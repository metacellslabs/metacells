function cloneMentionItems(items) {
  return Array.isArray(items)
    ? items.map(function (item) {
        return item && typeof item === 'object' ? { ...item } : item;
      })
    : [];
}

function sameMentionAutocompleteItems(prev, next) {
  if (prev === next) return true;
  if (!Array.isArray(prev) || !Array.isArray(next)) return false;
  if (prev.length !== next.length) return false;
  for (var i = 0; i < prev.length; i++) {
    var prevItem = prev[i];
    var nextItem = next[i];
    if (prevItem === nextItem) continue;
    if (!prevItem || !nextItem) return false;
    if (
      String(prevItem.token || '') !== String(nextItem.token || '') ||
      String(prevItem.label || '') !== String(nextItem.label || '') ||
      String(prevItem.kind || '') !== String(nextItem.kind || '')
    ) {
      return false;
    }
  }
  return true;
}

function measureTextInputCaretRect(input) {
  if (
    !input ||
    typeof document === 'undefined' ||
    typeof window === 'undefined' ||
    typeof input.selectionStart !== 'number' ||
    typeof input.getBoundingClientRect !== 'function'
  ) {
    return null;
  }

  var inputRect = input.getBoundingClientRect();
  var computed = window.getComputedStyle(input);
  var mirror = document.createElement('div');
  var styleProps = [
    'boxSizing',
    'width',
    'height',
    'overflowX',
    'overflowY',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'fontStretch',
    'fontSize',
    'fontFamily',
    'lineHeight',
    'letterSpacing',
    'textTransform',
    'textAlign',
    'textIndent',
    'textDecoration',
    'textRendering',
    'tabSize',
  ];

  mirror.style.position = 'absolute';
  mirror.style.left = '-9999px';
  mirror.style.top = '0';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';

  for (var i = 0; i < styleProps.length; i++) {
    var prop = styleProps[i];
    mirror.style[prop] = computed[prop];
  }

  var isTextarea = String(input.nodeName || '').toUpperCase() === 'TEXTAREA';
  mirror.style.whiteSpace = isTextarea ? 'pre-wrap' : 'pre';
  mirror.style.wordBreak = isTextarea ? 'break-word' : 'normal';
  mirror.style.overflowWrap = isTextarea ? 'break-word' : 'normal';

  var value = String(input.value || '');
  var caretIndex = Math.max(0, Math.min(input.selectionStart, value.length));
  var before = value.slice(0, caretIndex);
  if (isTextarea && /\n$/.test(before)) {
    before += '\u200b';
  }

  mirror.textContent = before;
  var caret = document.createElement('span');
  caret.textContent = value.slice(caretIndex) || '.';
  mirror.appendChild(caret);
  document.body.appendChild(mirror);

  var caretLeft = Number(caret.offsetLeft || 0);
  var caretTop = Number(caret.offsetTop || 0);
  var lineHeight =
    Number.parseFloat(computed.lineHeight) ||
    Number.parseFloat(computed.fontSize) * 1.2 ||
    20;

  if (mirror.parentNode) mirror.parentNode.removeChild(mirror);

  var left = inputRect.left + caretLeft - input.scrollLeft;
  var top = inputRect.top + caretTop - input.scrollTop;
  var width = Math.max(24, inputRect.right - left);
  return {
    left: left,
    top: top,
    bottom: top + lineHeight,
    width: width,
    height: lineHeight,
  };
}

function normalizeMentionAutocompleteUiState(nextState) {
  return nextState && typeof nextState === 'object'
    ? {
        visible: nextState.visible === true,
        left: Number(nextState.left || 0),
        top: Number(nextState.top || 0),
        minWidth: Number(nextState.minWidth || 0),
        sourceKind: String(nextState.sourceKind || ''),
        activeIndex: Number(nextState.activeIndex || 0),
        items: cloneMentionItems(nextState.items),
      }
    : {
        visible: false,
        left: 0,
        top: 0,
        minWidth: 0,
        sourceKind: '',
        activeIndex: 0,
        items: [],
      };
}

export function publishMentionAutocompleteUiState(app, nextState) {
  if (!app) return;
  var prev =
    app.mentionAutocompleteUiState &&
    typeof app.mentionAutocompleteUiState === 'object'
      ? app.mentionAutocompleteUiState
      : null;
  var next = normalizeMentionAutocompleteUiState(nextState);
  var changed =
    !prev ||
    prev.visible !== next.visible ||
    prev.left !== next.left ||
    prev.top !== next.top ||
    prev.minWidth !== next.minWidth ||
    prev.sourceKind !== next.sourceKind ||
    prev.activeIndex !== next.activeIndex ||
    !sameMentionAutocompleteItems(prev && prev.items, next.items);
  app.mentionAutocompleteUiState = next;
  if (changed && typeof app.publishUiState === 'function') {
    app.publishUiState();
  }
}

export function buildMentionAutocompleteUiState(options) {
  var opts = options || {};
  var anchorRect =
    opts.anchorRect && typeof opts.anchorRect === 'object'
      ? opts.anchorRect
      : opts.anchorCaret === true
        ? measureTextInputCaretRect(opts.anchorElement)
      : opts.anchorElement &&
          typeof opts.anchorElement.getBoundingClientRect === 'function'
        ? opts.anchorElement.getBoundingClientRect()
        : null;
  var fallbackRect =
    opts.fallbackRect && typeof opts.fallbackRect === 'object'
      ? opts.fallbackRect
      : null;
  var rect = anchorRect || fallbackRect;
  var left = rect && Number.isFinite(rect.left) ? rect.left : 0;
  var top = rect && Number.isFinite(rect.bottom) ? rect.bottom + 4 : 0;
  var width = rect && Number.isFinite(rect.width) ? rect.width : 240;
  return {
    visible: opts.visible === true,
    left: Math.round(left),
    top: Math.round(top),
    minWidth: Math.round(Math.min(Math.max(width, 240), 460)),
    sourceKind: String(opts.sourceKind || ''),
    activeIndex: Number(opts.activeIndex || 0),
    items: cloneMentionItems(opts.items),
  };
}

export function syncMentionAutocompleteUiToAnchor(app, options) {
  publishMentionAutocompleteUiState(
    app,
    buildMentionAutocompleteUiState(options),
  );
}
