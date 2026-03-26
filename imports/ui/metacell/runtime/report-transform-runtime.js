export function replaceMentionNodes(app, root) {
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  var nodes = [];
  var current;
  while ((current = walker.nextNode())) {
    nodes.push(current);
  }
  for (var i = 0; i < nodes.length; i++) {
    replaceMentionInTextNode(app, nodes[i]);
  }
}

export function renderReportMarkdownNodes(app, root) {
  if (!root) return;
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  var nodes = [];
  var current;
  while ((current = walker.nextNode())) {
    nodes.push(current);
  }

  for (var i = 0; i < nodes.length; i++) {
    var textNode = nodes[i];
    if (!textNode || !textNode.parentNode) continue;
    var parent = textNode.parentNode;
    if (!parent || !parent.closest) continue;
    if (parent.closest('.report-input-placeholder')) continue;
    if (parent.closest('.report-internal-link')) continue;
    if (parent.closest('.report-region-table')) continue;
    if (parent.closest('.report-linked-input')) continue;
    if (parent.closest('code, pre, button, a, table, ul, ol, li')) continue;

    var text = String(textNode.nodeValue || '');
    if (!text.trim()) continue;

    var container = document.createElement('div');
    container.innerHTML = app.renderMarkdown(text);
    var fragment = document.createDocumentFragment();
    while (container.firstChild) {
      fragment.appendChild(container.firstChild);
    }
    parent.replaceChild(fragment, textNode);
  }
}

export function replaceMentionInTextNode(app, textNode) {
  var text = textNode.nodeValue || '';
  if (!text) return;
  var pattern =
    /(!@(?:'[^']+'|"[^"]+"|[A-Za-z][A-Za-z0-9 _-]*)[!:]@?[A-Za-z]+[0-9]+:@?[A-Za-z]+[0-9]+(?:#[A-Za-z0-9 _-]+)?|!@(?:'[^']+'|"[^"]+"|[A-Za-z][A-Za-z0-9 _-]*)[!:]@?[A-Za-z]+[0-9]+(?:#[A-Za-z0-9 _-]+)?|!@[A-Za-z_][A-Za-z0-9_]*(?:#[A-Za-z0-9 _-]+)?|Tab:\\[[^\\]]*\\]|File:(?:_?@[A-Za-z_][A-Za-z0-9_]*|(?:_?@)?(?:'[^']+'|\"[^\"]+\"|[A-Za-z][A-Za-z0-9 _-]*)[!:]@?[A-Za-z]+[0-9]+)(?::\\[[^\\]]*\\])?|Input:(?:_?@[A-Za-z_][A-Za-z0-9_]*|(?:_?@)?(?:'[^']+'|\"[^\"]+\"|[A-Za-z][A-Za-z0-9 _-]*)[!:]@?[A-Za-z]+[0-9]+)(?::\\[[^\\]]*\\])?|(?:_?@)?(?:'[^']+'|\"[^\"]+\"|[A-Za-z][A-Za-z0-9 _-]*)[!:]@?[A-Za-z]+[0-9]+:@?[A-Za-z]+[0-9]+|_?@[A-Za-z_][A-Za-z0-9_]*|(?:_?@)?(?:'[^']+'|\"[^\"]+\"|[A-Za-z][A-Za-z0-9 _-]*)[:!]@?[A-Za-z]+[0-9]+)/g;
  pattern.lastIndex = 0;
  var hasMatch = pattern.exec(text);
  if (!hasMatch) return;
  pattern.lastIndex = 0;

  var fragment = document.createDocumentFragment();
  var cursor = 0;
  var m;
  while ((m = pattern.exec(text))) {
    var token = m[0];
    if (m.index > cursor) {
      fragment.appendChild(document.createTextNode(text.slice(cursor, m.index)));
    }
    if (token.indexOf('Tab:[') === 0) {
      fragment.appendChild(app.createReportTabElement(token));
    } else if (token.indexOf('Input:') === 0) {
      var inputSpec = app.parseReportControlToken(token, 'Input:');
      var placeholder = document.createElement('span');
      placeholder.className = 'report-input-placeholder';
      placeholder.dataset.reportInputToken = inputSpec.referenceToken;
      if (inputSpec.hint) placeholder.dataset.reportInputHint = inputSpec.hint;
      placeholder.textContent = token;
      fragment.appendChild(placeholder);
    } else if (token.indexOf('File:') === 0) {
      var fileSpec = app.parseReportControlToken(token, 'File:');
      var filePlaceholder = document.createElement('span');
      filePlaceholder.className = 'report-file-placeholder';
      filePlaceholder.dataset.reportFileToken = fileSpec.referenceToken;
      if (fileSpec.hint) filePlaceholder.dataset.reportFileHint = fileSpec.hint;
      filePlaceholder.textContent = token;
      fragment.appendChild(filePlaceholder);
    } else if (token.indexOf('!@') === 0) {
      var linkResolved = app.resolveReportInternalLink(token);
      if (!linkResolved) {
        fragment.appendChild(document.createTextNode(token));
      } else {
        fragment.appendChild(app.createReportInternalLinkElement(token, linkResolved));
      }
    } else {
      var resolved = app.resolveReportMention(token);
      if (!resolved || typeof resolved.value === 'undefined') {
        fragment.appendChild(document.createTextNode(token));
      } else if (resolved.type === 'region' || resolved.type === 'table') {
        fragment.appendChild(app.createReportRegionTableElement(resolved.rows));
      } else if (resolved.type === 'list') {
        fragment.appendChild(app.createReportListElement(resolved.items));
      } else if (resolved.type === 'attachment') {
        fragment.appendChild(
          app.createLinkedReportFileElement({
            sheetId: resolved.sheetId,
            cellId: resolved.cellId,
          }),
        );
      } else {
        fragment.appendChild(document.createTextNode(String(resolved.value)));
      }
    }
    cursor = m.index + token.length;
  }
  if (cursor < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(cursor)));
  }
  textNode.parentNode.replaceChild(fragment, textNode);
}

export function createReportTabElement(app, token) {
  var title = String(token || '')
    .replace(/^Tab:\[/, '')
    .replace(/\]$/, '')
    .trim();
  var element = document.createElement('div');
  element.className = 'report-tab-title';
  element.dataset.reportTabMarker = 'true';
  element.textContent = title || 'Section';
  return element;
}

export function fragmentHasVisibleContent(app, fragment) {
  if (!fragment) return false;
  var walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ALL, null);
  var current;
  while ((current = walker.nextNode())) {
    if (current.nodeType === Node.ELEMENT_NODE) return true;
    if (
      current.nodeType === Node.TEXT_NODE &&
      String(current.nodeValue || '').trim()
    ) {
      return true;
    }
  }
  return false;
}
