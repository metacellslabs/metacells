import { rpc } from '../../../../lib/rpc-client.js';
import {
  getAssistantConversation,
  refreshAssistantManifest,
  renderAssistantPanel,
  setAssistantDraftState,
  syncAssistantWorkbook,
} from './assistant-state-runtime.js';

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

function submitAssistantPrompt(app) {
  var value = String((app && app.assistantDraft) || '').trim();
  if (!value || app.assistantBusy) return;
  app.assistantBusy = true;
  app.assistantMessages = app.assistantMessages || [];
  app.assistantActivity = app.assistantActivity || [];
  app.assistantMessages.push({ role: 'user', content: value });
  setAssistantDraftState(app, '');
  renderAssistantPanel(app);

  rpc('assistant.chat', {
    sheetDocumentId: app.sheetDocumentId,
    workbookSnapshot: app.getWorkbookSnapshot(),
    message: value,
  })
    .then(function (result) {
      app.assistantManifest =
        result && result.manifest ? result.manifest : app.assistantManifest;
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

export function submitAssistantDraft(app, value) {
  if (typeof value !== 'undefined') {
    setAssistantDraftState(app, value);
  }
  submitAssistantPrompt(app);
}

export function clearAssistantConversation(app) {
  rpc('assistant.clearConversation', app.sheetDocumentId).catch(function () {});
  app.assistantMessages = [];
  app.assistantActivity = [];
  app.assistantUploads = [];
  renderAssistantPanel(app);
}

export function removeAssistantUpload(app, uploadId) {
  var normalizedUploadId = String(uploadId || '');
  if (!normalizedUploadId) return Promise.resolve();
  return rpc('assistant.removeUpload', app.sheetDocumentId, normalizedUploadId)
    .then(function (result) {
      app.assistantUploads =
        result && Array.isArray(result.uploads) ? result.uploads : [];
      renderAssistantPanel(app);
    })
    .catch(function () {});
}

export function setAssistantProvider(app, providerId) {
  var normalizedProviderId = String(providerId || '');
  if (!normalizedProviderId) return Promise.resolve();
  app.assistantBusy = true;
  renderAssistantPanel(app);
  return rpc('settings.setActiveAIProvider', normalizedProviderId)
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
}

export function uploadAssistantFile(app, file) {
  if (!file) return Promise.resolve();
  app.assistantBusy = true;
  renderAssistantPanel(app);
  return file
    .arrayBuffer()
    .then(function (buffer) {
      return rpc(
        'assistant.uploadFile',
        app.sheetDocumentId,
        String(file.name || 'Attached file'),
        String(file.type || ''),
        arrayBufferToBase64(buffer),
      );
    })
    .then(function (upload) {
      app.assistantUploads = (app.assistantUploads || []).concat([upload]);
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
      renderAssistantPanel(app);
    });
}
