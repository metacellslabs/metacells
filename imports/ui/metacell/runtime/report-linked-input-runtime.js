import {
  readLinkedInputValue,
  resolveReportInputMention,
} from './report-mention-runtime.js';
import {
  applyLinkedReportInputValue,
  refreshLinkedReportInputElementValue,
} from './report-input-facade.js';
import {
  clearAttachmentToPlaceholder,
  startAttachmentSelectionFromSource,
} from './attachment-selection-facade.js';
import { resolveCellAttachment } from './attachment-cell-facade.js';
import {
  canPreviewAttachmentFile,
  openAttachmentContentPreview,
  openAttachmentFilePreview,
} from './attachment-preview-runtime.js';

export function injectLinkedInputsFromPlaceholders(app, root) {
  if (!root) return;
  var placeholders = root.querySelectorAll('.report-input-placeholder');
  placeholders.forEach((node) => {
    var payload = node.dataset.reportInputToken || '';
    var item = resolveReportInputMention(app, payload);
    if (!item) {
      node.classList.remove('report-input-placeholder');
      return;
    }
    item.placeholder = String(node.dataset.reportInputHint || '');
    var fragment = document.createDocumentFragment();
    fragment.appendChild(createLinkedReportInputElement(app, item));
    node.parentNode.replaceChild(fragment, node);
  });
  var filePlaceholders = root.querySelectorAll('.report-file-placeholder');
  filePlaceholders.forEach((node) => {
    var payload = node.dataset.reportFileToken || '';
    var item = resolveReportInputMention(app, payload);
    if (!item) {
      node.classList.remove('report-file-placeholder');
      return;
    }
    item.placeholder = String(node.dataset.reportFileHint || '');
    var fragment = document.createDocumentFragment();
    fragment.appendChild(createLinkedReportFileElement(app, item));
    node.parentNode.replaceChild(fragment, node);
  });
}

export function createLinkedReportInputElement(app, inputResolved) {
  var linked = document.createElement('input');
  linked.type = 'text';
  linked.className = 'report-linked-input';
  linked.disabled = false;
  linked.readOnly = false;
  linked.dataset.sheetId = inputResolved.sheetId;
  linked.dataset.cellId = inputResolved.cellId;
  linked.dataset.key = inputResolved.sheetId + ':' + inputResolved.cellId;
  linked.value = readLinkedInputValue(
    app,
    inputResolved.sheetId,
    inputResolved.cellId,
  );
  if (inputResolved.placeholder)
    linked.placeholder = String(inputResolved.placeholder);
  return linked;
}

export function createLinkedReportInputValueElement(app, inputResolved) {
  var value = readLinkedInputValue(
    app,
    inputResolved.sheetId,
    inputResolved.cellId,
  );
  var text = document.createElement('span');
  text.className = 'report-linked-input-value';
  text.textContent = 'Input:' + String(value == null ? '' : value);
  return text;
}

export function createLinkedReportFileElement(app, inputResolved) {
  var shell = document.createElement('span');
  shell.className = 'report-file-shell';
  shell.dataset.sheetId = inputResolved.sheetId;
  shell.dataset.cellId = inputResolved.cellId;

  var attachment = resolveCellAttachment(
    app,
    inputResolved.sheetId,
    inputResolved.cellId,
  );
  var isImage =
    !!attachment &&
    !!attachment.previewUrl &&
    String(attachment.type || '')
      .toLowerCase()
      .indexOf('image/') === 0;

  if (isImage) {
    shell.classList.add('has-image-preview');
    var imageFrame = document.createElement('span');
    imageFrame.className = 'report-file-image-frame';
    imageFrame.title = String(
      attachment.name || inputResolved.placeholder || 'Attached image',
    );

    var preview = document.createElement('img');
    preview.className = 'report-file-image';
    preview.src = String(attachment.previewUrl || '');
    preview.alt = String(attachment.name || 'Attached image');
    imageFrame.appendChild(preview);
    shell.appendChild(imageFrame);
    var openImage = document.createElement('button');
    openImage.type = 'button';
    openImage.className = 'report-file-button report-file-open';
    openImage.textContent = String(
      attachment.name || inputResolved.placeholder || 'Open file',
    );
    shell.appendChild(openImage);
  } else {
    var choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'report-file-button';
    choose.textContent =
      attachment && attachment.name
        ? attachment.name
        : inputResolved.placeholder || 'Select file';
    shell.appendChild(choose);
  }

  if (attachment && attachment.name) {
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'report-file-remove';
    remove.textContent = '×';
    remove.title = 'Remove file';
    shell.appendChild(remove);
  }
  return shell;
}

export function handleReportFileShellAction(app, shell, removeOnly) {
  if (!shell) return;
  var sheetId = String(shell.dataset.sheetId || '');
  var cellId = String(shell.dataset.cellId || '').toUpperCase();
  if (!sheetId || !cellId) return;

  if (removeOnly) {
    clearAttachmentToPlaceholder(app, {
      sheetId: sheetId,
      cellId: cellId,
      withHistory: true,
      clearComputed: true,
      renderMode: 'report',
    });
    return;
  }

  var attachment = resolveCellAttachment(app, sheetId, cellId);
  if (attachment) {
    if (canPreviewAttachmentFile(attachment)) {
      openAttachmentFilePreview(app, sheetId, cellId, shell);
      return;
    }
    if (String(attachment.content || '').trim()) {
      openAttachmentContentPreview(app, sheetId, cellId);
      return;
    }
  }

  startAttachmentSelectionFromSource(app, {
    sheetId: sheetId,
    cellId: cellId,
    previousValue: app.storage.getCellValue(sheetId, cellId) || '',
    showPendingPlaceholder: !app.parseAttachmentSource(
      app.storage.getCellValue(sheetId, cellId) || '',
    ),
    renderMode: 'report',
  });
}

export function applyLinkedReportInput(app, input) {
  var sheetId = input.dataset.sheetId;
  var cellId = String(input.dataset.cellId || '').toUpperCase();
  if (!sheetId || !cellId) return;
  applyLinkedReportInputValue(app, {
    sheetId: sheetId,
    cellId: cellId,
    value: input.value,
  });
}

export function refreshLinkedReportInputValue(app, input) {
  refreshLinkedReportInputElementValue(app, input);
}
