export function cacheSpreadsheetWorkbookDomRefs(app) {
  app.reportWrap = document.querySelector('.report-wrap');
  app.reportEditor = document.querySelector('#report-editor');
  app.reportLive = document.querySelector('#report-live');
  app.undoButton = document.querySelector('#undo-action');
  app.redoButton = document.querySelector('#redo-action');
  app.updateAIButton = document.querySelector('#update-ai');
  app.assistantChatButton = document.querySelector('#assistant-chat-button');
  app.formulaTrackerButton = document.querySelector('#formula-tracker-button');
  app.tabsContainer = document.querySelector('#tabs');
  app.addTabButton = document.querySelector('#add-tab');
  app.deleteTabButton = document.querySelector('#delete-tab');
}
