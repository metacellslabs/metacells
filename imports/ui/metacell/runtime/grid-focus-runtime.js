export {
  focusActiveEditor,
  focusCellProxy,
} from './grid-focus-helpers-runtime.js';
import { focusActiveEditor } from './grid-focus-helpers-runtime.js';

export function restoreGridKeyboardFocusSoon(app) {
  if (!app) return;
  requestAnimationFrame(function () {
    var activeInput =
      typeof app.getActiveCellInput === 'function'
        ? app.getActiveCellInput()
        : app.activeInput;
    var activeEl = document.activeElement;
    var isBusyWithOtherEditor = !!(
      activeEl &&
      (activeEl === app.editorOverlayInput ||
        activeEl === app.formulaInput ||
        activeEl === app.cellNameInput ||
        activeEl === app.reportEditor ||
        (activeEl.tagName === 'INPUT' &&
          activeEl !== activeInput &&
          activeEl !== app.formulaInput &&
          activeEl !== app.cellNameInput) ||
        (activeEl.tagName === 'TEXTAREA' &&
          activeEl !== app.reportEditor &&
          activeEl !== app.formulaInput))
    );
    if (isBusyWithOtherEditor) return;
    if (!activeInput || app.isReportActive()) return;
    focusActiveEditor(app);
  });
}
