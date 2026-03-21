import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { Meteor } from 'meteor/meteor';

function listSpecFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const results = [];

  entries.forEach((entry) => {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listSpecFiles(fullPath));
      return;
    }
    if (/\.workbook-test\.json$/i.test(entry.name)) {
      results.push(fullPath);
    }
  });

  return results.sort();
}

function resolveSpecRoots(specDir) {
  const requestedDir = String(specDir || 'tests/workbook-specs');
  const candidates = [
    path.resolve(process.cwd(), requestedDir),
    process.env.PWD ? path.resolve(process.env.PWD, requestedDir) : '',
  ].filter(Boolean);
  const unique = [];
  candidates.forEach((candidate) => {
    if (unique.indexOf(candidate) === -1) unique.push(candidate);
  });
  return unique;
}

function inferMimeType(filePath) {
  const extension = String(path.extname(filePath) || '').toLowerCase();
  if (extension === '.md') return 'text/markdown';
  if (extension === '.json') return 'application/json';
  if (extension === '.html') return 'text/html';
  if (extension === '.csv') return 'text/csv';
  if (extension === '.pdf') return 'application/pdf';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.svg') return 'image/svg+xml';
  return 'text/plain';
}

function loadSpecDocument(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeCellAddress(address) {
  return String(address || '').trim().toUpperCase();
}

function parseCellId(cellId) {
  const match = /^([A-Za-z]+)([0-9]+)$/.exec(normalizeCellAddress(cellId));
  if (!match) return null;
  let col = 0;
  for (let i = 0; i < match[1].length; i += 1) {
    col = col * 26 + (match[1].charCodeAt(i) - 64);
  }
  return {
    col,
    row: parseInt(match[2], 10),
  };
}

function formatCellId(col, row) {
  let n = Number(col) || 0;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return `${label}${row}`;
}

function createAttachmentSource(specFilePath, cellSpec) {
  const relativePath = String(cellSpec.file || '').trim();
  const resolvedPath = path.resolve(path.dirname(specFilePath), relativePath);
  const attachmentName = String(cellSpec.fileName || path.basename(resolvedPath));
  const mimeType = String(cellSpec.mimeType || inferMimeType(resolvedPath));
  const encoding = String(cellSpec.fileEncoding || '').toLowerCase();
  const content =
    encoding === 'base64'
      ? fs.readFileSync(resolvedPath).toString('base64')
      : fs.readFileSync(resolvedPath, 'utf8');

  return `__ATTACHMENT__:${JSON.stringify({
    name: attachmentName,
    type: mimeType,
    content,
    encoding: encoding === 'base64' ? 'base64' : 'utf8',
  })}`;
}

function getExpectationTextCandidates(cell) {
  const value = String(cell && cell.value == null ? '' : cell.value);
  const candidates = [value];
  if (value.indexOf('__ATTACHMENT__:') !== 0) return candidates;
  try {
    const attachment = JSON.parse(value.slice('__ATTACHMENT__:'.length));
    const content = String(
      attachment && attachment.content != null ? attachment.content : '',
    );
    if (content) candidates.push(content);
    if (attachment && attachment.encoding === 'base64' && content) {
      candidates.push(Buffer.from(content, 'base64').toString('utf8'));
    }
  } catch (error) {}
  return candidates;
}

function emptyWorkbook() {
  return {
    version: 1,
    tabs: [],
    activeTabId: '',
    aiMode: 'auto',
    namedCells: {},
    sheets: {},
    dependencyGraph: {
      byCell: {},
      dependentsByCell: {},
      dependentsByNamedRef: {},
      dependentsByChannel: {},
      dependentsByAttachment: {},
      meta: {
        authoritative: false,
      },
    },
    caches: {},
    globals: {},
  };
}

function ensureSheetRecord(workbook, tab) {
  const sheetId = String(tab.id || '');
  if (!sheetId) return null;
  if (!workbook.sheets[sheetId]) {
    workbook.sheets[sheetId] = {
      cells: {},
      columnWidths: {},
      rowHeights: {},
      reportContent: '',
    };
  }
  return workbook.sheets[sheetId];
}

function buildWorkbookFromSpec(spec, specFilePath) {
  const workbook = emptyWorkbook();
  const workbookSpec =
    spec && spec.workbook && typeof spec.workbook === 'object'
      ? spec.workbook
      : {};
  const tabs = Array.isArray(workbookSpec.tabs) ? workbookSpec.tabs : [];
  const namedCells =
    workbookSpec.namedCells && typeof workbookSpec.namedCells === 'object'
      ? { ...workbookSpec.namedCells }
      : {};

  workbook.aiMode =
    String(workbookSpec.aiMode || '').trim().toLowerCase() === 'manual'
      ? 'manual'
      : 'auto';

  tabs.forEach((tab, index) => {
    const tabId = String((tab && tab.id) || `sheet-${index + 1}`);
    const tabName = String((tab && tab.name) || `Sheet ${index + 1}`);
    const tabType = String((tab && tab.type) || 'sheet').toLowerCase();
    const normalizedTab = {
      id: tabId,
      name: tabName,
      type: tabType === 'report' ? 'report' : 'sheet',
    };
    workbook.tabs.push(normalizedTab);
    const sheetRecord = ensureSheetRecord(workbook, normalizedTab);
    if (normalizedTab.type === 'report') {
      sheetRecord.reportContent = String(tab.reportContent || '');
    }

    const cells = Array.isArray(tab.cells) ? tab.cells : [];
    cells.forEach((cellSpec) => {
      const address = normalizeCellAddress(cellSpec.address || cellSpec.cell);
      if (!address) return;
      let source = '';
      if (cellSpec.file) {
        source = createAttachmentSource(specFilePath, cellSpec);
      } else if (
        Object.prototype.hasOwnProperty.call(cellSpec, 'formula') &&
        cellSpec.formula != null
      ) {
        source = String(cellSpec.formula);
      } else if (
        Object.prototype.hasOwnProperty.call(cellSpec, 'source') &&
        cellSpec.source != null
      ) {
        source = String(cellSpec.source);
      } else if (
        Object.prototype.hasOwnProperty.call(cellSpec, 'value') &&
        cellSpec.value != null
      ) {
        source = String(cellSpec.value);
      }

      sheetRecord.cells[address] = {
        source,
        sourceType: /^[='>#]/.test(source) ? 'formula' : 'raw',
        value: '',
        state: '',
        error: '',
        generatedBy: '',
        version: 1,
      };

      if (cellSpec.name) {
        namedCells[String(cellSpec.name).trim()] = {
          sheetId: tabId,
          cellId: address,
        };
      }
    });
  });

  workbook.activeTabId =
    String(workbookSpec.activeTabId || '') ||
    String((workbook.tabs.find((tab) => tab.type === 'sheet') || {}).id || '');
  workbook.namedCells = namedCells;
  return workbook;
}

function getDefaultActiveSheetId(workbook) {
  const activeTabId = String((workbook && workbook.activeTabId) || '');
  const tabs = Array.isArray(workbook && workbook.tabs) ? workbook.tabs : [];
  const activeTab = tabs.find((tab) => tab && tab.id === activeTabId);
  if (activeTab && activeTab.type === 'sheet') return activeTabId;
  return String((tabs.find((tab) => tab && tab.type === 'sheet') || {}).id || 'sheet-1');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function extractUserPromptFromMessages(messages) {
  const source = Array.isArray(messages) ? messages : [];
  for (let i = source.length - 1; i >= 0; i -= 1) {
    const message = source[i];
    if (!message || message.role !== 'user') continue;
    const content = message.content;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return String(content == null ? '' : content);
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return '';
        if (part.type === 'text') return String(part.text == null ? '' : part.text);
        return '';
      })
      .join('\n\n')
      .trim();
  }
  return '';
}

function normalizePromptText(text) {
  return String(text == null ? '' : text)
    .replace(/\s+/g, ' ')
    .trim();
}

function installWorkbookSpecFetchMock(aiMocks) {
  const mocks = Array.isArray(aiMocks) ? aiMocks : [];
  const originalFetch = global.fetch;

  const findMock = (prompt, messages) => {
    for (let i = 0; i < mocks.length; i += 1) {
      const item = mocks[i] || {};
      const match = item.match && typeof item.match === 'object' ? item.match : {};
      const exact = Object.prototype.hasOwnProperty.call(match, 'prompt')
        ? normalizePromptText(match.prompt)
        : '';
      const includes = Object.prototype.hasOwnProperty.call(match, 'includes')
        ? normalizePromptText(match.includes)
        : '';
      const role = Object.prototype.hasOwnProperty.call(match, 'role')
        ? String(match.role)
        : '';
      const normalizedPrompt = normalizePromptText(prompt);
      if (exact && normalizedPrompt !== exact) continue;
      if (includes && normalizedPrompt.indexOf(includes) === -1) continue;
      if (role) {
        const hasRole = (Array.isArray(messages) ? messages : []).some(
          (message) => message && String(message.role || '') === role,
        );
        if (!hasRole) continue;
      }
      return item;
    }
    return null;
  };

  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url || '');
    if (/\/models(?:\?.*)?$/.test(requestUrl)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 'mock-model' }],
        }),
        text: async () => JSON.stringify({ data: [{ id: 'mock-model' }] }),
      };
    }

    if (/\/chat\/completions(?:\?.*)?$/.test(requestUrl)) {
      const body = options && options.body ? JSON.parse(String(options.body)) : {};
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const prompt = extractUserPromptFromMessages(messages);
      const mock = findMock(prompt, messages);
      if (!mock) {
        throw new Error(`No workbook AI mock matched prompt: ${prompt}`);
      }
      if (mock.delayMs) {
        await sleep(mock.delayMs);
      }
      if (mock.error) {
        return {
          ok: false,
          status: Number(mock.status) || 500,
          json: async () => ({
            error: {
              message: String(mock.error),
            },
          }),
          text: async () =>
            JSON.stringify({
              error: {
                message: String(mock.error),
              },
            }),
        };
      }
      const responseText = String(mock.response == null ? '' : mock.response);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: responseText,
              },
            },
          ],
        }),
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: responseText,
                },
              },
            ],
          }),
      };
    }

    if (typeof originalFetch === 'function') {
      return originalFetch(url, options);
    }
    throw new Error(`Unexpected fetch URL in workbook spec test: ${requestUrl}`);
  };

  return () => {
    global.fetch = originalFetch;
  };
}

async function readWorkbookRecord(sheetId) {
  const { Sheets } = await import('../imports/api/sheets/index.js');
  const { decodeWorkbookDocument } = await import(
    '../imports/api/sheets/workbook-codec.js'
  );
  const saved = await Sheets.findOneAsync(sheetId);
  return {
    saved,
    workbook: decodeWorkbookDocument((saved && saved.workbook) || {}),
  };
}

function resolveTargetReference(workbook, target, explicitSheet) {
  const normalizedTarget = String(target || '').trim();
  const sheets =
    workbook && workbook.sheets && typeof workbook.sheets === 'object'
      ? workbook.sheets
      : {};
  if (!normalizedTarget) {
    throw new Error('Workbook step target is required');
  }

  const scopedSheetId = String(explicitSheet || '').trim();
  if (scopedSheetId && parseCellId(normalizedTarget)) {
    return {
      sheetId: scopedSheetId,
      cellId: normalizeCellAddress(normalizedTarget),
    };
  }

  const sheetCellMatch =
    /^(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)$/.exec(
      normalizedTarget,
    );
  if (sheetCellMatch) {
    const requestedSheet = sheetCellMatch[1] || sheetCellMatch[2] || '';
    const matchedTab = (Array.isArray(workbook.tabs) ? workbook.tabs : []).find(
      (tab) =>
        tab &&
        (String(tab.id || '') === requestedSheet ||
          String(tab.name || '') === requestedSheet),
    );
    if (!matchedTab) {
      throw new Error(`Unknown sheet in workbook target: ${normalizedTarget}`);
    }
    return {
      sheetId: String(matchedTab.id || ''),
      cellId: normalizeCellAddress(sheetCellMatch[3]),
    };
  }

  if (parseCellId(normalizedTarget)) {
    return {
      sheetId: getDefaultActiveSheetId(workbook),
      cellId: normalizeCellAddress(normalizedTarget),
    };
  }

  const namedCells =
    workbook && workbook.namedCells && typeof workbook.namedCells === 'object'
      ? workbook.namedCells
      : {};
  const namedEntryKey = Object.keys(namedCells).find(
    (name) => name.toLowerCase() === normalizedTarget.toLowerCase(),
  );
  if (!namedEntryKey) {
    throw new Error(`Unknown workbook target: ${normalizedTarget}`);
  }
  const ref = namedCells[namedEntryKey];
  if (!ref || !ref.sheetId || !ref.cellId) {
    throw new Error(`Workbook target is not a single cell: ${normalizedTarget}`);
  }
  return {
    sheetId: String(ref.sheetId || ''),
    cellId: normalizeCellAddress(ref.cellId),
  };
}

async function computeWorkbook(sheetId, workbookSnapshot) {
  const activeSheetId = getDefaultActiveSheetId(workbookSnapshot);
  return Meteor.server.method_handlers['sheets.computeGrid'].apply({}, [
    sheetId,
    activeSheetId,
    {
      workbookSnapshot,
    },
  ]);
}

async function applySetStep(sheetId, step) {
  const { workbook } = await readWorkbookRecord(sheetId);
  const payload = step && step.set && typeof step.set === 'object' ? step.set : {};
  const ref = resolveTargetReference(workbook, payload.target, payload.sheetId);
  if (!workbook.sheets[ref.sheetId]) {
    workbook.sheets[ref.sheetId] = {
      cells: {},
      columnWidths: {},
      rowHeights: {},
      reportContent: '',
    };
  }
  const currentCell =
    workbook.sheets[ref.sheetId].cells[ref.cellId] &&
    typeof workbook.sheets[ref.sheetId].cells[ref.cellId] === 'object'
      ? workbook.sheets[ref.sheetId].cells[ref.cellId]
      : {};
  const nextSource = Object.prototype.hasOwnProperty.call(payload, 'value')
    ? String(payload.value == null ? '' : payload.value)
    : String(payload.source == null ? '' : payload.source);

  workbook.sheets[ref.sheetId].cells[ref.cellId] = {
    ...currentCell,
    source: nextSource,
    sourceType: /^[='>#]/.test(nextSource) ? 'formula' : 'raw',
  };

  await computeWorkbook(sheetId, workbook);
}

async function assertCellExpectation(sheetId, expectation) {
  const timeoutMs = Math.max(50, Number(expectation.timeoutMs) || 1200);
  const intervalMs = Math.max(20, Number(expectation.intervalMs) || 50);
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() <= deadline) {
    try {
      const { workbook } = await readWorkbookRecord(sheetId);
      const ref = resolveTargetReference(
        workbook,
        expectation.target,
        expectation.sheetId,
      );
      const sheet = workbook.sheets[ref.sheetId] || {};
      const cell =
        sheet.cells && sheet.cells[ref.cellId] ? sheet.cells[ref.cellId] : {};
      if (Object.prototype.hasOwnProperty.call(expectation, 'value')) {
        assert.strictEqual(
          String(cell.value == null ? '' : cell.value),
          String(expectation.value == null ? '' : expectation.value),
          `Expected ${ref.sheetId}:${ref.cellId} value`,
        );
      }
      if (Object.prototype.hasOwnProperty.call(expectation, 'source')) {
        assert.strictEqual(
          String(cell.source == null ? '' : cell.source),
          String(expectation.source == null ? '' : expectation.source),
          `Expected ${ref.sheetId}:${ref.cellId} source`,
        );
      }
      if (Object.prototype.hasOwnProperty.call(expectation, 'state')) {
        assert.strictEqual(
          String(cell.state == null ? '' : cell.state),
          String(expectation.state == null ? '' : expectation.state),
          `Expected ${ref.sheetId}:${ref.cellId} state`,
        );
      }
      if (Object.prototype.hasOwnProperty.call(expectation, 'error')) {
        assert.strictEqual(
          String(cell.error == null ? '' : cell.error),
          String(expectation.error == null ? '' : expectation.error),
          `Expected ${ref.sheetId}:${ref.cellId} error`,
        );
      }
      if (Object.prototype.hasOwnProperty.call(expectation, 'contains')) {
        const candidates = getExpectationTextCandidates(cell);
        assert.ok(
          candidates.some((text) =>
            String(text).includes(String(expectation.contains)),
          ),
          `Expected ${ref.sheetId}:${ref.cellId} value to contain ${expectation.contains}`,
        );
      }
      return;
    } catch (error) {
      lastError = error;
      await sleep(intervalMs);
    }
  }

  throw lastError || new Error('Cell expectation failed');
}

async function assertReportExpectation(sheetId, expectation) {
  const { workbook } = await readWorkbookRecord(sheetId);
  const tabs = Array.isArray(workbook.tabs) ? workbook.tabs : [];
  const reportTab = tabs.find((tab) => {
    if (!tab || tab.type !== 'report') return false;
    if (expectation.reportTabId && String(tab.id || '') === expectation.reportTabId)
      return true;
    if (expectation.reportTabName && String(tab.name || '') === expectation.reportTabName)
      return true;
    return false;
  });
  assert.ok(reportTab, 'Expected report tab to exist for report assertion');
  const reportContent = String(
    ((workbook.sheets || {})[reportTab.id] || {}).reportContent || '',
  );
  if (Object.prototype.hasOwnProperty.call(expectation, 'content')) {
    assert.strictEqual(reportContent, String(expectation.content));
  }
  if (Object.prototype.hasOwnProperty.call(expectation, 'contains')) {
    assert.ok(
      reportContent.includes(String(expectation.contains)),
      `Expected report ${reportTab.id} content to contain ${expectation.contains}`,
    );
  }
}

async function runScenarioStep(sheetId, step) {
  if (step && step.set) {
    await applySetStep(sheetId, step);
    return;
  }
  if (step && step.expect) {
    await assertCellExpectation(sheetId, step.expect);
    return;
  }
  if (step && step.expectReport) {
    await assertReportExpectation(sheetId, step.expectReport);
    return;
  }
  if (step && (step.waitMs || step.waitSeconds)) {
    const waitMs = step.waitMs
      ? Number(step.waitMs)
      : Number(step.waitSeconds || 0) * 1000;
    await sleep(waitMs);
    return;
  }
  throw new Error(`Unsupported workbook step: ${JSON.stringify(step)}`);
}

async function createWorkbookForScenario(spec, specFilePath, scenarioName) {
  const workbook = buildWorkbookFromSpec(spec, specFilePath);
  const sheetId = await Meteor.server.method_handlers['sheets.create'].apply({}, [
    `${String(spec.name || 'Workbook Spec').trim()} :: ${scenarioName}`,
  ]);
  await Meteor.server.method_handlers['sheets.saveWorkbook'].apply({}, [
    sheetId,
    workbook,
  ]);
  await computeWorkbook(sheetId, workbook);
  return sheetId;
}

function shouldIncludeSpec(filePath) {
  const filter = String(process.env.WORKBOOK_SPEC_FILTER || '').trim();
  if (!filter) return true;
  return filePath.toLowerCase().includes(filter.toLowerCase());
}

export function registerWorkbookSpecTests() {
  if (!Meteor.isServer) return;

  describe('workbook spec framework', function () {
    const specRoots = resolveSpecRoots(process.env.WORKBOOK_SPEC_DIR);
    const specFiles = specRoots
      .reduce((acc, rootDir) => acc.concat(listSpecFiles(rootDir)), [])
      .filter((filePath, index, items) => items.indexOf(filePath) === index)
      .filter(shouldIncludeSpec);

    specFiles.forEach((specFilePath) => {
      const spec = loadSpecDocument(specFilePath);
      const scenarios = Array.isArray(spec.tests) ? spec.tests : [];

      scenarios.forEach((scenario) => {
        it(`${path.relative(process.cwd(), specFilePath)} :: ${scenario.name}`, async function () {
          const restoreFetch = installWorkbookSpecFetchMock(spec.aiMocks || []);
          let sheetId = '';
          try {
            sheetId = await createWorkbookForScenario(
              spec,
              specFilePath,
              String(scenario.name || 'scenario'),
            );
            const steps = Array.isArray(scenario.steps) ? scenario.steps : [];
            for (let i = 0; i < steps.length; i += 1) {
              await runScenarioStep(sheetId, steps[i]);
            }
          } finally {
            restoreFetch();
            if (sheetId) {
              const { Sheets } = await import('../imports/api/sheets/index.js');
              await Sheets.removeAsync({ _id: sheetId });
            }
          }
        });
      });
    });
  });
}
