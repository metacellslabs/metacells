import { buildAttachmentHref } from './attachment-render-runtime.js';
import {
  canPreviewAttachmentFile,
  openAttachmentContentPreview,
  openAttachmentFilePreview,
} from './attachment-preview-runtime.js';
import {
  resolveCellAttachment,
} from './attachment-cell-facade.js';
import { clearAttachmentToPlaceholder } from './attachment-selection-facade.js';

function getVisibleSheetId(app) {
  return typeof app.getVisibleSheetId === 'function'
    ? String(app.getVisibleSheetId() || '')
    : String(app.activeSheetId || '');
}

function hasAttachmentContentPreview(attachment) {
  var meta = attachment && typeof attachment === 'object' ? attachment : null;
  if (!meta) return false;
  return !!(
    String(meta.content || '').trim() || String(meta.contentArtifactId || '').trim()
  );
}

function hasAttachmentFilePreview(attachment, href) {
  return !!String(href || '').trim() && canPreviewAttachmentFile(attachment);
}

function canRunFormula(app, raw) {
  var text = String(raw || '');
  if (!text || (text.charAt(0) !== '=' && text.charAt(0) !== '>')) return false;
  return !!(
    app &&
    app.aiService &&
    typeof app.aiService.getMode === 'function' &&
    app.aiService.getMode() === 'manual'
  );
}

function getCellContext(app, input) {
  if (!app || !input) return null;
  var cellId = String(input.id || '').toUpperCase();
  var sheetId = getVisibleSheetId(app);
  var raw = String(app.getRawCellValue(cellId) || '');
  var display = String(app.storage.getCellDisplayValue(sheetId, cellId) || '');
  var computed = String(app.storage.getCellComputedValue(sheetId, cellId) || '');
  var attachment = resolveCellAttachment(app, sheetId, cellId);
  var downloadHref = attachment ? buildAttachmentHref(app.grid, attachment) : '';
  return {
    sheetId: sheetId,
    cellId: cellId,
    raw: raw,
    display: display,
    computed: computed,
    attachment: attachment,
    downloadHref: String(downloadHref || '').trim(),
  };
}

export function buildCellActionMenuItems(app, input) {
  var context = getCellContext(app, input);
  if (!context) return [];
  if (context.attachment) {
    var attachmentItems = [];
    if (hasAttachmentFilePreview(context.attachment, context.downloadHref)) {
      attachmentItems.push({ id: 'attachment-file-preview', label: 'Preview File' });
    } else if (context.downloadHref) {
      attachmentItems.push({ id: 'attachment-open', label: 'Open File' });
    }
    if (hasAttachmentContentPreview(context.attachment)) {
      attachmentItems.push({ id: 'attachment-preview', label: 'Show Content' });
    }
    if (!hasAttachmentFilePreview(context.attachment, context.downloadHref) && context.downloadHref) {
      attachmentItems.push({ id: 'attachment-download', label: 'Download File' });
    }
    attachmentItems.push({ id: 'attachment-remove', label: 'Remove File' });
    return attachmentItems;
  }

  var items = [
    { id: 'copy', label: 'Copy Value' },
    { id: 'fullscreen', label: 'Fullscreen' },
  ];
  if (canRunFormula(app, context.raw)) {
    items.push({ id: 'run', label: 'Run Formula' });
  }
  return items;
}

function buildMenuMarkup(items) {
  var list = Array.isArray(items) ? items : [];
  return list
    .map(function (item) {
      return (
        "<button type='button' class='cell-action-menu-item' data-menu-action='" +
        String(item.id || '') +
        "'>" +
        String(item.label || '') +
        '</button>'
      );
    })
    .join('');
}

function positionCellActionMenu(app, input, actions, menu, anchorElement) {
  if (!actions || !menu) return;
  menu.style.left = '';
  menu.style.right = '';
  menu.dataset.align = 'left';
  var wrap =
    app && app.tableWrap && app.tableWrap.getBoundingClientRect
      ? app.tableWrap
      : null;
  var anchor =
    anchorElement && anchorElement.getBoundingClientRect
      ? anchorElement
      : actions;
  var actionsRect =
    anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
  var menuRect =
    menu && menu.getBoundingClientRect ? menu.getBoundingClientRect() : null;
  if (!actionsRect || !menuRect) {
    menu.style.right = '0';
    return;
  }
  var menuWidth = Math.max(156, Number(menuRect.width || 0));
  var wrapRect = wrap ? wrap.getBoundingClientRect() : null;
  var leftBoundary = wrapRect ? wrapRect.left + 8 : 8;
  var rightBoundary = wrapRect ? wrapRect.right - 8 : window.innerWidth - 8;
  var fitsLeft = actionsRect.right - menuWidth >= leftBoundary;
  var fitsRight = actionsRect.left + menuWidth <= rightBoundary;

  if (!fitsLeft && fitsRight) {
    menu.style.left = '0';
    menu.style.right = 'auto';
    menu.dataset.align = 'right';
    return;
  }

  menu.style.right = '0';
  menu.style.left = 'auto';
  menu.dataset.align = 'left';
}

function getCellActionsRoot(input) {
  return input && input.parentElement
    ? input.parentElement.querySelector(':scope > .cell-actions')
    : null;
}

export function closeCellActionMenu(input) {
  var actions = getCellActionsRoot(input);
  if (!actions) return;
  actions.classList.remove('is-open');
  var menu = actions.querySelector('.cell-action-menu');
  if (menu) {
    menu.hidden = true;
    menu.innerHTML = '';
  }
}

export function closeAllCellActionMenus(root) {
  var scope = root && root.querySelectorAll ? root : document;
  if (!scope || !scope.querySelectorAll) return;
  var actions = scope.querySelectorAll('.cell-actions.is-open');
  for (var i = 0; i < actions.length; i++) {
    actions[i].classList.remove('is-open');
    var menu = actions[i].querySelector('.cell-action-menu');
    if (menu) {
      menu.hidden = true;
      menu.innerHTML = '';
    }
  }
}

export function toggleCellActionMenu(app, input, anchorElement) {
  if (!app || !input) return;
  var actions = getCellActionsRoot(input);
  if (!actions) return;
  var menu = actions.querySelector('.cell-action-menu');
  if (!menu) return;
  var isOpen = actions.classList.contains('is-open');
  closeAllCellActionMenus(app.table || document);
  if (isOpen) return;
  var items = buildCellActionMenuItems(app, input);
  if (!items.length) return;
  menu.innerHTML = buildMenuMarkup(items);
  menu.hidden = false;
  actions.classList.add('is-open');
  positionCellActionMenu(app, input, actions, menu, anchorElement);
}

function triggerAttachmentDownload(name, href) {
  var link = document.createElement('a');
  link.href = href;
  link.download = String(name || 'Attached file');
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    if (link.parentNode) link.parentNode.removeChild(link);
  }
}

function removeCellAttachment(app, context) {
  var cellId = String(context.cellId || '').toUpperCase();
  var sheetId = String(context.sheetId || getVisibleSheetId(app) || '');
  if (!cellId || !sheetId) return;
  clearAttachmentToPlaceholder(app, {
    sheetId: sheetId,
    cellId: cellId,
    withHistory: true,
    clearComputed: true,
    renderMode: 'sheet',
  });
  if (typeof app.renderCurrentSheetFromStorage === 'function') {
    app.renderCurrentSheetFromStorage();
  }
}

export function performCellActionMenuItem(app, input, actionId) {
  if (!app || !input) return;
  var action = String(actionId || '');
  var context = getCellContext(app, input);
  if (!context) return;
  if (action === 'copy') app.copyCellValue(input);
  if (action === 'fullscreen') app.openFullscreenCell(input);
  if (action === 'run') app.runFormulaForCell(input);
  if (action === 'attachment-preview') {
    openAttachmentContentPreview(app, context.sheetId, context.cellId);
  }
  if (action === 'attachment-file-preview') {
    openAttachmentFilePreview(app, context.sheetId, context.cellId, input);
  }
  if (action === 'attachment-open' && context.downloadHref) {
    window.open(context.downloadHref, '_blank', 'noopener,noreferrer');
  }
  if (action === 'attachment-download' && context.downloadHref) {
    triggerAttachmentDownload(
      context.attachment && context.attachment.name,
      context.downloadHref,
    );
  }
  if (action === 'attachment-remove') {
    removeCellAttachment(app, context);
  }
  closeCellActionMenu(input);
}
