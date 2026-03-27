import { invokeRpc, isClient, isServer, tick } from './runtime-test-helpers.js';
import assert from 'assert';
import { registerWorkbookSpecTests } from './workbook-spec-framework.js';

describe('metacells', function () {
  it('package.json has correct name', async function () {
    const { name } = await import('../package.json');
    assert.strictEqual(name, 'metacells');
  });

  if (isClient) {
    it('client is not server', function () {
      assert.strictEqual(isServer, false);
    });

    it('does not infer dependency overlays from attachment cell metadata', async function () {
      const { collectAppUiStateSnapshot } = await import(
        '../imports/ui/metacell/runtime/ui-snapshot-runtime.js'
      );

      const attachmentRaw =
        '__ATTACHMENT__:{"name":"architecture.png","type":"image/png","content":"D5 E6 F8"}';
      const makeRect = () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 24,
      });
      const cellShell = {
        getBoundingClientRect: makeRect,
      };

      const app = {
        activeSheetId: 'sheet-1',
        tableWrap: {
          scrollLeft: 0,
          scrollTop: 0,
          getBoundingClientRect: makeRect,
        },
        table: {
          rows: [
            { cells: [{ getBoundingClientRect: makeRect }, { getBoundingClientRect: makeRect }] },
            { cells: [{ getBoundingClientRect: makeRect }, cellShell] },
          ],
        },
        inputById: {
          D5: { id: 'D5', parentElement: cellShell },
        },
        getSelectionActiveCellId() {
          return 'D5';
        },
        getSelectionAnchorCellId() {
          return 'D5';
        },
        getVisibleSheetId() {
          return 'sheet-1';
        },
        getRawCellValue() {
          return attachmentRaw;
        },
        parseAttachmentSource(value) {
          return String(value || '').startsWith('__ATTACHMENT__:') ? {} : null;
        },
        getCellInput(cellId) {
          return this.inputById[cellId] || null;
        },
        storage: {
          getCellDependencies() {
            return {};
          },
          resolveNamedCell() {
            return null;
          },
        },
      };

      const snapshot = collectAppUiStateSnapshot(app);

      assert.deepStrictEqual(snapshot.selectionUi.dependencyRects, []);
    });

    it('applies mention autocomplete selections inside the fullscreen editor', async function () {
      const { applyMentionAutocompleteSelection } = await import(
        '../imports/ui/metacell/runtime/mention-runtime.js'
      );

      const fullscreenEditor = {
        value: 'Hello @arc',
        selectionStart: 10,
        selectionEnd: 10,
        focused: false,
        focus() {
          this.focused = true;
        },
        setSelectionRange(start, end) {
          this.selectionStart = start;
          this.selectionEnd = end;
        },
      };

      const app = {
        fullscreenEditor,
        fullscreenEditMode: 'value',
        fullscreenValueDraft: 'Hello @arc',
        mentionAutocompleteState: {
          input: fullscreenEditor,
          start: 6,
          end: 10,
          items: [{ token: "@'Architecture'!A1", label: "@'Architecture'!A1" }],
          activeIndex: 0,
        },
        published: 0,
        setFullscreenDraft(next) {
          this.fullscreenValueDraft = next;
          fullscreenEditor.value = next;
        },
        setEditorSelectionRange(start, end, input) {
          input.setSelectionRange(start, end);
        },
        publishUiState() {
          this.published += 1;
        },
      };

      applyMentionAutocompleteSelection(app, 0);

      assert.strictEqual(app.fullscreenValueDraft, "Hello @'Architecture'!A1");
      assert.strictEqual(fullscreenEditor.value, "Hello @'Architecture'!A1");
      assert.strictEqual(fullscreenEditor.selectionStart, 24);
      assert.strictEqual(fullscreenEditor.selectionEnd, 24);
      assert.strictEqual(fullscreenEditor.focused, true);
      assert.strictEqual(app.mentionAutocompleteState, null);
    });
  }

  if (isServer) {
    it('server is not client', function () {
      assert.strictEqual(isClient, false);
    });

    it('builds a topological evaluation plan for same-sheet dependencies', async function () {
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');

      const cells = {
        A1: 'seed',
        B1: '=A1',
        C1: '=B1',
        D1: '=C1',
      };
      const storageService = {
        getCellValue(sheetId, cellId) {
          return cells[cellId] || '';
        },
        getCellState() {
          return 'resolved';
        },
        resolveNamedCell() {
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {},
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        ['A1', 'B1', 'C1', 'D1'],
      );

      const plan = formulaEngine.buildEvaluationPlan('sheet-1');

      assert.deepStrictEqual(plan, ['A1', 'B1', 'C1', 'D1']);
    });

    it('falls back safely when dependency cycles exist', async function () {
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');

      const cells = {
        A1: '=B1',
        B1: '=A1',
        C1: '=B1',
      };
      const storageService = {
        getCellValue(sheetId, cellId) {
          return cells[cellId] || '';
        },
        getCellState() {
          return 'resolved';
        },
        resolveNamedCell() {
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {},
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        ['A1', 'B1', 'C1'],
      );

      const plan = formulaEngine.buildEvaluationPlan('sheet-1');

      assert.strictEqual(plan.length, 3);
      assert.deepStrictEqual([...plan].sort(), ['A1', 'B1', 'C1']);
      assert.strictEqual(plan[2], 'C1');
    });

    it('evaluates registered spreadsheet formulas from file-based modules', async function () {
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');

      const cells = {
        A1: '10',
        A2: '20',
        A3: '30',
        B1: '=SUM(A1:A3)',
        B2: '=AVERAGE(A1:A3)',
        B3: '=IF(A1>5, "yes", "no")',
        C1: 'Basic',
        C2: 'Pro',
        D1: '9',
        D2: '19',
        E1: '=VLOOKUP("Pro", C1:D2, 2)',
        E2: '=COUNT(A1:A3)',
        E3: '=COUNTA(A1:A3)',
        F1: '=LEN("hello")',
        F2: '=SUMIF(A1:A3, ">15")',
        F3: '=INDEX(C1:D2, 2, 2)',
        G1: '=XLOOKUP("Pro", C1:C2, D1:D2, "missing")',
        H1: '=COUNTIF(A1:A3, ">15")',
        H2: '=TRIM("  hello   world  ")',
        H3: '=DATEDIF("2024-01-01", "2024-01-11", "D")',
        I1: '=FILTER(C1:D2, C1:C2, "Pro")',
        I2: '=TODAY()',
      };
      const storageService = {
        getCellValue(sheetId, cellId) {
          return cells[cellId] || '';
        },
        getCellState() {
          return 'resolved';
        },
        resolveNamedCell() {
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {},
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        Object.keys(cells),
      );

      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'B1', {}), 60);
      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'B2', {}), 20);
      assert.strictEqual(
        formulaEngine.evaluateCell('sheet-1', 'B3', {}),
        'yes',
      );
      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'E1', {}), '19');
      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'E2', {}), 3);
      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'E3', {}), 3);
      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'F1', {}), 5);
      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'F2', {}), 50);
      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'F3', {}), '19');
      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'G1', {}), '19');
      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'H1', {}), 2);
      assert.strictEqual(
        formulaEngine.evaluateCell('sheet-1', 'H2', {}),
        'hello world',
      );
      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'H3', {}), 10);
      assert.strictEqual(
        formulaEngine.evaluateCell('sheet-1', 'I1', {}),
        'Pro,19',
      );
      assert.match(
        String(formulaEngine.evaluateCell('sheet-1', 'I2', {})),
        /^\d{4}-\d{2}-\d{2}$/,
      );

      cells.G2 = '=SUM(@A1:A3)';
      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'G2', {}), 60);
    });

    it('evaluates FILE, PDF and DOCX formulas to attachment values', async function () {
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');

      const cells = {
        A1: 'Hello World',
        A2: '# Report\n\n- item 1',
        B1: '=FILE("report.txt", A1)',
        B2: '=FILE("report.pdf", A1, "PDF")',
        B3: '=FILE("doc.docx", A2, "DOCX_MD")',
        C1: '=PDF("invoice.pdf", A1)',
        C2: '=DOCX("summary.docx", A2)',
        C3: '=PDF("summary.pdf", A2)',
        D1: '=FILE("", A1)',
      };
      const storageService = {
        getCellValue(sheetId, cellId) {
          return cells[cellId] || '';
        },
        getCellState() {
          return 'resolved';
        },
        resolveNamedCell() {
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {},
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        Object.keys(cells),
      );

      const fileResult = formulaEngine.evaluateCell('sheet-1', 'B1', {});
      assert.ok(
        String(fileResult).startsWith('__ATTACHMENT__:'),
        'FILE result should be an attachment',
      );
      const fileData = JSON.parse(
        String(fileResult).slice('__ATTACHMENT__:'.length),
      );
      assert.strictEqual(fileData.name, 'report.txt');
      assert.strictEqual(fileData.content, 'Hello World');
      assert.strictEqual(fileData.generated, true);

      const filePdfResult = formulaEngine.evaluateCell('sheet-1', 'B2', {});
      const filePdfData = JSON.parse(
        String(filePdfResult).slice('__ATTACHMENT__:'.length),
      );
      assert.strictEqual(filePdfData.name, 'report.pdf');
      assert.strictEqual(filePdfData.type, 'application/pdf');
      assert.strictEqual(filePdfData.encoding, 'base64');
      assert.ok(
        String(filePdfData.content || '').startsWith('JVBER'),
        'FILE(..., \"PDF\") should contain a real PDF payload',
      );
      assert.strictEqual(filePdfData.generatedAs, 'PDF');

      const fileDocxResult = formulaEngine.evaluateCell('sheet-1', 'B3', {});
      const fileDocxData = JSON.parse(
        String(fileDocxResult).slice('__ATTACHMENT__:'.length),
      );
      assert.strictEqual(fileDocxData.name, 'doc.docx');
      assert.strictEqual(
        fileDocxData.type,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      assert.strictEqual(fileDocxData.generatedAs, 'DOCX_MD');

      const pdfResult = formulaEngine.evaluateCell('sheet-1', 'C1', {});
      const pdfData = JSON.parse(
        String(pdfResult).slice('__ATTACHMENT__:'.length),
      );
      assert.strictEqual(pdfData.name, 'invoice.pdf');
      assert.strictEqual(pdfData.type, 'application/pdf');
      assert.strictEqual(pdfData.encoding, 'base64');
      assert.ok(
        String(pdfData.content || '').startsWith('JVBER'),
        'PDF() should contain a real PDF payload',
      );
      assert.match(
        Buffer.from(String(pdfData.content || ''), 'base64').toString('utf8'),
        /Hello World/,
      );
      assert.strictEqual(pdfData.generatedAs, 'PDF');

      const multilinePdfResult = formulaEngine.evaluateCell('sheet-1', 'C3', {});
      const multilinePdfData = JSON.parse(
        String(multilinePdfResult).slice('__ATTACHMENT__:'.length),
      );
      assert.match(
        Buffer.from(String(multilinePdfData.content || ''), 'base64').toString(
          'utf8',
        ),
        /item 1/,
      );

      cells.C4 = '=PDF("markdown.pdf", "# Title\\n\\n- one\\n- **two**\\n[doc](https://example.com)")';
      const markdownPdfResult = formulaEngine.evaluateCell('sheet-1', 'C4', {});
      const markdownPdfData = JSON.parse(
        String(markdownPdfResult).slice('__ATTACHMENT__:'.length),
      );
      const markdownPdfText = Buffer.from(
        String(markdownPdfData.content || ''),
        'base64',
      ).toString('utf8');
      assert.doesNotMatch(markdownPdfText, /# Title/);
      assert.match(markdownPdfText, /\(Title\) Tj/);
      assert.match(markdownPdfText, /\(\* one\) Tj/);
      assert.match(markdownPdfText, /\(\* two\) Tj/);
      assert.match(markdownPdfText, /\(doc \(https:\/\/example\.com\)\) Tj/);
      assert.strictEqual(pdfData.content, 'Hello World');

      const docxResult = formulaEngine.evaluateCell('sheet-1', 'C2', {});
      const docxData = JSON.parse(
        String(docxResult).slice('__ATTACHMENT__:'.length),
      );
      assert.strictEqual(docxData.name, 'summary.docx');
      assert.strictEqual(
        docxData.type,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );

      assert.strictEqual(
        formulaEngine.evaluateCell('sheet-1', 'D1', {}),
        '',
        'FILE with empty name should return empty string',
      );
    });

    it('collects dependency references for all AI formula shapes', async function () {
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');

      const cells = {
        A1: "'sum @B1",
        A2: '>items from @B2',
        A3: '#table from @B3;2;2',
        A4: '=askAI("explain @B4")',
        A5: '=listAI("ideas from @B5", 3)',
        B1: '11',
        B2: '12',
        B3: '13',
        B4: '14',
        B5: '15',
      };
      const storageService = {
        getCellValue(sheetId, cellId) {
          return cells[cellId] || '';
        },
        getCellState() {
          return 'resolved';
        },
        resolveNamedCell() {
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {},
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        Object.keys(cells),
      );

      const a1Deps = formulaEngine.collectCellDependencies('sheet-1', 'A1');
      const a2Deps = formulaEngine.collectCellDependencies('sheet-1', 'A2');
      const a3Deps = formulaEngine.collectCellDependencies('sheet-1', 'A3');
      const a4Deps = formulaEngine.collectCellDependencies('sheet-1', 'A4');
      const a5Deps = formulaEngine.collectCellDependencies('sheet-1', 'A5');

      assert.ok(
        a1Deps.some(
          (item) => item.sheetId === 'sheet-1' && item.cellId === 'B1',
        ),
      );
      assert.ok(
        a2Deps.some(
          (item) => item.sheetId === 'sheet-1' && item.cellId === 'B2',
        ),
      );
      assert.ok(
        a3Deps.some(
          (item) => item.sheetId === 'sheet-1' && item.cellId === 'B3',
        ),
      );
      assert.ok(
        a4Deps.some(
          (item) => item.sheetId === 'sheet-1' && item.cellId === 'B4',
        ),
      );
      assert.ok(
        a5Deps.some(
          (item) => item.sheetId === 'sheet-1' && item.cellId === 'B5',
        ),
      );
    });

    it('stores empty mention params as empty values and exposes display placeholders', async function () {
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');

      const cells = {
        A1: '',
        B1: "'summarize @A1 and @name",
        B2: '>ideas from @A1 and @name',
        B3: '#compare @A1 and @name;2;2',
        B4: '=SUM(@A1, 1)',
      };
      const storageService = {
        getCellValue(sheetId, cellId) {
          return cells[cellId] || '';
        },
        getCellState() {
          return 'resolved';
        },
        getCellDisplayValue() {
          return '';
        },
        resolveNamedCell(name) {
          if (name === 'name') return { sheetId: 'sheet-1', cellId: 'A1' };
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {},
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        Object.keys(cells),
      );

      const b1Meta = {};
      const b2Meta = {};
      const b3Meta = {};
      const b4Meta = {};

      assert.strictEqual(
        formulaEngine.evaluateCell(
          'sheet-1',
          'B1',
          {},
          { runtimeMeta: b1Meta },
        ),
        '',
      );
      assert.strictEqual(b1Meta.displayValue, 'Params: @A1, @name are empty');
      assert.strictEqual(
        formulaEngine.evaluateCell(
          'sheet-1',
          'B2',
          {},
          { runtimeMeta: b2Meta },
        ),
        '',
      );
      assert.strictEqual(b2Meta.displayValue, 'Params: @A1, @name are empty');
      assert.strictEqual(
        formulaEngine.evaluateCell(
          'sheet-1',
          'B3',
          {},
          { runtimeMeta: b3Meta },
        ),
        '',
      );
      assert.strictEqual(b3Meta.displayValue, 'Params: @A1, @name are empty');
      assert.strictEqual(
        formulaEngine.evaluateCell(
          'sheet-1',
          'B4',
          {},
          { runtimeMeta: b4Meta },
        ),
        '',
      );
      assert.strictEqual(b4Meta.displayValue, 'Params: @A1 are empty');
    });
    it('accepts an optional question marker after formula prefixes', async function () {
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');

      const cells = {
        A1: '5',
        B1: '=? @A1 + 2',
      };
      const storageService = {
        getCellValue(sheetId, cellId) {
          return cells[cellId] || '';
        },
        getCellState() {
          return 'resolved';
        },
        getCellDisplayValue() {
          return '';
        },
        resolveNamedCell() {
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {},
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        Object.keys(cells),
      );

      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'B1', {}), 7);
      assert.deepStrictEqual(
        formulaEngine.parseListShortcutSpec('>? brainstorm @A1'),
        {
          prompt: 'brainstorm @A1',
          includeAttachments: false,
          days: 1,
          placeholder: '',
        },
      );
      assert.deepStrictEqual(
        formulaEngine.parseTablePromptSpec('#? compare @A1;3;3'),
        {
          prompt: 'compare @A1',
          cols: 3,
          rows: 3,
          placeholder: '',
        },
      );
    });

    it('supports display placeholders for empty formula values', async function () {
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');

      const cells = {
        A1: '',
        B1: "'summarize @A1:[Waiting for input]",
        B2: '=TRIM(A1):[Nothing yet]',
      };
      const storageService = {
        getCellValue(sheetId, cellId) {
          return cells[cellId] || '';
        },
        getCellState() {
          return 'resolved';
        },
        getCellDisplayValue() {
          return '';
        },
        resolveNamedCell() {
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {},
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        Object.keys(cells),
      );

      const askMeta = {};
      const eqMeta = {};
      assert.strictEqual(
        formulaEngine.evaluateCell(
          'sheet-1',
          'B1',
          {},
          { runtimeMeta: askMeta },
        ),
        '',
      );
      assert.strictEqual(askMeta.displayValue, 'Waiting for input');
      assert.strictEqual(
        formulaEngine.evaluateCell(
          'sheet-1',
          'B2',
          {},
          { runtimeMeta: eqMeta },
        ),
        '',
      );
      assert.strictEqual(eqMeta.displayValue, 'Nothing yet');
    });

    it('highlights only empty cells referenced by mention-style formulas', async function () {
      const { shouldHighlightEmptyMentionedCell } =
        await import('../imports/ui/metacell/runtime/cell-render-model.js');

      const app = {
        storage: {
          getDependencyGraph() {
            return {
              dependentsByCell: {
                'sheet-1:A1': ['sheet-1:B1'],
                'sheet-1:C5': ['sheet-1:D4'],
              },
            };
          },
          getCellValue(sheetId, cellId) {
            if (sheetId === 'sheet-1' && cellId === 'B1') return '=SUM(@A1, 1)';
            if (sheetId === 'sheet-1' && cellId === 'D4')
              return '# top 5 countries by gdp';
            return '';
          },
        },
      };

      assert.strictEqual(
        shouldHighlightEmptyMentionedCell(app, 'sheet-1', 'A1', ''),
        true,
      );
      assert.strictEqual(
        shouldHighlightEmptyMentionedCell(app, 'sheet-1', 'C5', ''),
        false,
      );
    });

    it('persists display placeholders separately from computed values', async function () {
      const { WorkbookStorageAdapter } =
        await import('../imports/engine/workbook-storage-adapter.js');

      const storage = new WorkbookStorageAdapter({
        sheets: {
          'sheet-1': {
            cells: {
              B1: {
                source: "'summarize @A1",
                sourceType: 'formula',
                value: '',
                state: 'resolved',
              },
            },
          },
        },
      });

      storage.setComputedCellValue('sheet-1', 'B1', '', 'resolved', '', {
        displayValue: 'Params: @A1 are empty',
      });

      assert.strictEqual(storage.getCellComputedValue('sheet-1', 'B1'), '');
      assert.strictEqual(
        storage.getCellDisplayValue('sheet-1', 'B1'),
        'Params: @A1 are empty',
      );
    });

    it('expands quoted mentions inside question-mark prompt formulas', async function () {
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');

      const cells = {
        B2: 'hello',
        C1: '\'? "@B2" in russian',
      };
      const storageService = {
        getCellValue(sheetId, cellId) {
          return cells[cellId] || '';
        },
        getCellState() {
          return 'resolved';
        },
        getCellDisplayValue() {
          return '';
        },
        resolveNamedCell() {
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {
          ask(userPrompt) {
            return userPrompt;
          },
        },
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        Object.keys(cells),
      );

      assert.strictEqual(
        formulaEngine.evaluateCell('sheet-1', 'C1', {}),
        '"hello" in russian',
      );
    });

    it('records chained AI prompt dependencies even when upstream AI cells are pending', async function () {
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');

      const cells = {
        A1: '2',
        B1: "'шутка на тему @A1",
        C3: "'какого типа шутка @B1",
        B4: "'еще такого плана: @C3",
      };
      const states = {
        A1: 'resolved',
        B1: 'pending',
        C3: 'stale',
        B4: 'stale',
      };
      const storageService = {
        getCellValue(sheetId, cellId) {
          return cells[cellId] || '';
        },
        getCellState(sheetId, cellId) {
          return states[cellId] || '';
        },
        getCellDisplayValue() {
          return '';
        },
        resolveNamedCell() {
          return null;
        },
      };
      const createCollector = () => {
        const cells = [];
        return {
          addCell(sheetId, cellId) {
            cells.push({
              sheetId: String(sheetId || ''),
              cellId: String(cellId || '').toUpperCase(),
            });
          },
          addNamedRef() {},
          addChannel() {},
          addAttachment() {},
          snapshot() {
            return { cells };
          },
        };
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {
          ask() {
            throw new Error('unexpected ask');
          },
        },
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        Object.keys(cells),
      );

      const c3Collector = createCollector();
      const c3Value = formulaEngine.evaluateCell(
        'sheet-1',
        'C3',
        {},
        {
          dependencyCollector: c3Collector,
        },
      );
      assert.strictEqual(c3Value, '...');
      assert.deepStrictEqual(c3Collector.snapshot().cells, [
        { sheetId: 'sheet-1', cellId: 'B1' },
      ]);

      const b4Collector = createCollector();
      const b4Value = formulaEngine.evaluateCell(
        'sheet-1',
        'B4',
        {},
        {
          dependencyCollector: b4Collector,
        },
      );
      assert.strictEqual(b4Value, '...');
      assert.deepStrictEqual(b4Collector.snapshot().cells, [
        { sheetId: 'sheet-1', cellId: 'C3' },
      ]);
    });

    it('adds registered formulas to help automatically', async function () {
      const { HELP_SECTIONS } =
        await import('../imports/ui/help/helpContent.js');
      const { getRegisteredFormulaManifest } =
        await import('../imports/engine/formulas/index.js');
      const builtins = HELP_SECTIONS.find(
        (section) => section && section.title === 'Built-in formulas',
      );
      const manifest = getRegisteredFormulaManifest();

      assert.ok(builtins);
      assert.ok(Array.isArray(builtins.items));
      assert.ok(Array.isArray(manifest));
      assert.ok(manifest.some((item) => item.file === 'SUM.js'));
      assert.ok(manifest.some((item) => item.file === 'FILTER.js'));
      assert.ok(
        manifest.every((item) =>
          /^[0-9a-f]{8}$/.test(String(item.discoveryHash || '')),
        ),
      );
      assert.ok(
        builtins.items.some((item) =>
          String(item).includes('SUM(value1, value2, ...)'),
        ),
      );
      assert.ok(
        builtins.items.some((item) =>
          String(item).includes('VLOOKUP(lookupValue, table, columnIndex'),
        ),
      );
      assert.ok(
        builtins.items.some((item) =>
          String(item).includes(
            'XLOOKUP(lookupValue, lookupRange, returnRange',
          ),
        ),
      );
      assert.ok(
        builtins.items.some((item) =>
          String(item).includes('COUNTIF(range, criteria)'),
        ),
      );
      assert.ok(
        builtins.items.some((item) => String(item).includes('TODAY()')),
      );
      assert.ok(
        builtins.items.some((item) =>
          String(item).includes('DATEDIF(startDate, endDate, unit)'),
        ),
      );
      assert.ok(
        builtins.items.some((item) => String(item).includes('TRIM(value)')),
      );
      assert.ok(
        builtins.items.some((item) =>
          String(item).includes('FILTER(range, criteriaRange, criteria)'),
        ),
      );
    });

    it('discovers file-based AI providers automatically', async function () {
      const { getRegisteredAIProviders, getRegisteredAIProviderManifest } =
        await import('../imports/api/settings/providers/index.js');

      const providers = getRegisteredAIProviders();
      const manifest = getRegisteredAIProviderManifest();

      assert.ok(Array.isArray(providers));
      assert.ok(Array.isArray(manifest));
      assert.ok(providers.some((item) => item.id === 'openai'));
      assert.ok(providers.some((item) => item.id === 'aws-bedrock'));
      assert.ok(providers.some((item) => item.id === 'corporate-ai-model'));
      assert.ok(providers.some((item) => item.id === 'lm-studio'));
      assert.ok(manifest.some((item) => item.file === 'AWS_BEDROCK.js'));
      assert.ok(manifest.some((item) => item.file === 'CORPORATE_AI_MODEL.js'));
      assert.ok(manifest.some((item) => item.file === 'LM_STUDIO.js'));
      assert.ok(
        manifest.every((item) =>
          /^[0-9a-f]{8}$/.test(String(item.discoveryHash || '')),
        ),
      );
    });

    it('persists simple cell formats in workbook storage', async function () {
      const { WorkbookStorageAdapter } =
        await import('../imports/engine/workbook-storage-adapter.js');

      const storage = new WorkbookStorageAdapter({});
      storage.setCellSource('sheet-1', 'A1', '123');
      storage.setCellFormat('sheet-1', 'A1', 'currency_eur');
      storage.setCellPresentation('sheet-1', 'A1', {
        align: 'right',
        bold: true,
        italic: true,
      });

      assert.strictEqual(
        storage.getCellFormat('sheet-1', 'A1'),
        'currency_eur',
      );
      assert.strictEqual(
        storage.snapshot().sheets['sheet-1'].cells.A1.format,
        'currency_eur',
      );
      assert.strictEqual(
        storage.getCellPresentation('sheet-1', 'A1').align,
        'right',
      );
      assert.strictEqual(
        storage.getCellPresentation('sheet-1', 'A1').bold,
        true,
      );
      assert.strictEqual(
        storage.getCellPresentation('sheet-1', 'A1').italic,
        true,
      );

      storage.setCellSource('sheet-1', 'A1', '456');
      assert.strictEqual(
        storage.getCellFormat('sheet-1', 'A1'),
        'currency_eur',
      );
      assert.strictEqual(
        storage.getCellPresentation('sheet-1', 'A1').align,
        'right',
      );
    });

    it('discovers file-based channel connectors automatically', async function () {
      const {
        getRegisteredChannelConnectors,
        getRegisteredChannelConnectorManifest,
      } = await import('../imports/api/channels/connectors/index.js');
      const { HELP_SECTIONS } =
        await import('../imports/ui/help/helpContent.js');

      const connectors = getRegisteredChannelConnectors();
      const manifest = getRegisteredChannelConnectorManifest();
      const helpSection = HELP_SECTIONS.find(
        (section) => section && section.title === 'Channels',
      );

      assert.ok(connectors.some((item) => item.id === 'imap-email'));
      assert.ok(connectors.some((item) => item.id === 'telegram'));
      assert.ok(connectors.some((item) => item.id === 'twitter'));
      assert.ok(manifest.some((item) => item.file === 'IMAP.js'));
      assert.ok(manifest.some((item) => item.file === 'TELEGRAM.js'));
      assert.ok(manifest.some((item) => item.file === 'TWITTER.js'));
      assert.ok(
        manifest.every((item) =>
          /^[0-9a-f]{8}$/.test(String(item.discoveryHash || '')),
        ),
      );
      assert.ok(helpSection);
      assert.ok(
        helpSection.items.some((item) =>
          String(item).includes('Email (IMAP + SMTP)'),
        ),
      );
      assert.ok(
        helpSection.items.some((item) =>
          String(item).includes('/tg:send:hello'),
        ),
      );
      assert.ok(
        helpSection.items.some((item) => String(item).includes('Telegram')),
      );
      assert.ok(
        helpSection.items.some((item) => String(item).includes('Twitter / X')),
      );
    });

    it('returns a readable error for invalid IMAP test settings', async function () {
      const { testImapConnection } =
        await import('../imports/api/channels/server/handlers/imap.js');

      await assert.rejects(
        () =>
          testImapConnection({
            host: '',
            username: '',
            password: '',
            mailbox: 'INBOX',
          }),
        /IMAP host is required/,
      );
    });

    it('returns a readable error for invalid Telegram test settings', async function () {
      const { testTelegramConnection } =
        await import('../imports/api/channels/server/handlers/telegram.js');

      await assert.rejects(
        () =>
          testTelegramConnection({
            token: '',
            chatId: '',
          }),
        /Telegram bot token is required/,
      );
    });

    it('returns a readable error for invalid Twitter/X test settings', async function () {
      const { testTwitterConnection } =
        await import('../imports/api/channels/server/handlers/twitter.js');

      await assert.rejects(
        () =>
          testTwitterConnection({
            accessToken: '',
            apiBaseUrl: 'https://api.x.com',
          }),
        /Twitter\/X access token is required/,
      );
    });

    it('rejects Twitter/X attachments before calling the API', async function () {
      const { sendTwitterMessage } =
        await import('../imports/api/channels/server/handlers/twitter.js');

      await assert.rejects(
        () =>
          sendTwitterMessage({
            settings: {
              accessToken: 'token',
              apiBaseUrl: 'https://api.x.com',
            },
            attachments: [{ name: 'logo.png' }],
          }),
        /does not support attachments yet/,
      );
    });

    it('parses slash-send channel commands', async function () {
      const {
        buildChannelSendAttachmentsFromPreparedPrompt,
        buildChannelSendBodyFromPreparedPrompt,
        parseChannelSendCommand,
        stripChannelSendFileAndImagePlaceholders,
      } = await import('../imports/api/channels/commands.js');

      assert.deepStrictEqual(parseChannelSendCommand('/tg hello from sheet'), {
        label: 'tg',
        message: 'hello from sheet',
      });
      assert.deepStrictEqual(parseChannelSendCommand('/tg:send:message'), {
        label: 'tg',
        message: 'message',
      });
      assert.deepStrictEqual(parseChannelSendCommand('/tg:send:hello'), {
        label: 'tg',
        message: 'hello',
      });
      assert.deepStrictEqual(
        parseChannelSendCommand(
          '/sf:send:{"to":"zentelechia@gmail.com","subj":"Hi","body":"hello"}',
        ),
        {
          label: 'sf',
          message: '{"to":"zentelechia@gmail.com","subj":"Hi","body":"hello"}',
        },
      );
      assert.strictEqual(parseChannelSendCommand('plain text'), null);

      assert.strictEqual(
        buildChannelSendBodyFromPreparedPrompt({
          userPrompt: 'hello',
          userContent: [
            { type: 'text', text: 'hello <attached file: policy.txt>' },
            { type: 'text', text: 'Attached file: policy.txt\n\nPolicy body' },
          ],
        }),
        'hello <attached file: policy.txt>\n\nAttached file: policy.txt\n\nPolicy body',
      );
      assert.strictEqual(
        buildChannelSendBodyFromPreparedPrompt({
          userPrompt: '<attached image: logo.png> okok',
        }),
        'okok',
      );
      assert.strictEqual(
        stripChannelSendFileAndImagePlaceholders(
          '<attached file: policy.txt> hello',
        ),
        'hello',
      );
      assert.deepStrictEqual(
        buildChannelSendAttachmentsFromPreparedPrompt({
          imageAttachments: [
            {
              name: 'logo.png',
              type: 'image/png',
              downloadUrl: '/artifacts/logo',
            },
          ],
          textAttachments: [
            {
              name: 'policy.pdf',
              type: 'application/pdf',
              downloadUrl: '/artifacts/policy',
            },
          ],
        }),
        [
          {
            name: 'logo.png',
            type: 'image/png',
            binaryArtifactId: '',
            downloadUrl: '/artifacts/logo',
          },
          {
            name: 'policy.pdf',
            type: 'application/pdf',
            binaryArtifactId: '',
            downloadUrl: '/artifacts/policy',
          },
        ],
      );
    });

    it('collects and injects channel mentions into AI prompts', async function () {
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');
      const { formatChannelEventForPrompt } =
        await import('../imports/api/channels/mentioning.js');

      const storageService = {
        getCellValue() {
          return '';
        },
        getCellState() {
          return 'resolved';
        },
        resolveNamedCell() {
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {},
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        ['A1'],
      );

      const dependencies = formulaEngine.collectAIPromptDependencies(
        'sheet-1',
        'summarize /sf in one sentence',
      );
      assert.ok(
        dependencies.some(
          (item) => item && item.kind === 'channel' && item.label === 'sf',
        ),
      );
      assert.strictEqual(
        formulaEngine.arePromptDependenciesResolved(
          'sheet-1',
          'summarize /sf',
          { channelPayloads: {} },
        ),
        false,
      );

      const prepared = formulaEngine.prepareAIPrompt(
        'sheet-1',
        'summarize /sf in one sentence',
        {},
        {
          channelPayloads: {
            sf: {
              label: 'sf',
              event: 'message.new',
              subject: 'New task',
              from: ['boss@example.com'],
              text: 'Please prepare the weekly summary.',
            },
          },
        },
      );

      assert.match(prepared.userPrompt, /Event: message\.new/);
      assert.match(prepared.userPrompt, /Subject: New task/);
      assert.match(prepared.userPrompt, /Please prepare the weekly summary\./);

      const withoutAttachments = formatChannelEventForPrompt(
        {
          label: 'sf',
          subject: 'New task',
          text: 'Please prepare the weekly summary.',
          attachments: [{ name: 'invoice.pdf', content: 'invoice body' }],
        },
        { includeAttachments: false },
      );
      assert.doesNotMatch(withoutAttachments, /Attachments:/);

      const withAttachments = formatChannelEventForPrompt(
        {
          label: 'sf',
          subject: 'New task',
          text: 'Please prepare the weekly summary.',
          attachments: [{ name: 'invoice.pdf', content: 'invoice body' }],
        },
        { includeAttachments: true },
      );
      assert.match(withAttachments, /Attachments:/);
    });

    it('sends file mentions as attached text content while preserving prompt text', async function () {
      const { buildChannelSendBodyFromPreparedPrompt } =
        await import('../imports/api/channels/commands.js');
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');

      const storageService = {
        getCellValue(sheetId, cellId) {
          if (cellId === 'A1') {
            return '__ATTACHMENT__:{"name":"policy.txt","type":"text/plain","content":"Policy body"}';
          }
          return '';
        },
        getCellState() {
          return 'resolved';
        },
        getCellDisplayValue() {
          return '';
        },
        resolveNamedCell(name) {
          if (name === 'file') return { sheetId: 'sheet-1', cellId: 'A1' };
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {},
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        ['A1', 'B1'],
      );

      const prepared = formulaEngine.prepareAIPrompt(
        'sheet-1',
        'summarize @file briefly',
        {},
        { channelPayloads: {} },
      );

      assert.strictEqual(
        prepared.userPrompt,
        'summarize <attached file: policy.txt> briefly',
      );
      assert.ok(Array.isArray(prepared.userContent));
      assert.deepStrictEqual(prepared.userContent[0], {
        type: 'text',
        text: 'summarize <attached file: policy.txt> briefly',
      });
      assert.deepStrictEqual(prepared.userContent[1], {
        type: 'text',
        text: 'Attached file: policy.txt\n\nPolicy body',
      });
      assert.deepStrictEqual(prepared.textAttachments, [
        {
          sheetId: 'sheet-1',
          cellId: 'A1',
          name: 'policy.txt',
          type: 'text/plain',
          binaryArtifactId: '',
          url: '',
          downloadUrl: '',
          previewUrl: '',
          content: 'Policy body',
        },
      ]);
      assert.strictEqual(
        buildChannelSendBodyFromPreparedPrompt(prepared),
        'summarize <attached file: policy.txt> briefly\n\nAttached file: policy.txt\n\nPolicy body',
      );
    });

    it('strips attached image placeholders from AI text parts while preserving image content parts', async function () {
      const { AIService } =
        await import('../imports/ui/metacell/runtime/ai-service.js');
      const { aiMethods } =
        await import('../imports/engine/formula-engine/ai-methods.js');

      const cleanedPrompt = aiMethods.stripAIPromptImagePlaceholders(
        'how many people on <attached image: team.jpg> - return a number only',
      );
      assert.strictEqual(
        cleanedPrompt,
        'how many people in this image - return a number only',
      );

      const aiService = new AIService({
        getCacheValue() {
          return undefined;
        },
        setCacheValue() {},
      });
      assert.deepStrictEqual(
        aiService.buildUserMessageContent('', [
          { type: 'text', text: cleanedPrompt },
          {
            type: 'image_url',
            image_url: { url: 'data:image/jpeg;base64,abc' },
          },
        ]),
        [
          {
            type: 'text',
            text: 'how many people in this image - return a number only',
          },
          {
            type: 'image_url',
            image_url: { url: 'data:image/jpeg;base64,abc' },
          },
        ],
      );
    });

    it('parses channel-feed shortcuts without breaking table shortcuts', async function () {
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');

      const storageService = {
        getCellValue() {
          return '';
        },
        getCellState() {
          return 'resolved';
        },
        resolveNamedCell() {
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {},
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        ['A1'],
      );

      const todaySpec = formulaEngine.parseChannelFeedPromptSpec(
        '# /sf summarise each message',
      );
      assert.deepStrictEqual(todaySpec, {
        prompt: '/sf summarise each message',
        days: 1,
        labels: ['sf'],
        includeAttachments: false,
        placeholder: '',
      });

      const weekSpec = formulaEngine.parseChannelFeedPromptSpec(
        '#7 /sf extract action items',
      );
      assert.deepStrictEqual(weekSpec, {
        prompt: '/sf extract action items',
        days: 7,
        labels: ['sf'],
        includeAttachments: false,
        placeholder: '',
      });

      const attachmentOptInWeekSpec = formulaEngine.parseChannelFeedPromptSpec(
        '#+7 /sf extract action items',
      );
      assert.deepStrictEqual(attachmentOptInWeekSpec, {
        prompt: '/sf extract action items',
        days: 7,
        labels: ['sf'],
        includeAttachments: true,
        placeholder: '',
      });

      const listSpec = formulaEngine.parseListShortcutSpec(
        '> /sf any payment requests?',
      );
      assert.deepStrictEqual(listSpec, {
        prompt: '/sf any payment requests?',
        includeAttachments: false,
        days: 1,
        placeholder: '',
      });

      const listAttachmentSpec = formulaEngine.parseListShortcutSpec(
        '>+7 /sf any payment requests?',
      );
      assert.deepStrictEqual(listAttachmentSpec, {
        prompt: '/sf any payment requests?',
        includeAttachments: true,
        days: 7,
        placeholder: '',
      });

      assert.strictEqual(
        formulaEngine.parseChannelFeedPromptSpec('#compare @idea;4;6'),
        null,
      );
      assert.deepStrictEqual(
        formulaEngine.parseTablePromptSpec('#compare @idea;4;6'),
        {
          prompt: 'compare @idea',
          cols: 4,
          rows: 6,
          placeholder: '',
        },
      );
    });

    it('builds default settings from discovered AI providers', async function () {
      const {
        DEFAULT_AI_PROVIDERS,
        DEFAULT_SETTINGS_ID,
        ensureDefaultSettings,
        AppSettings,
      } = await import('../imports/api/settings/index.js');

      await AppSettings.removeAsync({ _id: DEFAULT_SETTINGS_ID });
      const settings = await ensureDefaultSettings();

      try {
        assert.strictEqual(settings._id, DEFAULT_SETTINGS_ID);
        assert.strictEqual(
          settings.aiProviders.length,
          DEFAULT_AI_PROVIDERS.length,
        );
        assert.ok(settings.aiProviders.some((item) => item.id === 'openai'));
        assert.ok(settings.aiProviders.some((item) => item.id === 'aws-bedrock'));
        assert.ok(settings.aiProviders.some((item) => item.id === 'lm-studio'));
      } finally {
        await AppSettings.removeAsync({ _id: DEFAULT_SETTINGS_ID });
        await ensureDefaultSettings();
      }
    });

    it('builds OpenAI responses input for multimodal messages and extracts output text', async function () {
      const { buildOpenAIResponsesInput, extractOpenAIResponsesText } =
        await import('../imports/api/ai/index.js');

      assert.deepStrictEqual(
        buildOpenAIResponsesInput([
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What do you see in this image?' },
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,abc' },
              },
            ],
          },
        ]),
        [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'What do you see in this image?',
              },
              {
                type: 'input_image',
                image_url: 'data:image/png;base64,abc',
              },
            ],
          },
        ],
      );

      assert.strictEqual(
        extractOpenAIResponsesText({
          output: [
            {
              content: [
                { type: 'output_text', text: '1' },
                { type: 'ignored', text: 'x' },
              ],
            },
          ],
        }),
        '1',
      );
    });

    it('saves workbook cell content in Mongo', async function () {
      const { Sheets } = await import('../imports/api/sheets/index.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');

      const sheetId = await invokeRpc('sheets.create', 'Test Save Workbook');

      try {
        const workbook = {
          version: 1,
          tabs: [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
          activeTabId: 'sheet-1',
          aiMode: 'auto',
          namedCells: {},
          sheets: {
            'sheet-1': {
              cells: {
                A1: {
                  source: 'hello world',
                  sourceType: 'raw',
                  value: 'hello world',
                  state: 'resolved',
                  generatedBy: '',
                  version: 1,
                },
              },
              columnWidths: {},
              rowHeights: {},
              reportContent: '',
            },
          },
          caches: {},
          globals: {},
        };

        await invokeRpc('sheets.saveWorkbook', 
          sheetId,
          workbook,
        );

        const saved = await Sheets.findOneAsync(sheetId);
        assert.ok(saved);
        assert.strictEqual(typeof saved.storage, 'undefined');

        const decodedWorkbook = decodeWorkbookDocument(saved.workbook || {});
        assert.strictEqual(
          decodedWorkbook.sheets['sheet-1'].cells.A1.source,
          'hello world',
        );
        assert.strictEqual(
          decodedWorkbook.sheets['sheet-1'].cells.A1.value,
          'hello world',
        );
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });

    it('computes and persists formula cell values', async function () {
      const { Sheets } = await import('../imports/api/sheets/index.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');

      const sheetId = await invokeRpc('sheets.create', 'Test Compute Workbook');

      try {
        const workbook = {
          version: 1,
          tabs: [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
          activeTabId: 'sheet-1',
          aiMode: 'auto',
          namedCells: {},
          sheets: {
            'sheet-1': {
              cells: {
                A1: {
                  source: 'alpha',
                  sourceType: 'raw',
                  value: 'alpha',
                  state: 'resolved',
                  generatedBy: '',
                  version: 1,
                },
                B1: {
                  source: '=A1',
                  sourceType: 'formula',
                  value: '',
                  state: 'stale',
                  generatedBy: '',
                  version: 1,
                },
              },
              columnWidths: {},
              rowHeights: {},
              reportContent: '',
            },
          },
          caches: {},
          globals: {},
        };

        await invokeRpc('sheets.saveWorkbook', 
          sheetId,
          workbook,
        );
        const result = await invokeRpc('sheets.computeGrid', sheetId, 'sheet-1', {});

        assert.strictEqual(result.values.B1, 'alpha');

        const saved = await Sheets.findOneAsync(sheetId);
        const decodedWorkbook = decodeWorkbookDocument(saved.workbook || {});
        assert.strictEqual(
          decodedWorkbook.sheets['sheet-1'].cells.B1.value,
          'alpha',
        );
        assert.strictEqual(
          decodedWorkbook.sheets['sheet-1'].cells.B1.state,
          'resolved',
        );
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });

    it('creates a precomputed formula test workbook', async function () {
      const { Sheets } = await import('../imports/api/sheets/index.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');

      const sheetId = await invokeRpc('sheets.createFormulaTestWorkbook');

      try {
        const saved = await Sheets.findOneAsync(sheetId);
        assert.ok(saved);
        assert.strictEqual(saved.name, 'Formula Test Bench');

        const workbook = decodeWorkbookDocument(saved.workbook || {});
        assert.strictEqual(workbook.tabs.length, 3);
        assert.strictEqual(workbook.activeTabId, 'sheet-1');
        assert.deepStrictEqual(workbook.namedCells.base_value, {
          sheetId: 'sheet-1',
          cellId: 'J2',
        });
        assert.deepStrictEqual(workbook.namedCells.edit_value, {
          sheetId: 'sheet-1',
          cellId: 'J10',
        });
        assert.deepStrictEqual(workbook.namedCells.idea, {
          sheetId: 'sheet-3',
          cellId: 'J2',
        });
        assert.deepStrictEqual(workbook.namedCells.plans, {
          sheetId: 'sheet-2',
          startCellId: 'A2',
          endCellId: 'C4',
        });

        assert.strictEqual(workbook.sheets['sheet-1'].cells.B5.value, '30');
        assert.strictEqual(workbook.sheets['sheet-1'].cells.D5.value, 'PASS');
        assert.strictEqual(workbook.sheets['sheet-1'].cells.B18.value, '20');
        assert.strictEqual(workbook.sheets['sheet-1'].cells.D18.value, 'PASS');
        assert.strictEqual(
          workbook.sheets['sheet-1'].cells.B21.value,
          'pro,20,growth',
        );
        assert.strictEqual(workbook.sheets['sheet-1'].cells.D21.value, 'PASS');
        assert.strictEqual(workbook.sheets['sheet-1'].cells.B27.value, '10');
        assert.strictEqual(workbook.sheets['sheet-1'].cells.D27.value, 'PASS');
        assert.strictEqual(workbook.sheets['sheet-1'].cells.J10.source, '55');
        assert.strictEqual(workbook.sheets['sheet-1'].cells.B29.value, '55');
        assert.strictEqual(workbook.sheets['sheet-1'].cells.D29.value, 'PASS');
        assert.strictEqual(workbook.sheets['sheet-1'].cells.B30.value, '11');
        assert.strictEqual(workbook.sheets['sheet-1'].cells.D30.value, 'PASS');
        assert.strictEqual(
          workbook.sheets['sheet-3'].cells.A2.source,
          "'@idea: write a one-line value proposition",
        );
        assert.strictEqual(
          workbook.sheets['sheet-3'].cells.A3.source,
          '>5 target customer segments for @idea, one per row',
        );
        assert.strictEqual(
          workbook.sheets['sheet-3'].cells.A4.source,
          '# summarize @website in 3 bullets',
        );
        assert.strictEqual(
          workbook.sheets['sheet-3'].cells.J2.source,
          'AI spreadsheet copilot for finance teams',
        );
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });

    it('creates an AI startup financial model workbook', async function () {
      const { Sheets } = await import('../imports/api/sheets/index.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');

      const sheetId = await invokeRpc('sheets.createFinancialModelWorkbook');

      try {
        const saved = await Sheets.findOneAsync(sheetId);
        assert.ok(saved);
        assert.strictEqual(saved.name, 'AI Startup Financial Model');

        const workbook = decodeWorkbookDocument(saved.workbook || {});
        assert.strictEqual(workbook.tabs.length, 3);
        assert.strictEqual(workbook.activeTabId, 'sheet-2');
        assert.deepStrictEqual(workbook.namedCells.price_per_customer, {
          sheetId: 'sheet-1',
          cellId: 'B2',
        });
        assert.deepStrictEqual(workbook.namedCells.current_mrr, {
          sheetId: 'sheet-2',
          cellId: 'G3',
        });
        assert.deepStrictEqual(workbook.namedCells.current_cash, {
          sheetId: 'sheet-2',
          cellId: 'G6',
        });

        assert.strictEqual(workbook.sheets['sheet-2'].cells.B2.value, '12');
        assert.strictEqual(workbook.sheets['sheet-2'].cells.B3.value, '5988');
        assert.strictEqual(workbook.sheets['sheet-2'].cells.B7.value, '71856');
        assert.strictEqual(workbook.sheets['sheet-2'].cells.B10.value, 'Alive');
        assert.strictEqual(
          workbook.sheets['sheet-3'].cells.A2.source,
          "'Write a one-line investor update for @company_idea with MRR @current_mrr and cash @current_cash",
        );
        assert.strictEqual(
          workbook.sheets['sheet-3'].cells.A3.source,
          '>5 reasons why @icp would buy @company_idea at @price_per_customer per month',
        );
        assert.strictEqual(
          workbook.sheets['sheet-3'].cells.J2.source,
          'AI copilot for RevOps teams',
        );
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });

    it('persists dependency graph edges for cells, named refs, channels, and attachments', async function () {
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');
      const { WorkbookStorageAdapter } =
        await import('../imports/engine/workbook-storage-adapter.js');
      const { StorageService } =
        await import('../imports/engine/storage-service.js');

      const workbook = {
        version: 1,
        tabs: [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        activeTabId: 'sheet-1',
        aiMode: 'auto',
        namedCells: {
          file: { sheetId: 'sheet-1', cellId: 'A1' },
        },
        sheets: {
          'sheet-1': {
            cells: {
              A1: {
                source:
                  '__ATTACHMENT__:{"name":"policy.txt","type":"text/plain","content":"Policy body"}',
                sourceType: 'raw',
                value:
                  '__ATTACHMENT__:{"name":"policy.txt","type":"text/plain","content":"Policy body"}',
                state: 'resolved',
                error: '',
                generatedBy: '',
                version: 1,
              },
              B1: {
                source: "'summarize @file for /sf'",
                sourceType: 'formula',
                value: '',
                state: 'stale',
                error: '',
                generatedBy: '',
                version: 1,
              },
            },
            columnWidths: {},
            rowHeights: {},
            reportContent: '',
          },
        },
        caches: {},
        globals: {},
      };

      const adapter = new WorkbookStorageAdapter(workbook);
      const storageService = new StorageService(adapter);
      const formulaEngine = new FormulaEngine(
        storageService,
        {
          ask() {
            return 'summary';
          },
        },
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        ['A1', 'B1'],
      );
      const dependencyCollector = {
        cells: [],
        namedRefs: [],
        channelLabels: [],
        attachments: [],
        addCell(sheetId, cellId) {
          if (
            !this.cells.some(
              (item) => item.sheetId === sheetId && item.cellId === cellId,
            )
          ) {
            this.cells.push({ sheetId, cellId });
          }
        },
        addNamedRef(name) {
          if (this.namedRefs.indexOf(name) === -1) this.namedRefs.push(name);
        },
        addChannel(label) {
          if (this.channelLabels.indexOf(label) === -1)
            this.channelLabels.push(label);
        },
        addAttachment(sheetId, cellId) {
          if (
            !this.attachments.some(
              (item) => item.sheetId === sheetId && item.cellId === cellId,
            )
          ) {
            this.attachments.push({ sheetId, cellId });
          }
        },
      };

      formulaEngine.evaluateCell(
        'sheet-1',
        'B1',
        {},
        {
          channelPayloads: {
            sf: {
              label: 'sf',
              event: 'message.new',
              subject: 'Policy review',
              text: 'Please summarize the latest policy',
            },
          },
          dependencyCollector,
        },
      );
      storageService.setCellDependencies('sheet-1', 'B1', dependencyCollector);

      const graph = storageService.getDependencyGraph().byCell || {};
      const entry = graph['sheet-1:B1'];

      assert.ok(entry);
      assert.deepStrictEqual(entry.namedRefs, ['file']);
      assert.deepStrictEqual(entry.channelLabels, ['sf']);
      assert.ok(
        entry.cells.some(
          (item) => item.sheetId === 'sheet-1' && item.cellId === 'A1',
        ),
      );
      assert.ok(
        entry.attachments.some(
          (item) => item.sheetId === 'sheet-1' && item.cellId === 'A1',
        ),
      );
    });

    it('clears reverse dependency graph entries when deleting a source cell', async function () {
      const { WorkbookStorageAdapter, createEmptyWorkbook } =
        await import('../imports/engine/workbook-storage-adapter.js');

      const adapter = new WorkbookStorageAdapter(createEmptyWorkbook());
      adapter.setTabs([{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }]);
      adapter.setActiveTabId('sheet-1');
      adapter.setCellSource('sheet-1', 'A1', 'seed');
      adapter.setCellSource('sheet-1', 'B1', '=A1');
      adapter.setCellDependencies('sheet-1', 'B1', {
        cells: [{ sheetId: 'sheet-1', cellId: 'A1' }],
        namedRefs: [],
        channelLabels: [],
        attachments: [],
      });

      let graph = adapter.getDependencyGraph();
      assert.deepStrictEqual(graph.dependentsByCell['sheet-1:A1'], [
        'sheet-1:B1',
      ]);

      adapter.setCellSource('sheet-1', 'B1', '');
      graph = adapter.getDependencyGraph();

      assert.strictEqual(graph.byCell['sheet-1:B1'], undefined);
      assert.strictEqual(graph.dependentsByCell['sheet-1:A1'], undefined);
      assert.strictEqual(adapter.getCellSource('sheet-1', 'B1'), '');
    });

    it('persists #REF! and hint for missing sheet dependencies', async function () {
      const { Sheets } = await import('../imports/api/sheets/index.js');
      const { computeSheetSnapshot } =
        await import('../imports/api/sheets/server/compute.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');

      const sheetId = await invokeRpc('sheets.create', 'Test Missing Sheet Ref');

      try {
        const workbook = {
          version: 1,
          tabs: [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
          activeTabId: 'sheet-1',
          aiMode: 'auto',
          namedCells: {},
          sheets: {
            'sheet-1': {
              cells: {
                A1: {
                  source: "=@'delete test'!D14",
                  sourceType: 'formula',
                  value: '',
                  state: 'stale',
                  error: '',
                  generatedBy: '',
                  version: 1,
                },
              },
              columnWidths: {},
              rowHeights: {},
              reportContent: '',
            },
          },
          caches: {},
          globals: {},
        };

        let persistedWorkbook = workbook;
        const result = await computeSheetSnapshot({
          sheetDocumentId: sheetId,
          workbookData: workbook,
          activeSheetId: 'sheet-1',
          persistWorkbook: async (nextWorkbook) => {
            persistedWorkbook = nextWorkbook;
          },
        });

        assert.strictEqual(result.values.A1, '#REF!');

        const decodedWorkbook = decodeWorkbookDocument(persistedWorkbook);
        const cell = decodedWorkbook.sheets['sheet-1'].cells.A1;
        assert.strictEqual(cell.value, '#REF!');
        assert.strictEqual(cell.state, 'error');
        assert.match(String(cell.error || ''), /Unknown sheet: delete test/);
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });

    it('surfaces AI provider errors with returned error text', async function () {
      const { AIService } =
        await import('../imports/ui/metacell/runtime/ai-service.js');

      const storage = {
        getAIMode() {
          return 'auto';
        },
        getCacheValue() {
          return undefined;
        },
        setCacheValue() {},
      };

      const service = new AIService(storage, () => {}, {
        sheetDocumentId: 'sheet-doc',
        getActiveSheetId: () => 'sheet-1',
      });

      service.requestChat = () => Promise.reject(new Error('model is wrong'));
      service.enrichPromptWithFetchedUrls = (prompt) => Promise.resolve(prompt);

      service.requestAsk('hello', 'AI_CACHE:\n---\nhello', false, '', null);
      await tick();

      assert.strictEqual(
        service.cache['AI_CACHE:\n---\nhello'],
        '#AI_ERROR: model is wrong',
      );
    });

    it('fetches URL markdown and injects it into AI prompts before request', async function () {
      const { AIService } =
        await import('../imports/ui/metacell/runtime/ai-service.js');

      const storage = {
        getAIMode() {
          return 'auto';
        },
        getCacheValue() {
          return undefined;
        },
        setCacheValue() {},
      };

      const service = new AIService(storage, () => {}, {
        sheetDocumentId: 'sheet-doc',
        getActiveSheetId: () => 'sheet-1',
      });

      let capturedMessages = null;
      service.fetchUrlAsMarkdown = (url) => {
        assert.strictEqual(url, 'https://metacells.dev');
        return Promise.resolve('# MetaCells\n\nAI spreadsheet runtime');
      };
      service.requestChat = (messages) => {
        capturedMessages = messages;
        return Promise.resolve('ok');
      };

      service.requestAsk(
        'summarize https://metacells.dev',
        'AI_CACHE:\n---\nsummarize https://metacells.dev',
        false,
        '',
        null,
      );
      await tick();

      assert.ok(Array.isArray(capturedMessages));
      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].role, 'user');
      assert.ok(
        String(capturedMessages[0].content || '').includes('summarize'),
      );
      assert.ok(
        String(capturedMessages[0].content || '').includes('<CONTENT START>'),
      );
      assert.ok(
        String(capturedMessages[0].content || '').includes(
          '# MetaCells\n\nAI spreadsheet runtime',
        ),
      );
      assert.ok(
        !String(capturedMessages[0].content || '').includes(
          'https://metacells.dev',
        ),
      );
    });

    it('dedupes and caches table AI requests for identical prompts', async function () {
      const { AIService } =
        await import('../imports/ui/metacell/runtime/ai-service.js');

      const cache = Object.create(null);
      const storage = {
        getAIMode() {
          return 'auto';
        },
        getCacheValue(key) {
          return cache[key];
        },
        setCacheValue(key, value) {
          cache[key] = value;
        },
      };

      const service = new AIService(storage, () => {}, {
        sheetDocumentId: 'sheet-doc',
        getActiveSheetId: () => 'sheet-1',
      });

      let requestCount = 0;
      service.requestChat = () => {
        requestCount += 1;
        return Promise.resolve(
          '| Name | GDP |\n| --- | --- |\n| Japan | 4.3 |',
        );
      };
      service.enrichPromptWithFetchedUrls = (prompt) => Promise.resolve(prompt);

      const first = service.askTable(
        'top states in ASIA and their metrics: name',
        1,
        5,
        {},
      );
      const second = service.askTable(
        'top states in ASIA and their metrics: name',
        1,
        5,
        {},
      );

      const [firstMatrix, secondMatrix] = await Promise.all([first, second]);
      assert.strictEqual(requestCount, 1);
      assert.deepStrictEqual(firstMatrix, [['Name'], ['Japan']]);
      assert.deepStrictEqual(secondMatrix, [['Name'], ['Japan']]);

      const thirdMatrix = await service.askTable(
        'top states in ASIA and their metrics: name',
        1,
        5,
        {},
      );
      assert.strictEqual(requestCount, 1);
      assert.deepStrictEqual(thirdMatrix, [['Name'], ['Japan']]);
    });

    it('runs table onResult before invalidate so spill data is ready for rerender', async function () {
      const { AIService } =
        await import('../imports/ui/metacell/runtime/ai-service.js');

      const events = [];
      const storage = {
        getAIMode() {
          return 'auto';
        },
        getCacheValue() {
          return undefined;
        },
        setCacheValue() {},
      };

      const service = new AIService(
        storage,
        () => {
          events.push('invalidate');
        },
        {
          sheetDocumentId: 'sheet-doc',
          getActiveSheetId: () => 'sheet-1',
        },
      );

      service.requestChat = () =>
        Promise.resolve('| Name | GDP |\n| --- | --- |\n| Japan | 4.3 |');
      service.enrichPromptWithFetchedUrls = (prompt) => Promise.resolve(prompt);

      const matrix = await service.askTable('top states in ASIA', 2, 5, {
        onResult(value) {
          events.push('result');
          assert.deepStrictEqual(value, [
            ['Name', 'GDP'],
            ['Japan', '4.3'],
          ]);
        },
      });

      assert.deepStrictEqual(matrix, [
        ['Name', 'GDP'],
        ['Japan', '4.3'],
      ]);
      assert.deepStrictEqual(events, ['result', 'invalidate']);
    });

    it('ignores stale list spill results after the source formula changes', async function () {
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');
      const { WorkbookStorageAdapter } =
        await import('../imports/engine/workbook-storage-adapter.js');
      const { StorageService } =
        await import('../imports/engine/storage-service.js');

      const workbook = {
        tabs: [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        activeTabId: 'sheet-1',
        sheets: {
          'sheet-1': {
            cells: {
              A1: {
                source: '>facts about @B2',
                sourceType: 'formula',
                value: '...',
                displayValue: '...',
                state: 'pending',
                error: '',
                generatedBy: '',
                version: 1,
              },
              B2: {
                source: 'duda',
                sourceType: 'raw',
                value: 'duda',
                displayValue: 'duda',
                state: 'resolved',
                error: '',
                generatedBy: '',
                version: 1,
              },
            },
            columnWidths: {},
            rowHeights: {},
            reportContent: '',
          },
        },
      };

      const adapter = new WorkbookStorageAdapter(workbook);
      const storageService = new StorageService(adapter);
      let pendingOnResult = null;
      const aiService = {
        list(prompt, count, onResult) {
          pendingOnResult = onResult;
          return '...';
        },
        getMode() {
          return 'auto';
        },
      };
      const engine = new FormulaEngine(
        storageService,
        aiService,
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        ['A1', 'B2'],
      );

      const first = engine.evaluateCell('sheet-1', 'A1', {});
      assert.strictEqual(first, '...');
      assert.ok(typeof pendingOnResult === 'function');

      storageService.setCellValue('sheet-1', 'A1', '>facts about @B2 updated');
      pendingOnResult(['old fact 1', 'old fact 2']);

      assert.strictEqual(storageService.getCellValue('sheet-1', 'A2'), '');
      assert.strictEqual(storageService.getCellValue('sheet-1', 'A3'), '');
    });

    it('recomputes chained named references across sheets', async function () {
      const { Sheets } = await import('../imports/api/sheets/index.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');

      const sheetId = await invokeRpc('sheets.create', 'Test Cross Sheet Named Refs');

      try {
        const workbook = {
          version: 1,
          tabs: [
            { id: 'sheet-1', name: 'Sheet 1', type: 'sheet' },
            { id: 'sheet-2', name: 'Sheet 2', type: 'sheet' },
          ],
          activeTabId: 'sheet-1',
          aiMode: 'auto',
          namedCells: {
            sum_cell: { sheetId: 'sheet-1', cellId: 'B1' },
            ref_sum_cell: { sheetId: 'sheet-2', cellId: 'A1' },
          },
          sheets: {
            'sheet-1': {
              cells: {
                A1: {
                  source: '10',
                  sourceType: 'raw',
                  value: '10',
                  state: 'resolved',
                  generatedBy: '',
                  version: 1,
                },
                A2: {
                  source: '20',
                  sourceType: 'raw',
                  value: '20',
                  state: 'resolved',
                  generatedBy: '',
                  version: 1,
                },
                A3: {
                  source: '30',
                  sourceType: 'raw',
                  value: '30',
                  state: 'resolved',
                  generatedBy: '',
                  version: 1,
                },
                B1: {
                  source: '=SUM(@A1:A3)',
                  sourceType: 'formula',
                  value: '',
                  state: 'stale',
                  generatedBy: '',
                  version: 1,
                },
                C1: {
                  source: '=@ref_sum_cell',
                  sourceType: 'formula',
                  value: '',
                  state: 'stale',
                  generatedBy: '',
                  version: 1,
                },
              },
              columnWidths: {},
              rowHeights: {},
              reportContent: '',
            },
            'sheet-2': {
              cells: {
                A1: {
                  source: '=@sum_cell',
                  sourceType: 'formula',
                  value: '',
                  state: 'stale',
                  generatedBy: '',
                  version: 1,
                },
              },
              columnWidths: {},
              rowHeights: {},
              reportContent: '',
            },
          },
          caches: {},
          globals: {},
        };

        await invokeRpc('sheets.saveWorkbook', 
          sheetId,
          workbook,
        );
        let result = await invokeRpc('sheets.computeGrid', sheetId, 'sheet-1', {});
        assert.strictEqual(result.values.B1, 60);
        assert.strictEqual(result.values.C1, 60);

        await invokeRpc('sheets.saveWorkbook', 
          sheetId,
          {
            ...workbook,
            sheets: {
              ...workbook.sheets,
              'sheet-1': {
                ...workbook.sheets['sheet-1'],
                cells: {
                  ...workbook.sheets['sheet-1'].cells,
                  A3: {
                    source: '40',
                    sourceType: 'raw',
                    value: '40',
                    state: 'resolved',
                    generatedBy: '',
                    version: 2,
                  },
                },
              },
            },
          },
        );

        result = await invokeRpc('sheets.computeGrid', sheetId, 'sheet-1', {});
        assert.strictEqual(result.values.B1, 70);
        assert.strictEqual(result.values.C1, 70);

        const saved = await Sheets.findOneAsync(sheetId);
        const decodedWorkbook = decodeWorkbookDocument(saved.workbook || {});
        assert.strictEqual(
          decodedWorkbook.sheets['sheet-1'].cells.C1.value,
          '70',
        );
        assert.strictEqual(
          decodedWorkbook.sheets['sheet-2'].cells.A1.value,
          '70',
        );
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });

    it('walks affected downstream cells from the persisted dependency graph', async function () {
      const { collectAffectedCellKeysFromSignals } =
        await import('../imports/api/sheets/server/compute.js');

      const workbook = {
        version: 1,
        tabs: [
          { id: 'sheet-1', name: 'Sheet 1', type: 'sheet' },
          { id: 'sheet-2', name: 'Sheet 2', type: 'sheet' },
        ],
        activeTabId: 'sheet-1',
        aiMode: 'auto',
        namedCells: {},
        sheets: {
          'sheet-1': {
            cells: {},
            columnWidths: {},
            rowHeights: {},
            reportContent: '',
          },
          'sheet-2': {
            cells: {},
            columnWidths: {},
            rowHeights: {},
            reportContent: '',
          },
        },
        dependencyGraph: {
          byCell: {
            'sheet-1:B1': {
              cells: [{ sheetId: 'sheet-1', cellId: 'A1' }],
              namedRefs: [],
              channelLabels: [],
              attachments: [],
            },
            'sheet-2:C1': {
              cells: [{ sheetId: 'sheet-1', cellId: 'B1' }],
              namedRefs: [],
              channelLabels: [],
              attachments: [],
            },
          },
          meta: {
            authoritative: true,
          },
        },
        caches: {},
        globals: {},
      };

      const affected = collectAffectedCellKeysFromSignals(workbook, [
        { kind: 'cell', sheetId: 'sheet-1', cellId: 'A1' },
      ]);

      assert.ok(affected);
      assert.strictEqual(affected['sheet-1:A1'], true);
      assert.strictEqual(affected['sheet-1:B1'], true);
      assert.strictEqual(affected['sheet-2:C1'], true);
    });

    it('relinks named cells when rows and columns are inserted or deleted', async function () {
      const { remapNamedCellsForStructureEdit } =
        await import('../imports/ui/metacell/runtime/structure-runtime.js');

      const parseCellId = (cellId) => {
        const match = /^([A-Za-z]+)([0-9]+)$/.exec(
          String(cellId || '').toUpperCase(),
        );
        if (!match) return null;
        let col = 0;
        for (let i = 0; i < match[1].length; i += 1) {
          col = col * 26 + (match[1].charCodeAt(i) - 64);
        }
        return {
          col,
          row: parseInt(match[2], 10),
        };
      };
      const formatCellId = (col, row) => {
        let n = Number(col) || 0;
        let label = '';
        while (n > 0) {
          const rem = (n - 1) % 26;
          label = String.fromCharCode(65 + rem) + label;
          n = Math.floor((n - 1) / 26);
        }
        return label + String(row);
      };
      const helpers = { parseCellId, formatCellId };
      const namedCells = {
        idea: { sheetId: 'sheet-1', cellId: 'J7' },
        plans: { sheetId: 'sheet-1', startCellId: 'B2', endCellId: 'D4' },
      };

      const insertRow = remapNamedCellsForStructureEdit(
        namedCells,
        'row',
        3,
        1,
        'insert',
        helpers,
      );
      assert.deepStrictEqual(insertRow.idea, {
        sheetId: 'sheet-1',
        cellId: 'J8',
      });
      assert.deepStrictEqual(insertRow.plans, {
        sheetId: 'sheet-1',
        startCellId: 'B2',
        endCellId: 'D5',
      });

      const deleteRow = remapNamedCellsForStructureEdit(
        namedCells,
        'row',
        3,
        1,
        'delete',
        helpers,
      );
      assert.deepStrictEqual(deleteRow.idea, {
        sheetId: 'sheet-1',
        cellId: 'J6',
      });
      assert.deepStrictEqual(deleteRow.plans, {
        sheetId: 'sheet-1',
        startCellId: 'B2',
        endCellId: 'D3',
      });

      const insertCol = remapNamedCellsForStructureEdit(
        namedCells,
        'col',
        4,
        1,
        'insert',
        helpers,
      );
      assert.deepStrictEqual(insertCol.idea, {
        sheetId: 'sheet-1',
        cellId: 'K7',
      });
      assert.deepStrictEqual(insertCol.plans, {
        sheetId: 'sheet-1',
        startCellId: 'B2',
        endCellId: 'E4',
      });

      const deleteCol = remapNamedCellsForStructureEdit(
        namedCells,
        'col',
        3,
        1,
        'delete',
        helpers,
      );
      assert.deepStrictEqual(deleteCol.idea, {
        sheetId: 'sheet-1',
        cellId: 'I7',
      });
      assert.deepStrictEqual(deleteCol.plans, {
        sheetId: 'sheet-1',
        startCellId: 'B2',
        endCellId: 'C4',
      });
    });

    it('marks only downstream dependent formulas stale during incremental invalidation', async function () {
      const { invalidateWorkbookDependencies } =
        await import('../imports/api/sheets/server/compute.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');

      const workbook = {
        version: 1,
        tabs: [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        activeTabId: 'sheet-1',
        aiMode: 'auto',
        namedCells: {},
        sheets: {
          'sheet-1': {
            cells: {
              A1: {
                source: '20',
                sourceType: 'raw',
                value: '20',
                state: 'resolved',
                generatedBy: '',
                version: 2,
              },
              B1: {
                source: '=A1',
                sourceType: 'formula',
                value: '10',
                state: 'resolved',
                error: '',
                generatedBy: '',
                version: 1,
              },
              C1: {
                source: '=B1',
                sourceType: 'formula',
                value: '10',
                state: 'resolved',
                error: '',
                generatedBy: '',
                version: 1,
              },
              D1: {
                source: '=99',
                sourceType: 'formula',
                value: '99',
                state: 'resolved',
                error: '',
                generatedBy: '',
                version: 1,
              },
            },
            columnWidths: {},
            rowHeights: {},
            reportContent: '',
          },
        },
        dependencyGraph: {
          byCell: {
            'sheet-1:B1': {
              cells: [{ sheetId: 'sheet-1', cellId: 'A1' }],
              namedRefs: [],
              channelLabels: [],
              attachments: [],
            },
            'sheet-1:C1': {
              cells: [{ sheetId: 'sheet-1', cellId: 'B1' }],
              namedRefs: [],
              channelLabels: [],
              attachments: [],
            },
          },
          meta: {
            authoritative: true,
          },
        },
        caches: {},
        globals: {},
      };

      const invalidated = decodeWorkbookDocument(
        invalidateWorkbookDependencies(workbook, [
          { kind: 'cell', sheetId: 'sheet-1', cellId: 'A1' },
        ]),
      );

      assert.strictEqual(
        invalidated.sheets['sheet-1'].cells.A1.state,
        'resolved',
      );
      assert.strictEqual(invalidated.sheets['sheet-1'].cells.A1.value, '20');
      assert.strictEqual(invalidated.sheets['sheet-1'].cells.B1.state, 'stale');
      assert.strictEqual(invalidated.sheets['sheet-1'].cells.C1.state, 'stale');
      assert.strictEqual(
        invalidated.sheets['sheet-1'].cells.D1.state,
        'resolved',
      );
    });

    it('marks all AI formula shapes stale when dependencies change', async function () {
      const { invalidateWorkbookDependencies } =
        await import('../imports/api/sheets/server/compute.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');

      const workbook = {
        version: 1,
        tabs: [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        activeTabId: 'sheet-1',
        aiMode: 'auto',
        namedCells: {},
        sheets: {
          'sheet-1': {
            cells: {
              A1: {
                source: "'sum @B1",
                sourceType: 'formula',
                value: 'cached ask',
                state: 'resolved',
                error: '',
                generatedBy: '',
                version: 1,
              },
              A2: {
                source: '>items from @B1',
                sourceType: 'formula',
                value: 'cached list item',
                state: 'resolved',
                error: '',
                generatedBy: '',
                version: 1,
              },
              A3: {
                source: '#table from @B1;2;2',
                sourceType: 'formula',
                value: '#',
                state: 'resolved',
                error: '',
                generatedBy: '',
                version: 1,
              },
              A4: {
                source: '=askAI("explain @B1")',
                sourceType: 'formula',
                value: 'cached inline ask',
                state: 'resolved',
                error: '',
                generatedBy: '',
                version: 1,
              },
              A5: {
                source: '=listAI("ideas from @B1", 3)',
                sourceType: 'formula',
                value: 'cached inline list',
                state: 'resolved',
                error: '',
                generatedBy: '',
                version: 1,
              },
              B1: {
                source: '9',
                sourceType: 'raw',
                value: '9',
                state: 'resolved',
                error: '',
                generatedBy: '',
                version: 2,
              },
            },
            columnWidths: {},
            rowHeights: {},
            reportContent: '',
          },
        },
        dependencyGraph: {
          byCell: {
            'sheet-1:A1': {
              cells: [{ sheetId: 'sheet-1', cellId: 'B1' }],
              namedRefs: [],
              channelLabels: [],
              attachments: [],
            },
            'sheet-1:A2': {
              cells: [{ sheetId: 'sheet-1', cellId: 'B1' }],
              namedRefs: [],
              channelLabels: [],
              attachments: [],
            },
            'sheet-1:A3': {
              cells: [{ sheetId: 'sheet-1', cellId: 'B1' }],
              namedRefs: [],
              channelLabels: [],
              attachments: [],
            },
            'sheet-1:A4': {
              cells: [{ sheetId: 'sheet-1', cellId: 'B1' }],
              namedRefs: [],
              channelLabels: [],
              attachments: [],
            },
            'sheet-1:A5': {
              cells: [{ sheetId: 'sheet-1', cellId: 'B1' }],
              namedRefs: [],
              channelLabels: [],
              attachments: [],
            },
          },
          dependentsByCell: {
            'sheet-1:B1': [
              'sheet-1:A1',
              'sheet-1:A2',
              'sheet-1:A3',
              'sheet-1:A4',
              'sheet-1:A5',
            ],
          },
          dependentsByNamedRef: {},
          dependentsByChannel: {},
          dependentsByAttachment: {},
          meta: {
            authoritative: true,
          },
        },
        caches: {},
        globals: {},
      };

      const invalidated = decodeWorkbookDocument(
        invalidateWorkbookDependencies(workbook, [
          { kind: 'cell', sheetId: 'sheet-1', cellId: 'B1' },
        ]),
      );

      assert.strictEqual(invalidated.sheets['sheet-1'].cells.A1.state, 'stale');
      assert.strictEqual(invalidated.sheets['sheet-1'].cells.A2.state, 'stale');
      assert.strictEqual(invalidated.sheets['sheet-1'].cells.A3.state, 'stale');
      assert.strictEqual(invalidated.sheets['sheet-1'].cells.A4.state, 'stale');
      assert.strictEqual(invalidated.sheets['sheet-1'].cells.A5.state, 'stale');
      assert.strictEqual(
        invalidated.sheets['sheet-1'].cells.B1.state,
        'resolved',
      );
    });

    it('reinvalidates quoted prompt cells when a referenced value changes', async function () {
      const { computeSheetSnapshot } =
        await import('../imports/api/sheets/server/compute.js');

      const workbook = {
        version: 1,
        tabs: [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        activeTabId: 'sheet-1',
        aiMode: 'auto',
        namedCells: {},
        sheets: {
          'sheet-1': {
            cells: {
              A8: {
                source: "'5+5+@B8+3",
                sourceType: 'formula',
                value: 'previous ai output',
                state: 'resolved',
                error: '',
                generatedBy: '',
                sourceVersion: 1,
                computedVersion: 1,
                dependencyVersion: 1,
                dependencySignature:
                  '{"cells":[{"sheetId":"sheet-1","cellId":"B8","sourceVersion":1,"computedVersion":1,"dependencyVersion":1}],"namedRefs":[],"channelLabels":[],"attachments":[]}',
                version: 1,
              },
              B8: {
                source: '7',
                sourceType: 'raw',
                value: '7',
                state: 'resolved',
                error: '',
                generatedBy: '',
                sourceVersion: 2,
                computedVersion: 2,
                dependencyVersion: 2,
                version: 2,
              },
            },
            columnWidths: {},
            rowHeights: {},
            reportContent: '',
          },
        },
        dependencyGraph: {
          byCell: {
            'sheet-1:A8': {
              cells: [{ sheetId: 'sheet-1', cellId: 'B8' }],
              namedRefs: [],
              channelLabels: [],
              attachments: [],
            },
          },
          dependentsByCell: {
            'sheet-1:B8': ['sheet-1:A8'],
          },
          dependentsByNamedRef: {},
          dependentsByChannel: {},
          dependentsByAttachment: {},
          meta: {
            authoritative: true,
          },
        },
        caches: {},
        globals: {},
      };

      const result = await computeSheetSnapshot({
        sheetDocumentId: 'quoted-prompt-test',
        workbookData: workbook,
        activeSheetId: 'sheet-1',
        changedSignals: [{ kind: 'cell', sheetId: 'sheet-1', cellId: 'B8' }],
      });

      assert.strictEqual(result.valuesBySheet['sheet-1'].A8, '...');
      assert.strictEqual(
        result.workbook.sheets['sheet-1'].cells.A8.state,
        'pending',
      );
    });

    it('recomputes quoted prompt dependents from a client workbook snapshot change', async function () {
      const { Sheets } = await import('../imports/api/sheets/index.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');

      const sheetId = await invokeRpc('sheets.create', 'Quoted Prompt Snapshot Recompute');

      try {
        const persistedWorkbook = {
          version: 1,
          tabs: [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
          activeTabId: 'sheet-1',
          aiMode: 'auto',
          namedCells: {},
          sheets: {
            'sheet-1': {
              cells: {
                B4: {
                  source: "'5+5+@C4",
                  sourceType: 'formula',
                  value: 'previous ai output',
                  state: 'resolved',
                  error: '',
                  generatedBy: '',
                  sourceVersion: 1,
                  computedVersion: 1,
                  dependencyVersion: 1,
                  dependencySignature:
                    '{"cells":[{"sheetId":"sheet-1","cellId":"C4","sourceVersion":1,"computedVersion":1,"dependencyVersion":1}],"namedRefs":[],"channelLabels":[],"attachments":[]}',
                  version: 1,
                },
                C4: {
                  source: '2',
                  sourceType: 'raw',
                  value: '2',
                  state: 'resolved',
                  error: '',
                  generatedBy: '',
                  sourceVersion: 1,
                  computedVersion: 1,
                  dependencyVersion: 1,
                  version: 1,
                },
              },
              columnWidths: {},
              rowHeights: {},
              reportContent: '',
            },
          },
          dependencyGraph: {
            byCell: {
              'sheet-1:B4': {
                cells: [{ sheetId: 'sheet-1', cellId: 'C4' }],
                namedRefs: [],
                channelLabels: [],
                attachments: [],
              },
            },
            dependentsByCell: {
              'sheet-1:C4': ['sheet-1:B4'],
            },
            dependentsByNamedRef: {},
            dependentsByChannel: {},
            dependentsByAttachment: {},
            meta: {
              authoritative: true,
            },
          },
          caches: {},
          globals: {},
        };

        await invokeRpc('sheets.saveWorkbook', 
          sheetId,
          persistedWorkbook,
        );

        const clientWorkbookSnapshot = {
          ...persistedWorkbook,
          sheets: {
            'sheet-1': {
              ...persistedWorkbook.sheets['sheet-1'],
              cells: {
                ...persistedWorkbook.sheets['sheet-1'].cells,
                C4: {
                  ...persistedWorkbook.sheets['sheet-1'].cells.C4,
                  source: '3',
                  value: '3',
                  sourceVersion: 2,
                  computedVersion: 2,
                  dependencyVersion: 2,
                  version: 2,
                },
              },
            },
          },
        };

        const result = await invokeRpc(
          'sheets.computeGrid',
          sheetId,
          'sheet-1',
          {
            workbookSnapshot: clientWorkbookSnapshot,
          },
        );

        const saved = await Sheets.findOneAsync(sheetId);
        const decodedWorkbook = decodeWorkbookDocument(saved.workbook || {});
        assert.strictEqual(result.values.B4, '...');
        assert.strictEqual(
          decodedWorkbook.sheets['sheet-1'].cells.C4.value,
          '3',
        );
        assert.strictEqual(
          decodedWorkbook.sheets['sheet-1'].cells.B4.state,
          'pending',
        );
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });

    it('repairs workbook dependency graphs explicitly and marks them authoritative', async function () {
      const { Sheets } = await import('../imports/api/sheets/index.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');
      const sheetId = await invokeRpc('sheets.create', 'Dependency Repair Test');

      try {
        const workbook = {
          version: 1,
          tabs: [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
          activeTabId: 'sheet-1',
          aiMode: 'auto',
          namedCells: {},
          sheets: {
            'sheet-1': {
              cells: {
                A1: {
                  source: '10',
                  sourceType: 'raw',
                  value: '10',
                  state: 'resolved',
                  generatedBy: '',
                  version: 1,
                },
                B1: {
                  source: '=A1',
                  sourceType: 'formula',
                  value: '',
                  state: 'stale',
                  generatedBy: '',
                  version: 1,
                },
              },
              columnWidths: {},
              rowHeights: {},
              reportContent: '',
            },
          },
          dependencyGraph: {
            byCell: {},
            meta: { authoritative: false },
          },
          caches: {},
          globals: {},
        };

        await Sheets.updateAsync(
          { _id: sheetId },
          {
            $set: {
              workbook,
              updatedAt: new Date(),
            },
            $unset: { storage: '' },
          },
        );

        await invokeRpc('sheets.rebuildDependencyGraph', sheetId);

        const saved = await Sheets.findOneAsync(sheetId);
        const decoded = decodeWorkbookDocument(saved.workbook || {});
        assert.strictEqual(decoded.dependencyGraph.meta.authoritative, true);
        assert.deepStrictEqual(
          decoded.dependencyGraph.byCell['sheet-1:B1'].cells,
          [{ sheetId: 'sheet-1', cellId: 'A1' }],
        );
        assert.deepStrictEqual(
          decoded.dependencyGraph.dependentsByCell['sheet-1:A1'],
          ['sheet-1:B1'],
        );
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });

    it('detects channel mentions inside workbook formulas', async function () {
      const { workbookMentionsChannel } =
        await import('../imports/api/sheets/index.js');

      const workbook = {
        version: 1,
        tabs: [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        activeTabId: 'sheet-1',
        aiMode: 'auto',
        namedCells: {},
        sheets: {
          'sheet-1': {
            cells: {
              A1: {
                source: '>summarize /sf in one sentence',
                sourceType: 'formula',
                value: '',
                state: 'stale',
                generatedBy: '',
                version: 1,
              },
              A2: {
                source: 'plain text',
                sourceType: 'raw',
                value: 'plain text',
                state: 'resolved',
                generatedBy: '',
                version: 1,
              },
            },
            columnWidths: {},
            rowHeights: {},
            reportContent: '',
          },
        },
        caches: {},
        globals: {},
      };

      assert.strictEqual(workbookMentionsChannel(workbook, 'sf'), true);
      assert.strictEqual(workbookMentionsChannel(workbook, 'other'), false);
    });

    it('runs durable jobs through the SQLite-backed worker', async function () {
      const { Jobs, registerJobHandler, enqueueDurableJobAndWait } =
        await import('../imports/api/jobs/index.js');
      registerJobHandler('test.echo', {
        description: 'Test echo job',
        concurrency: 1,
        retryPolicy: {
          maxAttempts: 1,
          retryDelayMs: 250,
        },
        timeoutMs: 5000,
        leaseTimeoutMs: 5000,
        heartbeatIntervalMs: 1000,
        payloadSchema: {
          value: String,
        },
        payloadSchemaDescription: 'Echo payload with a string value',
        idempotencyStrategy: 'dedupeKey equals the test payload string',
        run: async (job) =>
          String(
            job && job.payload && job.payload.value ? job.payload.value : '',
          ),
      });

      try {
        const result = await enqueueDurableJobAndWait(
          {
            type: 'test.echo',
            payload: { value: 'hello jobs' },
            dedupeKey: 'test.echo:hello-jobs',
          },
          { timeoutMs: 10_000 },
        );

        assert.strictEqual(result, 'hello jobs');
        const persisted = await Jobs.findOneAsync({
          type: 'test.echo',
          dedupeKey: 'test.echo:hello-jobs',
        });
        assert.ok(persisted);
        assert.strictEqual(persisted.status, 'completed');
      } finally {
        await Jobs.removeAsync({ type: 'test.echo' });
      }
    });

    it('uses persisted workbook cache/runtime state when client snapshot lags', async function () {
      const { Sheets } = await import('../imports/api/sheets/index.js');
      const sheetId = await invokeRpc('sheets.create', 'Test Persisted Cache Merge');

      try {
        const persistedWorkbook = {
          version: 1,
          tabs: [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
          activeTabId: 'sheet-1',
          aiMode: 'auto',
          namedCells: {},
          sheets: {
            'sheet-1': {
              cells: {
                A1: {
                  source: "'3+4",
                  sourceType: 'formula',
                  value: '7',
                  state: 'resolved',
                  error: '',
                  generatedBy: '',
                  version: 1,
                },
              },
              columnWidths: {},
              rowHeights: {},
              reportContent: '',
            },
          },
          dependencyGraph: { byCell: {} },
          caches: {
            'AI_CACHE:\n---\n3+4': '7',
          },
          globals: {},
        };

        await Sheets.updateAsync(
          { _id: sheetId },
          {
            $set: {
              workbook: persistedWorkbook,
              updatedAt: new Date(),
            },
            $unset: {
              storage: '',
            },
          },
        );

        const laggingClientSnapshot = {
          ...persistedWorkbook,
          sheets: {
            'sheet-1': {
              ...persistedWorkbook.sheets['sheet-1'],
              cells: {
                A1: {
                  ...persistedWorkbook.sheets['sheet-1'].cells.A1,
                  value: '',
                  state: 'stale',
                },
              },
            },
          },
          caches: {},
        };

        const result = await invokeRpc(
          'sheets.computeGrid',
          sheetId,
          'sheet-1',
          { workbookSnapshot: laggingClientSnapshot },
        );

        assert.strictEqual(result.values.A1, '7');
        assert.strictEqual(
          result.workbook.sheets['sheet-1'].cells.A1.state,
          'resolved',
        );
        assert.strictEqual(result.workbook.caches['AI_CACHE:\n---\n3+4'], '7');
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });

    it('preserves persisted AI result when a lagging client workbook is saved', async function () {
      const { Sheets } = await import('../imports/api/sheets/index.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');
      const sheetId = await invokeRpc('sheets.create', 'Test Save Merge');

      try {
        const persistedWorkbook = {
          version: 1,
          tabs: [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
          activeTabId: 'sheet-1',
          aiMode: 'auto',
          namedCells: {},
          sheets: {
            'sheet-1': {
              cells: {
                A1: {
                  source: "'4+4",
                  sourceType: 'formula',
                  value: '8',
                  state: 'resolved',
                  error: '',
                  generatedBy: '',
                  version: 1,
                },
              },
              columnWidths: {},
              rowHeights: {},
              reportContent: '',
            },
          },
          dependencyGraph: {
            byCell: {
              'sheet-1:A1': {
                cells: [],
                namedRefs: [],
                channelLabels: [],
                attachments: [],
              },
            },
          },
          caches: {
            'AI_CACHE:\n---\n4+4': '8',
          },
          globals: {},
        };

        await Sheets.updateAsync(
          { _id: sheetId },
          {
            $set: {
              workbook: persistedWorkbook,
              updatedAt: new Date(),
            },
            $unset: { storage: '' },
          },
        );

        const laggingClientWorkbook = {
          ...persistedWorkbook,
          sheets: {
            'sheet-1': {
              ...persistedWorkbook.sheets['sheet-1'],
              cells: {
                A1: {
                  ...persistedWorkbook.sheets['sheet-1'].cells.A1,
                  value: '',
                  state: 'stale',
                },
              },
            },
          },
          caches: {},
        };

        await invokeRpc('sheets.saveWorkbook', 
          sheetId,
          laggingClientWorkbook,
        );

        const saved = await Sheets.findOneAsync(sheetId);
        const decoded = decodeWorkbookDocument(saved.workbook || {});
        assert.strictEqual(decoded.sheets['sheet-1'].cells.A1.value, '8');
        assert.strictEqual(
          decoded.sheets['sheet-1'].cells.A1.state,
          'resolved',
        );
        assert.strictEqual(decoded.caches['AI_CACHE:\n---\n4+4'], '8');
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });

    it('preserves persisted generated spill cells when a lagging client workbook is saved', async function () {
      const { Sheets } = await import('../imports/api/sheets/index.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');
      const sheetId = await invokeRpc('sheets.create', 'Test Generated Spill Merge');

      try {
        const persistedWorkbook = {
          version: 1,
          tabs: [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
          activeTabId: 'sheet-1',
          aiMode: 'auto',
          namedCells: {},
          sheets: {
            'sheet-1': {
              cells: {
                B4: {
                  source: '#2 /sf any invoices to pay',
                  sourceType: 'formula',
                  value: '#2 /sf any invoices to pay',
                  state: 'resolved',
                  error: '',
                  generatedBy: '',
                  version: 1,
                },
                B5: {
                  source: 'Invoice A',
                  sourceType: 'raw',
                  value: 'Invoice A',
                  state: 'resolved',
                  error: '',
                  generatedBy: 'B4',
                  version: 1,
                },
              },
              columnWidths: {},
              rowHeights: {},
              reportContent: '',
            },
          },
          dependencyGraph: {
            byCell: {
              'sheet-1:B4': {
                cells: [],
                namedRefs: [],
                channelLabels: ['sf'],
                attachments: [],
              },
            },
          },
          caches: {},
          globals: {},
        };

        await Sheets.updateAsync(
          { _id: sheetId },
          {
            $set: {
              workbook: persistedWorkbook,
              updatedAt: new Date(),
            },
            $unset: { storage: '' },
          },
        );

        const laggingClientWorkbook = {
          ...persistedWorkbook,
          sheets: {
            'sheet-1': {
              ...persistedWorkbook.sheets['sheet-1'],
              cells: {
                B4: {
                  ...persistedWorkbook.sheets['sheet-1'].cells.B4,
                },
              },
            },
          },
        };

        await invokeRpc('sheets.saveWorkbook', 
          sheetId,
          laggingClientWorkbook,
        );

        const saved = await Sheets.findOneAsync(sheetId);
        const decoded = decodeWorkbookDocument(saved.workbook || {});
        assert.strictEqual(
          decoded.sheets['sheet-1'].cells.B5.source,
          'Invoice A',
        );
        assert.strictEqual(
          decoded.sheets['sheet-1'].cells.B5.generatedBy,
          'B4',
        );
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });

    const makeShiftHelper = async () => {
      const { SpreadsheetApp } = await import(
        '../imports/ui/metacell/runtime/index.js'
      );
      const columnLabelToIndex = (label) => {
        let result = 0;
        for (let i = 0; i < label.length; i++) {
          result = result * 26 + (label.charCodeAt(i) - 64);
        }
        return result;
      };
      const columnIndexToLabel = (index) => {
        let n = Math.max(1, index);
        let label = '';
        while (n > 0) {
          const rem = (n - 1) % 26;
          label = String.fromCharCode(65 + rem) + label;
          n = Math.floor((n - 1) / 26);
        }
        return label;
      };
      return {
        parseCellId(cellId) {
          const match = /^\$?([A-Za-z]+)\$?([0-9]+)$/.exec(
            String(cellId || ''),
          );
          if (!match) return null;
          return {
            col: columnLabelToIndex(match[1].toUpperCase()),
            row: parseInt(match[2], 10),
          };
        },
        columnIndexToLabel,
        shiftFormulaReferences: SpreadsheetApp.prototype.shiftFormulaReferences,
      };
    };

    it('shiftFormulaReferences adjusts relative references normally', async function () {
      const helper = await makeShiftHelper();

      assert.strictEqual(helper.shiftFormulaReferences('=B1', 1, 1), '=C2');
      assert.strictEqual(
        helper.shiftFormulaReferences('=B1+C2', 1, 0),
        '=B2+C3',
      );
      assert.strictEqual(
        helper.shiftFormulaReferences('=A1:B3', 0, 1),
        '=B1:C3',
      );
    });

    it('shiftFormulaReferences respects $ absolute column reference', async function () {
      const helper = await makeShiftHelper();

      assert.strictEqual(
        helper.shiftFormulaReferences('=$B1', 1, 1),
        '=$B2',
      );
      assert.strictEqual(
        helper.shiftFormulaReferences('=$B1', 0, 3),
        '=$B1',
      );
      assert.strictEqual(
        helper.shiftFormulaReferences('=$B1:$D3', 1, 1),
        '=$B2:$D4',
      );
    });

    it('shiftFormulaReferences respects $ absolute row reference', async function () {
      const helper = await makeShiftHelper();

      assert.strictEqual(
        helper.shiftFormulaReferences('=B$1', 1, 1),
        '=C$1',
      );
      assert.strictEqual(
        helper.shiftFormulaReferences('=B$1', 5, 0),
        '=B$1',
      );
      assert.strictEqual(
        helper.shiftFormulaReferences('=B$1:D$3', 2, 1),
        '=C$1:E$3',
      );
    });

    it('shiftFormulaReferences respects fully absolute $col$row reference', async function () {
      const helper = await makeShiftHelper();

      assert.strictEqual(
        helper.shiftFormulaReferences('=$B$1', 3, 3),
        '=$B$1',
      );
      assert.strictEqual(
        helper.shiftFormulaReferences('=$B$1+C2', 1, 1),
        '=$B$1+D3',
      );
      assert.strictEqual(
        helper.shiftFormulaReferences('=$A$1:$B$3', 5, 5),
        '=$A$1:$B$3',
      );
    });

    it('evaluates formulas with $ absolute references correctly', async function () {
      const { FormulaEngine } =
        await import('../imports/engine/formula-engine.js');

      const cells = {
        A1: '10',
        B1: '=$A$1+5',
        C1: '=$A1',
        D1: '=A$1',
      };
      const storageService = {
        getCellValue(sheetId, cellId) {
          return cells[cellId] || '';
        },
        getCellState() {
          return 'resolved';
        },
        resolveNamedCell() {
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {},
        () => [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }],
        Object.keys(cells),
      );

      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'B1', {}), 15);
      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'C1', {}), '10');
      assert.strictEqual(formulaEngine.evaluateCell('sheet-1', 'D1', {}), '10');
    });
  }
});

registerWorkbookSpecTests();
