export function ensureReportUI(app) {
  if (app.reportWrap && app.reportEditor && app.reportLive) return;
  if (!app.tableWrap || !app.tableWrap.parentElement) return;

  var wrap = document.createElement('div');
  wrap.className = 'report-wrap';
  wrap.style.display = 'none';
  wrap.innerHTML =
    '' +
    "<div class='report-toolbar'>" +
    "<button type='button' class='report-mode active' data-report-mode='edit'>Edit</button>" +
    "<button type='button' class='report-mode' data-report-mode='view'>View</button>" +
    "<button type='button' class='report-cmd' data-cmd='bold' aria-label='Bold' title='Bold'><svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M8 6h5a3 3 0 0 1 0 6H8z'></path><path d='M8 12h6a3 3 0 0 1 0 6H8z'></path></svg></button>" +
    "<button type='button' class='report-cmd' data-cmd='italic' aria-label='Italic' title='Italic'><svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M14 6h-4'></path><path d='M14 18h-4'></path><path d='M14 6 10 18'></path></svg></button>" +
    "<button type='button' class='report-cmd' data-cmd='underline' aria-label='Underline' title='Underline'><svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M7 5v6a5 5 0 0 0 10 0V5'></path><path d='M5 19h14'></path></svg></button>" +
    "<button type='button' class='report-cmd' data-cmd='insertUnorderedList' aria-label='Bullet list' title='Bullet list'><svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M9 6h11'></path><path d='M9 12h11'></path><path d='M9 18h11'></path><circle cx='4' cy='6' r='1' fill='currentColor' stroke='none'></circle><circle cx='4' cy='12' r='1' fill='currentColor' stroke='none'></circle><circle cx='4' cy='18' r='1' fill='currentColor' stroke='none'></circle></svg></button>" +
    '</div>' +
    "<div id='report-editor' class='report-editor' contenteditable='true'></div>" +
    "<div id='report-live' class='report-live'></div>";

  app.tableWrap.parentElement.insertBefore(wrap, app.tableWrap.nextSibling);
  app.reportWrap = wrap;
  app.reportEditor = wrap.querySelector('#report-editor');
  app.reportLive = wrap.querySelector('#report-live');
}
