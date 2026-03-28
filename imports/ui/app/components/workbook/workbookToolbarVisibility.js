const SURFACE_SHEET = 'sheet';
const SURFACE_REPORT_EDIT = 'reportEdit';
const SURFACE_REPORT_VIEW = 'reportView';
const ZONE_LEFT = 'left';
const ZONE_CENTER = 'center';
const ZONE_RIGHT = 'right';

export const WORKBOOK_TOOLBAR_SURFACES = {
  SHEET: SURFACE_SHEET,
  REPORT_EDIT: SURFACE_REPORT_EDIT,
  REPORT_VIEW: SURFACE_REPORT_VIEW,
};

export const WORKBOOK_TOOLBAR_ZONES = {
  LEFT: ZONE_LEFT,
  CENTER: ZONE_CENTER,
  RIGHT: ZONE_RIGHT,
};

export const WORKBOOK_TOOLBAR_VISIBILITY = {
  main: {
    home: {
      [SURFACE_SHEET]: true,
      [SURFACE_REPORT_EDIT]: true,
      [SURFACE_REPORT_VIEW]: true,
    },
    settings: {
      [SURFACE_SHEET]: false,
      [SURFACE_REPORT_EDIT]: false,
      [SURFACE_REPORT_VIEW]: false,
    },
    stats: {
      [SURFACE_SHEET]: false,
      [SURFACE_REPORT_EDIT]: false,
      [SURFACE_REPORT_VIEW]: false,
    },
    workbookName: {
      [SURFACE_SHEET]: true,
      [SURFACE_REPORT_EDIT]: true,
      [SURFACE_REPORT_VIEW]: true,
    },
    namedCellInput: {
      [SURFACE_SHEET]: true,
      [SURFACE_REPORT_EDIT]: false,
      [SURFACE_REPORT_VIEW]: false,
    },
    formulaInput: {
      [SURFACE_SHEET]: true,
      [SURFACE_REPORT_EDIT]: false,
      [SURFACE_REPORT_VIEW]: false,
    },
    calcProgress: {
      [SURFACE_SHEET]: true,
      [SURFACE_REPORT_EDIT]: false,
      [SURFACE_REPORT_VIEW]: false,
    },
    surfaceStatus: {
      [SURFACE_SHEET]: true,
      [SURFACE_REPORT_EDIT]: false,
      [SURFACE_REPORT_VIEW]: false,
    },
    aiMode: {
      [SURFACE_SHEET]: true,
      [SURFACE_REPORT_EDIT]: false,
      [SURFACE_REPORT_VIEW]: false,
    },
    displayMode: {
      [SURFACE_SHEET]: true,
      [SURFACE_REPORT_EDIT]: false,
      [SURFACE_REPORT_VIEW]: false,
    },
    updateAi: {
      [SURFACE_SHEET]: true,
      [SURFACE_REPORT_EDIT]: false,
      [SURFACE_REPORT_VIEW]: false,
    },
    help: {
      [SURFACE_SHEET]: true,
      [SURFACE_REPORT_EDIT]: true,
      [SURFACE_REPORT_VIEW]: true,
    },
  },
  report: {
    editModeButton: {
      [SURFACE_SHEET]: false,
      [SURFACE_REPORT_EDIT]: false,
      [SURFACE_REPORT_VIEW]: true,
    },
    viewModeButton: {
      [SURFACE_SHEET]: false,
      [SURFACE_REPORT_EDIT]: true,
      [SURFACE_REPORT_VIEW]: false,
    },
    publish: {
      [SURFACE_SHEET]: false,
      [SURFACE_REPORT_EDIT]: true,
      [SURFACE_REPORT_VIEW]: true,
    },
    pdf: {
      [SURFACE_SHEET]: false,
      [SURFACE_REPORT_EDIT]: true,
      [SURFACE_REPORT_VIEW]: true,
    },
    bold: {
      [SURFACE_SHEET]: false,
      [SURFACE_REPORT_EDIT]: true,
      [SURFACE_REPORT_VIEW]: false,
    },
    italic: {
      [SURFACE_SHEET]: false,
      [SURFACE_REPORT_EDIT]: true,
      [SURFACE_REPORT_VIEW]: false,
    },
    underline: {
      [SURFACE_SHEET]: false,
      [SURFACE_REPORT_EDIT]: true,
      [SURFACE_REPORT_VIEW]: false,
    },
    bulletList: {
      [SURFACE_SHEET]: false,
      [SURFACE_REPORT_EDIT]: true,
      [SURFACE_REPORT_VIEW]: false,
    },
    hint: {
      [SURFACE_SHEET]: false,
      [SURFACE_REPORT_EDIT]: true,
      [SURFACE_REPORT_VIEW]: false,
    },
  },
};

export const WORKBOOK_TOOLBAR_LAYOUT = {
  main: {
    brand: ZONE_LEFT,
    address: ZONE_LEFT,
    editor: ZONE_CENTER,
    modes: ZONE_RIGHT,
    actions: ZONE_RIGHT,
  },
  report: {
    mode: ZONE_LEFT,
    actions: ZONE_LEFT,
    formatting: ZONE_CENTER,
    hint: ZONE_RIGHT,
  },
};

export function getWorkbookToolbarSurface(workbookUiState) {
  const ui =
    workbookUiState && typeof workbookUiState === 'object'
      ? workbookUiState
      : {};
  const reportUi =
    ui.reportUi && typeof ui.reportUi === 'object' ? ui.reportUi : {};
  const isReportActive =
    reportUi.active === true || ui.isReportActive === true;
  if (!isReportActive) {
    return SURFACE_SHEET;
  }
  const reportMode = String(
    reportUi.mode || ui.reportMode || (reportUi.isView === true ? 'view' : 'edit'),
  );
  return reportMode === 'view' ? SURFACE_REPORT_VIEW : SURFACE_REPORT_EDIT;
}

export function isWorkbookToolbarControlVisible(group, control, surface) {
  const groupVisibility =
    WORKBOOK_TOOLBAR_VISIBILITY[group] &&
    typeof WORKBOOK_TOOLBAR_VISIBILITY[group] === 'object'
      ? WORKBOOK_TOOLBAR_VISIBILITY[group]
      : null;
  const controlVisibility =
    groupVisibility &&
    groupVisibility[control] &&
    typeof groupVisibility[control] === 'object'
      ? groupVisibility[control]
      : null;
  if (!controlVisibility) {
    return false;
  }
  return controlVisibility[surface] === true;
}

export function getWorkbookToolbarLayoutZone(group, cluster) {
  const groupLayout =
    WORKBOOK_TOOLBAR_LAYOUT[group] &&
    typeof WORKBOOK_TOOLBAR_LAYOUT[group] === 'object'
      ? WORKBOOK_TOOLBAR_LAYOUT[group]
      : null;
  const zone = groupLayout ? groupLayout[cluster] : null;
  if (zone === ZONE_LEFT || zone === ZONE_CENTER || zone === ZONE_RIGHT) {
    return zone;
  }
  return ZONE_LEFT;
}
