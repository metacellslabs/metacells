import {
  createEmptyWorkbook,
  WorkbookStorageAdapter,
} from '../../engine/workbook-storage-adapter.js';
import { computeSheetSnapshot } from './server/compute.js';

const MAIN_SHEET_ID = 'sheet-1';
const LOOKUP_SHEET_ID = 'sheet-2';
const AI_SHEET_ID = 'sheet-3';
const RUNTIME_SHEET_ID = 'sheet-4';
const REPORT_TAB_ID = 'report-1';
const FINANCE_ASSUMPTIONS_SHEET_ID = 'sheet-1';
const FINANCE_MODEL_SHEET_ID = 'sheet-2';
const FINANCE_AI_SHEET_ID = 'sheet-3';

function setCell(adapter, sheetId, cellId, source) {
  adapter.setCellSource(sheetId, cellId, source);
}

function buildBaseFormulaTestWorkbook() {
  const adapter = new WorkbookStorageAdapter(createEmptyWorkbook());

  adapter.setTabs([
    { id: MAIN_SHEET_ID, name: 'Formula Checks', type: 'sheet' },
    { id: LOOKUP_SHEET_ID, name: 'Lookup Data', type: 'sheet' },
    { id: AI_SHEET_ID, name: 'AI Playground', type: 'sheet' },
    { id: RUNTIME_SHEET_ID, name: 'Runtime Patterns', type: 'sheet' },
    { id: REPORT_TAB_ID, name: 'Report View', type: 'report' },
  ]);
  adapter.setActiveTabId(MAIN_SHEET_ID);
  adapter.setNamedCells({
    base_value: { sheetId: MAIN_SHEET_ID, cellId: 'J2' },
    edit_value: { sheetId: MAIN_SHEET_ID, cellId: 'J10' },
    idea: { sheetId: AI_SHEET_ID, cellId: 'J2' },
    website: { sheetId: AI_SHEET_ID, cellId: 'J3' },
    tone: { sheetId: AI_SHEET_ID, cellId: 'J4' },
    plans: { sheetId: LOOKUP_SHEET_ID, startCellId: 'A2', endCellId: 'C4' },
    case: { sheetId: RUNTIME_SHEET_ID, cellId: 'J2' },
    summary: { sheetId: RUNTIME_SHEET_ID, cellId: 'J3' },
    policy_source: { sheetId: RUNTIME_SHEET_ID, cellId: 'J5' },
    policy_file: { sheetId: RUNTIME_SHEET_ID, cellId: 'K5' },
  });

  setCell(adapter, LOOKUP_SHEET_ID, 'A1', 'SKU');
  setCell(adapter, LOOKUP_SHEET_ID, 'B1', 'Price');
  setCell(adapter, LOOKUP_SHEET_ID, 'C1', 'Tier');
  setCell(adapter, LOOKUP_SHEET_ID, 'A2', 'basic');
  setCell(adapter, LOOKUP_SHEET_ID, 'B2', '10');
  setCell(adapter, LOOKUP_SHEET_ID, 'C2', 'starter');
  setCell(adapter, LOOKUP_SHEET_ID, 'A3', 'pro');
  setCell(adapter, LOOKUP_SHEET_ID, 'B3', '20');
  setCell(adapter, LOOKUP_SHEET_ID, 'C3', 'growth');
  setCell(adapter, LOOKUP_SHEET_ID, 'A4', 'enterprise');
  setCell(adapter, LOOKUP_SHEET_ID, 'B4', '30');
  setCell(adapter, LOOKUP_SHEET_ID, 'C4', 'scale');

  setCell(adapter, MAIN_SHEET_ID, 'A1', 'Case');
  setCell(adapter, MAIN_SHEET_ID, 'B1', 'Actual');
  setCell(adapter, MAIN_SHEET_ID, 'C1', 'Expected');
  setCell(adapter, MAIN_SHEET_ID, 'D1', 'Check');
  setCell(adapter, MAIN_SHEET_ID, 'E1', 'Notes');

  setCell(adapter, MAIN_SHEET_ID, 'J1', 'Local Inputs');
  setCell(adapter, MAIN_SHEET_ID, 'J2', '10');
  setCell(adapter, MAIN_SHEET_ID, 'J3', '20');
  setCell(adapter, MAIN_SHEET_ID, 'J4', '  hello   world  ');
  setCell(adapter, MAIN_SHEET_ID, 'J5', '2024-01-01');
  setCell(adapter, MAIN_SHEET_ID, 'J6', '2024-01-11');
  setCell(adapter, MAIN_SHEET_ID, 'J7', '2024-01-01');
  setCell(adapter, MAIN_SHEET_ID, 'J8', '2024-03-15');
  setCell(adapter, MAIN_SHEET_ID, 'J10', '55');
  setCell(
    adapter,
    MAIN_SHEET_ID,
    'K10',
    'Edit J10 to test dependent recalculation',
  );

  const rows = [
    [
      'Direct mention ref',
      '=@J2',
      '10',
      '=IF(B2==C2,"PASS","FAIL")',
      'Simple local mention',
    ],
    [
      'Named ref',
      '=@base_value',
      '10',
      '=IF(B3==C3,"PASS","FAIL")',
      'Named cell points to J2',
    ],
    [
      'Arithmetic',
      '=@B2+@J3',
      '30',
      '=IF(B4==C4,"PASS","FAIL")',
      'Mix mention + raw number',
    ],
    ['SUM', '=SUM(J2:J3)', '30', '=IF(B5==C5,"PASS","FAIL")', 'Range sum'],
    [
      'AVERAGE',
      '=AVERAGE(J2:J3)',
      '15',
      '=IF(B6==C6,"PASS","FAIL")',
      'Range average',
    ],
    [
      'COUNT',
      '=COUNT(J2:J4)',
      '2',
      '=IF(B7==C7,"PASS","FAIL")',
      'Counts numeric values only',
    ],
    [
      'COUNTA',
      '=COUNTA(J2:J4)',
      '3',
      '=IF(B8==C8,"PASS","FAIL")',
      'Counts non-empty values',
    ],
    [
      'TRIM',
      '=TRIM(J4)',
      'hello world',
      '=IF(B9==C9,"PASS","FAIL")',
      'Normalizes spacing',
    ],
    [
      'LEN(TRIM())',
      '=LEN(TRIM(J4))',
      '11',
      '=IF(B10==C10,"PASS","FAIL")',
      'Counts trimmed characters',
    ],
    [
      'IF',
      '=IF(J2>5,"High","Low")',
      'High',
      '=IF(B11==C11,"PASS","FAIL")',
      'Boolean branch',
    ],
    [
      'COUNTIF',
      '=COUNTIF(J2:J3,">15")',
      '1',
      '=IF(B12==C12,"PASS","FAIL")',
      'Criteria count',
    ],
    [
      'SUMIF',
      '=SUMIF(J2:J3,">15")',
      '20',
      '=IF(B13==C13,"PASS","FAIL")',
      'Criteria sum',
    ],
    [
      'TODAY',
      '=TODAY()',
      '=TODAY()',
      '=IF(B14==C14,"PASS","FAIL")',
      'Date should match today',
    ],
    [
      'DATEDIF days',
      '=DATEDIF(J5,J6,"D")',
      '10',
      '=IF(B15==C15,"PASS","FAIL")',
      'Day difference',
    ],
    [
      'DATEDIF months',
      '=DATEDIF(J7,J8,"M")',
      '2',
      '=IF(B16==C16,"PASS","FAIL")',
      'Month difference',
    ],
    [
      'INDEX',
      "=INDEX('Lookup Data'!A2:C4,2,3)",
      'growth',
      '=IF(B17==C17,"PASS","FAIL")',
      'Matrix lookup by row/col',
    ],
    [
      'VLOOKUP',
      '=VLOOKUP("pro",\'Lookup Data\'!A2:C4,2)',
      '20',
      '=IF(B18==C18,"PASS","FAIL")',
      'Classic vertical lookup',
    ],
    [
      'XLOOKUP',
      '=XLOOKUP("enterprise",\'Lookup Data\'!A2:A4,\'Lookup Data\'!C2:C4,"Missing")',
      'scale',
      '=IF(B19==C19,"PASS","FAIL")',
      'Exact lookup with fallback',
    ],
    [
      'XLOOKUP missing',
      '=XLOOKUP("missing",\'Lookup Data\'!A2:A4,\'Lookup Data\'!C2:C4,"Missing")',
      'Missing',
      '=IF(B20==C20,"PASS","FAIL")',
      'Fallback branch',
    ],
    [
      'FILTER',
      "=FILTER('Lookup Data'!A2:C4,'Lookup Data'!A2:A4,\"pro\")",
      'pro,20,growth',
      '=IF(B21==C21,"PASS","FAIL")',
      'CSV output from filter',
    ],
    [
      'Cross-sheet ref',
      "='Lookup Data'!B3",
      '20',
      '=IF(B22==C22,"PASS","FAIL")',
      'Direct cross-sheet ref',
    ],
    [
      'Nested combo',
      '=SUM(J2:J3)+VLOOKUP("basic",\'Lookup Data\'!A2:C4,2)',
      '40',
      '=IF(B23==C23,"PASS","FAIL")',
      'Combines SUM and VLOOKUP',
    ],
    [
      'Mention range SUM',
      '=SUM(@J2:J3)',
      '30',
      '=IF(B24==C24,"PASS","FAIL")',
      'Mentioned range used in formula',
    ],
    [
      'Chained ref',
      '=@B23/2',
      '20',
      '=IF(B25==C25,"PASS","FAIL")',
      'Depends on another formula result',
    ],
    [
      'Named range INDEX',
      '=INDEX(@plans,3,3)',
      'scale',
      '=IF(B26==C26,"PASS","FAIL")',
      'Named region',
    ],
    [
      'Named range VLOOKUP',
      '=VLOOKUP("basic",@plans,2)',
      '10',
      '=IF(B27==C27,"PASS","FAIL")',
      'Lookup against named region',
    ],
    [
      'Conditional combo',
      '=IF(COUNTIF(\'Lookup Data\'!B2:B4,">15")==2,"OK","NO")',
      'OK',
      '=IF(B28==C28,"PASS","FAIL")',
      'Nested COUNTIF in IF',
    ],
    [
      'Editable direct ref',
      '=@edit_value',
      '55',
      '=IF(B29==C29,"PASS","FAIL")',
      'Change J10 to validate live refs',
    ],
    [
      'Editable derived formula',
      '=@B29/5',
      '11',
      '=IF(B30==C30,"PASS","FAIL")',
      'Depends on editable direct ref',
    ],
  ];

  rows.forEach((row, index) => {
    const sheetRow = index + 2;
    setCell(adapter, MAIN_SHEET_ID, `A${sheetRow}`, row[0]);
    setCell(adapter, MAIN_SHEET_ID, `B${sheetRow}`, row[1]);
    setCell(adapter, MAIN_SHEET_ID, `C${sheetRow}`, row[2]);
    setCell(adapter, MAIN_SHEET_ID, `D${sheetRow}`, row[3]);
    setCell(adapter, MAIN_SHEET_ID, `E${sheetRow}`, row[4]);
  });

  return adapter.snapshot();
}

export async function buildComputedFormulaTestWorkbook() {
  const workbook = buildBaseFormulaTestWorkbook();
  const result = await computeSheetSnapshot({
    sheetDocumentId: '',
    workbookData: workbook,
    activeSheetId: MAIN_SHEET_ID,
    channelPayloads: {},
    forceRefreshAI: false,
    changedSignals: [],
    persistWorkbook: async () => {},
  });

  const computedWorkbook =
    result && result.workbook ? result.workbook : workbook;
  const adapter = new WorkbookStorageAdapter(computedWorkbook);

  setCell(adapter, AI_SHEET_ID, 'A1', 'AI Formula');
  setCell(adapter, AI_SHEET_ID, 'B1', 'Purpose');
  setCell(adapter, AI_SHEET_ID, 'C1', 'Expected behavior');
  setCell(adapter, AI_SHEET_ID, 'J1', 'AI Inputs');
  setCell(adapter, AI_SHEET_ID, 'J2', 'пломбир для карликов');
  setCell(adapter, AI_SHEET_ID, 'J3', 'https://example.com');
  setCell(
    adapter,
    AI_SHEET_ID,
    'J4',
    'Answer in a concise product-strategy tone.',
  );

  const aiRows = [
    [
      "'@idea: one-line value proposition",
      'Quoted prompt',
      'Returns one text answer',
    ],
    [
      '>5 потенциальных аудиторий для проекта @idea. по одной ЦА',
      'List shortcut',
      'Spills one item per row',
    ],
    [
      '# summarize @website in 3 bullets',
      'Table shortcut',
      'Spills rows/columns under the source cell',
    ],
    [
      "'@@tone Rewrite the homepage pitch for @idea",
      'System context mention',
      'Uses @@tone as hidden instruction',
    ],
    [
      "'Top keywords for @website",
      'URL enrichment',
      'Fetches URL content before asking AI',
    ],
    [
      "'Summarize @A3",
      'Cross-formula dependency',
      'Uses the latest list/table output as prompt input',
    ],
    [
      "'Compare @idea with competitors on @website",
      'Multi-mention prompt',
      'Combines named refs and URL context',
    ],
  ];

  aiRows.forEach((row, index) => {
    const sheetRow = index + 2;
    setCell(adapter, AI_SHEET_ID, `A${sheetRow}`, row[0]);
    setCell(adapter, AI_SHEET_ID, `B${sheetRow}`, row[1]);
    setCell(adapter, AI_SHEET_ID, `C${sheetRow}`, row[2]);
  });

  setCell(adapter, RUNTIME_SHEET_ID, 'A1', 'Capability');
  setCell(adapter, RUNTIME_SHEET_ID, 'B1', 'Example');
  setCell(adapter, RUNTIME_SHEET_ID, 'C1', 'What it covers');
  setCell(adapter, RUNTIME_SHEET_ID, 'J1', 'Runtime Inputs');
  setCell(adapter, RUNTIME_SHEET_ID, 'J2', 'A two-line business case draft');
  setCell(
    adapter,
    RUNTIME_SHEET_ID,
    'J3',
    'Weekly launch summary with customer proof points.',
  );
  setCell(
    adapter,
    RUNTIME_SHEET_ID,
    'J5',
    '# Policy\n\n- Keep launch notes concise.\n- Include customer impact.\n',
  );
  setCell(
    adapter,
    RUNTIME_SHEET_ID,
    'K5',
    '=PDF("policy-copy.pdf", J5)',
  );

  const runtimeRows = [
    [
      'Report input',
      'Input:@case:[Enter your business case]',
      'Editable report control bound to a named cell',
    ],
    [
      'Inline report input',
      'Business case: Input:@case',
      'Mixed prose + embedded report control',
    ],
    [
      'Report file picker',
      'File:@policy_file:[Upload policy PDF]',
      'Report file control syntax for workbook-bound files',
    ],
    [
      'Sheet-linked generated file',
      "File:'Runtime Patterns'!K5",
      'Report link to a generated =PDF(...) file cell',
    ],
    [
      'Report link',
      '!@idea',
      'Internal report link to a named cell',
    ],
    [
      'Generated text file',
      '=FILE("launch-notes.txt", J3)',
      'Generated attachment formula',
    ],
    [
      'Generated PDF',
      '=PDF("policy-copy.pdf", J5)',
      'Generated PDF formula',
    ],
    [
      'Channel inbox log',
      '/tg',
      'Raw inbound event stream as date/from/text/file rows',
    ],
    [
      'Channel AI note',
      "' /tg summarize the latest incoming event",
      'One AI note from channel events',
    ],
    [
      'Channel AI list',
      '> /tg extract action items from each incoming event',
      'One list item per channel event',
    ],
    [
      'Channel AI table',
      '# /tg extract key fields from each incoming event',
      'One table row per channel event',
    ],
    [
      'Telegram send',
      '/tg:send:hello from MetaCells',
      'Outbound channel send',
    ],
    [
      'Telegram file send',
      '/tg:send:@policy_file uploaded',
      'Outbound send with workbook attachment reference',
    ],
    [
      'Shell send',
      '/sh:send:{"command":"pwd"}',
      'Channel action with JSON payload',
    ],
    [
      'Email send',
      '/sf:send:{"to":"user@example.com","subj":"Status","body":"See @summary"}',
      'Structured outbound send through SMTP/IMAP channel',
    ],
  ];

  runtimeRows.forEach((row, index) => {
    const sheetRow = index + 2;
    setCell(adapter, RUNTIME_SHEET_ID, `A${sheetRow}`, row[0]);
    setCell(adapter, RUNTIME_SHEET_ID, `B${sheetRow}`, row[1]);
    setCell(adapter, RUNTIME_SHEET_ID, `C${sheetRow}`, row[2]);
  });

  adapter.setReportContent(
    REPORT_TAB_ID,
    [
      '# Formula Test Report',
      '',
      'Idea link: !@idea',
      'Case input: Input:@case:[Enter your business case]',
      'Policy file: File:@policy_file:[Upload policy PDF]',
      "Generated file: File:'Runtime Patterns'!K5",
      '',
      'This report tab exercises report-view controls, links, and generated file references.',
    ].join('\n'),
  );

  return adapter.snapshot();
}

export async function buildComputedFinancialModelWorkbook() {
  const adapter = new WorkbookStorageAdapter(createEmptyWorkbook());

  adapter.setTabs([
    { id: FINANCE_ASSUMPTIONS_SHEET_ID, name: 'Assumptions', type: 'sheet' },
    { id: FINANCE_MODEL_SHEET_ID, name: 'Financial Model', type: 'sheet' },
    { id: FINANCE_AI_SHEET_ID, name: 'AI Strategy', type: 'sheet' },
  ]);
  adapter.setActiveTabId(FINANCE_MODEL_SHEET_ID);
  adapter.setNamedCells({
    price_per_customer: { sheetId: FINANCE_ASSUMPTIONS_SHEET_ID, cellId: 'B2' },
    starting_customers: { sheetId: FINANCE_ASSUMPTIONS_SHEET_ID, cellId: 'B3' },
    monthly_new_customers: {
      sheetId: FINANCE_ASSUMPTIONS_SHEET_ID,
      cellId: 'B4',
    },
    monthly_churn_pct: { sheetId: FINANCE_ASSUMPTIONS_SHEET_ID, cellId: 'B5' },
    team_size: { sheetId: FINANCE_ASSUMPTIONS_SHEET_ID, cellId: 'B6' },
    salary_per_head: { sheetId: FINANCE_ASSUMPTIONS_SHEET_ID, cellId: 'B7' },
    fixed_opex: { sheetId: FINANCE_ASSUMPTIONS_SHEET_ID, cellId: 'B8' },
    gross_margin_pct: { sheetId: FINANCE_ASSUMPTIONS_SHEET_ID, cellId: 'B9' },
    cac: { sheetId: FINANCE_ASSUMPTIONS_SHEET_ID, cellId: 'B10' },
    initial_cash: { sheetId: FINANCE_ASSUMPTIONS_SHEET_ID, cellId: 'B11' },
    company_idea: { sheetId: FINANCE_AI_SHEET_ID, cellId: 'J2' },
    icp: { sheetId: FINANCE_AI_SHEET_ID, cellId: 'J3' },
    tone: { sheetId: FINANCE_AI_SHEET_ID, cellId: 'J4' },
    current_mrr: { sheetId: FINANCE_MODEL_SHEET_ID, cellId: 'G3' },
    current_cash: { sheetId: FINANCE_MODEL_SHEET_ID, cellId: 'G6' },
    payback_months: { sheetId: FINANCE_MODEL_SHEET_ID, cellId: 'B9' },
  });

  const assumptionRows = [
    ['Metric', 'Value'],
    ['Price / customer / month', '499'],
    ['Starting customers', '12'],
    ['Monthly new customers', '8'],
    ['Monthly churn %', '0.05'],
    ['Team size', '6'],
    ['Salary / head / month', '7000'],
    ['Fixed opex / month', '15000'],
    ['Gross margin %', '0.82'],
    ['CAC', '1800'],
    ['Initial cash', '750000'],
  ];

  assumptionRows.forEach((row, index) => {
    const sheetRow = index + 1;
    setCell(adapter, FINANCE_ASSUMPTIONS_SHEET_ID, `A${sheetRow}`, row[0]);
    setCell(adapter, FINANCE_ASSUMPTIONS_SHEET_ID, `B${sheetRow}`, row[1]);
  });

  setCell(adapter, FINANCE_MODEL_SHEET_ID, 'A1', 'Metric');
  ['Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5', 'Month 6'].forEach(
    (label, index) => {
      setCell(
        adapter,
        FINANCE_MODEL_SHEET_ID,
        String.fromCharCode(66 + index) + '1',
        label,
      );
    },
  );

  const modelRows = [
    [
      'Customers',
      [
        '=@starting_customers',
        '=B2+@monthly_new_customers-(B2*@monthly_churn_pct)',
        '=C2+@monthly_new_customers-(C2*@monthly_churn_pct)',
        '=D2+@monthly_new_customers-(D2*@monthly_churn_pct)',
        '=E2+@monthly_new_customers-(E2*@monthly_churn_pct)',
        '=F2+@monthly_new_customers-(F2*@monthly_churn_pct)',
      ],
    ],
    [
      'MRR',
      [
        '=B2*@price_per_customer',
        '=C2*@price_per_customer',
        '=D2*@price_per_customer',
        '=E2*@price_per_customer',
        '=F2*@price_per_customer',
        '=G2*@price_per_customer',
      ],
    ],
    [
      'Gross Profit',
      [
        '=B3*@gross_margin_pct',
        '=C3*@gross_margin_pct',
        '=D3*@gross_margin_pct',
        '=E3*@gross_margin_pct',
        '=F3*@gross_margin_pct',
        '=G3*@gross_margin_pct',
      ],
    ],
    [
      'Burn',
      [
        '=(@team_size*@salary_per_head)+@fixed_opex-B4',
        '=(@team_size*@salary_per_head)+@fixed_opex-C4',
        '=(@team_size*@salary_per_head)+@fixed_opex-D4',
        '=(@team_size*@salary_per_head)+@fixed_opex-E4',
        '=(@team_size*@salary_per_head)+@fixed_opex-F4',
        '=(@team_size*@salary_per_head)+@fixed_opex-G4',
      ],
    ],
    [
      'Cash Balance',
      ['=@initial_cash-B5', '=B6-C5', '=C6-D5', '=D6-E5', '=E6-F5', '=F6-G5'],
    ],
    ['ARR', ['=B3*12', '=C3*12', '=D3*12', '=E3*12', '=F3*12', '=G3*12']],
    [
      'New ARR Added',
      [
        '=@monthly_new_customers*@price_per_customer*12',
        '=@monthly_new_customers*@price_per_customer*12',
        '=@monthly_new_customers*@price_per_customer*12',
        '=@monthly_new_customers*@price_per_customer*12',
        '=@monthly_new_customers*@price_per_customer*12',
        '=@monthly_new_customers*@price_per_customer*12',
      ],
    ],
    [
      'CAC Payback (months)',
      [
        '=@cac/(@price_per_customer*@gross_margin_pct)',
        '=@cac/(@price_per_customer*@gross_margin_pct)',
        '=@cac/(@price_per_customer*@gross_margin_pct)',
        '=@cac/(@price_per_customer*@gross_margin_pct)',
        '=@cac/(@price_per_customer*@gross_margin_pct)',
        '=@cac/(@price_per_customer*@gross_margin_pct)',
      ],
    ],
    [
      'Status',
      [
        '=IF(B6>0,"Alive","Out")',
        '=IF(C6>0,"Alive","Out")',
        '=IF(D6>0,"Alive","Out")',
        '=IF(E6>0,"Alive","Out")',
        '=IF(F6>0,"Alive","Out")',
        '=IF(G6>0,"Alive","Out")',
      ],
    ],
  ];

  modelRows.forEach((row, index) => {
    const sheetRow = index + 2;
    setCell(adapter, FINANCE_MODEL_SHEET_ID, `A${sheetRow}`, row[0]);
    row[1].forEach((formula, valueIndex) => {
      setCell(
        adapter,
        FINANCE_MODEL_SHEET_ID,
        String.fromCharCode(66 + valueIndex) + sheetRow,
        formula,
      );
    });
  });

  const result = await computeSheetSnapshot({
    sheetDocumentId: '',
    workbookData: adapter.snapshot(),
    activeSheetId: FINANCE_MODEL_SHEET_ID,
    channelPayloads: {},
    forceRefreshAI: false,
    changedSignals: [],
    persistWorkbook: async () => {},
  });

  const computedWorkbook =
    result && result.workbook ? result.workbook : adapter.snapshot();
  const computedAdapter = new WorkbookStorageAdapter(computedWorkbook);

  setCell(computedAdapter, FINANCE_AI_SHEET_ID, 'A1', 'AI Formula');
  setCell(computedAdapter, FINANCE_AI_SHEET_ID, 'B1', 'Purpose');
  setCell(computedAdapter, FINANCE_AI_SHEET_ID, 'C1', 'What to expect');
  setCell(computedAdapter, FINANCE_AI_SHEET_ID, 'J1', 'AI Inputs');
  setCell(
    computedAdapter,
    FINANCE_AI_SHEET_ID,
    'J2',
    'AI copilot for RevOps teams',
  );
  setCell(
    computedAdapter,
    FINANCE_AI_SHEET_ID,
    'J3',
    'Series A B2B SaaS revenue leaders',
  );
  setCell(
    computedAdapter,
    FINANCE_AI_SHEET_ID,
    'J4',
    'Write in a concise investor-update tone.',
  );

  const aiRows = [
    [
      "'Write a one-line investor update for @company_idea with MRR @current_mrr and cash @current_cash",
      'Single answer',
      'One concise text summary',
    ],
    [
      '>5 reasons why @icp would buy @company_idea at @price_per_customer per month',
      'List shortcut',
      'Five rows of GTM ideas',
    ],
    [
      '# summarize growth and burn for @company_idea using MRR @current_mrr, cash @current_cash and payback @payback_months',
      'Table shortcut',
      'A small summary table',
    ],
    [
      "'@@tone Rewrite the founder update for @company_idea and @icp",
      'Hidden system prompt',
      'Uses tone as hidden instruction',
    ],
    [
      "'Top fundraising risks for @company_idea if current cash is @current_cash",
      'Depends on model outputs',
      'Reruns when model outputs move',
    ],
    [
      "'Suggest pricing tests around @price_per_customer for @icp",
      'Named ref prompt',
      'Uses assumptions directly',
    ],
  ];

  aiRows.forEach((row, index) => {
    const sheetRow = index + 2;
    setCell(computedAdapter, FINANCE_AI_SHEET_ID, `A${sheetRow}`, row[0]);
    setCell(computedAdapter, FINANCE_AI_SHEET_ID, `B${sheetRow}`, row[1]);
    setCell(computedAdapter, FINANCE_AI_SHEET_ID, `C${sheetRow}`, row[2]);
  });

  return computedAdapter.snapshot();
}
