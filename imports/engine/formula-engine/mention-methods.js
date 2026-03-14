// Description: mention methods extracted from FormulaEngine for smaller logical modules.
export const mentionMethods = {
  collectExplicitMentionTokens(text) {
    var source = String(text == null ? '' : text);
    if (!source) return [];

    var pattern =
      /(_)?@(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)|(_)?@([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)|(_)?@(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)|(_)?@([A-Za-z_][A-Za-z0-9_]*)/g;
    var results = [];
    var seen = {};
    var match;

    while ((match = pattern.exec(source))) {
      var token = null;

      if (match[4] && match[5]) {
        var rangeSheetName = match[2] || match[3] || '';
        token = {
          rawMode: match[1] === '_',
          kind: 'sheet-region',
          displayToken:
            '@' +
            (match[2]
              ? "'" + rangeSheetName + "'"
              : String(rangeSheetName || '')) +
            '!' +
            String(match[4]).toUpperCase() +
            ':' +
            String(match[5]).toUpperCase(),
          sheetName: rangeSheetName,
          startCellId: String(match[4]).toUpperCase(),
          endCellId: String(match[5]).toUpperCase(),
        };
      } else if (match[7] && match[8]) {
        token = {
          rawMode: match[6] === '_',
          kind: 'region',
          displayToken:
            '@' +
            String(match[7]).toUpperCase() +
            ':' +
            String(match[8]).toUpperCase(),
          startCellId: String(match[7]).toUpperCase(),
          endCellId: String(match[8]).toUpperCase(),
        };
      } else if (match[12]) {
        var sheetName = match[10] || match[11] || '';
        token = {
          rawMode: match[9] === '_',
          kind: 'sheet-cell',
          displayToken:
            '@' +
            (match[10] ? "'" + sheetName + "'" : String(sheetName || '')) +
            '!' +
            String(match[12]).toUpperCase(),
          sheetName: sheetName,
          cellId: String(match[12]).toUpperCase(),
        };
      } else if (match[14]) {
        token = {
          rawMode: match[13] === '_',
          kind: 'plain',
          displayToken: '@' + String(match[14] || '').trim(),
          token: String(match[14] || '').trim(),
        };
      }

      if (!token || !token.displayToken || seen[token.displayToken]) continue;
      seen[token.displayToken] = true;
      results.push(token);
    }

    return results;
  },

  recordExplicitMentionDependency(sheetId, mention, options) {
    var token = mention && typeof mention === 'object' ? mention : null;
    if (!token) return;

    if (token.kind === 'sheet-region') {
      var rangeSheetId = this.findSheetIdByName(token.sheetName);
      if (!rangeSheetId) return;
      var sheetRegionCellIds = this.enumerateRegionCellIds(
        token.startCellId,
        token.endCellId,
      );
      for (var i = 0; i < sheetRegionCellIds.length; i += 1) {
        this.recordDependencyCell(options, rangeSheetId, sheetRegionCellIds[i]);
      }
      return;
    }

    if (token.kind === 'region') {
      var regionCellIds = this.enumerateRegionCellIds(
        token.startCellId,
        token.endCellId,
      );
      for (var j = 0; j < regionCellIds.length; j += 1) {
        this.recordDependencyCell(options, sheetId, regionCellIds[j]);
      }
      return;
    }

    if (token.kind === 'sheet-cell') {
      var refSheetId = this.findSheetIdByName(token.sheetName);
      if (!refSheetId) return;
      this.recordDependencyCell(options, refSheetId, token.cellId);
      return;
    }

    if (token.kind !== 'plain') return;
    if (this.isExistingCellId(token.token)) {
      this.recordDependencyCell(options, sheetId, token.token.toUpperCase());
      return;
    }

    this.recordDependencyNamedRef(options, token.token);
    var named = this.storageService.resolveNamedCell(token.token);
    if (!named || !named.sheetId) return;

    if (named.startCellId && named.endCellId) {
      var namedRegionCellIds = this.enumerateRegionCellIds(
        String(named.startCellId).toUpperCase(),
        String(named.endCellId).toUpperCase(),
      );
      for (var k = 0; k < namedRegionCellIds.length; k += 1) {
        this.recordDependencyCell(options, named.sheetId, namedRegionCellIds[k]);
      }
      return;
    }

    if (named.cellId) {
      this.recordDependencyCell(
        options,
        named.sheetId,
        String(named.cellId).toUpperCase(),
      );
    }
  },

  recordExplicitMentionDependenciesFromText(sheetId, text, options) {
    var mentions = this.collectExplicitMentionTokens(text);
    for (var i = 0; i < mentions.length; i += 1) {
      this.recordExplicitMentionDependency(sheetId, mentions[i], options);
    }
  },

  resolveExplicitMentionTokenValue(sheetId, mention, stack, options) {
    var token = mention && typeof mention === 'object' ? mention : null;
    if (!token) return null;
    var resolutionOptions = null;
    if (options && typeof options === 'object') {
      resolutionOptions = { ...options };
      delete resolutionOptions.dependencyCollector;
    }

    if (token.kind === 'sheet-region') {
      var rangeSheetId = this.findSheetIdByName(token.sheetName);
      if (!rangeSheetId) return undefined;
      return token.rawMode
        ? this.regionToRawCsv(rangeSheetId, token.startCellId, token.endCellId)
        : this.regionToCsv(
            rangeSheetId,
            token.startCellId,
            token.endCellId,
            stack || {},
          );
    }

    if (token.kind === 'region') {
      return token.rawMode
        ? this.regionToRawCsv(sheetId, token.startCellId, token.endCellId)
        : this.regionToCsv(sheetId, token.startCellId, token.endCellId, stack || {});
    }

    if (token.kind === 'sheet-cell') {
      var refSheetId = this.findSheetIdByName(token.sheetName);
      if (!refSheetId) return undefined;
      return token.rawMode
        ? this.getMentionRawValue(refSheetId, token.cellId)
        : this.getMentionValue(refSheetId, token.cellId, stack, resolutionOptions);
    }

    if (token.kind === 'plain') {
      return token.rawMode
        ? this.getPlainMentionValue(
            sheetId,
            token.token,
            stack,
            resolutionOptions,
            true,
          )
        : this.getPlainMentionValue(
            sheetId,
            token.token,
            stack,
            resolutionOptions,
          );
    }

    return null;
  },

  formatEmptyMentionDependencyMessage(tokens) {
    var source = Array.isArray(tokens) ? tokens : [];
    var labels = source
      .map((item) => String((item && item.displayToken) || '').trim())
      .filter(Boolean);
    if (!labels.length) return '';
    return 'Params: ' + labels.join(', ') + ' are empty';
  },

  getEmptyMentionDependencyMessage(sheetId, text, stack, options) {
    var mentions = this.collectExplicitMentionTokens(text);
    if (!mentions.length) return '';

    var emptyMentions = [];
    for (var i = 0; i < mentions.length; i += 1) {
      var mention = mentions[i];
      var resolved = null;
      try {
        resolved = this.resolveExplicitMentionTokenValue(
          sheetId,
          mention,
          stack,
          options,
        );
      } catch (error) {
        continue;
      }
      if (typeof resolved === 'undefined') continue;
      if (String(resolved == null ? '' : resolved).trim() !== '') continue;
      emptyMentions.push(mention);
    }

    return this.formatEmptyMentionDependencyMessage(emptyMentions);
  },

  getMentionValue(sheetId, cellId, stack, options) {
    var targetCellId = String(cellId || '').toUpperCase();
    var raw = this.storageService.getCellValue(sheetId, targetCellId);
    if (!raw) return '';
    if (typeof this.recordDependencyCell === 'function') {
      this.recordDependencyCell(options, sheetId, targetCellId);
    }
    var attachment =
      typeof this.parseAttachmentSource === 'function'
        ? this.parseAttachmentSource(raw)
        : null;
    if (attachment) {
      if (typeof this.recordDependencyAttachment === 'function') {
        this.recordDependencyAttachment(options, sheetId, targetCellId);
      }
      return this.resolveAttachmentContentOrThrow(
        attachment,
        sheetId,
        targetCellId,
      );
    }

    if (this.isListShortcutRaw(raw)) {
      return this.readListShortcutResult(sheetId, targetCellId, stack, options);
    }
    if (raw.charAt(0) === '=') {
      var shortcutPrompt = this.parseListShortcutPrompt(raw);
      if (shortcutPrompt)
        return this.readListShortcutResult(
          sheetId,
          targetCellId,
          stack,
          options,
        );
    }
    if (this.isTableShortcutRaw(raw)) {
      return this.readTableShortcutResult(
        sheetId,
        targetCellId,
        stack,
        options,
      );
    }

    if (options && options.aiPromptPreferDisplay) {
      var state = String(
        this.storageService.getCellState(sheetId, targetCellId) || '',
      );
      var computedValue =
        this.storageService &&
        typeof this.storageService.getCellComputedValue === 'function'
          ? this.storageService.getCellComputedValue(sheetId, targetCellId)
          : '';
      var displayValue = this.storageService.getCellDisplayValue(
        sheetId,
        targetCellId,
      );
      if (
        state === 'resolved' &&
        String(computedValue == null ? '' : computedValue) !== '' &&
        String(displayValue == null ? '' : displayValue) !== ''
      ) {
        return displayValue;
      }
    }

    return this.evaluateCell(sheetId, targetCellId, stack, options);
  },

  getMentionRawValue(sheetId, cellId) {
    return String(
      this.storageService.getCellValue(
        sheetId,
        String(cellId || '').toUpperCase(),
      ) || '',
    );
  },

  getNamedRefValue(ref, stack, options, rawMode) {
    if (!ref || !ref.sheetId) return '';
    if (ref.startCellId && ref.endCellId) {
      if (rawMode)
        return this.regionToRawCsv(
          ref.sheetId,
          String(ref.startCellId).toUpperCase(),
          String(ref.endCellId).toUpperCase(),
        );
      return this.regionToCsv(
        ref.sheetId,
        String(ref.startCellId).toUpperCase(),
        String(ref.endCellId).toUpperCase(),
        stack || {},
        options,
      );
    }
    if (!ref.cellId) return '';
    if (typeof this.recordDependencyCell === 'function') {
      this.recordDependencyCell(
        options,
        ref.sheetId,
        String(ref.cellId).toUpperCase(),
      );
    }
    if (rawMode)
      return this.getMentionRawValue(
        ref.sheetId,
        String(ref.cellId).toUpperCase(),
      );
    return this.getMentionValue(
      ref.sheetId,
      String(ref.cellId).toUpperCase(),
      stack,
      options,
    );
  },

  getNamedOrSpecialValue(currentSheetId, name, stack, options, rawMode) {
    var key = String(name || '').trim();
    if (!key) return '';
    if (typeof this.recordDependencyNamedRef === 'function') {
      this.recordDependencyNamedRef(options, key);
    }

    var ref = this.storageService.resolveNamedCell(key);
    if (ref && ref.sheetId) {
      return this.getNamedRefValue(ref, stack, options, !!rawMode);
    }

    var reportTabId = this.findReportTabId(currentSheetId, key);
    if (reportTabId) {
      return this.getReportContentValue(reportTabId, stack, options, !!rawMode);
    }

    throw new Error('Unknown cell name: ' + key);
  },

  getReportContentValue(reportTabId, stack, options, rawMode) {
    var html = this.storageService.getReportContent(reportTabId);
    if (rawMode) return this.htmlToMarkdown(html);
    return this.renderReportAsViewText(reportTabId, html, stack, options);
  },

  findReportTabId(currentSheetId, reportToken) {
    var tabs = this.getTabs();
    var reportTabs = [];
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i] && this.isReportSheetId(tabs[i].id)) reportTabs.push(tabs[i]);
    }

    var token = String(reportToken == null ? '' : reportToken).trim();
    if (!token) {
      if (currentSheetId && this.isReportSheetId(currentSheetId))
        return currentSheetId;
      return reportTabs[0] ? reportTabs[0].id : '';
    }

    var normalizedToken = this.normalizeReportToken(token);

    for (var n = 0; n < reportTabs.length; n++) {
      var byName = reportTabs[n];
      if (this.normalizeReportToken(byName.name) === normalizedToken)
        return byName.id;
      if (String(byName.id) === token) return byName.id;
    }

    return '';
  },

  isReportSheetId(sheetId) {
    var tab = null;
    var tabs = this.getTabs();
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i] && tabs[i].id === sheetId) {
        tab = tabs[i];
        break;
      }
    }
    if (!tab) return false;
    return tab.type === 'report';
  },

  htmlToPlainText(html) {
    var source = String(html == null ? '' : html);
    if (!source) return '';
    if (typeof document === 'undefined' || !document.createElement) {
      return source
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    var tmp = document.createElement('div');
    tmp.innerHTML = source;
    return String(tmp.textContent || tmp.innerText || '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  renderReportAsViewText(reportSheetId, html, stack, options) {
    var markdown = this.htmlToMarkdown(html);
    if (!markdown) return '';

    markdown = this.stripSelfReportMentions(reportSheetId, markdown);

    // Resolve linked Input: tokens to their referenced values.
    markdown = markdown.replace(
      /Input:(@[A-Za-z_][A-Za-z0-9_]*|(?:@)?(?:'[^']+'|[A-Za-z][A-Za-z0-9 _-]*)[!:][A-Za-z]+[0-9]+)/g,
      (_, token) => {
        var refToken = String(token || '').trim();
        if (!refToken) return '';
        var normalized =
          refToken.charAt(0) === '@' ? refToken.substring(1) : refToken;
        try {
          if (
            /^(?:'[^']+'|[A-Za-z][A-Za-z0-9 _-]*)[!:][A-Za-z]+[0-9]+$/.test(
              normalized,
            )
          ) {
            var m =
              /^(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))[!:]([A-Za-z]+[0-9]+)$/.exec(
                normalized,
              );
            if (!m) return '';
            var sheetName = m[1] || m[2] || '';
            var sheetId = this.findSheetIdByName(sheetName);
            if (!sheetId) return '';
            return String(
              this.getMentionValue(
                sheetId,
                String(m[3]).toUpperCase(),
                stack,
                options,
              ) || '',
            );
          }
          return String(
            this.getPlainMentionValue(
              reportSheetId,
              normalized,
              stack,
              options,
            ) || '',
          );
        } catch (e) {
          return '';
        }
      },
    );

    return this.expandMentionsInPromptText(
      reportSheetId,
      markdown,
      stack,
      options,
    );
  },

  stripSelfReportMentions(reportSheetId, text) {
    var source = String(text == null ? '' : text);
    if (!source) return '';
    var tabs = this.getTabs();
    var tab = null;
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i] && tabs[i].id === reportSheetId) {
        tab = tabs[i];
        break;
      }
    }
    if (!tab) return source;

    var tokens = [];
    var tabId = String(tab.id || '').trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tabId)) tokens.push(tabId);
    var tabName = String(tab.name || '').trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tabName)) tokens.push(tabName);

    var result = source;
    for (var t = 0; t < tokens.length; t++) {
      var escaped = tokens[t].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp('@@?' + escaped, 'g'), '');
    }
    return result;
  },

  htmlToMarkdown(html) {
    var source = String(html == null ? '' : html);
    if (!source) return '';
    try {
      if (
        typeof window !== 'undefined' &&
        typeof window.TurndownService === 'function'
      ) {
        var turndown = new window.TurndownService();
        return String(turndown.turndown(source) || '').trim();
      }
    } catch (e) {}
    return this.htmlToPlainText(source);
  },

  normalizeReportToken(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
  },

  getPlainMentionValue(sheetId, token, stack, options, rawMode) {
    var key = String(token || '').trim();
    if (!key) return '';
    if (this.isExistingCellId(key)) {
      if (rawMode) return this.getMentionRawValue(sheetId, key.toUpperCase());
      return this.getMentionValue(sheetId, key.toUpperCase(), stack, options);
    }
    return this.getNamedOrSpecialValue(sheetId, key, stack, options, !!rawMode);
  },

  isExistingCellId(token) {
    var cellId = String(token || '').toUpperCase();
    for (var i = 0; i < this.cellIds.length; i++) {
      if (this.cellIds[i] === cellId) return true;
    }
    return false;
  },
};
