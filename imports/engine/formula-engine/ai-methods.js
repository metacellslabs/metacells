import {
  extractChannelMentionLabels,
  buildChannelAttachmentLinkSystemPrompt,
  getChannelAttachmentLinkEntries,
  formatChannelEventForPrompt,
  normalizeChannelLabel,
} from '../../api/channels/mentioning.js';

// Description: ai methods extracted from FormulaEngine for smaller logical modules.
export const aiMethods = {
  stripAIPromptImagePlaceholders(text) {
    return String(text == null ? '' : text)
      .replace(
        /\b(on|in)\s+<attached image:\s*[^>]+>(?=[ \t.,!?:;\-]|$)/gim,
        'in this image',
      )
      .replace(
        /\b(from)\s+<attached image:\s*[^>]+>(?=[ \t.,!?:;\-]|$)/gim,
        '$1 this image',
      )
      .replace(/(^|[ \t])<attached image:\s*[^>]+>(?=[ \t]|$)/gim, '$1this image')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+\?/g, '?')
      .replace(/\s+([.,!;:])/g, '$1')
      .trim();
  },

  getAttachmentForCell(sheetId, cellId, options) {
    var targetSheetId = String(sheetId || '');
    var targetCellId = String(cellId || '').toUpperCase();
    if (
      !targetSheetId ||
      !targetCellId ||
      typeof this.parseAttachmentSource !== 'function'
    )
      return null;
    var raw = String(
      this.storageService.getCellValue(targetSheetId, targetCellId) || '',
    );
    var attachment = this.parseAttachmentSource(raw);
    if (!attachment) return null;
    if (typeof this.recordDependencyAttachment === 'function') {
      this.recordDependencyAttachment(options, targetSheetId, targetCellId);
    }
    return {
      sheetId: targetSheetId,
      cellId: targetCellId,
      name: String(attachment.name || targetCellId),
      type: String(attachment.type || ''),
      binaryArtifactId: String(attachment.binaryArtifactId || ''),
      url: String(attachment.previewUrl || ''),
      downloadUrl: String(attachment.downloadUrl || ''),
      previewUrl: String(attachment.previewUrl || ''),
      content: this.resolveAttachmentContentOrThrow(
        attachment,
        targetSheetId,
        targetCellId,
      ),
    };
  },

  getImageAttachmentForCell(sheetId, cellId, options) {
    var attachment = this.getAttachmentForCell(sheetId, cellId, options);
    if (!attachment) return null;
    var type = String(attachment.type || '').toLowerCase();
    var previewUrl = String(
      attachment.previewUrl || attachment.downloadUrl || attachment.url || '',
    );
    if (type.indexOf('image/') !== 0 || !previewUrl) return null;
    return {
      sheetId: attachment.sheetId,
      cellId: attachment.cellId,
      name: String(attachment.name || attachment.cellId),
      type: String(attachment.type || ''),
      binaryArtifactId: String(attachment.binaryArtifactId || ''),
      url: previewUrl,
      downloadUrl: String(attachment.downloadUrl || previewUrl),
    };
  },

  getTextAttachmentForCell(sheetId, cellId, options) {
    var attachment = this.getAttachmentForCell(sheetId, cellId, options);
    if (!attachment) return null;
    var type = String(attachment.type || '').toLowerCase();
    if (type.indexOf('image/') === 0) return null;
    if (!String(attachment.content || '').trim()) return null;
    return attachment;
  },

  resolveImageAttachmentMention(sheetId, token, options) {
    var sourceSheetId = String(sheetId || '');
    var rawToken = String(token || '').trim();
    if (!rawToken) return null;

    var sheetCellMatch =
      /^(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)$/.exec(
        rawToken,
      );
    if (sheetCellMatch) {
      var sheetName = sheetCellMatch[1] || sheetCellMatch[2] || '';
      var refSheetId = this.findSheetIdByName(sheetName);
      if (!refSheetId) return null;
      return this.getImageAttachmentForCell(
        refSheetId,
        sheetCellMatch[3],
        options,
      );
    }

    var localCellMatch = /^([A-Za-z]+[0-9]+)$/.exec(rawToken);
    if (localCellMatch) {
      return this.getImageAttachmentForCell(
        sourceSheetId,
        localCellMatch[1],
        options,
      );
    }

    var named = this.storageService.resolveNamedCell(rawToken);
    if (named && named.sheetId && named.cellId) {
      return this.getImageAttachmentForCell(
        named.sheetId,
        named.cellId,
        options,
      );
    }
    return null;
  },

  resolveTextAttachmentMention(sheetId, token, options) {
    var sourceSheetId = String(sheetId || '');
    var rawToken = String(token || '').trim();
    if (!rawToken) return null;

    var sheetCellMatch =
      /^(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)$/.exec(
        rawToken,
      );
    if (sheetCellMatch) {
      var sheetName = sheetCellMatch[1] || sheetCellMatch[2] || '';
      var refSheetId = this.findSheetIdByName(sheetName);
      if (!refSheetId) return null;
      return this.getTextAttachmentForCell(
        refSheetId,
        sheetCellMatch[3],
        options,
      );
    }

    var localCellMatch = /^([A-Za-z]+[0-9]+)$/.exec(rawToken);
    if (localCellMatch) {
      return this.getTextAttachmentForCell(
        sourceSheetId,
        localCellMatch[1],
        options,
      );
    }

    var named = this.storageService.resolveNamedCell(rawToken);
    if (named && named.sheetId && named.cellId) {
      return this.getTextAttachmentForCell(
        named.sheetId,
        named.cellId,
        options,
      );
    }
    return null;
  },

  appendAIPromptImageAttachment(options, attachment) {
    if (!attachment || !options || typeof options !== 'object') return;
    if (!options.aiImageAttachments) options.aiImageAttachments = [];
    var list = options.aiImageAttachments;
    var key = [attachment.sheetId, attachment.cellId, attachment.url].join(':');
    for (var i = 0; i < list.length; i++) {
      var existing = list[i];
      if (!existing) continue;
      var existingKey = [existing.sheetId, existing.cellId, existing.url].join(
        ':',
      );
      if (existingKey === key) return;
    }
    list.push(attachment);
  },

  appendAIPromptTextAttachment(options, attachment) {
    if (!attachment || !options || typeof options !== 'object') return;
    if (!options.aiTextAttachments) options.aiTextAttachments = [];
    var list = options.aiTextAttachments;
    var key = [attachment.sheetId, attachment.cellId, attachment.name].join(':');
    for (var i = 0; i < list.length; i++) {
      var existing = list[i];
      if (!existing) continue;
      var existingKey = [
        existing.sheetId,
        existing.cellId,
        existing.name,
      ].join(':');
      if (existingKey === key) return;
    }
    list.push(attachment);
  },

  buildTextAttachmentUserContentPart(attachment) {
    if (!attachment) return null;
    var name = String(attachment.name || attachment.cellId || 'file').trim();
    var content = String(attachment.content || '').trim();
    if (!content) return null;
    return {
      type: 'text',
      text: ['Attached file: ' + name, content].join('\n\n'),
    };
  },

  buildAIUserContent(userPrompt, imageAttachments, textAttachments) {
    var text = String(userPrompt == null ? '' : userPrompt).trim();
    var files = Array.isArray(textAttachments)
      ? textAttachments.filter((item) => item && item.content)
      : [];
    var images = Array.isArray(imageAttachments)
      ? imageAttachments.filter((item) => item && item.url)
      : [];
    if (images.length) {
      text = this.stripAIPromptImagePlaceholders(text);
    }
    if (!files.length && !images.length) return text;
    var parts = [];
    if (text) parts.push({ type: 'text', text: text });
    for (var j = 0; j < files.length; j++) {
      var textPart = this.buildTextAttachmentUserContentPart(files[j]);
      if (textPart) parts.push(textPart);
    }
    for (var i = 0; i < images.length; i++) {
      parts.push({
        type: 'image_url',
        image_url: {
          url: String(images[i].url || ''),
        },
      });
    }
    return parts;
  },

  getChannelPayloadMap(options) {
    var source =
      options &&
      typeof options === 'object' &&
      options.channelPayloads &&
      typeof options.channelPayloads === 'object'
        ? options.channelPayloads
        : {};
    return source;
  },

  shouldIncludeChannelAttachments(options) {
    return !!(
      options &&
      typeof options === 'object' &&
      options.includeChannelAttachments === true
    );
  },

  getChannelMentionValue(label, options) {
    var key = normalizeChannelLabel(label);
    if (!key) return '';
    var map = this.getChannelPayloadMap(options);
    return formatChannelEventForPrompt(map[key] || null, {
      includeAttachments: this.shouldIncludeChannelAttachments(options),
    });
  },

  buildChannelAttachmentSystemPrompt(labels, options) {
    var map = this.getChannelPayloadMap(options);
    var instructions = [];
    var seen = {};
    var source = Array.isArray(labels) ? labels : [];
    for (var i = 0; i < source.length; i++) {
      var key = normalizeChannelLabel(source[i]);
      if (!key || seen[key]) continue;
      seen[key] = true;
      var instruction = buildChannelAttachmentLinkSystemPrompt(
        map[key] || null,
        {
          includeAttachments: this.shouldIncludeChannelAttachments(options),
        },
      );
      if (instruction) instructions.push(instruction);
    }
    return instructions.join('\n');
  },

  buildChannelAttachmentLinks(labels, options) {
    var map = this.getChannelPayloadMap(options);
    var results = [];
    var seen = {};
    var source = Array.isArray(labels) ? labels : [];
    for (var i = 0; i < source.length; i++) {
      var key = normalizeChannelLabel(source[i]);
      if (!key) continue;
      var entries = getChannelAttachmentLinkEntries(map[key] || null, {
        includeAttachments: this.shouldIncludeChannelAttachments(options),
      });
      for (var j = 0; j < entries.length; j++) {
        var item = entries[j];
        var dedupeKey = String(item.name || '') + '::' + String(item.url || '');
        if (!item || !item.url || seen[dedupeKey]) continue;
        seen[dedupeKey] = true;
        results.push(item);
      }
    }
    return results;
  },

  getCurrentChannelEventIds(labels, options) {
    var map = this.getChannelPayloadMap(options);
    var result = {};
    var source = Array.isArray(labels) ? labels : [];
    for (var i = 0; i < source.length; i++) {
      var key = normalizeChannelLabel(source[i]);
      if (!key) continue;
      var payload = map[key] || null;
      var eventId =
        payload && (payload.eventId || payload._id)
          ? String(payload.eventId || payload._id)
          : '';
      if (!eventId) continue;
      result[key] = eventId;
    }
    return result;
  },

  shouldAppendForChannelEvent(sheetId, sourceCellId, channelLabels, options) {
    var labels = Array.isArray(channelLabels) ? channelLabels : [];
    if (!labels.length) return false;
    if (
      !this.storageService ||
      typeof this.storageService.getCellProcessedChannelEventIds !== 'function'
    )
      return false;
    var previous =
      this.storageService.getCellProcessedChannelEventIds(
        sheetId,
        sourceCellId,
      ) || {};
    var current = this.getCurrentChannelEventIds(labels, options);
    var changed = false;
    var hadPrevious = false;

    Object.keys(current).forEach((label) => {
      if (previous[label]) hadPrevious = true;
      if (previous[label] && previous[label] !== current[label]) {
        changed = true;
      }
    });

    return hadPrevious && changed;
  },

  isChannelDependencyResolved(label, options) {
    return !!this.getChannelMentionValue(label, options);
  },

  isCellDependencyResolved(sheetId, cellId) {
    var raw = String(this.storageService.getCellValue(sheetId, cellId) || '');
    if (!raw) return true;
    var isFormula = /^[='>#]/.test(raw);
    var state = String(this.storageService.getCellState(sheetId, cellId) || '');
    var computedValue =
      this.storageService &&
      typeof this.storageService.getCellComputedValue === 'function'
        ? String(this.storageService.getCellComputedValue(sheetId, cellId) || '')
        : '';
    var displayValue =
      this.storageService &&
      typeof this.storageService.getCellDisplayValue === 'function'
        ? String(this.storageService.getCellDisplayValue(sheetId, cellId) || '')
        : '';
    if (!state) {
      if (!isFormula) return true;
      if (
        computedValue === '...' ||
        computedValue === '(manual: click Update)' ||
        displayValue === '...' ||
        displayValue === '(manual: click Update)'
      ) {
        return false;
      }
      return !!(computedValue || displayValue);
    }
    if (state === 'error') return true;
    if (state === 'resolved') {
      if (
        computedValue === '...' ||
        computedValue === '(manual: click Update)'
      ) {
        return false;
      }
      return true;
    }
    return false;
  },

  isRegionDependencyResolved(sheetId, startCellId, endCellId) {
    var start = this.parseCellId(startCellId);
    var end = this.parseCellId(endCellId);
    if (!start || !end) return true;

    var rowStart = Math.min(start.row, end.row);
    var rowEnd = Math.max(start.row, end.row);
    var colStart = Math.min(start.col, end.col);
    var colEnd = Math.max(start.col, end.col);

    for (var r = rowStart; r <= rowEnd; r++) {
      for (var c = colStart; c <= colEnd; c++) {
        var cellId = this.columnIndexToLabel(c) + r;
        if (!this.isCellDependencyResolved(sheetId, cellId)) return false;
      }
    }

    return true;
  },

  arePromptDependenciesResolved(sheetId, text, options) {
    var dependencies = this.collectAIPromptDependencies(sheetId, text);
    for (var i = 0; i < dependencies.length; i++) {
      var dependency = dependencies[i];
      if (!dependency || !dependency.kind) continue;
      if (dependency.kind === 'cell') {
        if (
          !this.isCellDependencyResolved(dependency.sheetId, dependency.cellId)
        )
          return false;
        continue;
      }
      if (dependency.kind === 'region') {
        if (
          !this.isRegionDependencyResolved(
            dependency.sheetId,
            dependency.startCellId,
            dependency.endCellId,
          )
        )
          return false;
        continue;
      }
      if (dependency.kind === 'channel') {
        if (!this.isChannelDependencyResolved(dependency.label, options))
          return false;
      }
    }
    return true;
  },

  collectAIPromptDependencies(sheetId, text) {
    var source = String(text == null ? '' : text);
    if (!source) return [];
    var pattern =
      /@@?(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)|@@?([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)|@@?(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)|@@?([A-Za-z_][A-Za-z0-9_]*)/g;
    var results = [];
    var seen = {};
    var m;

    while ((m = pattern.exec(source))) {
      var dependency = null;

      if (m[3] && m[4]) {
        var rangeSheetName = m[1] || m[2] || '';
        var rangeSheetId = this.findSheetIdByName(rangeSheetName);
        if (rangeSheetId) {
          dependency = {
            kind: 'region',
            sheetId: rangeSheetId,
            startCellId: String(m[3]).toUpperCase(),
            endCellId: String(m[4]).toUpperCase(),
          };
        }
      } else if (m[5] && m[6]) {
        dependency = {
          kind: 'region',
          sheetId: sheetId,
          startCellId: String(m[5]).toUpperCase(),
          endCellId: String(m[6]).toUpperCase(),
        };
      } else if (m[9]) {
        var refSheetName = m[7] || m[8] || '';
        var refSheetId = this.findSheetIdByName(refSheetName);
        if (refSheetId) {
          dependency = {
            kind: 'cell',
            sheetId: refSheetId,
            cellId: String(m[9]).toUpperCase(),
          };
        }
      } else if (m[10]) {
        var token = String(m[10] || '').trim();
        if (this.isExistingCellId(token)) {
          dependency = {
            kind: 'cell',
            sheetId: sheetId,
            cellId: token.toUpperCase(),
          };
        } else {
          var named = this.storageService.resolveNamedCell(token);
          if (named && named.sheetId && named.startCellId && named.endCellId) {
            dependency = {
              kind: 'region',
              sheetId: named.sheetId,
              startCellId: String(named.startCellId).toUpperCase(),
              endCellId: String(named.endCellId).toUpperCase(),
            };
          } else if (named && named.sheetId && named.cellId) {
            dependency = {
              kind: 'cell',
              sheetId: named.sheetId,
              cellId: String(named.cellId).toUpperCase(),
            };
          }
        }
      }

      if (!dependency) continue;
      var key =
        dependency.kind === 'region'
          ? 'region:' +
            dependency.sheetId +
            ':' +
            dependency.startCellId +
            ':' +
            dependency.endCellId
          : 'cell:' + dependency.sheetId + ':' + dependency.cellId;
      if (seen[key]) continue;
      seen[key] = true;
      results.push(dependency);
    }

    var channelLabels = extractChannelMentionLabels(source);
    for (var i = 0; i < channelLabels.length; i++) {
      var label = normalizeChannelLabel(channelLabels[i]);
      var key = 'channel:' + label;
      if (!label || seen[key]) continue;
      seen[key] = true;
      results.push({
        kind: 'channel',
        label: label,
      });
    }

    return results;
  },

  expandChannelMentionsInPromptText(text, options) {
    var source = String(text == null ? '' : text);
    if (!source) return '';
    var self = this;
    return source.replace(
      /(^|[^A-Za-z0-9_:/])\/([A-Za-z][A-Za-z0-9_-]*)\b/g,
      function (match, prefix, label) {
        if (typeof self.recordDependencyChannel === 'function') {
          self.recordDependencyChannel(options, label);
        }
        var resolved = self.getChannelMentionValue(label, options);
        return String(prefix || '') + String(resolved || '');
      },
    );
  },

  wrapResolvedMentionsForAI(sheetId, text, stack, options) {
    var source = String(text == null ? '' : text);
    if (!source) return '';
    var pattern =
      /(_)?@(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)|(_)?@([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)|(_)?@(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)|(_)?@([A-Za-z_][A-Za-z0-9_]*)/g;

    return source.replace(
      pattern,
      (
        _,
        rangeRawPrefix,
        qSheetRange,
        pSheetRange,
        rangeStart,
        rangeEnd,
        localRangeRawPrefix,
        localRangeStart,
        localRangeEnd,
        sheetRawPrefix,
        qSheetCell,
        pSheetCell,
        sheetCellId,
        plainRawPrefix,
        plainToken,
      ) => {
        try {
          var resolved = '';
          var imageAttachment = null;
          var textAttachment = null;
          if (rangeStart && rangeEnd) {
            var rangeSheetName = qSheetRange || pSheetRange || '';
            var rangeSheetId = this.findSheetIdByName(rangeSheetName);
            if (!rangeSheetId) return '';
            resolved = this.regionToCsv(
              rangeSheetId,
              rangeStart.toUpperCase(),
              rangeEnd.toUpperCase(),
              stack || {},
              options,
            );
          } else if (localRangeStart && localRangeEnd) {
            resolved = this.regionToCsv(
              sheetId,
              localRangeStart.toUpperCase(),
              localRangeEnd.toUpperCase(),
              stack || {},
              options,
            );
          } else if (sheetCellId) {
            var sheetName = qSheetCell || pSheetCell || '';
            var refSheetId = this.findSheetIdByName(sheetName);
            if (!refSheetId) return '';
            var rawMode = !!sheetRawPrefix;
            if (!rawMode) {
              imageAttachment = this.getImageAttachmentForCell(
                refSheetId,
                sheetCellId.toUpperCase(),
                options,
              );
              if (!imageAttachment) {
                textAttachment = this.getTextAttachmentForCell(
                  refSheetId,
                  sheetCellId.toUpperCase(),
                  options,
                );
              }
            }
            resolved = rawMode
              ? this.getMentionRawValue(refSheetId, sheetCellId.toUpperCase())
              : this.getMentionValue(
                  refSheetId,
                  sheetCellId.toUpperCase(),
                  stack,
                  options,
                );
          } else if (plainToken) {
            if (!plainRawPrefix) {
              imageAttachment = this.resolveImageAttachmentMention(
                sheetId,
                plainToken,
                options,
              );
              if (!imageAttachment) {
                textAttachment = this.resolveTextAttachmentMention(
                  sheetId,
                  plainToken,
                  options,
                );
              }
            }
            resolved = this.getPlainMentionValue(
              sheetId,
              plainToken,
              stack,
              options,
              !!plainRawPrefix,
            );
          }
          if (imageAttachment) {
            this.appendAIPromptImageAttachment(options, imageAttachment);
            return (
              '<attached image: ' +
              String(
                imageAttachment.name || imageAttachment.cellId || 'image',
              ) +
              '>'
            );
          }
          if (textAttachment) {
            this.appendAIPromptTextAttachment(options, textAttachment);
            return (
              '<attached file: ' +
              String(textAttachment.name || textAttachment.cellId || 'file') +
              '>'
            );
          }
          return String(resolved == null ? '' : resolved);
        } catch (e) {
          return '';
        }
      },
    );
  },

  expandMentionsInPromptText(sheetId, text, stack, options) {
    var source = String(text == null ? '' : text);
    if (!source) return '';
    var pattern =
      /(_)?@(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)|(_)?@([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)|(_)?@(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)|(_)?@([A-Za-z_][A-Za-z0-9_]*)/g;

    return source.replace(
      pattern,
      (
        _,
        rangeRawPrefix,
        qSheetRange,
        pSheetRange,
        rangeStart,
        rangeEnd,
        localRangeRawPrefix,
        localRangeStart,
        localRangeEnd,
        sheetRawPrefix,
        qSheetCell,
        pSheetCell,
        sheetCellId,
        plainRawPrefix,
        plainToken,
      ) => {
        try {
          if (rangeStart && rangeEnd) {
            var rangeSheetName = qSheetRange || pSheetRange || '';
            var rangeSheetId = this.findSheetIdByName(rangeSheetName);
            if (!rangeSheetId) return '';
            return this.regionToCsv(
              rangeSheetId,
              rangeStart.toUpperCase(),
              rangeEnd.toUpperCase(),
              stack || {},
              options,
            );
          }

          if (localRangeStart && localRangeEnd) {
            return this.regionToCsv(
              sheetId,
              localRangeStart.toUpperCase(),
              localRangeEnd.toUpperCase(),
              stack || {},
              options,
            );
          }

          if (sheetCellId) {
            var sheetName = qSheetCell || pSheetCell || '';
            var refSheetId = this.findSheetIdByName(sheetName);
            if (!refSheetId) return '';
            var rawMode = !!sheetRawPrefix;
            var sheetValue = rawMode
              ? this.getMentionRawValue(refSheetId, sheetCellId.toUpperCase())
              : this.getMentionValue(
                  refSheetId,
                  sheetCellId.toUpperCase(),
                  stack,
                  options,
                );
            return String(sheetValue == null ? '' : sheetValue);
          }

          if (plainToken) {
            var plainValue = this.getPlainMentionValue(
              sheetId,
              plainToken,
              stack,
              options,
              !!plainRawPrefix,
            );
            return String(plainValue == null ? '' : plainValue);
          }
        } catch (e) {
          return '';
        }
        return '';
      },
    );
  },

  parseListShortcutSpec(rawFormula) {
    var raw = String(rawFormula == null ? '' : rawFormula);
    if (!raw || raw.charAt(0) !== '>') return null;

    var parsed = this.parseFormulaDisplayPlaceholder(
      this.stripOptionalFormulaQuestionMarker(raw.substring(1)),
    );
    var body = String(parsed.content || '').trim();
    if (!body) return null;

    var includeAttachments = false;
    var days = 1;
    var prompt = body;
    var attachmentOptIn = /^\+(\d+)?\s*(.+)$/.exec(body);
    if (attachmentOptIn) {
      includeAttachments = true;
      days = attachmentOptIn[1] ? parseInt(attachmentOptIn[1], 10) : 1;
      if (isNaN(days) || days < 1) days = 1;
      prompt = String(attachmentOptIn[2] || '').trim();
    }

    if (!prompt) return null;
    return {
      prompt: prompt,
      includeAttachments: includeAttachments,
      days: days,
      placeholder: String(parsed.placeholder || ''),
    };
  },

  parseListShortcutPrompt(rawFormula) {
    var spec = this.parseListShortcutSpec(rawFormula);
    return spec && spec.prompt ? spec.prompt : '';
  },

  parseChannelFeedPromptSpec(rawValue) {
    var raw = String(rawValue == null ? '' : rawValue);
    if (!raw || raw.charAt(0) !== '#') return null;

    var parsed = this.parseFormulaDisplayPlaceholder(
      this.stripOptionalFormulaQuestionMarker(raw.substring(1)),
    );
    var payload = String(parsed.content || '').trim();
    if (!payload) return null;

    var match = /^(\+)?(\d+)?\s*(.+)$/.exec(payload);
    if (!match) return null;

    var includeAttachments = match[1] === '+';
    var dayToken = String(match[2] || '').trim();
    var prompt = String(match[3] || '').trim();
    if (!prompt) return null;

    var labels = extractChannelMentionLabels(prompt);
    if (!labels.length) return null;

    var days = dayToken ? parseInt(dayToken, 10) : 1;
    if (isNaN(days) || days < 1) return null;

    return {
      prompt: prompt,
      days: days,
      labels: labels,
      includeAttachments: includeAttachments,
      placeholder: String(parsed.placeholder || ''),
    };
  },

  parseTablePromptSpec(rawValue) {
    var raw = String(rawValue == null ? '' : rawValue);
    if (!raw || raw.charAt(0) !== '#') return null;

    var parsed = this.parseFormulaDisplayPlaceholder(
      this.stripOptionalFormulaQuestionMarker(raw.substring(1)),
    );
    var payload = String(parsed.content || '').trim();
    if (!payload) {
      return {
        prompt: '',
        cols: null,
        rows: null,
        placeholder: String(parsed.placeholder || ''),
      };
    }

    var parts = payload.split(';');
    if (parts.length >= 3) {
      var maybeRows = parseInt(parts[parts.length - 1].trim(), 10);
      var maybeCols = parseInt(parts[parts.length - 2].trim(), 10);
      if (
        !isNaN(maybeCols) &&
        maybeCols > 0 &&
        !isNaN(maybeRows) &&
        maybeRows > 0
      ) {
        return {
          prompt: parts.slice(0, -2).join(';').trim(),
          cols: maybeCols,
          rows: maybeRows,
          placeholder: String(parsed.placeholder || ''),
        };
      }
    }

    return {
      prompt: payload,
      cols: null,
      rows: null,
      placeholder: String(parsed.placeholder || ''),
    };
  },

  tryDirectMentionTableSpill(sheetId, cellId, rawFormula, stack, options) {
    var target = this.resolveDirectMentionFormulaRef(sheetId, rawFormula);
    if (!target) return null;
    var targetRaw = String(
      this.storageService.getCellValue(target.sheetId, target.cellId) || '',
    );
    if (!this.isTableShortcutRaw(targetRaw)) return null;

    var matrix = this.readTableShortcutMatrix(
      target.sheetId,
      target.cellId,
      stack,
      options,
    );
    if (!matrix.length) return { applied: true, value: '' };

    this.spillMatrixToSheet(sheetId, cellId, matrix);
    return {
      applied: true,
      value: String(matrix[0][0] == null ? '' : matrix[0][0]),
    };
  },

  resolveDirectMentionFormulaRef(sheetId, rawFormula) {
    var raw = String(rawFormula == null ? '' : rawFormula);
    if (!raw || raw.charAt(0) !== '=') return null;
    var body = this.stripOptionalFormulaQuestionMarker(raw.substring(1)).trim();
    if (!body || body.charAt(0) !== '@') return null;
    var token = body.substring(1).trim();
    if (!token) return null;

    var sheetCellMatch =
      /^(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)$/.exec(token);
    if (sheetCellMatch) {
      var sheetName = sheetCellMatch[1] || sheetCellMatch[2] || '';
      var refSheetId = this.findSheetIdByName(sheetName);
      if (!refSheetId) return null;
      return { sheetId: refSheetId, cellId: sheetCellMatch[3].toUpperCase() };
    }

    var localCellMatch = /^([A-Za-z]+[0-9]+)$/.exec(token);
    if (localCellMatch) {
      return { sheetId: sheetId, cellId: localCellMatch[1].toUpperCase() };
    }

    var named = this.storageService.resolveNamedCell(token);
    if (named && named.sheetId && named.cellId) {
      return {
        sheetId: named.sheetId,
        cellId: String(named.cellId).toUpperCase(),
      };
    }
    return null;
  },

  listAI(
    sheetId,
    sourceCellId,
    text,
    count,
    forceRefresh,
    stack,
    options,
    fillStartFromIndex,
  ) {
    var sourceRaw = String(
      this.storageService.getCellValue(sheetId, sourceCellId) || '',
    );
    var dependencies = this.collectAIPromptDependencies(sheetId, text);
    if (typeof this.recordAIPromptDependencies === 'function') {
      this.recordAIPromptDependencies(options, dependencies);
    }
    if (!this.arePromptDependenciesResolved(sheetId, text, options)) {
      return '...';
    }
    var prepared = this.prepareAIPrompt(sheetId, text, stack, options);
    var prompt = prepared.userPrompt;
    var total = parseInt(count, 10);
    if (isNaN(total) || total < 1) total = 5;
    if (total > 50) total = 50;
    var startIndex =
      typeof fillStartFromIndex === 'number' ? fillStartFromIndex : 1;

    return this.aiService.list(
      prompt,
      total,
      (items) => {
        if (
          String(this.storageService.getCellValue(sheetId, sourceCellId) || '') !==
          sourceRaw
        ) {
          return;
        }
        var rows = (Array.isArray(items) ? items : [])
          .slice(startIndex)
          .map((item) => [String(item == null ? '' : item)]);
        this.spillMatrixToSheet(sheetId, sourceCellId, rows, {
          preserveSourceCell: true,
        });
      },
      {
        forceRefresh: !!forceRefresh,
        systemPrompt: prepared.systemPrompt,
        userContent: prepared.userContent,
        queueMeta: {
          formulaKind: 'list',
          sourceCellId: sourceCellId,
          promptTemplate: this.normalizeQueuedPromptTemplate(text),
          count: total,
          dependencies: dependencies,
          attachmentLinks: prepared.attachmentLinks,
        },
      },
    );
  },

  tableAI(
    sheetId,
    sourceCellId,
    text,
    cols,
    rows,
    forceRefresh,
    stack,
    options,
  ) {
    var sourceRaw = String(
      this.storageService.getCellValue(sheetId, sourceCellId) || '',
    );
    var dependencies = this.collectAIPromptDependencies(sheetId, text);
    if (typeof this.recordAIPromptDependencies === 'function') {
      this.recordAIPromptDependencies(options, dependencies);
    }
    if (!this.arePromptDependenciesResolved(sheetId, text, options)) {
      return '...';
    }
    var prepared = this.prepareAIPrompt(sheetId, text, stack, options);
    var prompt = prepared.userPrompt;
    var channelLabels = extractChannelMentionLabels(
      String(text == null ? '' : text),
    );
    var appendBelowExisting = this.shouldAppendForChannelEvent(
      sheetId,
      sourceCellId,
      channelLabels,
      options,
    );

    this.aiService
      .askTable(prompt, cols, rows, {
        forceRefresh: !!forceRefresh,
        onResult: (matrix) => {
          if (
            String(this.storageService.getCellValue(sheetId, sourceCellId) || '') !==
            sourceRaw
          ) {
            return;
          }
          this.spillMatrixToSheet(sheetId, sourceCellId, matrix, {
            preserveSourceCell: true,
            appendBelowExisting: appendBelowExisting,
          });
        },
        systemPrompt: prepared.systemPrompt,
        userContent: prepared.userContent,
        queueMeta: {
          formulaKind: 'table',
          sourceCellId: sourceCellId,
          promptTemplate: this.normalizeQueuedPromptTemplate(text),
          colsLimit: cols,
          rowsLimit: rows,
          dependencies: dependencies,
          attachmentLinks: prepared.attachmentLinks,
        },
      })
      .catch(() => {});

    return '#';
  },

  isTableShortcutRaw(rawValue) {
    var raw = String(rawValue == null ? '' : rawValue).trim();
    if (!raw) return false;
    var head = raw.charAt(0);
    if (head !== '#') return false;
    return (
      this.stripOptionalFormulaQuestionMarker(raw.substring(1)).trim() !== ''
    );
  },

  isListShortcutRaw(rawValue) {
    var raw = String(rawValue == null ? '' : rawValue).trim();
    if (!raw) return false;
    var head = raw.charAt(0);
    if (head !== '>') return false;
    return (
      this.stripOptionalFormulaQuestionMarker(raw.substring(1)).trim() !== ''
    );
  },

  readListShortcutResult(sheetId, sourceCellId, stack, options) {
    var source = this.parseCellId(sourceCellId);
    if (!source) return '';
    var generatedIds =
      this.storageService.listGeneratedCellsBySource(sheetId, sourceCellId) ||
      [];
    if (generatedIds.length) {
      var generatedValues = generatedIds
        .map((cellId) => {
          var parsed = this.parseCellId(cellId);
          return {
            cellId: String(cellId || '').toUpperCase(),
            row: parsed ? parsed.row : 0,
            col: parsed ? parsed.col : 0,
          };
        })
        .sort((left, right) => {
          if (left.row !== right.row) return left.row - right.row;
          return left.col - right.col;
        })
        .map((item) => {
          var value = this.evaluateCell(
            sheetId,
            item.cellId,
            stack || {},
            options,
          );
          return String(value == null ? '' : value);
        })
        .filter((value) => value.trim() !== '');
      if (generatedValues.length) {
        return generatedValues.join('\n');
      }
    }
    var bounds = this.getGridBounds();
    var maxRow = bounds.maxRow;
    var values = [];
    for (var row = source.row + 1; row <= maxRow; row++) {
      var cellId = this.columnIndexToLabel(source.col) + row;
      var raw = String(this.storageService.getCellValue(sheetId, cellId) || '');
      if (raw.trim() === '') break;
      var value = this.evaluateCell(sheetId, cellId, stack || {}, options);
      values.push(String(value == null ? '' : value));
    }
    return values.join('\n');
  },

  readTableShortcutResult(sheetId, sourceCellId, stack, options) {
    var matrix = this.readTableShortcutMatrix(
      sheetId,
      sourceCellId,
      stack,
      options,
    );
    if (!matrix.length) return '';
    var lines = [];
    for (var r = 0; r < matrix.length; r++) {
      lines.push(
        matrix[r]
          .map((v) => this.escapeCsv(String(v == null ? '' : v)))
          .join(','),
      );
    }
    return lines.join('\n');
  },

  readTableShortcutMatrix(sheetId, sourceCellId, stack, options) {
    var source = this.parseCellId(sourceCellId);
    if (!source) return [];
    var generatedIds =
      this.storageService.listGeneratedCellsBySource(sheetId, sourceCellId) ||
      [];
    if (generatedIds.length) {
      var generatedCells = generatedIds
        .map((cellId) => {
          var parsed = this.parseCellId(cellId);
          if (!parsed) return null;
          return {
            cellId: String(cellId || '').toUpperCase(),
            row: parsed.row,
            col: parsed.col,
          };
        })
        .filter(Boolean);
      if (generatedCells.length) {
        var minRow = generatedCells[0].row;
        var maxRowGenerated = generatedCells[0].row;
        var minCol = generatedCells[0].col;
        var maxColGenerated = generatedCells[0].col;
        for (var g = 1; g < generatedCells.length; g++) {
          if (generatedCells[g].row < minRow) minRow = generatedCells[g].row;
          if (generatedCells[g].row > maxRowGenerated)
            maxRowGenerated = generatedCells[g].row;
          if (generatedCells[g].col < minCol) minCol = generatedCells[g].col;
          if (generatedCells[g].col > maxColGenerated)
            maxColGenerated = generatedCells[g].col;
        }

        var generatedMap = {};
        for (var gm = 0; gm < generatedCells.length; gm++) {
          generatedMap[generatedCells[gm].cellId] = true;
        }

        var generatedMatrix = [];
        for (var rowIndex = minRow; rowIndex <= maxRowGenerated; rowIndex++) {
          var rowValues = [];
          var hasAny = false;
          for (var colIndex = minCol; colIndex <= maxColGenerated; colIndex++) {
            var targetCellId = this.columnIndexToLabel(colIndex) + rowIndex;
            if (!generatedMap[targetCellId]) {
              rowValues.push('');
              continue;
            }
            var generatedValue = this.evaluateCell(
              sheetId,
              targetCellId,
              stack || {},
              options,
            );
            var stringValue = String(
              generatedValue == null ? '' : generatedValue,
            );
            if (stringValue.trim() !== '') hasAny = true;
            rowValues.push(stringValue);
          }
          if (hasAny) generatedMatrix.push(rowValues);
        }
        if (generatedMatrix.length) return generatedMatrix;
      }
    }
    var bounds = this.getGridBounds();
    var maxRow = bounds.maxRow;
    var maxCol = bounds.maxCol;
    var startRow = source.row + 1;
    var startCol = source.col;

    var width = 0;
    for (var col = startCol; col <= maxCol; col++) {
      var firstRowCellId = this.columnIndexToLabel(col) + startRow;
      var firstRaw = String(
        this.storageService.getCellValue(sheetId, firstRowCellId) || '',
      );
      if (firstRaw.trim() === '') break;
      width++;
    }
    if (width < 1) return [];

    var matrix = [];
    for (var row = startRow; row <= maxRow; row++) {
      var rowValues = [];
      var hasAny = false;
      for (var c = 0; c < width; c++) {
        var cellId = this.columnIndexToLabel(startCol + c) + row;
        var raw = String(
          this.storageService.getCellValue(sheetId, cellId) || '',
        );
        if (raw.trim() !== '') hasAny = true;
        var value = this.evaluateCell(sheetId, cellId, stack || {}, options);
        rowValues.push(String(value == null ? '' : value));
      }
      if (!hasAny) break;
      matrix.push(rowValues);
    }

    return matrix;
  },

  spillMatrixToSheet(sheetId, sourceCellId, matrix, spillOptions) {
    var source = this.parseCellId(sourceCellId);
    if (!source) return;
    var sourceKey = String(sourceCellId || '').toUpperCase();
    var opts =
      spillOptions && typeof spillOptions === 'object' ? spillOptions : {};
    var preserveSourceCell = opts.preserveSourceCell !== false;
    var appendBelowExisting = !!opts.appendBelowExisting;
    var baseRow = source.row + (preserveSourceCell ? 1 : 0);
    var baseCol = source.col;

    if (!appendBelowExisting) {
      this.storageService.clearGeneratedCellsBySource(sheetId, sourceCellId);
    } else {
      var existing =
        this.storageService.listGeneratedCellsBySource(sheetId, sourceCellId) ||
        [];
      var maxRow = 0;
      for (var i = 0; i < existing.length; i++) {
        var parsed = this.parseCellId(existing[i]);
        if (parsed && parsed.row > maxRow) maxRow = parsed.row;
      }
      if (maxRow > 0) {
        baseRow = maxRow + 1;
      }
    }

    for (var r = 0; r < matrix.length; r++) {
      var rowValues = Array.isArray(matrix[r]) ? matrix[r] : [matrix[r]];
      for (var c = 0; c < rowValues.length; c++) {
        var targetRow = baseRow + r;
        var targetCol = baseCol + c;
        if (targetRow < 1 || targetCol < 1) continue;
        var targetCellId = this.columnIndexToLabel(targetCol) + targetRow;
        this.storageService.setCellValue(
          sheetId,
          targetCellId,
          String(rowValues[c] == null ? '' : rowValues[c]),
          { generatedBy: sourceKey },
        );
      }
    }
  },

  getGridBounds() {
    var maxRow = 1;
    var maxCol = 1;
    for (var i = 0; i < this.cellIds.length; i++) {
      var parsed = this.parseCellId(this.cellIds[i]);
      if (!parsed) continue;
      if (parsed.row > maxRow) maxRow = parsed.row;
      if (parsed.col > maxCol) maxCol = parsed.col;
    }
    if (
      this.storageService &&
      typeof this.storageService.listAllCellIds === 'function'
    ) {
      var refs = this.storageService.listAllCellIds();
      for (var s = 0; s < refs.length; s++) {
        var match = /^([A-Za-z]+)([0-9]+)$/.exec(
          String((refs[s] && refs[s].cellId) || '').toUpperCase(),
        );
        if (!match) continue;
        var col = this.columnLabelToIndex(String(match[1]).toUpperCase());
        var row = parseInt(match[2], 10);
        if (row > maxRow) maxRow = row;
        if (col > maxCol) maxCol = col;
      }
    }
    return { maxRow: maxRow, maxCol: maxCol };
  },

  prepareAIPrompt(sheetId, text, stack, options) {
    var rawText = String(text == null ? '' : text);
    var mentionOptions = Object.assign({}, options || {}, {
      aiPromptPreferDisplay: true,
    });
    var channelLabels = extractChannelMentionLabels(rawText);
    for (var c = 0; c < channelLabels.length; c++) {
      if (typeof this.recordDependencyChannel === 'function') {
        this.recordDependencyChannel(options, channelLabels[c]);
      }
    }
    var pattern =
      /@@(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)|@@(_?)([A-Za-z_][A-Za-z0-9_]*)/g;
    var contextLines = [];
    var cursor = 0;
    var userParts = [];
    var m;

    while ((m = pattern.exec(rawText))) {
      var idx = m.index;
      if (idx > cursor) userParts.push(rawText.slice(cursor, idx));

      var token = m[0];
      var sheetQuoted = m[1];
      var sheetPlain = m[2];
      var sheetCell = m[3];
      var plainRawPrefix = m[4];
      var plainToken = m[5];
      var value = '';
      var key = '';

      try {
        if (sheetCell) {
          var sheetName = sheetQuoted || sheetPlain || '';
          var refSheetId = this.findSheetIdByName(sheetName);
          if (refSheetId) {
            var refCell = sheetCell.toUpperCase();
            value = this.getMentionValue(
              refSheetId,
              refCell,
              stack,
              mentionOptions,
            );
            key = sheetName + '!' + refCell;
          }
        } else if (plainToken) {
          value = this.getPlainMentionValue(
            sheetId,
            plainToken,
            stack,
            mentionOptions,
            plainRawPrefix === '_',
          );
          key = plainToken;
        }
      } catch (e) {}

      if (key) {
        contextLines.push(
          '- ' + key + ': ' + String(value == null ? '' : value),
        );
      }

      cursor = idx + token.length;
    }

    if (cursor < rawText.length) userParts.push(rawText.slice(cursor));
    var userPrompt = userParts
      .join('')
      .replace(/\s{2,}/g, ' ')
      .trim();
    userPrompt = this.wrapResolvedMentionsForAI(
      sheetId,
      userPrompt,
      stack,
      mentionOptions,
    ).trim();
    userPrompt = this.expandChannelMentionsInPromptText(userPrompt, options)
      .replace(/\s{2,}/g, ' ')
      .trim();
    var imageAttachments =
      mentionOptions && Array.isArray(mentionOptions.aiImageAttachments)
        ? mentionOptions.aiImageAttachments.slice()
        : [];
    var textAttachments =
      mentionOptions && Array.isArray(mentionOptions.aiTextAttachments)
        ? mentionOptions.aiTextAttachments.slice()
        : [];
    var systemPrompt = '';
    if (contextLines.length) {
      systemPrompt = 'Spreadsheet context:\n' + contextLines.join('\n');
    }
    var channelAttachmentSystemPrompt = this.buildChannelAttachmentSystemPrompt(
      channelLabels,
      options,
    );
    var attachmentLinks = this.buildChannelAttachmentLinks(
      channelLabels,
      options,
    );
    if (channelAttachmentSystemPrompt) {
      systemPrompt = systemPrompt
        ? systemPrompt + '\n\n' + channelAttachmentSystemPrompt
        : channelAttachmentSystemPrompt;
    }
    return {
      userPrompt: userPrompt,
      systemPrompt: systemPrompt,
      imageAttachments: imageAttachments,
      textAttachments: textAttachments,
      userContent: this.buildAIUserContent(
        userPrompt,
        imageAttachments,
        textAttachments,
      ),
      attachmentLinks: attachmentLinks,
    };
  },
};
