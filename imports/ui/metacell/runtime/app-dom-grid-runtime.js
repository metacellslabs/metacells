export function cacheSpreadsheetGridDomRefs(app) {
  app.table = document.querySelector('table');
  app.tableWrap = document.querySelector('.table-wrap');
  app.formulaInput = document.querySelector('#formula-input');
  app.calcProgress = document.querySelector('#calc-progress');
  app.formulaBar = document.querySelector('.formula-bar');
  app.nameBar = document.querySelector('.name-bar');
  app.cellNameInput = document.querySelector('#cell-name-input');
  app.namedCellJump = document.querySelector('#named-cell-jump');
  app.namedCellJumpPopover = document.querySelector('#named-cell-jump-popover');
}
