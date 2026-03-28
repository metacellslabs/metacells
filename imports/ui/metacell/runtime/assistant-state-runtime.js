import { rpc } from '../../../../lib/rpc-client.js';

function getAssistantDraftStorageKey(app) {
  return 'metacells:assistant:draft:' + String(app.sheetDocumentId || 'local');
}

function loadAssistantDraft(app) {
  try {
    return String(window.localStorage.getItem(getAssistantDraftStorageKey(app)) || '');
  } catch (_error) {
    return '';
  }
}

function saveAssistantDraft(app, value) {
  try {
    window.localStorage.setItem(
      getAssistantDraftStorageKey(app),
      String(value == null ? '' : value),
    );
  } catch (_error) {}
}

export function setAssistantDraftState(app, value) {
  app.assistantDraft = String(value == null ? '' : value);
  saveAssistantDraft(app, app.assistantDraft);
  renderAssistantPanel(app);
}

export function loadAssistantConversation(app) {
  return rpc('assistant.getConversation', app.sheetDocumentId)
    .then(function (result) {
      app.assistantMessages =
        result && Array.isArray(result.messages) ? result.messages : [];
      app.assistantUploads =
        result && Array.isArray(result.uploads) ? result.uploads : [];
      renderAssistantPanel(app);
    })
    .catch(function () {
      app.assistantMessages = [];
      app.assistantUploads = [];
      renderAssistantPanel(app);
    });
}

function getAssistantStatusText(app) {
  if (app.assistantBusy) return 'Working on your request';
  return '';
}

function formatAssistantMessageTime(item) {
  var raw = item && item.createdAt ? item.createdAt : '';
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_error) {
    return '';
  }
}

export function refreshAssistantManifest(app) {
  return rpc('assistant.getManifest', app.sheetDocumentId, app.getWorkbookSnapshot())
    .then(function (manifest) {
      app.assistantManifest = manifest;
      renderAssistantPanel(app);
      return manifest;
    })
    .catch(function () {});
}

function scrollAssistantMessagesToBottom(messagesWrap) {
  if (!messagesWrap) return;
  var applyScroll = function () {
    messagesWrap.scrollTop = messagesWrap.scrollHeight;
  };
  applyScroll();
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(applyScroll);
  }
}

export function ensureAssistantPanel(app) {
  if (app.assistantPanel) return app.assistantPanel;
  var panel = document.querySelector('.assistant-chat-panel');
  if (!panel) return null;
  app.assistantPanel = panel;
  return panel;
}

export function renderAssistantPanel(app) {
  var panel = ensureAssistantPanel(app);
  if (!panel) return;
  var messagesWrap = panel.querySelector('.assistant-chat-messages');
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
  if (messagesWrap) {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(function () {
        scrollAssistantMessagesToBottom(messagesWrap);
      });
    } else {
      scrollAssistantMessagesToBottom(messagesWrap);
    }
  }
}

export function getAssistantUiState(app) {
  var manifest =
    app && app.assistantManifest && typeof app.assistantManifest === 'object'
      ? app.assistantManifest
      : null;
  var providers =
    manifest && Array.isArray(manifest.providers)
      ? manifest.providers
          .map(function (provider) {
            return provider && typeof provider === 'object'
              ? {
                  id: String(provider.id || ''),
                  name: String(provider.name || provider.id || ''),
                }
              : null;
          })
          .filter(Boolean)
      : [];
  var messages = Array.isArray(app && app.assistantMessages)
    ? app.assistantMessages
        .map(function (item) {
          return item && typeof item === 'object'
            ? {
                role: String(item.role || ''),
                content: String(item.content || ''),
                time: formatAssistantMessageTime(item),
              }
            : null;
        })
        .filter(Boolean)
    : [];
  var uploads = Array.isArray(app && app.assistantUploads)
    ? app.assistantUploads
        .map(function (item) {
          return item && typeof item === 'object'
            ? {
                id: String(item.id || ''),
                name: String(item.name || 'Uploaded file'),
              }
            : null;
        })
        .filter(Boolean)
    : [];
  var activity = Array.isArray(app && app.assistantActivity)
    ? app.assistantActivity
        .map(function (item) {
          var toolResults = Array.isArray(item && item.toolResults)
            ? item.toolResults
                .map(function (result) {
                  return result && typeof result === 'object'
                    ? {
                        name: String(result.name || ''),
                        ok: result.ok !== false,
                        error: String(result.error || ''),
                      }
                    : null;
                })
                .filter(Boolean)
            : [];
          return item && typeof item === 'object'
            ? {
                assistantMessage: String(item.assistantMessage || 'Tool activity'),
                toolResults: toolResults,
              }
            : null;
        })
        .filter(Boolean)
    : [];
  return {
    open: app && app.assistantPanelOpen === true,
    busy: app && app.assistantBusy === true,
    draft: String((app && app.assistantDraft) || ''),
    statusText: getAssistantStatusText(app),
    metaText: app && app.assistantBusy ? 'Working...' : '',
    activeProviderId: String((manifest && manifest.activeProviderId) || ''),
    providers: providers,
    uploads: uploads,
    messages: messages,
    activity: activity,
  };
}

export function syncAssistantWorkbook(app, workbook) {
  if (
    !workbook ||
    !app.storage ||
    !app.storage.storage ||
    typeof app.storage.storage.replaceAll !== 'function'
  ) {
    return;
  }
  app.storage.storage.replaceAll(workbook);
  app.tabs = app.storage.readTabs();
  app.renderTabs();
  var nextActiveSheetId = String((workbook && workbook.activeTabId) || '');
  if (!nextActiveSheetId) {
    nextActiveSheetId = app.storage.getActiveSheetId(app.activeSheetId);
  }
  if (!nextActiveSheetId && app.tabs[0]) nextActiveSheetId = app.tabs[0].id;
  if (nextActiveSheetId && nextActiveSheetId !== app.activeSheetId) {
    app.switchToSheet(nextActiveSheetId);
    return;
  }
  app.renderCurrentSheetFromStorage();
  if (app.isReportActive()) app.renderReportLiveValues();
}

export function getAssistantConversation(app) {
  return (Array.isArray(app.assistantMessages) ? app.assistantMessages : []).map(
    function (item) {
      return {
        role: String((item && item.role) || ''),
        content: String((item && item.content) || ''),
      };
    },
  );
}

export function setupAssistantPanel(app) {
  ensureAssistantPanel(app);
  app.assistantPanelOpen = false;
  app.assistantMessages = [];
  app.assistantActivity = [];
  app.assistantUploads = [];
  app.assistantBusy = false;
  app.assistantDraft = loadAssistantDraft(app);
  loadAssistantConversation(app);
  refreshAssistantManifest(app);
}

export function toggleAssistantPanel(app) {
  var panel = ensureAssistantPanel(app);
  if (!panel) return;
  if (!app.assistantPanelOpen) {
    app.assistantPanelOpen = true;
    renderAssistantPanel(app);
    return;
  }
  hideAssistantPanel(app);
}

export function hideAssistantPanel(app) {
  app.assistantPanelOpen = false;
  if (typeof app.publishUiState === 'function') app.publishUiState();
}

export function updateAssistantDraft(app, value) {
  setAssistantDraftState(app, value);
}
