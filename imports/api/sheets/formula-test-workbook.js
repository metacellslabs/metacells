import {
  createEmptyWorkbook,
  WorkbookStorageAdapter,
} from '../../engine/workbook-storage-adapter.js';
import { computeSheetSnapshot } from './server/compute.js';
import { buildAttachmentSourceValue } from '../artifacts/index.js';

const MAIN_SHEET_ID = 'sheet-1';
const LOOKUP_SHEET_ID = 'sheet-2';
const AI_SHEET_ID = 'sheet-3';
const FINANCE_ASSUMPTIONS_SHEET_ID = 'sheet-1';
const FINANCE_MODEL_SHEET_ID = 'sheet-2';
const FINANCE_AI_SHEET_ID = 'sheet-3';

function setCell(adapter, sheetId, cellId, source) {
  adapter.setCellSource(sheetId, cellId, source);
}

function setCellFormat(adapter, sheetId, cellId, format, presentation) {
  adapter.setCellFormat(sheetId, cellId, format);
  if (presentation && typeof presentation === 'object') {
    adapter.setCellPresentation(sheetId, cellId, presentation);
  }
}

function applyRowFormat(adapter, sheetId, rowNumber, format, presentation) {
  ['B', 'C', 'D', 'E', 'F', 'G'].forEach((column) => {
    setCellFormat(
      adapter,
      sheetId,
      `${column}${rowNumber}`,
      format,
      presentation,
    );
  });
}

function buildBaseFormulaTestWorkbook() {
  const adapter = new WorkbookStorageAdapter(createEmptyWorkbook());

  adapter.setTabs([
    { id: MAIN_SHEET_ID, name: 'Formula Checks', type: 'sheet' },
    { id: LOOKUP_SHEET_ID, name: 'Lookup Data', type: 'sheet' },
    { id: AI_SHEET_ID, name: 'AI Playground', type: 'sheet' },
  ]);
  adapter.setActiveTabId(MAIN_SHEET_ID);
  adapter.setNamedCells({
    base_value: { sheetId: MAIN_SHEET_ID, cellId: 'J2' },
    edit_value: { sheetId: MAIN_SHEET_ID, cellId: 'J10' },
    idea: { sheetId: AI_SHEET_ID, cellId: 'J2' },
    website: { sheetId: AI_SHEET_ID, cellId: 'J3' },
    tone: { sheetId: AI_SHEET_ID, cellId: 'J4' },
    policy_file: { sheetId: AI_SHEET_ID, cellId: 'J5' },
    launch_brief_file: { sheetId: AI_SHEET_ID, cellId: 'J6' },
    plans: { sheetId: LOOKUP_SHEET_ID, startCellId: 'A2', endCellId: 'C4' },
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
  setCell(adapter, MAIN_SHEET_ID, 'E1', 'Description');

  setCell(adapter, MAIN_SHEET_ID, 'J1', 'Local Inputs');
  setCell(adapter, MAIN_SHEET_ID, 'J2', '10');
  setCell(adapter, MAIN_SHEET_ID, 'J3', '20');
  setCell(adapter, MAIN_SHEET_ID, 'J4', '  hello   world  ');
  setCell(adapter, MAIN_SHEET_ID, 'J5', '2024-01-01');
  setCell(adapter, MAIN_SHEET_ID, 'J6', '2024-01-11');
  setCell(adapter, MAIN_SHEET_ID, 'J7', '2024-01-01');
  setCell(adapter, MAIN_SHEET_ID, 'J8', '2024-03-15');
  setCell(adapter, MAIN_SHEET_ID, 'J9', '-12');
  setCell(adapter, MAIN_SHEET_ID, 'J10', '55');
  setCell(adapter, MAIN_SHEET_ID, 'J11', 'North America');
  setCell(adapter, MAIN_SHEET_ID, 'J12', 'Growth');
  setCell(adapter, MAIN_SHEET_ID, 'J13', '0.256');
  setCell(
    adapter,
    MAIN_SHEET_ID,
    'J14',
    '# Launch Plan\n\n## Priorities\n- Expand in North America\n- Focus on growth-stage buyers\n- Keep messaging concise',
  );
  setCell(
    adapter,
    MAIN_SHEET_ID,
    'K10',
    'Edit J10 to verify that dependent formulas recalculate correctly',
  );

  const rows = [
    [
      'Direct mention ref',
      '=@J2',
      '10',
      '=IF(B2==C2,"PASS","FAIL")',
      'Reads a local numeric input through the mention syntax.',
    ],
    [
      'Named ref',
      '=@base_value',
      '10',
      '=IF(B3==C3,"PASS","FAIL")',
      'Resolves a named cell that points to J2.',
    ],
    [
      'Arithmetic',
      '=@B2+@J3',
      '30',
      '=IF(B4==C4,"PASS","FAIL")',
      'Combines a previous computed cell with a direct input.',
    ],
    ['SUM', '=SUM(J2:J3)', '30', '=IF(B5==C5,"PASS","FAIL")', 'Sums a basic two-cell numeric range.'],
    [
      'AVERAGE',
      '=AVERAGE(J2:J3)',
      '15',
      '=IF(B6==C6,"PASS","FAIL")',
      'Computes the average across the same numeric range.',
    ],
    [
      'COUNT',
      '=COUNT(J2:J4)',
      '2',
      '=IF(B7==C7,"PASS","FAIL")',
      'Counts only numeric entries and ignores text.',
    ],
    [
      'COUNTA',
      '=COUNTA(J2:J4)',
      '3',
      '=IF(B8==C8,"PASS","FAIL")',
      'Counts all non-empty cells, including text.',
    ],
    [
      'TRIM',
      '=TRIM(J4)',
      'hello world',
      '=IF(B9==C9,"PASS","FAIL")',
      'Removes repeated internal spacing and trims edges.',
    ],
    [
      'LEN(TRIM())',
      '=LEN(TRIM(J4))',
      '11',
      '=IF(B10==C10,"PASS","FAIL")',
      'Measures the normalized string length after TRIM.',
    ],
    [
      'IF',
      '=IF(J2>5,"High","Low")',
      'High',
      '=IF(B11==C11,"PASS","FAIL")',
      'Exercises a simple boolean branch with text outputs.',
    ],
    [
      'COUNTIF',
      '=COUNTIF(J2:J3,">15")',
      '1',
      '=IF(B12==C12,"PASS","FAIL")',
      'Counts entries matching a numeric comparison criterion.',
    ],
    [
      'SUMIF',
      '=SUMIF(J2:J3,">15")',
      '20',
      '=IF(B13==C13,"PASS","FAIL")',
      'Sums only values that match the criterion.',
    ],
    [
      'TODAY',
      '=TODAY()',
      '=TODAY()',
      '=IF(B14==C14,"PASS","FAIL")',
      'Uses a volatile date function and compares against itself.',
    ],
    [
      'DATEDIF days',
      '=DATEDIF(J5,J6,"D")',
      '10',
      '=IF(B15==C15,"PASS","FAIL")',
      'Measures day difference between two fixed dates.',
    ],
    [
      'DATEDIF months',
      '=DATEDIF(J7,J8,"M")',
      '2',
      '=IF(B16==C16,"PASS","FAIL")',
      'Measures full month difference across a wider date range.',
    ],
    [
      'INDEX',
      "=INDEX('Lookup Data'!A2:C4,2,3)",
      'growth',
      '=IF(B17==C17,"PASS","FAIL")',
      'Fetches a matrix value by explicit row and column offsets.',
    ],
    [
      'VLOOKUP',
      '=VLOOKUP("pro",\'Lookup Data\'!A2:C4,2)',
      '20',
      '=IF(B18==C18,"PASS","FAIL")',
      'Exercises classic exact-match vertical lookup behavior.',
    ],
    [
      'XLOOKUP',
      '=XLOOKUP("enterprise",\'Lookup Data\'!A2:A4,\'Lookup Data\'!C2:C4,"Missing")',
      'scale',
      '=IF(B19==C19,"PASS","FAIL")',
      'Uses exact-match lookup with a custom missing fallback.',
    ],
    [
      'XLOOKUP missing',
      '=XLOOKUP("missing",\'Lookup Data\'!A2:A4,\'Lookup Data\'!C2:C4,"Missing")',
      'Missing',
      '=IF(B20==C20,"PASS","FAIL")',
      'Validates the missing-value fallback branch.',
    ],
    [
      'FILTER',
      "=FILTER('Lookup Data'!A2:C4,'Lookup Data'!A2:A4,\"pro\")",
      'pro,20,growth',
      '=IF(B21==C21,"PASS","FAIL")',
      'Returns the matching row as a spill-like CSV result.',
    ],
    [
      'Cross-sheet ref',
      "='Lookup Data'!B3",
      '20',
      '=IF(B22==C22,"PASS","FAIL")',
      'Reads a value directly from another sheet.',
    ],
    [
      'Nested combo',
      '=SUM(J2:J3)+VLOOKUP("basic",\'Lookup Data\'!A2:C4,2)',
      '40',
      '=IF(B23==C23,"PASS","FAIL")',
      'Combines aggregation and lookup in one formula.',
    ],
    [
      'Mention range SUM',
      '=SUM(@J2:J3)',
      '30',
      '=IF(B24==C24,"PASS","FAIL")',
      'Uses a mentioned range directly inside SUM.',
    ],
    [
      'Chained ref',
      '=@B23/2',
      '20',
      '=IF(B25==C25,"PASS","FAIL")',
      'Depends on another computed formula cell.',
    ],
    [
      'Named range INDEX',
      '=INDEX(@plans,3,3)',
      'scale',
      '=IF(B26==C26,"PASS","FAIL")',
      'Reads from the named lookup region using INDEX.',
    ],
    [
      'Named range VLOOKUP',
      '=VLOOKUP("basic",@plans,2)',
      '10',
      '=IF(B27==C27,"PASS","FAIL")',
      'Performs lookup against the same named region.',
    ],
    [
      'Conditional combo',
      '=IF(COUNTIF(\'Lookup Data\'!B2:B4,">15")==2,"OK","NO")',
      'OK',
      '=IF(B28==C28,"PASS","FAIL")',
      'Uses COUNTIF inside IF to build a derived label.',
    ],
    [
      'Editable direct ref',
      '=@edit_value',
      '55',
      '=IF(B29==C29,"PASS","FAIL")',
      'Directly references the editable input cell J10.',
    ],
    [
      'Editable derived formula',
      '=@B29/5',
      '11',
      '=IF(B30==C30,"PASS","FAIL")',
      'Builds on the editable reference to verify chaining.',
    ],
    [
      'MAX across local inputs',
      '=MAX(J2:J3,J9)',
      '20',
      '=IF(B31==C31,"PASS","FAIL")',
      'Returns the highest value across positive and negative inputs.',
    ],
    [
      'MIN across local inputs',
      '=MIN(J2:J3,J9)',
      '-12',
      '=IF(B32==C32,"PASS","FAIL")',
      'Returns the lowest value across the same mixed-sign set.',
    ],
    [
      'ABS on negative input',
      '=ABS(J9)',
      '12',
      '=IF(B33==C33,"PASS","FAIL")',
      'Normalizes a negative number into a positive magnitude.',
    ],
    [
      'ROUND percentage',
      '=ROUND(J13*100,1)',
      '25.6',
      '=IF(B34==C34,"PASS","FAIL")',
      'Rounds a decimal percentage after scaling by 100.',
    ],
    [
      'IFERROR fallback',
      '=IFERROR(VLOOKUP("missing",\'Lookup Data\'!A2:C4,2),"Fallback Price")',
      'Fallback Price',
      '=IF(B35==C35,"PASS","FAIL")',
      'Converts a failing lookup into a readable fallback value.',
    ],
    [
      'UPPER text transform',
      '=UPPER(J11)',
      'NORTH AMERICA',
      '=IF(B36==C36,"PASS","FAIL")',
      'Converts a mixed-case phrase to uppercase.',
    ],
    [
      'LOWER text transform',
      '=LOWER(J12)',
      'growth',
      '=IF(B37==C37,"PASS","FAIL")',
      'Converts a title-case label to lowercase.',
    ],
    [
      'LEFT substring',
      '=LEFT(J11,5)',
      'North',
      '=IF(B38==C38,"PASS","FAIL")',
      'Extracts the first five characters from a phrase.',
    ],
    [
      'RIGHT substring',
      '=RIGHT(J11,7)',
      'America',
      '=IF(B39==C39,"PASS","FAIL")',
      'Extracts the trailing portion of the same phrase.',
    ],
    [
      'Concatenation combo',
      '=TRIM(J4)&" / "&J12',
      'hello world / Growth',
      '=IF(B40==C40,"PASS","FAIL")',
      'Combines normalized text with another local input.',
    ],
    [
      'AND logic',
      '=IF(AND(J2>5,J3>15),"Both pass","Fail")',
      'Both pass',
      '=IF(B41==C41,"PASS","FAIL")',
      'Checks two numeric conditions together.',
    ],
    [
      'OR logic',
      '=IF(OR(J2>50,J3>15),"One passes","Fail")',
      'One passes',
      '=IF(B42==C42,"PASS","FAIL")',
      'Checks whether at least one condition is true.',
    ],
    [
      'Lookup plus text label',
      '=XLOOKUP("pro",\'Lookup Data\'!A2:A4,\'Lookup Data\'!C2:C4,"Missing")&" plan"',
      'growth plan',
      '=IF(B43==C43,"PASS","FAIL")',
      'Combines lookup output with literal text.',
    ],
    [
      'Multi-step arithmetic chain',
      '=ROUND((SUM(J2:J3)+ABS(J9))/COUNT(J2:J3),2)',
      '21',
      '=IF(B44==C44,"PASS","FAIL")',
      'Combines SUM, ABS, COUNT, division, and rounding.',
    ],
    [
      'Cross-sheet conditional lookup',
      '=IF(VLOOKUP("enterprise",\'Lookup Data\'!A2:C4,2)>25,"Premium","Standard")',
      'Premium',
      '=IF(B45==C45,"PASS","FAIL")',
      'Turns a looked-up price into a category label.',
    ],
    [
      'Deep nested formula',
      '=IFERROR(INDEX(@plans,MATCH("pro",\'Lookup Data\'!A2:A4,0),3),"Missing")',
      'growth',
      '=IF(B46==C46,"PASS","FAIL")',
      'Combines INDEX, MATCH, named ranges, and IFERROR.',
    ],
    [
      'Editable + fixed input mix',
      '=ROUND((@edit_value+J2)/3,2)',
      '21.67',
      '=IF(B47==C47,"PASS","FAIL")',
      'Mixes the editable input with a stable numeric seed.',
    ],
    [
      'Text and numeric summary',
      '="Region: "&J11&", Price: "&VLOOKUP("basic",@plans,2)',
      'Region: North America, Price: 10',
      '=IF(B48==C48,"PASS","FAIL")',
      'Builds a readable summary from text and lookup results.',
    ],
    [
      'FILE attachment from text',
      '=FILE("ops-notes.txt",TRIM(J4))',
      'ops-notes.txt',
      '=IF(B49=C49,"PASS","FAIL")',
      'Creates a plain text attachment from a formula-resolved string.',
    ],
    [
      'PDF attachment from formula content',
      '=PDF("north-america-summary.pdf","Region: "&J11&", Segment: "&J12)',
      'application/pdf',
      '=IF(B50=C50,"PASS","FAIL")',
      'Creates a PDF attachment from concatenated text generated by formulas.',
    ],
    [
      'DOCX attachment from markdown',
      '=DOCX("launch-plan.docx",J14)',
      'DOCX_MD',
      '=IF(B51=C51,"PASS","FAIL")',
      'Creates a DOCX attachment from markdown-style content stored in a cell.',
    ],
    [
      'FILE with explicit PDF type',
      '=FILE("lookup-summary.pdf","Basic price: "&VLOOKUP("basic",@plans,2),"PDF")',
      'application/pdf',
      '=IF(B52=C52,"PASS","FAIL")',
      'Uses FILE with an explicit PDF type argument instead of PDF().',
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
  setCell(adapter, AI_SHEET_ID, 'J2', 'AI spreadsheet copilot for finance teams');
  setCell(adapter, AI_SHEET_ID, 'J3', 'https://example.com');
  setCell(
    adapter,
    AI_SHEET_ID,
    'J4',
    'Answer in a concise product-strategy tone.',
  );
  setCell(
    adapter,
    AI_SHEET_ID,
    'J5',
    buildAttachmentSourceValue({
      name: 'policy.txt',
      type: 'text/plain',
      content:
        'Company policy\nEmployees may work remotely up to three days per week.\nAll customer data must stay in approved systems.\nSecurity incidents must be reported within 24 hours.',
      encoding: 'utf8',
      generated: true,
    }),
  );
  setCell(
    adapter,
    AI_SHEET_ID,
    'J6',
    buildAttachmentSourceValue({
      name: 'launch-brief.md',
      type: 'text/markdown',
      content:
        '# Launch Brief\n\n## Audience\nFinance leaders at growth-stage SaaS companies\n\n## Goal\nPosition the product as an AI spreadsheet copilot for finance teams\n\n## Risks\nCrowded market, unclear onboarding, and weak proof points',
      encoding: 'utf8',
      generated: true,
    }),
  );

  const aiRows = [
    [
      "'@idea: write a one-line value proposition",
      'Quoted prompt',
      'Returns a single text answer in one cell.',
    ],
    [
      '>5 target customer segments for @idea, one per row',
      'List shortcut',
      'Returns one list item per row below the source cell.',
    ],
    [
      '# summarize @website in 3 bullets',
      'Table shortcut',
      'Returns a small multi-row structured output.',
    ],
    [
      "'@@tone Rewrite the homepage pitch for @idea",
      'System context mention',
      'Uses @@tone as hidden system-style context.',
    ],
    [
      "'Top keywords for @website",
      'URL enrichment',
      'Fetches and injects URL content before the AI request.',
    ],
    [
      "'Summarize @A3",
      'Cross-formula dependency',
      'Uses earlier AI output as the prompt input for a second step.',
    ],
    [
      "'Compare @idea with competitors on @website",
      'Multi-mention prompt',
      'Combines named references with fetched URL context.',
    ],
    [
      "'Summarize @policy_file in 3 bullets",
      'File-backed prompt',
      'Injects attached file content into the AI prompt as text context.',
    ],
    [
      "'Extract the top 3 launch risks from @launch_brief_file",
      'File analysis prompt',
      'Uses an attached markdown file as the main source document.',
    ],
    [
      "'List 3 objections a buyer may have about @idea and answer each briefly",
      'Reasoning prompt',
      'Produces a compact objection-and-response style answer.',
    ],
    [
      '# create a 3-column messaging table for @idea aimed at CFOs',
      'Structured output',
      'Returns a small table suitable for downstream references.',
    ],
    [
      "'@@tone Draft a launch email for @idea using facts from @website",
      'Prompt composition',
      'Combines tone, product context, and fetched web context in one prompt.',
    ],
    [
      '=PDF("policy-summary.pdf", A9)',
      'AI output to PDF',
      'Turns AI-generated text derived from an attached file into a PDF attachment.',
    ],
    [
      '=DOCX("launch-risks.docx", A10)',
      'AI output to DOCX',
      'Turns AI-generated text derived from an attached file into a DOCX attachment.',
    ],
  ];

  aiRows.forEach((row, index) => {
    const sheetRow = index + 2;
    setCell(adapter, AI_SHEET_ID, `A${sheetRow}`, row[0]);
    setCell(adapter, AI_SHEET_ID, `B${sheetRow}`, row[1]);
    setCell(adapter, AI_SHEET_ID, `C${sheetRow}`, row[2]);
  });

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

  setCellFormat(adapter, FINANCE_ASSUMPTIONS_SHEET_ID, 'B2', 'currency_usd');
  setCellFormat(adapter, FINANCE_ASSUMPTIONS_SHEET_ID, 'B3', 'number_0');
  setCellFormat(adapter, FINANCE_ASSUMPTIONS_SHEET_ID, 'B4', 'number_0');
  setCellFormat(adapter, FINANCE_ASSUMPTIONS_SHEET_ID, 'B5', 'percent_2');
  setCellFormat(adapter, FINANCE_ASSUMPTIONS_SHEET_ID, 'B6', 'number_0');
  setCellFormat(adapter, FINANCE_ASSUMPTIONS_SHEET_ID, 'B7', 'currency_usd');
  setCellFormat(adapter, FINANCE_ASSUMPTIONS_SHEET_ID, 'B8', 'currency_usd');
  setCellFormat(adapter, FINANCE_ASSUMPTIONS_SHEET_ID, 'B9', 'percent_2');
  setCellFormat(adapter, FINANCE_ASSUMPTIONS_SHEET_ID, 'B10', 'currency_usd');
  setCellFormat(adapter, FINANCE_ASSUMPTIONS_SHEET_ID, 'B11', 'currency_usd');
  setCellFormat(
    adapter,
    FINANCE_ASSUMPTIONS_SHEET_ID,
    'A1',
    'text',
    { bold: true },
  );
  setCellFormat(
    adapter,
    FINANCE_ASSUMPTIONS_SHEET_ID,
    'B1',
    'text',
    { bold: true },
  );

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

  setCellFormat(adapter, FINANCE_MODEL_SHEET_ID, 'A1', 'text', { bold: true });
  ['B', 'C', 'D', 'E', 'F', 'G'].forEach((column) => {
    setCellFormat(adapter, FINANCE_MODEL_SHEET_ID, `${column}1`, 'text', {
      bold: true,
    });
  });
  ['A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'].forEach((cellId) => {
    setCellFormat(adapter, FINANCE_MODEL_SHEET_ID, cellId, 'text', {
      bold: true,
    });
  });
  applyRowFormat(adapter, FINANCE_MODEL_SHEET_ID, 2, 'number_0');
  applyRowFormat(adapter, FINANCE_MODEL_SHEET_ID, 3, 'currency_usd');
  applyRowFormat(adapter, FINANCE_MODEL_SHEET_ID, 4, 'currency_usd');
  applyRowFormat(adapter, FINANCE_MODEL_SHEET_ID, 5, 'currency_usd');
  applyRowFormat(adapter, FINANCE_MODEL_SHEET_ID, 6, 'currency_usd');
  applyRowFormat(adapter, FINANCE_MODEL_SHEET_ID, 7, 'currency_usd');
  applyRowFormat(adapter, FINANCE_MODEL_SHEET_ID, 8, 'currency_usd');
  applyRowFormat(
    adapter,
    FINANCE_MODEL_SHEET_ID,
    9,
    'number_2',
    { decimalPlaces: 2 },
  );

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
