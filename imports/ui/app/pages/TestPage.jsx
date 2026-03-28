import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rpc } from '../../../../lib/rpc-client.js';
import { subscribeServerEvents } from '../../../../lib/transport/ws-client.js';
import { SheetPage } from './SheetPage.jsx';
import { getSelectedRangeDebugText } from '../../metacell/runtime/drag-debug-runtime.js';

const FORMULA_SHEET_ID = 'sheet-1';
const AI_SHEET_ID = 'sheet-3';
const FORMULA_CHECK_START_ROW = 2;
const FORMULA_CHECK_END_ROW = 52;
const AI_CHECK_START_ROW = 2;
const AI_CHECK_END_ROW = 15;

function formatOpenedAtToken(date) {
  const value = date instanceof Date ? date : new Date();
  const year = String(value.getFullYear());
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  const seconds = String(value.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

function parseAttachmentSource(rawValue) {
  const raw = String(rawValue || '');
  if (!raw.startsWith('__ATTACHMENT__:')) return null;
  try {
    const parsed = JSON.parse(raw.slice('__ATTACHMENT__:'.length));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function getSheetCellMap(snapshot, sheetId) {
  const workbook = snapshot && typeof snapshot === 'object' ? snapshot : null;
  const sheets = workbook && workbook.sheets && typeof workbook.sheets === 'object'
    ? workbook.sheets
    : {};
  const sheet = sheets[sheetId];
  return sheet && sheet.cells && typeof sheet.cells === 'object' ? sheet.cells : {};
}

function getCellRecord(snapshot, sheetId, cellId) {
  const cells = getSheetCellMap(snapshot, sheetId);
  return cells[String(cellId || '').toUpperCase()] || null;
}

function getCellSource(snapshot, sheetId, cellId) {
  const record = getCellRecord(snapshot, sheetId, cellId);
  return String((record && record.source) || '');
}

function getCellDisplay(snapshot, sheetId, cellId) {
  const record = getCellRecord(snapshot, sheetId, cellId);
  return String((record && record.displayValue) || '');
}

function getCellComputed(snapshot, sheetId, cellId) {
  const record = getCellRecord(snapshot, sheetId, cellId);
  return String((record && record.computedValue) || '');
}

function getCellState(snapshot, sheetId, cellId) {
  const record = getCellRecord(snapshot, sheetId, cellId);
  return String((record && record.state) || '');
}

function getCellError(snapshot, sheetId, cellId) {
  const record = getCellRecord(snapshot, sheetId, cellId);
  return String((record && record.error) || '');
}

function getGeneratedDescendants(snapshot, sheetId, sourceCellId) {
  const cells = getSheetCellMap(snapshot, sheetId);
  const queue = [String(sourceCellId || '').toUpperCase()];
  const seen = new Set(queue);
  const results = [];

  while (queue.length) {
    const source = queue.shift();
    Object.keys(cells).forEach((cellId) => {
      const record = cells[cellId];
      if (!record) return;
      const generatedBy = String(record.generatedBy || '').toUpperCase();
      if (!generatedBy || generatedBy !== source) return;
      if (seen.has(cellId)) return;
      seen.add(cellId);
      queue.push(cellId);
      results.push({ cellId, record });
    });
  }

  return results;
}

function buildFormulaResults(snapshot) {
  const results = [];
  for (let row = FORMULA_CHECK_START_ROW; row <= FORMULA_CHECK_END_ROW; row += 1) {
    const caseLabel = getCellDisplay(snapshot, FORMULA_SHEET_ID, `A${row}`);
    const expected = 'PASS';
    const actual =
      getCellComputed(snapshot, FORMULA_SHEET_ID, `D${row}`) ||
      getCellDisplay(snapshot, FORMULA_SHEET_ID, `D${row}`);
    const pass = actual === expected;
    results.push({
      kind: 'formula',
      sheetId: FORMULA_SHEET_ID,
      cellId: `D${row}`,
      label: caseLabel || `Formula row ${row}`,
      expected,
      actual,
      status: pass ? 'PASS' : 'FAIL',
      note: pass
        ? ''
        : `Expected formula check cell D${row} to be PASS, got ${JSON.stringify(actual)}`,
    });
  }
  return results;
}

function buildAiResults(snapshot) {
  const results = [];
  for (let row = AI_CHECK_START_ROW; row <= AI_CHECK_END_ROW; row += 1) {
    const cellId = `A${row}`;
    const raw = getCellSource(snapshot, AI_SHEET_ID, cellId);
    const label = getCellDisplay(snapshot, AI_SHEET_ID, `B${row}`) || `AI row ${row}`;
    const expected = getCellDisplay(snapshot, AI_SHEET_ID, `C${row}`);
    const state = getCellState(snapshot, AI_SHEET_ID, cellId);
    const display = getCellDisplay(snapshot, AI_SHEET_ID, cellId);
    const computed = getCellComputed(snapshot, AI_SHEET_ID, cellId);
    const error = getCellError(snapshot, AI_SHEET_ID, cellId);
    const generated = getGeneratedDescendants(snapshot, AI_SHEET_ID, cellId);
    const hasGeneratedValue = generated.some(({ record }) =>
      String((record && (record.displayValue || record.computedValue || record.source)) || '').trim(),
    );
    const attachment = parseAttachmentSource(computed || display);
    let pass = false;
    let note = '';

    if (!raw) continue;

    if (state && state !== 'resolved') {
      pass = false;
      note = `Cell state is ${state}${error ? ` (${error})` : ''}`;
    } else if (raw.charAt(0) === "'") {
      pass = !!String(display || computed).trim() && String(display || computed) !== raw;
      if (!pass) note = 'Quoted AI prompt did not resolve to a non-raw answer';
    } else if (raw.charAt(0) === '>' || raw.charAt(0) === '#') {
      pass = hasGeneratedValue;
      if (!pass) note = 'Structured AI prompt produced no generated descendant cells';
    } else if (/^=PDF\(/i.test(raw) || /^=DOCX\(/i.test(raw)) {
      pass = !!(attachment && String(attachment.name || '').trim());
      if (!pass) note = 'Generated file formula did not resolve to an attachment';
    } else {
      pass = !!String(display || computed).trim();
      if (!pass) note = 'AI cell resolved empty output';
    }

    results.push({
      kind: 'ai',
      sheetId: AI_SHEET_ID,
      cellId,
      label,
      expected,
      actual: pass ? 'PASS' : 'FAIL',
      status: pass ? 'PASS' : 'FAIL',
      note,
    });
  }
  return results;
}

async function waitForReady(uiStateRef, timeoutMs) {
  const startedAt = Date.now();
  let readySince = 0;
  while (Date.now() - startedAt < timeoutMs) {
    const uiState = uiStateRef.current;
    const surfaceStatus =
      uiState && uiState.surfaceStatusUi && uiState.surfaceStatusUi.status
        ? String(uiState.surfaceStatusUi.status)
        : '';
    if (surfaceStatus === 'ready') {
      if (!readySince) readySince = Date.now();
      if (Date.now() - readySince >= 1500) return;
    } else {
      readySince = 0;
    }
    await wait(250);
  }
  throw new Error(`Timed out waiting for READY status after ${timeoutMs}ms`);
}

function hasStaleAiCells(snapshot) {
  for (let row = AI_CHECK_START_ROW; row <= AI_CHECK_END_ROW; row += 1) {
    const state = getCellState(snapshot, AI_SHEET_ID, `A${row}`);
    if (state === 'stale' || state === 'pending') {
      return true;
    }
  }
  return false;
}

async function settleAiCells(app, uiStateRef) {
  if (!app) return '';
  if (
    typeof app.switchToSheet === 'function' &&
    String(app.activeSheetId || '') !== AI_SHEET_ID
  ) {
    app.switchToSheet(AI_SHEET_ID);
    await nextFrame();
  }
  let attempts = 0;
  while (attempts < 3) {
    const snapshot =
      typeof app.getWorkbookSnapshot === 'function'
        ? app.getWorkbookSnapshot()
        : null;
    if (!hasStaleAiCells(snapshot)) return '';
    if (typeof app.runManualAIUpdate !== 'function') {
      return 'AI cells remained stale and runManualAIUpdate is unavailable';
    }
    attempts += 1;
    app.runManualAIUpdate({ forceRefreshAI: true });
    await waitForReady(uiStateRef, 5 * 60 * 1000);
    await nextFrame();
  }
  const finalSnapshot =
    typeof app.getWorkbookSnapshot === 'function'
      ? app.getWorkbookSnapshot()
      : null;
  if (hasStaleAiCells(finalSnapshot)) {
    return 'AI cells remained stale after 3 manual update attempts';
  }
  return '';
}

async function captureFailureDebug(app, sheetId, cellId) {
  if (!app) return '';
  if (typeof app.switchToSheet === 'function' && String(app.activeSheetId || '') !== String(sheetId || '')) {
    app.switchToSheet(sheetId);
    await nextFrame();
  }
  const input =
    typeof app.getCellInput === 'function'
      ? app.getCellInput(String(cellId || '').toUpperCase())
      : null;
  if (input && typeof app.setActiveInput === 'function') {
    app.setActiveInput(input);
  }
  if (typeof app.clearSelectionRange === 'function') {
    app.clearSelectionRange();
  }
  await nextFrame();
  return String(getSelectedRangeDebugText(app) || '');
}

function buildReportText({ openedAt, sheetId, waitError, results, debugBlocks, savedAt }) {
  const total = results.length;
  const failed = results.filter((item) => item.status !== 'PASS');
  const passed = total - failed.length;
  const lines = [
    `opened_at=${openedAt.toISOString()}`,
    `saved_at=${savedAt.toISOString()}`,
    `sheet_id=${sheetId}`,
    `overall=${failed.length ? 'FAIL' : 'PASS'}`,
    `total=${total}`,
    `passed=${passed}`,
    `failed=${failed.length}`,
  ];

  if (waitError) {
    lines.push(`ready_wait_error=${waitError}`);
  }

  lines.push('');
  lines.push('[results]');
  results.forEach((item) => {
    lines.push(
      [
        `status=${item.status}`,
        `kind=${item.kind}`,
        `sheetId=${item.sheetId}`,
        `cellId=${item.cellId}`,
        `label=${JSON.stringify(item.label)}`,
        `expected=${JSON.stringify(item.expected || '')}`,
        `actual=${JSON.stringify(item.actual || '')}`,
        `note=${JSON.stringify(item.note || '')}`,
      ].join('\t'),
    );
  });

  if (debugBlocks.length) {
    lines.push('');
    lines.push('[fail_debug]');
    debugBlocks.forEach((block) => {
      lines.push(`FAIL ${block.sheetId}!${block.cellId} ${block.label}`);
      lines.push(block.text || '(empty debug dump)');
      lines.push('');
    });
  }

  return lines.join('\n');
}

function writeRunnerResultsToWorkbook(app, results) {
  if (!app || !app.storage || typeof app.storage.setCellSource !== 'function') return;

  app.storage.setCellSource(AI_SHEET_ID, 'D1', 'Runner Check');
  app.storage.setCellSource(AI_SHEET_ID, 'E1', 'Runner Notes');
  app.storage.setCellSource(FORMULA_SHEET_ID, 'G1', 'Final');
  app.storage.setCellSource(FORMULA_SHEET_ID, 'H1', results.some((item) => item.status !== 'PASS') ? 'FAIL' : 'PASS');

  results
    .filter((item) => item.kind === 'ai')
    .forEach((item) => {
      const rowMatch = /([0-9]+)$/.exec(String(item.cellId || ''));
      const row = rowMatch ? rowMatch[1] : '';
      if (!row) return;
      app.storage.setCellSource(AI_SHEET_ID, `D${row}`, item.status);
      app.storage.setCellSource(AI_SHEET_ID, `E${row}`, item.note || 'OK');
    });

  if (typeof app.renderCurrentSheetFromStorage === 'function') {
    app.renderCurrentSheetFromStorage();
  }
}

export function TestPage() {
  const openedAt = useMemo(() => new Date(), []);
  const openedAtToken = useMemo(() => formatOpenedAtToken(openedAt), [openedAt]);
  const [sheetId, setSheetId] = useState('');
  const [phase, setPhase] = useState('Creating test workbook...');
  const [errorText, setErrorText] = useState('');
  const [savedPath, setSavedPath] = useState('');
  const [results, setResults] = useState([]);
  const [isFinished, setIsFinished] = useState(false);
  const [appReadyTick, setAppReadyTick] = useState(0);
  const [jobEvents, setJobEvents] = useState([]);
  const appRef = useRef(null);
  const workbookUiStateRef = useRef(null);
  const runStartedRef = useRef(false);

  const handleAppReady = useCallback((app) => {
    appRef.current = app;
    if (app) {
      setAppReadyTick((value) => value + 1);
    }
  }, []);

  const handleWorkbookUiStateChange = useCallback((uiState) => {
    workbookUiStateRef.current = uiState;
  }, []);

  useEffect(() => {
    document.body.classList.add('route-sheet');
    document.body.classList.remove('route-home');
    document.body.classList.remove('route-settings');
    return () => {
      document.body.classList.remove('route-sheet');
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeServerEvents((message) => {
      const event =
        message &&
        message.type === 'server.event' &&
        message.event &&
        typeof message.event === 'object'
          ? message.event
          : null;
      if (!event || String(event.scope || '') !== 'jobs') return;

      const payload =
        event.payload && typeof event.payload === 'object' ? event.payload : {};
      const timestamp = Number(event.timestamp) || Date.now();
      const type = String(event.type || '');
      const status = String(event.jobStatus || payload.status || '');
      const text =
        type === 'jobs.failed'
          ? String(payload.message || 'Job failed')
          : type === 'jobs.completed'
            ? 'Completed'
            : type === 'jobs.running'
              ? 'Started running'
              : type === 'jobs.retrying'
                ? `Retrying${payload.delayMs ? ` in ${payload.delayMs}ms` : ''}`
                : type === 'jobs.queued'
                  ? 'Queued'
                  : status || type;

      setJobEvents((current) =>
        [
          {
            id: `${timestamp}:${event.sequence || 0}:${type}:${String(event.jobId || '')}`,
            timestamp,
            label: String(event.jobType || 'job'),
            text,
          },
          ...current,
        ].slice(0, 10),
      );
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;
    rpc('sheets.createFormulaTestWorkbook', `Formula Test Bench ${openedAtToken}`)
      .then((nextSheetId) => {
        if (cancelled) return;
        setSheetId(String(nextSheetId || ''));
        setPhase('Booting workbook runtime...');
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorText(error.reason || error.message || 'Failed to create test workbook');
      });
    return () => {
      cancelled = true;
    };
  }, [openedAtToken]);

  useEffect(() => {
    if (!sheetId || !appRef.current || runStartedRef.current) return;
    runStartedRef.current = true;
    let cancelled = false;

    const run = async () => {
      let readyWaitError = '';
      try {
        setPhase('Waiting for READY status...');
        await waitForReady(workbookUiStateRef, 5 * 60 * 1000);
        setPhase('Running manual AI updates...');
        const aiSettleError = await settleAiCells(appRef.current, workbookUiStateRef);
        if (aiSettleError) {
          readyWaitError = aiSettleError;
        }
      } catch (error) {
        readyWaitError = error && error.message ? error.message : String(error);
      }

      if (cancelled || !appRef.current) return;

      setPhase('Evaluating workbook expectations...');
      const snapshot =
        typeof appRef.current.getWorkbookSnapshot === 'function'
          ? appRef.current.getWorkbookSnapshot()
          : null;
      const nextResults = [
        ...buildFormulaResults(snapshot),
        ...buildAiResults(snapshot),
      ];
      writeRunnerResultsToWorkbook(appRef.current, nextResults);

      setResults(nextResults);

      const failures = nextResults.filter((item) => item.status !== 'PASS');
      const debugBlocks = [];
      if (failures.length) {
        setPhase('Collecting dependency dumps for failures...');
        for (let index = 0; index < failures.length; index += 1) {
          const failure = failures[index];
          const debugText = await captureFailureDebug(
            appRef.current,
            failure.sheetId,
            failure.cellId,
          );
          debugBlocks.push({
            sheetId: failure.sheetId,
            cellId: failure.cellId,
            label: failure.label,
            text: debugText,
          });
        }
      }

      if (cancelled) return;

      setPhase('Writing testing/test_results_*.txt...');
      const reportText = buildReportText({
        openedAt,
        savedAt: new Date(),
        sheetId,
        waitError: readyWaitError,
        results: nextResults,
        debugBlocks,
      });
      const saved = await rpc('testing.saveTestResults', openedAtToken, reportText);
      if (cancelled) return;
      setSavedPath(String((saved && (saved.relativePath || saved.filePath)) || ''));
      setPhase(failures.length ? 'Completed with failures' : 'Completed successfully');
      setIsFinished(true);
      if (readyWaitError && !failures.length) {
        setErrorText(readyWaitError);
      }
    };

    run().catch((error) => {
      if (cancelled) return;
      setErrorText(error.reason || error.message || 'Test run failed');
      setPhase('Run failed');
      setIsFinished(true);
    });

    return () => {
      cancelled = true;
    };
  }, [sheetId, openedAt, openedAtToken, appReadyTick]);

  const passedCount = results.filter((item) => item.status === 'PASS').length;
  const failedCount = results.filter((item) => item.status !== 'PASS').length;

  return (
    <main className="sheet-page-shell test-route-shell">
      <section className="home-card" style={{ margin: '16px' }}>
        <div className="home-section-head">
          <h2>/test</h2>
        </div>
        <p className="home-empty-note">Opened at {openedAt.toLocaleString()}.</p>
        <p className="home-empty-note">{phase}</p>
        {sheetId ? <p className="home-empty-note">Workbook: {sheetId}</p> : null}
        {results.length ? (
          <p className="home-empty-note">
            PASS {passedCount} / FAIL {failedCount}
          </p>
        ) : null}
        {savedPath ? (
          <p className="home-empty-note">Results file: {savedPath}</p>
        ) : null}
        {jobEvents.length ? (
          <div className="settings-live-feed" style={{ marginTop: '12px' }}>
            <div className="settings-live-feed-head">Live jobs</div>
            <div className="settings-live-feed-list">
              {jobEvents.map((item) => (
                <div key={item.id} className="settings-live-feed-item">
                  <strong>{item.label}</strong>
                  <span>{item.text}</span>
                  <time>{new Date(item.timestamp).toLocaleTimeString()}</time>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {errorText ? (
          <p className="home-empty-note" style={{ color: '#b42318' }}>
            {errorText}
          </p>
        ) : null}
        {isFinished && failedCount ? (
          <p className="home-empty-note" style={{ color: '#b42318' }}>
            Some checks failed. Dependency dumps were written to the results file.
          </p>
        ) : null}
      </section>
      {sheetId ? (
        <SheetPage
          sheetId={sheetId}
          onOpenHelp={() => {}}
          onAppReady={handleAppReady}
          onWorkbookUiStateChange={handleWorkbookUiStateChange}
          syncRouteWithActiveSheet={false}
        />
      ) : null}
    </main>
  );
}
