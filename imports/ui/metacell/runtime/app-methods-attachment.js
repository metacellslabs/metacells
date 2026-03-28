import { setAvailableChannels as setAvailableChannelsRuntime } from './mention-runtime.js';

let attachmentRuntimePromise = null;
let attachmentRuntimeLoaded = null;

function loadAttachmentRuntime() {
  if (!attachmentRuntimePromise) {
    attachmentRuntimePromise = Promise.all([
      import('./attachment-upload-runtime.js'),
      import('./attachment-channel-binding-runtime.js'),
    ]).then(([uploadModule, channelBindingModule]) => ({
      upload: uploadModule,
      channelBinding: channelBindingModule,
    }));
  }
  return attachmentRuntimePromise.then((runtime) => {
    attachmentRuntimeLoaded = runtime;
    return runtime;
  });
}

export function installAttachmentMethods(SpreadsheetApp) {
  SpreadsheetApp.prototype.setupAttachmentControls = function () {
    if (this._attachmentControlsSetupRequested) return;
    this._attachmentControlsSetupRequested = true;
    loadAttachmentRuntime().then(({ upload, channelBinding }) => {
      upload.setupAttachmentUploadControls(this);
      channelBinding.setupChannelBindingControls(this);
      if (typeof this.publishUiState === 'function') this.publishUiState();
    });
  };

  SpreadsheetApp.prototype.syncChannelBindingControl = function () {
    if (!attachmentRuntimeLoaded) return;
    attachmentRuntimeLoaded.channelBinding.syncChannelBindingControl(this);
  };

  SpreadsheetApp.prototype.applyChannelBindingSelection = function (
    channelLabel,
    mode,
  ) {
    return loadAttachmentRuntime().then(({ channelBinding }) =>
      channelBinding.applyChannelBindingSelection(this, channelLabel, mode),
    );
  };

  SpreadsheetApp.prototype.readAttachedFileContent = function (file, preparedBase64) {
    return loadAttachmentRuntime().then(({ upload }) =>
      upload.readAttachedFileContent(this, file, preparedBase64),
    );
  };

  SpreadsheetApp.prototype.handleAttachmentPaste = function (input, clipboardData) {
    return loadAttachmentRuntime().then(({ upload }) =>
      upload.handleAttachmentPaste(this, input, clipboardData),
    );
  };

  SpreadsheetApp.prototype.prepareActiveCellAttachmentSelection = function () {
    return loadAttachmentRuntime().then(({ upload }) =>
      upload.prepareActiveCellAttachmentSelection(this),
    );
  };

  SpreadsheetApp.prototype.commitPendingAttachmentSelection = function (file) {
    return loadAttachmentRuntime().then(({ upload }) =>
      upload.commitPendingAttachmentSelection(this, file),
    );
  };

  SpreadsheetApp.prototype.pasteAttachmentFromSystemClipboard = function (input) {
    return loadAttachmentRuntime().then(({ upload }) =>
      upload.pasteAttachmentFromSystemClipboard(this, input),
    );
  };

  SpreadsheetApp.prototype.arrayBufferToBase64 = function (buffer) {
    return loadAttachmentRuntime().then(({ upload }) =>
      upload.arrayBufferToBase64(this, buffer),
    );
  };

  SpreadsheetApp.prototype.setAvailableChannels = function (channels) {
    setAvailableChannelsRuntime(this, channels);
  };
}
