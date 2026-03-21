// Description: Shared configuration and storage keys for the spreadsheet app.
export const GRID_ROWS = 25;
export const GRID_COLS = 10;
export const DEFAULT_COL_WIDTH = 80;
export const MIN_COL_WIDTH = 56;
export const DEFAULT_ROW_HEIGHT = 24;

export const STORAGE_KEYS = {
  tabs: 'SHEET_TABS',
  activeTab: 'ACTIVE_SHEET_TAB',
  aiMode: 'AI_MODE',
  namedCells: 'NAMED_CELLS',
  reportContent: 'REPORT_CONTENT',
};

export const AI_MODE = {
  auto: 'auto',
  manual: 'manual',
};
