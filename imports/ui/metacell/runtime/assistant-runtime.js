import { Meteor } from 'meteor/meteor';

function getAssistantDraftStorageKey(app) {
  return 'metacells:assistant:draft:' + String(app.sheetDocumentId || 'local');
}

function loadAssistantDraft(app) {
  try {
    return String(
      window.localStorage.getItem(getAssistantDraftStorageKey(app)) || '',
    );
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

function arrayBufferToBase64(buffer) {
  var bytes = new Uint8Array(buffer || new ArrayBuffer(0));
  var chunkSize = 0x8000;
  var binary = '';
  for (var i = 0; i < bytes.length; i += chunkSize) {
    var chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return window.btoa(binary);
}

function openAssistantFilePicker(app) {
  var panel = ensureAssistantPanel(app);
  var input = panel.querySelector("input[name='assistant-file']");
  if (!input) return;
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
  } catch (_error) {}
  input.click();
}

function loadAssistantConversation(app) {
  return Meteor.callAsync('assistant.getConversation', app.sheetDocumentId)
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

function refreshAssistantManifest(app) {
  return Meteor.callAsync(
    'assistant.getManifest',
    app.sheetDocumentId,
    app.getWorkbookSnapshot(),
  )
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

function ensureAssistantPanel(app) {
  if (app.assistantPanel) return app.assistantPanel;
  var panel = document.createElement('div');
  panel.className = 'assistant-chat-panel';
  panel.style.display = 'none';
  panel.innerHTML =
    "<div class='assistant-chat-head'>" +
    "<div class='assistant-chat-title-wrap'>" +
    "<h2>AI Assistant</h2>" +
    '</div>' +
    "<div class='assistant-chat-head-actions'>" +
    "<label class='assistant-chat-provider assistant-chat-provider-compact' aria-label='Assistant provider'>" +
    "<select name='assistant-provider'></select>" +
    "<span class='assistant-chat-provider-arrow' aria-hidden='true'>▾</span>" +
    '</label>' +
    "<div class='assistant-chat-status'></div>" +
    "<button type='button' class='secondary assistant-chat-head-button' data-action='attach-file'>Attach file</button>" +
    "<button type='button' class='assistant-chat-close' data-action='close' aria-label='Close'>×</button>" +
    '</div>' +
    '</div>' +
    "<div class='assistant-chat-meta'></div>" +
    "<div class='assistant-chat-uploads'></div>" +
    "<div class='assistant-chat-messages'></div>" +
    "<div class='assistant-chat-activity'></div>" +
    "<form class='assistant-chat-compose'>" +
    "<textarea name='message' rows='4' placeholder='Ask AI to analyze or update this workbook'></textarea>" +
    "<input type='file' name='assistant-file' class='assistant-chat-file-input' tabindex='-1' aria-hidden='true' />" +
    "<div class='assistant-chat-actions'>" +
    "<div class='assistant-chat-hint'>Use Cmd/Ctrl+Enter to send. Ask for workbook edits, reports, schedules, formatting, or channel actions.</div>" +
    "<button type='button' class='secondary' data-action='clear'>Clear</button>" +
    "<button type='submit'>Send</button>" +
    '</div>' +
    '</form>';
  document.body.appendChild(panel);
  panel.addEventListener('click', function (event) {
    var actionTarget =
      event.target && event.target.closest
        ? event.target.closest('[data-action]')
        : null;
    if (!actionTarget) return;
    var action = String(actionTarget.getAttribute('data-action') || '');
    if (action === 'close') {
      hideAssistantPanel(app);
      return;
    }
    if (action === 'clear') {
      Meteor.callAsync('assistant.clearConversation', app.sheetDocumentId).catch(
        function () {},
      );
      app.assistantMessages = [];
      app.assistantActivity = [];
      app.assistantUploads = [];
      renderAssistantPanel(app);
    }
    if (action === 'attach-file') {
      event.preventDefault();
      event.stopPropagation();
      openAssistantFilePicker(app);
      return;
    }
    if (action === 'remove-upload') {
      event.preventDefault();
      event.stopPropagation();
      var uploadId = String(actionTarget.getAttribute('data-upload-id') || '');
      if (!uploadId) return;
      Meteor.callAsync('assistant.removeUpload', app.sheetDocumentId, uploadId)
        .then(function (result) {
          app.assistantUploads =
            result && Array.isArray(result.uploads) ? result.uploads : [];
          renderAssistantPanel(app);
        })
        .catch(function () {});
    }
  });
  panel
    .querySelector('.assistant-chat-compose')
    .addEventListener('submit', function (event) {
      event.preventDefault();
      submitAssistantPrompt(app);
    });
  var textarea = panel.querySelector("textarea[name='message']");
  if (textarea) {
    textarea.value = loadAssistantDraft(app);
    textarea.addEventListener('input', function () {
      saveAssistantDraft(app, textarea.value);
    });
    textarea.addEventListener('keydown', function (event) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        submitAssistantPrompt(app);
      }
    });
  }
  var providerSelect = panel.querySelector("select[name='assistant-provider']");
  if (providerSelect) {
    providerSelect.addEventListener('change', function () {
      var providerId = String(providerSelect.value || '');
      if (!providerId) return;
      app.assistantBusy = true;
      renderAssistantPanel(app);
      Meteor.callAsync('settings.setActiveAIProvider', providerId)
        .then(function () {
          return refreshAssistantManifest(app);
        })
        .catch(function (error) {
          app.assistantMessages = app.assistantMessages || [];
          app.assistantMessages.push({
            role: 'assistant',
            content:
              'Provider switch error: ' +
              String(error && error.message ? error.message : error),
            createdAt: new Date().toISOString(),
          });
        })
        .finally(function () {
          app.assistantBusy = false;
          renderAssistantPanel(app);
        });
    });
  }
  var fileInput = panel.querySelector("input[name='assistant-file']");
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      app.assistantBusy = true;
      renderAssistantPanel(app);
      file
        .arrayBuffer()
        .then(function (buffer) {
          return Meteor.callAsync(
            'assistant.uploadFile',
            app.sheetDocumentId,
            String(file.name || 'Attached file'),
            String(file.type || ''),
            arrayBufferToBase64(buffer),
          );
        })
        .then(function (upload) {
          app.assistantUploads = (app.assistantUploads || []).concat([
            upload,
          ]);
          renderAssistantPanel(app);
        })
        .catch(function (error) {
          app.assistantMessages = app.assistantMessages || [];
          app.assistantMessages.push({
            role: 'assistant',
            content:
              'Upload error: ' +
              String(error && error.message ? error.message : error),
          });
          renderAssistantPanel(app);
        })
        .finally(function () {
          app.assistantBusy = false;
          fileInput.value = '';
          renderAssistantPanel(app);
        });
    });
  }
  app.assistantPanel = panel;
  return panel;
}

function renderAssistantPanel(app) {
  var panel = ensureAssistantPanel(app);
  var meta = panel.querySelector('.assistant-chat-meta');
  var status = panel.querySelector('.assistant-chat-status');
  var providerSelect = panel.querySelector("select[name='assistant-provider']");
  var uploadsWrap = panel.querySelector('.assistant-chat-uploads');
  var messagesWrap = panel.querySelector('.assistant-chat-messages');
  var activityWrap = panel.querySelector('.assistant-chat-activity');
  var metaParts = [];
  if (app.assistantBusy) metaParts.push('Working...');
  if (status) {
    var statusText = getAssistantStatusText(app);
    status.textContent = statusText;
    status.style.display = statusText ? 'inline-flex' : 'none';
  }
  meta.textContent = metaParts.join(' · ');
  if (providerSelect) {
    providerSelect.innerHTML = '';
    (app.assistantManifest &&
    Array.isArray(app.assistantManifest.providers)
      ? app.assistantManifest.providers
      : []
    ).forEach(function (provider) {
      if (!provider) return;
      var option = document.createElement('option');
      option.value = String(provider.id || '');
      option.textContent = String(provider.name || provider.id || '');
      if (
        String(provider.id || '') ===
        String((app.assistantManifest && app.assistantManifest.activeProviderId) || '')
      ) {
        option.selected = true;
      }
      providerSelect.appendChild(option);
    });
    providerSelect.disabled = !!app.assistantBusy;
  }
  uploadsWrap.innerHTML = '';
  (Array.isArray(app.assistantUploads) ? app.assistantUploads : []).forEach(
    function (item) {
      var chip = document.createElement('div');
      chip.className = 'assistant-chat-upload-chip';
      var chipLabel = document.createElement('span');
      chipLabel.className = 'assistant-chat-upload-chip-label';
      chipLabel.textContent = String((item && item.name) || 'Uploaded file');
      chip.appendChild(chipLabel);
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'assistant-chat-upload-remove';
      remove.setAttribute('data-action', 'remove-upload');
      remove.setAttribute('data-upload-id', String((item && item.id) || ''));
      remove.setAttribute('aria-label', 'Remove uploaded file');
      remove.textContent = '×';
      chip.appendChild(remove);
      uploadsWrap.appendChild(chip);
    },
  );
  uploadsWrap.style.display =
    Array.isArray(app.assistantUploads) && app.assistantUploads.length
      ? 'flex'
      : 'none';
  messagesWrap.innerHTML = '';
  var renderedMessages = Array.isArray(app.assistantMessages)
    ? app.assistantMessages
    : [];
  if (!renderedMessages.length) {
    var empty = document.createElement('div');
    empty.className = 'assistant-chat-empty';
    empty.innerHTML =
      "<strong>Ask for workbook changes directly.</strong><span>Try: build a report tab, rewrite these formulas using @mentions, add schedules, or attach an uploaded file into a cell.</span>";
    messagesWrap.appendChild(empty);
  }
  renderedMessages.forEach(function (item) {
      var role = String((item && item.role) || 'assistant');
      var node = document.createElement('div');
      node.className = 'assistant-chat-message assistant-chat-message-' + role;
      var label = document.createElement('div');
      label.className = 'assistant-chat-message-role';
      label.textContent = role === 'user' ? '' : 'Assistant';
      var time = formatAssistantMessageTime(item);
      if (time) {
        var stamp = document.createElement('span');
        stamp.className = 'assistant-chat-message-time';
        stamp.textContent = time;
        label.appendChild(stamp);
      }
      if (role !== 'user' || time) {
        node.appendChild(label);
      }
      var body = document.createElement('div');
      body.className = 'assistant-chat-message-body';
      body.textContent = String((item && item.content) || '');
      node.appendChild(body);
      messagesWrap.appendChild(node);
    });
  if (app.assistantBusy) {
    var thinking = document.createElement('div');
    thinking.className =
      'assistant-chat-message assistant-chat-message-assistant assistant-chat-message-thinking';
    var thinkingBody = document.createElement('div');
    thinkingBody.className = 'assistant-chat-message-body assistant-chat-thinking-body';
    thinkingBody.innerHTML =
      "<span class='assistant-chat-thinking-dot'></span>" +
      "<span class='assistant-chat-thinking-dot'></span>" +
      "<span class='assistant-chat-thinking-dot'></span>";
    thinking.appendChild(thinkingBody);
    messagesWrap.appendChild(thinking);
  }
  activityWrap.innerHTML = '';
  var renderedActivity = Array.isArray(app.assistantActivity)
    ? app.assistantActivity
    : [];
  if (renderedActivity.length) {
    var activityHeader = document.createElement('div');
    activityHeader.className = 'assistant-chat-activity-heading';
    activityHeader.textContent = 'Recent tool activity';
    activityWrap.appendChild(activityHeader);
  }
  renderedActivity.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'assistant-chat-activity-card';
      var title = document.createElement('div');
      title.className = 'assistant-chat-activity-title';
      title.textContent = String((item && item.assistantMessage) || 'Tool activity');
      card.appendChild(title);
      var toolResults = Array.isArray(item && item.toolResults)
        ? item.toolResults
        : [];
      toolResults.forEach(function (result) {
        var line = document.createElement('div');
        line.className =
          'assistant-chat-activity-line' +
          (result && result.ok === false ? ' is-error' : '');
        line.textContent =
          String((result && result.name) || '') +
          (result && result.ok === false
            ? ': ' + String(result.error || 'Failed')
            : ': ok');
        card.appendChild(line);
      });
      activityWrap.appendChild(card);
    });
  scrollAssistantMessagesToBottom(messagesWrap);
}

function syncAssistantWorkbook(app, workbook) {
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

function getAssistantConversation(app) {
  return (Array.isArray(app.assistantMessages) ? app.assistantMessages : []).map(
    function (item) {
      return {
        role: String((item && item.role) || ''),
        content: String((item && item.content) || ''),
      };
    },
  );
}

function submitAssistantPrompt(app) {
  var panel = ensureAssistantPanel(app);
  var textarea = panel.querySelector("textarea[name='message']");
  var value = String((textarea && textarea.value) || '').trim();
  if (!value || app.assistantBusy) return;
  app.assistantBusy = true;
  app.assistantMessages = app.assistantMessages || [];
  app.assistantActivity = app.assistantActivity || [];
  app.assistantMessages.push({ role: 'user', content: value });
  textarea.value = '';
  saveAssistantDraft(app, '');
  renderAssistantPanel(app);
  Meteor.callAsync('assistant.chat', {
    sheetDocumentId: app.sheetDocumentId,
    workbookSnapshot: app.getWorkbookSnapshot(),
    message: value,
  })
    .then(function (result) {
      app.assistantManifest = result && result.manifest ? result.manifest : app.assistantManifest;
      app.assistantUploads =
        result && Array.isArray(result.uploads)
          ? result.uploads
          : app.assistantUploads || [];
      app.assistantMessages =
        result && Array.isArray(result.conversation)
          ? result.conversation
          : getAssistantConversation(app).concat([
              {
                role: 'assistant',
                content: String((result && result.message) || '(no response)'),
              },
            ]);
      if (result && Array.isArray(result.activity) && result.activity.length) {
        app.assistantActivity = app.assistantActivity.concat(result.activity);
      }
  if (result && result.workbook) {
        syncAssistantWorkbook(app, result.workbook);
      }
      renderAssistantPanel(app);
    })
    .catch(function (error) {
      app.assistantMessages.push({
        role: 'assistant',
        content:
          'Assistant error: ' +
          String(error && error.message ? error.message : error),
      });
      renderAssistantPanel(app);
    })
    .finally(function () {
      app.assistantBusy = false;
      renderAssistantPanel(app);
    });
}

export function setupAssistantPanel(app) {
  var panel = ensureAssistantPanel(app);
  app.assistantMessages = [];
  app.assistantActivity = [];
  app.assistantUploads = [];
  app.assistantBusy = false;
  var textarea = panel.querySelector("textarea[name='message']");
  if (textarea) textarea.value = loadAssistantDraft(app);
  loadAssistantConversation(app);
  refreshAssistantManifest(app);
}

export function toggleAssistantPanel(app) {
  var panel = ensureAssistantPanel(app);
  if (panel.style.display === 'none') {
    panel.style.display = 'flex';
    renderAssistantPanel(app);
    var textarea = panel.querySelector("textarea[name='message']");
    if (textarea && typeof textarea.focus === 'function') textarea.focus();
    return;
  }
  hideAssistantPanel(app);
}

export function hideAssistantPanel(app) {
  if (!app.assistantPanel) return;
  app.assistantPanel.style.display = 'none';
}
