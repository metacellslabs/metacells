// Description: parser methods extracted from FormulaEngine for smaller logical modules.
export const parserMethods = {
  findSheetIdByName(name) {
    var tabs = this.getTabs();

    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].name === name) return tabs[i].id;
    }

    var target = String(name).toLowerCase();
    for (var j = 0; j < tabs.length; j++) {
      if (tabs[j].name.toLowerCase() === target) return tabs[j].id;
    }
  },

  preprocessFormula(formula, sourceCellId) {
    var withInlineAsk = this.preprocessInlineAskCalls(formula);
    var withUpdateTargets = this.preprocessUpdateTargets(
      withInlineAsk,
      sourceCellId,
    );
    var withRecalcTargets = this.preprocessRecalcTargets(
      withUpdateTargets,
      sourceCellId,
    );
    var withRawAtSheetRegionRefs = withRecalcTargets.replace(
      /_@(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)/g,
      (_, quoted, plain, startCellId, endCellId) => {
        var sheetName = quoted || plain || '';
        return (
          'mentionRawSheetRegionRef("' +
          this.escapeForDoubleQuotedString(sheetName) +
          '","' +
          startCellId.toUpperCase() +
          '","' +
          endCellId.toUpperCase() +
          '")'
        );
      },
    );
    var withAtSheetRegionRefs = withRawAtSheetRegionRefs.replace(
      /@(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)/g,
      (_, quoted, plain, startCellId, endCellId) => {
        var sheetName = quoted || plain || '';
        return (
          'mentionSheetRegionRef("' +
          this.escapeForDoubleQuotedString(sheetName) +
          '","' +
          startCellId.toUpperCase() +
          '","' +
          endCellId.toUpperCase() +
          '")'
        );
      },
    );
    var withRawAtRegionRefs = withAtSheetRegionRefs.replace(
      /_@([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)/g,
      (_, startCellId, endCellId) => {
        return (
          'mentionRawRegionRef("' +
          startCellId.toUpperCase() +
          '","' +
          endCellId.toUpperCase() +
          '")'
        );
      },
    );
    var withAtRegionRefs = withRawAtRegionRefs.replace(
      /@([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)/g,
      (_, startCellId, endCellId) => {
        return (
          'mentionRegionRef("' +
          startCellId.toUpperCase() +
          '","' +
          endCellId.toUpperCase() +
          '")'
        );
      },
    );
    var withRawAtSheetRefs = withAtRegionRefs.replace(
      /_@(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)/g,
      (_, quoted, plain, cellId) => {
        var sheetName = quoted || plain || '';
        return (
          'mentionRawSheetRef("' +
          this.escapeForDoubleQuotedString(sheetName) +
          '","' +
          cellId.toUpperCase() +
          '")'
        );
      },
    );
    var withAtSheetRefs = withRawAtSheetRefs.replace(
      /@(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)/g,
      (_, quoted, plain, cellId) => {
        var sheetName = quoted || plain || '';
        return (
          'mentionSheetRef("' +
          this.escapeForDoubleQuotedString(sheetName) +
          '","' +
          cellId.toUpperCase() +
          '")'
        );
      },
    );
    var withSheetRegionRefs = withAtSheetRefs.replace(
      /(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)/g,
      (_, quoted, plain, startCellId, endCellId) => {
        var sheetName = quoted || plain || '';
        return (
          'sheetRegionRef("' +
          this.escapeForDoubleQuotedString(sheetName) +
          '","' +
          startCellId.toUpperCase() +
          '","' +
          endCellId.toUpperCase() +
          '")'
        );
      },
    );
    var withRegionRefs = withSheetRegionRefs.replace(
      /([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)/g,
      (_, startCellId, endCellId) => {
        return (
          'regionRef("' +
          startCellId.toUpperCase() +
          '","' +
          endCellId.toUpperCase() +
          '")'
        );
      },
    );
    var withSheetRefs = withRegionRefs.replace(
      /(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)/g,
      (_, quoted, plain, cellId) => {
        var sheetName = quoted || plain || '';
        return (
          'sheetRef("' +
          this.escapeForDoubleQuotedString(sheetName) +
          '","' +
          cellId.toUpperCase() +
          '")'
        );
      },
    );
    var withStringMentions =
      this.interpolateMentionsInStringLiterals(withSheetRefs);
    return withStringMentions.replace(
      /(_)?@([A-Za-z_][A-Za-z0-9_]*)/g,
      (_, rawPrefix, token) => {
        var rawMode = rawPrefix === '_';
        if (this.isExistingCellId(token)) {
          return rawMode
            ? 'mentionRawRef("' + token.toUpperCase() + '")'
            : 'mentionRef("' + token.toUpperCase() + '")';
        }
        return rawMode
          ? 'mentionRawNamedRef("' +
              this.escapeForDoubleQuotedString(token) +
              '")'
          : 'mentionNamedRef("' +
              this.escapeForDoubleQuotedString(token) +
              '")';
      },
    );
  },

  preprocessInlineAskCalls(formula) {
    var text = String(formula || '');
    var out = '';
    var i = 0;

    while (i < text.length) {
      if (text.charAt(i) === "'" && text.charAt(i + 1) === '(') {
        var start = i + 2;
        var depth = 1;
        var j = start;
        var quote = '';
        while (j < text.length) {
          var ch = text.charAt(j);
          var prev = j > start ? text.charAt(j - 1) : '';
          if (quote) {
            if (ch === quote && prev !== '\\') quote = '';
            j++;
            continue;
          }
          if (ch === '"' || ch === "'") {
            quote = ch;
            j++;
            continue;
          }
          if (ch === '(') depth++;
          else if (ch === ')') {
            depth--;
            if (depth === 0) break;
          }
          j++;
        }
        if (j >= text.length || depth !== 0) {
          out += text.slice(i);
          break;
        }
        var prompt = text.slice(start, j).trim();
        out += 'askAI("' + this.escapeForDoubleQuotedString(prompt) + '")';
        i = j + 1;
        continue;
      }
      out += text.charAt(i);
      i++;
    }

    return out;
  },

  interpolateMentionsInStringLiterals(formula) {
    var text = String(formula || '');
    var out = '';
    var i = 0;

    while (i < text.length) {
      var ch = text.charAt(i);
      if (ch !== '"' && ch !== "'") {
        out += ch;
        i++;
        continue;
      }

      var quote = ch;
      var j = i + 1;
      var content = '';
      while (j < text.length) {
        var c = text.charAt(j);
        var prev = j > i + 1 ? text.charAt(j - 1) : '';
        if (c === quote && prev !== '\\') break;
        content += c;
        j++;
      }

      if (j >= text.length) {
        out += text.slice(i);
        break;
      }

      out += this.interpolateMentionsInStringContent(content);
      i = j + 1;
    }

    return out;
  },

  interpolateMentionsInStringContent(content) {
    var text = String(content || '');
    var pattern =
      /(_)?@(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)|(_)?@([A-Za-z_][A-Za-z0-9_]*)/g;
    var parts = [];
    var cursor = 0;
    var m;

    while ((m = pattern.exec(text))) {
      var idx = m.index;
      if (idx > 0 && text.charAt(idx - 1) === '@') {
        continue;
      }
      if (idx > cursor) {
        parts.push({ kind: 'text', value: text.slice(cursor, idx) });
      }

      var sheetRawPrefix = m[1];
      var sheetQuoted = m[2];
      var sheetPlain = m[3];
      var sheetCell = m[4];
      var plainRawPrefix = m[5];
      var plainToken = m[6];

      if (sheetCell) {
        var sheetName = sheetQuoted || sheetPlain || '';
        parts.push({
          kind: 'expr',
          value:
            sheetRawPrefix === '_'
              ? 'mentionRawSheetRef("' +
                this.escapeForDoubleQuotedString(sheetName) +
                '","' +
                sheetCell.toUpperCase() +
                '")'
              : 'mentionSheetRef("' +
                this.escapeForDoubleQuotedString(sheetName) +
                '","' +
                sheetCell.toUpperCase() +
                '")',
        });
      } else if (plainToken) {
        var rawMode = plainRawPrefix === '_';
        if (this.isExistingCellId(plainToken)) {
          parts.push({
            kind: 'expr',
            value: rawMode
              ? 'mentionRawRef("' + plainToken.toUpperCase() + '")'
              : 'mentionRef("' + plainToken.toUpperCase() + '")',
          });
        } else {
          parts.push({
            kind: 'expr',
            value: rawMode
              ? 'mentionRawNamedRef("' +
                this.escapeForDoubleQuotedString(plainToken) +
                '")'
              : 'mentionNamedRef("' +
                this.escapeForDoubleQuotedString(plainToken) +
                '")',
          });
        }
      }

      cursor = idx + m[0].length;
    }

    if (cursor < text.length) {
      parts.push({ kind: 'text', value: text.slice(cursor) });
    }

    if (!parts.length) return '""';

    var hasExpr = false;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].kind === 'expr') {
        hasExpr = true;
        break;
      }
    }
    if (!hasExpr) {
      return '"' + this.escapeForDoubleQuotedString(text) + '"';
    }

    return (
      '(' +
      parts
        .map((part) => {
          if (part.kind === 'expr') return 'String(' + part.value + ')';
          return '"' + this.escapeForDoubleQuotedString(part.value) + '"';
        })
        .join('+') +
      ')'
    );
  },

  preprocessUpdateTargets(formula, sourceCellId) {
    var text = String(formula || '');
    var source = String(sourceCellId || '').toUpperCase();
    var result = '';
    var cursor = 0;
    var token = 'update(';

    while (cursor < text.length) {
      var idx = text.toLowerCase().indexOf(token, cursor);
      if (idx === -1) {
        result += text.slice(cursor);
        break;
      }
      var prev = idx > 0 ? text.charAt(idx - 1) : '';
      if (/[A-Za-z0-9_.$]/.test(prev)) {
        result += text.slice(cursor, idx + 1);
        cursor = idx + 1;
        continue;
      }

      result += text.slice(cursor, idx);
      var argsStart = idx + token.length;
      var argsEnd = this.findClosingParen(text, argsStart - 1);
      if (argsEnd === -1) {
        result += text.slice(idx);
        break;
      }

      var argsText = text.slice(argsStart, argsEnd);
      var args = this.splitTopLevelArgs(argsText);
      if (args.length >= 1) {
        args[0] = this.preprocessUpdateTargetArg(args[0], source);
      }

      result += 'update(' + args.join(',') + ')';
      cursor = argsEnd + 1;
    }

    return result;
  },

  preprocessUpdateTargetArg(rawArg, sourceCellId) {
    var value = String(rawArg || '').trim();
    if (!value || /^cell$/i.test(value)) {
      return '"' + sourceCellId + '"';
    }

    var plain = value.charAt(0) === '@' ? value.substring(1).trim() : value;

    var quotedCell =
      /^["']((?:'[^']+'|[A-Za-z][A-Za-z0-9 _-]*)![A-Za-z]+[0-9]+)["']$/.exec(
        value,
      );
    if (quotedCell)
      return '"' + this.escapeForDoubleQuotedString(quotedCell[1]) + '"';

    var quotedLocal = /^["']([A-Za-z]+[0-9]+)["']$/.exec(value);
    if (quotedLocal) return '"' + quotedLocal[1].toUpperCase() + '"';

    var sheetCell =
      /^(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)$/.exec(plain);
    if (sheetCell) {
      var sheetName = sheetCell[1] || sheetCell[2] || '';
      var cellId = sheetCell[3].toUpperCase();
      if (sheetCell[1])
        return (
          '"\'' +
          this.escapeForDoubleQuotedString(sheetName) +
          "'!" +
          cellId +
          '"'
        );
      return (
        '"' + this.escapeForDoubleQuotedString(sheetName) + '!' + cellId + '"'
      );
    }

    var localCell = /^([A-Za-z]+[0-9]+)$/.exec(plain);
    if (localCell) return '"' + localCell[1].toUpperCase() + '"';

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(plain)) return '"' + plain + '"';
    return rawArg;
  },

  preprocessRecalcTargets(formula, sourceCellId) {
    var text = String(formula || '');
    var source = String(sourceCellId || '').toUpperCase();
    var result = '';
    var cursor = 0;
    var token = 'recalc(';

    while (cursor < text.length) {
      var idx = text.toLowerCase().indexOf(token, cursor);
      if (idx === -1) {
        result += text.slice(cursor);
        break;
      }
      var prev = idx > 0 ? text.charAt(idx - 1) : '';
      if (/[A-Za-z0-9_.$]/.test(prev)) {
        result += text.slice(cursor, idx + 1);
        cursor = idx + 1;
        continue;
      }

      result += text.slice(cursor, idx);
      var argsStart = idx + token.length;
      var argsEnd = this.findClosingParen(text, argsStart - 1);
      if (argsEnd === -1) {
        result += text.slice(idx);
        break;
      }

      var argsText = text.slice(argsStart, argsEnd);
      var args = this.splitTopLevelArgs(argsText);
      if (args.length >= 2) {
        args[1] = this.preprocessRecalcTargetArg(args[1], source);
      }

      result += 'recalc(' + args.join(',') + ')';
      cursor = argsEnd + 1;
    }

    return result;
  },

  preprocessRecalcTargetArg(rawArg, sourceCellId) {
    var value = String(rawArg || '').trim();
    if (!value || /^cell$/i.test(value)) {
      return '"' + sourceCellId + '"';
    }

    var quotedMatch = /^["']([A-Za-z]+[0-9]+)["']$/.exec(value);
    if (quotedMatch) {
      return '"' + quotedMatch[1].toUpperCase() + '"';
    }

    var cellMatch = /^([A-Za-z]+[0-9]+)$/.exec(value);
    if (cellMatch) {
      return '"' + cellMatch[1].toUpperCase() + '"';
    }

    return rawArg;
  },

  splitTopLevelArgs(argsText) {
    var text = String(argsText || '');
    var args = [];
    var current = '';
    var depth = 0;
    var quote = '';

    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var prev = i > 0 ? text.charAt(i - 1) : '';

      if (quote) {
        current += ch;
        if (ch === quote && prev !== '\\') quote = '';
        continue;
      }

      if (ch === '"' || ch === "'") {
        quote = ch;
        current += ch;
        continue;
      }

      if (ch === '(') {
        depth++;
        current += ch;
        continue;
      }
      if (ch === ')') {
        if (depth > 0) depth--;
        current += ch;
        continue;
      }
      if (ch === ',' && depth === 0) {
        args.push(current);
        current = '';
        continue;
      }

      current += ch;
    }

    args.push(current);
    return args;
  },

  findClosingParen(text, openParenIndex) {
    var content = String(text || '');
    if (
      openParenIndex < 0 ||
      openParenIndex >= content.length ||
      content.charAt(openParenIndex) !== '('
    )
      return -1;

    var depth = 0;
    var quote = '';
    for (var i = openParenIndex; i < content.length; i++) {
      var ch = content.charAt(i);
      var prev = i > 0 ? content.charAt(i - 1) : '';

      if (quote) {
        if (ch === quote && prev !== '\\') quote = '';
        continue;
      }

      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }

      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) return i;
      }
    }

    return -1;
  },
};
