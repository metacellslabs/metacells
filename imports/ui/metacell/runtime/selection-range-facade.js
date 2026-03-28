import {
  clearSelectionRangeModel,
  getSelectionFillRange,
  getSelectionRangeModel,
  setSelectionFillRange,
  setSelectionRangeModel,
} from './selection-model.js';

export function getSelectionRangeState(app) {
  return getSelectionRangeModel(app);
}

export function setSelectionRangeState(app, range) {
  return setSelectionRangeModel(app, range);
}

export function clearSelectionRangeState(app) {
  return clearSelectionRangeModel(app);
}

export function getSelectionFillRangeState(app) {
  return getSelectionFillRange(app);
}

export function setSelectionFillRangeState(app, range) {
  return setSelectionFillRange(app, range);
}

export function hasSelectionRange(app) {
  return !!getSelectionRangeState(app);
}

export function hasMultiCellSelectionRange(app) {
  var range = getSelectionRangeState(app);
  if (!range) return false;
  return range.startCol !== range.endCol || range.startRow !== range.endRow;
}
