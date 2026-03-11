import assert from 'assert';

describe('metacells', function () {
  it('package.json has correct name', async function () {
    const { name } = await import('../package.json');
    assert.strictEqual(name, 'metacells');
  });

  if (Meteor.isClient) {
    it('client is not server', function () {
      assert.strictEqual(Meteor.isServer, false);
    });
  }

  if (Meteor.isServer) {
    it('server is not client', function () {
      assert.strictEqual(Meteor.isClient, false);
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
          return states[cellId] || 'resolved';
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
      const c3Value = formulaEngine.evaluateCell('sheet-1', 'C3', {}, {
        dependencyCollector: c3Collector,
      });
      assert.strictEqual(c3Value, '...');
      assert.deepStrictEqual(c3Collector.snapshot().cells, [
        { sheetId: 'sheet-1', cellId: 'B1' },
      ]);

      const b4Collector = createCollector();
      const b4Value = formulaEngine.evaluateCell('sheet-1', 'B4', {}, {
        dependencyCollector: b4Collector,
      });
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
      assert.ok(providers.some((item) => item.id === 'deepseek'));
      assert.ok(providers.some((item) => item.id === 'lm-studio'));
      assert.ok(manifest.some((item) => item.file === 'DEEPSEEK.js'));
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
      assert.ok(manifest.some((item) => item.file === 'IMAP.js'));
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
          String(item).includes('/channel1:send:message'),
        ),
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

    it('collects and injects channel mentions into AI prompts', async function () {
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
        assert.ok(settings.aiProviders.some((item) => item.id === 'deepseek'));
        assert.ok(settings.aiProviders.some((item) => item.id === 'lm-studio'));
      } finally {
        await AppSettings.removeAsync({ _id: DEFAULT_SETTINGS_ID });
        await ensureDefaultSettings();
      }
    });

    it('saves workbook cell content in Mongo', async function () {
      const { Sheets } = await import('../imports/api/sheets/index.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');

      const sheetId = await Meteor.server.method_handlers[
        'sheets.create'
      ].apply({}, ['Test Save Workbook']);

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

        await Meteor.server.method_handlers['sheets.saveWorkbook'].apply({}, [
          sheetId,
          workbook,
        ]);

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

      const sheetId = await Meteor.server.method_handlers[
        'sheets.create'
      ].apply({}, ['Test Compute Workbook']);

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

        await Meteor.server.method_handlers['sheets.saveWorkbook'].apply({}, [
          sheetId,
          workbook,
        ]);
        const result = await Meteor.server.method_handlers[
          'sheets.computeGrid'
        ].apply({}, [sheetId, 'sheet-1', {}]);

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

      const sheetId = await Meteor.server.method_handlers[
        'sheets.createFormulaTestWorkbook'
      ].apply({}, []);

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
          "'@idea: one-line value proposition",
        );
        assert.strictEqual(
          workbook.sheets['sheet-3'].cells.A3.source,
          '>5 потенциальных аудиторий для проекта @idea. по одной ЦА',
        );
        assert.strictEqual(
          workbook.sheets['sheet-3'].cells.A4.source,
          '# summarize @website in 3 bullets',
        );
        assert.strictEqual(
          workbook.sheets['sheet-3'].cells.J2.source,
          'пломбир для карликов',
        );
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });

    it('creates an AI startup financial model workbook', async function () {
      const { Sheets } = await import('../imports/api/sheets/index.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');

      const sheetId = await Meteor.server.method_handlers[
        'sheets.createFinancialModelWorkbook'
      ].apply({}, []);

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

    it('persists #REF! and hint for missing sheet dependencies', async function () {
      const { Sheets } = await import('../imports/api/sheets/index.js');
      const { computeSheetSnapshot } =
        await import('../imports/api/sheets/server/compute.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');

      const sheetId = await Meteor.server.method_handlers[
        'sheets.create'
      ].apply({}, ['Test Missing Sheet Ref']);

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
      await new Promise((resolve) => Meteor.setTimeout(resolve, 0));

      assert.strictEqual(
        service.cache['AI_CACHE:\n---\nhello'],
        '#AI_ERROR: model is wrong',
      );
    });

    it('recomputes chained named references across sheets', async function () {
      const { Sheets } = await import('../imports/api/sheets/index.js');
      const { decodeWorkbookDocument } =
        await import('../imports/api/sheets/workbook-codec.js');

      const sheetId = await Meteor.server.method_handlers[
        'sheets.create'
      ].apply({}, ['Test Cross Sheet Named Refs']);

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

        await Meteor.server.method_handlers['sheets.saveWorkbook'].apply({}, [
          sheetId,
          workbook,
        ]);
        let result = await Meteor.server.method_handlers[
          'sheets.computeGrid'
        ].apply({}, [sheetId, 'sheet-1', {}]);
        assert.strictEqual(result.values.B1, 60);
        assert.strictEqual(result.values.C1, 60);

        await Meteor.server.method_handlers['sheets.saveWorkbook'].apply({}, [
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
        ]);

        result = await Meteor.server.method_handlers[
          'sheets.computeGrid'
        ].apply({}, [sheetId, 'sheet-1', {}]);
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

      const sheetId = await Meteor.server.method_handlers[
        'sheets.create'
      ].apply({}, ['Quoted Prompt Snapshot Recompute']);

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

        await Meteor.server.method_handlers['sheets.saveWorkbook'].apply({}, [
          sheetId,
          persistedWorkbook,
        ]);

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

        const result = await Meteor.server.method_handlers[
          'sheets.computeGrid'
        ].apply({}, [
          sheetId,
          'sheet-1',
          {
            workbookSnapshot: clientWorkbookSnapshot,
          },
        ]);

        const saved = await Sheets.findOneAsync(sheetId);
        const decodedWorkbook = decodeWorkbookDocument(saved.workbook || {});
        assert.strictEqual(result.values.B4, '...');
        assert.strictEqual(decodedWorkbook.sheets['sheet-1'].cells.C4.value, '3');
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
      const sheetId = await Meteor.server.method_handlers[
        'sheets.create'
      ].apply({}, ['Dependency Repair Test']);

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

        await Meteor.server.method_handlers[
          'sheets.rebuildDependencyGraph'
        ].apply({}, [sheetId]);

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

    it('runs durable jobs through the Mongo-backed worker', async function () {
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
      const sheetId = await Meteor.server.method_handlers[
        'sheets.create'
      ].apply({}, ['Test Persisted Cache Merge']);

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

        const result = await Meteor.server.method_handlers[
          'sheets.computeGrid'
        ].apply({}, [
          sheetId,
          'sheet-1',
          { workbookSnapshot: laggingClientSnapshot },
        ]);

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
      const sheetId = await Meteor.server.method_handlers[
        'sheets.create'
      ].apply({}, ['Test Save Merge']);

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

        await Meteor.server.method_handlers['sheets.saveWorkbook'].apply({}, [
          sheetId,
          laggingClientWorkbook,
        ]);

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
  }
});
