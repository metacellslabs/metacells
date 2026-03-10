import assert from "assert";

describe("metacells", function () {
  it("package.json has correct name", async function () {
    const { name } = await import("../package.json");
    assert.strictEqual(name, "metacells");
  });

  if (Meteor.isClient) {
    it("client is not server", function () {
      assert.strictEqual(Meteor.isServer, false);
    });
  }

  if (Meteor.isServer) {
    it("server is not client", function () {
      assert.strictEqual(Meteor.isClient, false);
    });

    it("builds a topological evaluation plan for same-sheet dependencies", async function () {
      const { FormulaEngine } = await import("../imports/ui/metacell/runtime/formula-engine.js");

      const cells = {
        A1: "seed",
        B1: "=A1",
        C1: "=B1",
        D1: "=C1",
      };
      const storageService = {
        getCellValue(sheetId, cellId) {
          return cells[cellId] || "";
        },
        getCellState() {
          return "resolved";
        },
        resolveNamedCell() {
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {},
        () => [{ id: "sheet-1", name: "Sheet 1", type: "sheet" }],
        ["A1", "B1", "C1", "D1"],
      );

      const plan = formulaEngine.buildEvaluationPlan("sheet-1");

      assert.deepStrictEqual(plan, ["A1", "B1", "C1", "D1"]);
    });

    it("falls back safely when dependency cycles exist", async function () {
      const { FormulaEngine } = await import("../imports/ui/metacell/runtime/formula-engine.js");

      const cells = {
        A1: "=B1",
        B1: "=A1",
        C1: "=B1",
      };
      const storageService = {
        getCellValue(sheetId, cellId) {
          return cells[cellId] || "";
        },
        getCellState() {
          return "resolved";
        },
        resolveNamedCell() {
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {},
        () => [{ id: "sheet-1", name: "Sheet 1", type: "sheet" }],
        ["A1", "B1", "C1"],
      );

      const plan = formulaEngine.buildEvaluationPlan("sheet-1");

      assert.strictEqual(plan.length, 3);
      assert.deepStrictEqual([...plan].sort(), ["A1", "B1", "C1"]);
      assert.strictEqual(plan[2], "C1");
    });

    it("evaluates registered spreadsheet formulas from file-based modules", async function () {
      const { FormulaEngine } = await import("../imports/ui/metacell/runtime/formula-engine.js");

      const cells = {
        A1: "10",
        A2: "20",
        A3: "30",
        B1: "=SUM(A1:A3)",
        B2: "=AVERAGE(A1:A3)",
        B3: "=IF(A1>5, \"yes\", \"no\")",
        C1: "Basic",
        C2: "Pro",
        D1: "9",
        D2: "19",
        E1: "=VLOOKUP(\"Pro\", C1:D2, 2)",
        E2: "=COUNT(A1:A3)",
        E3: "=COUNTA(A1:A3)",
        F1: "=LEN(\"hello\")",
        F2: "=SUMIF(A1:A3, \">15\")",
        F3: "=INDEX(C1:D2, 2, 2)",
        G1: "=XLOOKUP(\"Pro\", C1:C2, D1:D2, \"missing\")",
        H1: "=COUNTIF(A1:A3, \">15\")",
        H2: "=TRIM(\"  hello   world  \")",
        H3: "=DATEDIF(\"2024-01-01\", \"2024-01-11\", \"D\")",
        I1: "=FILTER(C1:D2, C1:C2, \"Pro\")",
        I2: "=TODAY()",
      };
      const storageService = {
        getCellValue(sheetId, cellId) {
          return cells[cellId] || "";
        },
        getCellState() {
          return "resolved";
        },
        resolveNamedCell() {
          return null;
        },
      };
      const formulaEngine = new FormulaEngine(
        storageService,
        {},
        () => [{ id: "sheet-1", name: "Sheet 1", type: "sheet" }],
        Object.keys(cells),
      );

      assert.strictEqual(formulaEngine.evaluateCell("sheet-1", "B1", {}), 60);
      assert.strictEqual(formulaEngine.evaluateCell("sheet-1", "B2", {}), 20);
      assert.strictEqual(formulaEngine.evaluateCell("sheet-1", "B3", {}), "yes");
      assert.strictEqual(formulaEngine.evaluateCell("sheet-1", "E1", {}), "19");
      assert.strictEqual(formulaEngine.evaluateCell("sheet-1", "E2", {}), 3);
      assert.strictEqual(formulaEngine.evaluateCell("sheet-1", "E3", {}), 3);
      assert.strictEqual(formulaEngine.evaluateCell("sheet-1", "F1", {}), 5);
      assert.strictEqual(formulaEngine.evaluateCell("sheet-1", "F2", {}), 50);
      assert.strictEqual(formulaEngine.evaluateCell("sheet-1", "F3", {}), "19");
      assert.strictEqual(formulaEngine.evaluateCell("sheet-1", "G1", {}), "19");
      assert.strictEqual(formulaEngine.evaluateCell("sheet-1", "H1", {}), 2);
      assert.strictEqual(formulaEngine.evaluateCell("sheet-1", "H2", {}), "hello world");
      assert.strictEqual(formulaEngine.evaluateCell("sheet-1", "H3", {}), 10);
      assert.strictEqual(formulaEngine.evaluateCell("sheet-1", "I1", {}), "Pro,19");
      assert.match(String(formulaEngine.evaluateCell("sheet-1", "I2", {})), /^\d{4}-\d{2}-\d{2}$/);

      cells.G2 = "=SUM(@A1:A3)";
      assert.strictEqual(formulaEngine.evaluateCell("sheet-1", "G2", {}), 60);
    });

    it("adds registered formulas to help automatically", async function () {
      const { HELP_SECTIONS } = await import("../imports/ui/help/helpContent.js");
      const { getRegisteredFormulaManifest } = await import("../imports/ui/metacell/runtime/formulas/index.js");
      const builtins = HELP_SECTIONS.find((section) => section && section.title === "Built-in formulas");
      const manifest = getRegisteredFormulaManifest();

      assert.ok(builtins);
      assert.ok(Array.isArray(builtins.items));
      assert.ok(Array.isArray(manifest));
      assert.ok(manifest.some((item) => item.file === "SUM.js"));
      assert.ok(manifest.some((item) => item.file === "FILTER.js"));
      assert.ok(manifest.every((item) => /^[0-9a-f]{8}$/.test(String(item.discoveryHash || ""))));
      assert.ok(builtins.items.some((item) => String(item).includes("SUM(value1, value2, ...)")));
      assert.ok(builtins.items.some((item) => String(item).includes("VLOOKUP(lookupValue, table, columnIndex")));
      assert.ok(builtins.items.some((item) => String(item).includes("XLOOKUP(lookupValue, lookupRange, returnRange")));
      assert.ok(builtins.items.some((item) => String(item).includes("COUNTIF(range, criteria)")));
      assert.ok(builtins.items.some((item) => String(item).includes("TODAY()")));
      assert.ok(builtins.items.some((item) => String(item).includes("DATEDIF(startDate, endDate, unit)")));
      assert.ok(builtins.items.some((item) => String(item).includes("TRIM(value)")));
      assert.ok(builtins.items.some((item) => String(item).includes("FILTER(range, criteriaRange, criteria)")));
    });

    it("discovers file-based AI providers automatically", async function () {
      const { getRegisteredAIProviders, getRegisteredAIProviderManifest } = await import("../imports/api/settings/providers/index.js");

      const providers = getRegisteredAIProviders();
      const manifest = getRegisteredAIProviderManifest();

      assert.ok(Array.isArray(providers));
      assert.ok(Array.isArray(manifest));
      assert.ok(providers.some((item) => item.id === "deepseek"));
      assert.ok(providers.some((item) => item.id === "lm-studio"));
      assert.ok(manifest.some((item) => item.file === "DEEPSEEK.js"));
      assert.ok(manifest.some((item) => item.file === "LM_STUDIO.js"));
      assert.ok(manifest.every((item) => /^[0-9a-f]{8}$/.test(String(item.discoveryHash || ""))));
    });

    it("builds default settings from discovered AI providers", async function () {
      const {
        DEFAULT_AI_PROVIDERS,
        DEFAULT_SETTINGS_ID,
        ensureDefaultSettings,
        AppSettings,
      } = await import("../imports/api/settings/index.js");

      await AppSettings.removeAsync({ _id: DEFAULT_SETTINGS_ID });
      const settings = await ensureDefaultSettings();

      try {
        assert.strictEqual(settings._id, DEFAULT_SETTINGS_ID);
        assert.strictEqual(settings.aiProviders.length, DEFAULT_AI_PROVIDERS.length);
        assert.ok(settings.aiProviders.some((item) => item.id === "deepseek"));
        assert.ok(settings.aiProviders.some((item) => item.id === "lm-studio"));
      } finally {
        await AppSettings.removeAsync({ _id: DEFAULT_SETTINGS_ID });
        await ensureDefaultSettings();
      }
    });

    it("saves workbook cell content in Mongo", async function () {
      const { Sheets } = await import("../imports/api/sheets/index.js");
      const { decodeWorkbookDocument } = await import("../imports/api/sheets/workbook-codec.js");

      const sheetId = await Meteor.server.method_handlers["sheets.create"].apply({}, ["Test Save Workbook"]);

      try {
        const workbook = {
          version: 1,
          tabs: [{ id: "sheet-1", name: "Sheet 1", type: "sheet" }],
          activeTabId: "sheet-1",
          aiMode: "auto",
          namedCells: {},
          sheets: {
            "sheet-1": {
              cells: {
                A1: {
                  source: "hello world",
                  sourceType: "raw",
                  value: "hello world",
                  state: "resolved",
                  generatedBy: "",
                  version: 1,
                },
              },
              columnWidths: {},
              rowHeights: {},
              reportContent: "",
            },
          },
          caches: {},
          globals: {},
        };

        await Meteor.server.method_handlers["sheets.saveWorkbook"].apply({}, [sheetId, workbook]);

        const saved = await Sheets.findOneAsync(sheetId);
        assert.ok(saved);
        assert.strictEqual(typeof saved.storage, "undefined");

        const decodedWorkbook = decodeWorkbookDocument(saved.workbook || {});
        assert.strictEqual(decodedWorkbook.sheets["sheet-1"].cells.A1.source, "hello world");
        assert.strictEqual(decodedWorkbook.sheets["sheet-1"].cells.A1.value, "hello world");
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });

    it("computes and persists formula cell values", async function () {
      const { Sheets } = await import("../imports/api/sheets/index.js");
      const { decodeWorkbookDocument } = await import("../imports/api/sheets/workbook-codec.js");

      const sheetId = await Meteor.server.method_handlers["sheets.create"].apply({}, ["Test Compute Workbook"]);

      try {
        const workbook = {
          version: 1,
          tabs: [{ id: "sheet-1", name: "Sheet 1", type: "sheet" }],
          activeTabId: "sheet-1",
          aiMode: "auto",
          namedCells: {},
          sheets: {
            "sheet-1": {
              cells: {
                A1: {
                  source: "alpha",
                  sourceType: "raw",
                  value: "alpha",
                  state: "resolved",
                  generatedBy: "",
                  version: 1,
                },
                B1: {
                  source: "=A1",
                  sourceType: "formula",
                  value: "",
                  state: "stale",
                  generatedBy: "",
                  version: 1,
                },
              },
              columnWidths: {},
              rowHeights: {},
              reportContent: "",
            },
          },
          caches: {},
          globals: {},
        };

        await Meteor.server.method_handlers["sheets.saveWorkbook"].apply({}, [sheetId, workbook]);
        const result = await Meteor.server.method_handlers["sheets.computeGrid"].apply({}, [sheetId, "sheet-1", {}]);

        assert.strictEqual(result.values.B1, "alpha");

        const saved = await Sheets.findOneAsync(sheetId);
        const decodedWorkbook = decodeWorkbookDocument(saved.workbook || {});
        assert.strictEqual(decodedWorkbook.sheets["sheet-1"].cells.B1.value, "alpha");
        assert.strictEqual(decodedWorkbook.sheets["sheet-1"].cells.B1.state, "resolved");
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });

    it("persists #REF! and hint for missing sheet dependencies", async function () {
      const { Sheets } = await import("../imports/api/sheets/index.js");
      const { computeSheetSnapshot } = await import("../imports/api/sheets/server/compute.js");
      const { decodeWorkbookDocument } = await import("../imports/api/sheets/workbook-codec.js");

      const sheetId = await Meteor.server.method_handlers["sheets.create"].apply({}, ["Test Missing Sheet Ref"]);

      try {
        const workbook = {
          version: 1,
          tabs: [{ id: "sheet-1", name: "Sheet 1", type: "sheet" }],
          activeTabId: "sheet-1",
          aiMode: "auto",
          namedCells: {},
          sheets: {
            "sheet-1": {
              cells: {
                A1: {
                  source: "=@'delete test'!D14",
                  sourceType: "formula",
                  value: "",
                  state: "stale",
                  error: "",
                  generatedBy: "",
                  version: 1,
                },
              },
              columnWidths: {},
              rowHeights: {},
              reportContent: "",
            },
          },
          caches: {},
          globals: {},
        };

        let persistedWorkbook = workbook;
        const result = await computeSheetSnapshot({
          sheetDocumentId: sheetId,
          workbookData: workbook,
          activeSheetId: "sheet-1",
          persistWorkbook: async (nextWorkbook) => {
            persistedWorkbook = nextWorkbook;
          },
        });

        assert.strictEqual(result.values.A1, "#REF!");

        const decodedWorkbook = decodeWorkbookDocument(persistedWorkbook);
        const cell = decodedWorkbook.sheets["sheet-1"].cells.A1;
        assert.strictEqual(cell.value, "#REF!");
        assert.strictEqual(cell.state, "error");
        assert.match(String(cell.error || ""), /Unknown sheet: delete test/);
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });

    it("surfaces AI provider errors with returned error text", async function () {
      const { AIService } = await import("../imports/ui/metacell/runtime/ai-service.js");

      const storage = {
        getAIMode() {
          return "auto";
        },
        getCacheValue() {
          return undefined;
        },
        setCacheValue() {},
      };

      const service = new AIService(storage, () => {}, {
        sheetDocumentId: "sheet-doc",
        getActiveSheetId: () => "sheet-1",
      });

      service.requestChat = () => Promise.reject(new Error("model is wrong"));
      service.enrichPromptWithFetchedUrls = (prompt) => Promise.resolve(prompt);

      service.requestAsk("hello", "AI_CACHE:\n---\nhello", false, "", null);
      await new Promise((resolve) => Meteor.setTimeout(resolve, 0));

      assert.strictEqual(service.cache["AI_CACHE:\n---\nhello"], "#AI_ERROR: model is wrong");
    });

    it("recomputes chained named references across sheets", async function () {
      const { Sheets } = await import("../imports/api/sheets/index.js");
      const { decodeWorkbookDocument } = await import("../imports/api/sheets/workbook-codec.js");

      const sheetId = await Meteor.server.method_handlers["sheets.create"].apply({}, ["Test Cross Sheet Named Refs"]);

      try {
        const workbook = {
          version: 1,
          tabs: [
            { id: "sheet-1", name: "Sheet 1", type: "sheet" },
            { id: "sheet-2", name: "Sheet 2", type: "sheet" },
          ],
          activeTabId: "sheet-1",
          aiMode: "auto",
          namedCells: {
            sum_cell: { sheetId: "sheet-1", cellId: "B1" },
            ref_sum_cell: { sheetId: "sheet-2", cellId: "A1" },
          },
          sheets: {
            "sheet-1": {
              cells: {
                A1: { source: "10", sourceType: "raw", value: "10", state: "resolved", generatedBy: "", version: 1 },
                A2: { source: "20", sourceType: "raw", value: "20", state: "resolved", generatedBy: "", version: 1 },
                A3: { source: "30", sourceType: "raw", value: "30", state: "resolved", generatedBy: "", version: 1 },
                B1: { source: "=SUM(@A1:A3)", sourceType: "formula", value: "", state: "stale", generatedBy: "", version: 1 },
                C1: { source: "=@ref_sum_cell", sourceType: "formula", value: "", state: "stale", generatedBy: "", version: 1 },
              },
              columnWidths: {},
              rowHeights: {},
              reportContent: "",
            },
            "sheet-2": {
              cells: {
                A1: { source: "=@sum_cell", sourceType: "formula", value: "", state: "stale", generatedBy: "", version: 1 },
              },
              columnWidths: {},
              rowHeights: {},
              reportContent: "",
            },
          },
          caches: {},
          globals: {},
        };

        await Meteor.server.method_handlers["sheets.saveWorkbook"].apply({}, [sheetId, workbook]);
        let result = await Meteor.server.method_handlers["sheets.computeGrid"].apply({}, [sheetId, "sheet-1", {}]);
        assert.strictEqual(result.values.B1, 60);
        assert.strictEqual(result.values.C1, 60);

        await Meteor.server.method_handlers["sheets.saveWorkbook"].apply({}, [sheetId, {
          ...workbook,
          sheets: {
            ...workbook.sheets,
            "sheet-1": {
              ...workbook.sheets["sheet-1"],
              cells: {
                ...workbook.sheets["sheet-1"].cells,
                A3: { source: "40", sourceType: "raw", value: "40", state: "resolved", generatedBy: "", version: 2 },
              },
            },
          },
        }]);

        result = await Meteor.server.method_handlers["sheets.computeGrid"].apply({}, [sheetId, "sheet-1", {}]);
        assert.strictEqual(result.values.B1, 70);
        assert.strictEqual(result.values.C1, 70);

        const saved = await Sheets.findOneAsync(sheetId);
        const decodedWorkbook = decodeWorkbookDocument(saved.workbook || {});
        assert.strictEqual(decodedWorkbook.sheets["sheet-1"].cells.C1.value, "70");
        assert.strictEqual(decodedWorkbook.sheets["sheet-2"].cells.A1.value, "70");
      } finally {
        await Sheets.removeAsync({ _id: sheetId });
      }
    });
  }
});
