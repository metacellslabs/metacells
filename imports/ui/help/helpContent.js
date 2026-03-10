import { buildFormulaHelpSection } from "../metacell/runtime/formulas/index.js";

export const HELP_SECTIONS = [
  {
    title: "Cell Types",
    items: [
      "`=formula` for calculations",
      "`'prompt` asks AI and shows the answer in the cell",
      "`>prompt` asks AI for a list and fills cells below",
      "`#prompt` asks AI for a table and fills cells below",
      "`File cell` stores an uploaded file, shows its filename in the sheet, and uses extracted content in formulas and AI prompts",
    ],
  },
  {
    title: "Commands",
    items: [
      "`recalc(condition, cellRef)` forces a target cell to run again when a condition becomes true. Example: `=B1>5 && recalc(B1>5, @target)`",
      "`update(cellRef, newValue)` changes another cell from a formula, useful for workflows and chained actions",
    ],
  },
  buildFormulaHelpSection(),
  {
    title: "Mentioning",
    items: [
      "`A1` uses the value of cell A1 in the current sheet",
      "`Sheet 1!A1` uses the value of cell A1 from Sheet 1",
      "`A1:B5` uses the values from that region",
      "`@idea` uses the value of the cell named idea",
      "`@@idea` uses the value of the cell named idea as hidden AI context, useful for tone, instructions, or assistant persona",
      "`_@idea` uses the raw source from the cell named idea, including its formula or shortcut",
      "`!@idea` creates an internal report link to the cell named idea",
      "`@fileCell` uses the extracted content of an attached file cell, not just the filename",
      "`File:@cell:[Hint]` renders a report file picker with custom hint text before a file is selected",
      "`Input:@cell:[Placeholder]` renders a report text input with custom placeholder text",
      "`https://...` inside an AI formula fetches that URL and inserts its page content into the AI prompt",
    ],
  },
  {
    title: "Examples",
    items: [
      "Title: AI answer in one cell\nFormula: `'Write 3 taglines for @idea`\nValue: `Smarter budgeting for every kid. | Watch savings grow in real time. | Money habits made playful.`",
      "Title: AI list spill\nFormula: `>top 10 problems that @idea solves`\nValue: `low saving motivation | poor allowance visibility | weak parent-child money conversations | delayed reward feedback ...`",
      "Title: AI table spill\nFormula: `#compare @idea with competitors;4;6`\nValue: `| Product | Strength | Weakness | Differentiator |`",
      "Title: URL enrichment\nFormula: `'Summarise https://example.com for @idea`\nValue: `fetches the page content, inserts it into the AI prompt, and returns a summary shaped around the idea`",
      "Title: Region mention\nFormula: `'Summarise @C1:B10`\nValue: `passes the full region values into the AI prompt and returns one summary for that block`",
      "Title: Workflow update\nFormula: `=update(@target, \"#new prompt;4;6\")`\nValue: `rewrites the target cell so the new table prompt runs on next compute`",
      "Title: Conditional recalc\nFormula: `=B1>5 && recalc(B1>5, @target)`\nValue: `reruns the target formula only after B1 becomes greater than 5`",
      "Title: Hidden AI context\nFormula: `'Write with @@brief and @idea`\nValue: `uses the brief as hidden AI context and the idea in the visible prompt`",
      "Title: Raw source mention\nFormula: `'Audit _@A1`\nValue: `sends the raw source from A1, including its formula or shortcut, to the AI`",
      "Title: Basic report input\nFormula: `Input:@case`\nValue: `renders an editable report input bound to the @case cell`",
      "Title: Report input placeholder\nFormula: `Input:@case:[Enter your business case]`\nValue: `renders a report input with custom placeholder text and writes the typed value into @case`",
      "Title: Report file picker\nFormula: `File:@policy:[Upload policy PDF]`\nValue: `renders a report file picker with hint text; after upload it shows the filename and stores extracted content in @policy`",
      "Title: File content in AI\nFormula: `'Summarise @policy`\nValue: `if @policy is a file cell, sends the extracted file content to AI rather than the filename`",
      "Title: Inline report input\nFormula: `Enter your business case: Input:@case`\nValue: `shows a report input; typing there updates the cell named case`",
      "Title: Report link\nFormula: `!@idea`\nValue: `renders a clickable report link that jumps to the idea cell`",
      "Title: Named reference formula\nFormula: `=@idea`\nValue: `pulls the current computed value from the named cell into this cell`",
      "Title: Inline AI in formula\nFormula: `='(translate @idea to German)`\nValue: `runs an inline AI call inside a formula expression and returns the translated text`",
    ],
  },
  {
    title: "Shortcuts",
    items: [
      "`Enter` commits edit",
      "`Shift+Enter` commits and moves right",
      "`Cmd/Ctrl+C` copy selection",
      "`Cmd/Ctrl+V` paste selection",
      "`Cmd/Ctrl+Z` undo committed workbook changes",
      "`Cmd/Ctrl+Shift+Z` or `Ctrl+Y` redo committed workbook changes",
      "`Cmd/Ctrl+A` selects region, then full sheet on second press",
      "`Arrow keys` move active cell, `Shift+Arrow` extends selection",
      "`Report View` supports `Input:@cell` and `File:@cell` controls directly inside the report",
    ],
  },
];
