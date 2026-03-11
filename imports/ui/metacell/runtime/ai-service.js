// Description: LM Studio integration with auto/manual refresh control for askAI and listAI formulas.
import { AI_MODE } from './constants.js';
import { Meteor } from 'meteor/meteor';
import {
  AI_LIST_DELIMITER,
  buildListSystemPrompt,
  buildTableSystemPrompt,
} from './ai-prompts.js';
import { buildAttachmentLinksMarkdown } from '../../../api/channels/mentioning.js';

var SHARED_AI_PENDING = {};

export class AIService {
  constructor(storageService, onInvalidate, queueContext) {
    this.storageService = storageService;
    if (!this.storageService) {
      throw new Error('AIService requires a storage-backed StorageService');
    }
    var context = queueContext || {};
    this.onInvalidate = onInvalidate;
    this.sheetDocumentId = String(context.sheetDocumentId || '');
    this.getQueueActiveSheetId =
      typeof context.getActiveSheetId === 'function'
        ? context.getActiveSheetId
        : function () {
            return '';
          };
    this.cache = {};
    this.pending = {};
    this.model = null;
    this.manualTrigger = false;
    this.forceRefresh = false;
    this.suppressRequests = false;
    this.editDraftLocked = false;
    this.autoDebounceMs = 1000;
    this.autoDebounceTimer = null;
    this.autoDebounceActive = false;
    this.queuedAutoRequests = {};
    this.urlContentCacheTTLms = 3 * 24 * 60 * 60 * 1000;
  }

  buildQueueMeta(meta) {
    var source = meta || {};
    var activeSheetId = '';
    try {
      activeSheetId = String(this.getQueueActiveSheetId() || '');
    } catch (e) {}
    return {
      ...source,
      sheetDocumentId: this.sheetDocumentId,
      activeSheetId: activeSheetId,
      sourceCellId: String(source.sourceCellId || ''),
      formulaKind: String(source.formulaKind || ''),
    };
  }

  getMode() {
    return this.storageService.getAIMode();
  }

  setMode(mode) {
    this.storageService.setAIMode(mode);
    if (mode !== AI_MODE.auto) {
      this.autoDebounceActive = false;
      this.queuedAutoRequests = {};
      if (this.autoDebounceTimer) clearTimeout(this.autoDebounceTimer);
      this.autoDebounceTimer = null;
    }
  }

  notifyActiveCellChanged() {
    if (this.getMode() !== AI_MODE.auto) return;
    this.autoDebounceActive = true;
    if (this.autoDebounceTimer) clearTimeout(this.autoDebounceTimer);

    this.autoDebounceTimer = setTimeout(() => {
      this.autoDebounceTimer = null;
      this.autoDebounceActive = false;
      this.flushQueuedAutoRequests();
    }, this.autoDebounceMs);
  }

  withManualTrigger(fn) {
    this.manualTrigger = true;
    try {
      return fn();
    } finally {
      this.manualTrigger = false;
    }
  }

  withForcedRefresh(fn) {
    var previous = this.forceRefresh;
    this.forceRefresh = true;
    try {
      return fn();
    } finally {
      this.forceRefresh = previous;
    }
  }

  withRequestsSuppressed(fn) {
    var previous = this.suppressRequests;
    this.suppressRequests = true;
    try {
      return fn();
    } finally {
      this.suppressRequests = previous;
    }
  }

  setEditDraftLock(locked) {
    this.editDraftLocked = !!locked;
    if (!this.editDraftLocked) return;
    this.autoDebounceActive = false;
    this.queuedAutoRequests = {};
    if (this.autoDebounceTimer) clearTimeout(this.autoDebounceTimer);
    this.autoDebounceTimer = null;
  }

  ask(text, options) {
    var prompt = String(text == null ? '' : text);
    var opts = options || {};
    var systemPrompt = String(
      opts.systemPrompt == null ? '' : opts.systemPrompt,
    );
    var cacheKey = 'AI_CACHE:' + systemPrompt + '\n---\n' + prompt;
    var cached = this.loadCache(cacheKey);
    var mode = this.getMode();
    var requestForced = !!opts.forceRefresh;
    var suppressionBlocked =
      (this.suppressRequests || this.editDraftLocked) && !requestForced;
    var shouldRequest =
      (mode === AI_MODE.auto || this.manualTrigger || requestForced) &&
      !suppressionBlocked;
    var forceRefresh =
      requestForced || mode === AI_MODE.manual || this.forceRefresh;

    if (shouldRequest) {
      if (mode === AI_MODE.auto && this.autoDebounceActive && !forceRefresh) {
        this.queuedAutoRequests[cacheKey] = {
          kind: 'ask',
          prompt: prompt,
          cacheKey: cacheKey,
          systemPrompt: systemPrompt,
          userContent: opts.userContent,
          queueMeta: this.buildQueueMeta(opts.queueMeta),
        };
      } else {
        this.requestAsk(
          prompt,
          cacheKey,
          forceRefresh,
          systemPrompt,
          opts.userContent,
          this.buildQueueMeta(opts.queueMeta),
        );
      }
    }

    if (typeof cached !== 'undefined') return cached;
    return mode === AI_MODE.manual ? '(manual: click Update)' : '...';
  }

  list(text, count, onResult, options) {
    var prompt = String(text == null ? '' : text);
    var total = parseInt(count, 10);
    if (isNaN(total) || total < 1) total = 5;
    if (total > 50) total = 50;
    var opts = options || {};
    var systemPrompt = String(
      opts.systemPrompt == null ? '' : opts.systemPrompt,
    );

    var cacheKey =
      'AI_LIST_CACHE:' + total + ':' + systemPrompt + '\n---\n' + prompt;
    var cached = this.loadListCache(cacheKey);
    if (cached && cached.length && typeof onResult === 'function') {
      onResult(cached);
    }
    var mode = this.getMode();
    var requestForced = !!opts.forceRefresh;
    var suppressionBlocked =
      (this.suppressRequests || this.editDraftLocked) && !requestForced;
    var shouldRequest =
      (mode === AI_MODE.auto || this.manualTrigger || requestForced) &&
      !suppressionBlocked;
    var forceRefresh =
      requestForced || mode === AI_MODE.manual || this.forceRefresh;

    if (shouldRequest) {
      if (mode === AI_MODE.auto && this.autoDebounceActive && !forceRefresh) {
        this.queuedAutoRequests[cacheKey] = {
          kind: 'list',
          prompt: prompt,
          count: total,
          cacheKey: cacheKey,
          onResult: onResult,
          systemPrompt: systemPrompt,
          userContent: opts.userContent,
          queueMeta: this.buildQueueMeta(opts.queueMeta),
        };
      } else {
        this.requestList(
          prompt,
          total,
          cacheKey,
          forceRefresh,
          onResult,
          systemPrompt,
          opts.userContent,
          this.buildQueueMeta(opts.queueMeta),
        );
      }
    }

    if (cached && cached.length) return cached[0];
    return mode === AI_MODE.manual ? '(manual: click Update)' : '...';
  }

  askDirect(text) {
    var prompt = String(text == null ? '' : text).trim();
    if (!prompt) return Promise.resolve('');
    return this.requestChat([{ role: 'user', content: prompt }]).then(
      (content) => {
        return String(content || '').trim() || '(empty response)';
      },
    );
  }

  askTable(text, colsLimit, rowsLimit, options) {
    var prompt = String(text == null ? '' : text).trim();
    if (!prompt) return Promise.resolve([]);
    var opts = options || {};

    var cols = parseInt(colsLimit, 10);
    var rows = parseInt(rowsLimit, 10);
    if (isNaN(cols) || cols < 1) cols = null;
    if (isNaN(rows) || rows < 1) rows = null;

    var tableInstruction = buildTableSystemPrompt(cols, rows);
    var messages = [];
    if (opts.systemPrompt)
      messages.push({ role: 'system', content: String(opts.systemPrompt) });
    messages.push({ role: 'system', content: tableInstruction });
    messages.push({ role: 'user', content: opts.userContent || prompt });

    return this.requestChat(messages, this.buildQueueMeta(opts.queueMeta)).then(
      (content) => {
        return this.parseTableResponse(String(content || ''), cols, rows);
      },
    );
  }

  buildUserMessageContent(prompt, userContent) {
    if (!Array.isArray(userContent) || !userContent.length) {
      return String(prompt == null ? '' : prompt);
    }
    var text = String(prompt == null ? '' : prompt);
    var parts = [];
    var replacedText = false;
    for (var i = 0; i < userContent.length; i++) {
      var part = userContent[i];
      if (!part || typeof part !== 'object') continue;
      if (part.type === 'text') {
        parts.push({
          type: 'text',
          text: replacedText
            ? String(part.text == null ? '' : part.text)
            : text,
        });
        replacedText = true;
        continue;
      }
      if (part.type === 'image_url' && part.image_url && part.image_url.url) {
        parts.push({
          type: 'image_url',
          image_url: {
            url: String(part.image_url.url || ''),
          },
        });
      }
    }
    if (!replacedText && text) {
      parts.unshift({ type: 'text', text: text });
    }
    return parts.length ? parts : text;
  }

  loadCache(cacheKey) {
    if (Object.prototype.hasOwnProperty.call(this.cache, cacheKey))
      return this.cache[cacheKey];
    var stored = this.storageService.getCacheValue(cacheKey);
    if (typeof stored !== 'undefined') {
      this.cache[cacheKey] = stored;
      return stored;
    }
  }

  loadListCache(cacheKey) {
    var value = this.loadCache(cacheKey);
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return;

    try {
      var parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        this.cache[cacheKey] = parsed;
        return parsed;
      }
    } catch (e) {}
  }

  flushQueuedAutoRequests() {
    var queued = this.queuedAutoRequests;
    this.queuedAutoRequests = {};

    for (var cacheKey in queued) {
      if (!Object.prototype.hasOwnProperty.call(queued, cacheKey)) continue;
      var task = queued[cacheKey];
      if (task.kind === 'list') {
        this.requestList(
          task.prompt,
          task.count,
          task.cacheKey,
          false,
          task.onResult,
          task.systemPrompt,
          task.userContent,
          task.queueMeta,
        );
      } else {
        this.requestAsk(
          task.prompt,
          task.cacheKey,
          false,
          task.systemPrompt,
          task.userContent,
          task.queueMeta,
        );
      }
    }
  }

  hasInFlightWork() {
    if (this.editDraftLocked) return false;
    if (this.autoDebounceActive) return true;

    for (var p in this.pending) {
      if (Object.prototype.hasOwnProperty.call(this.pending, p)) return true;
    }
    for (var q in this.queuedAutoRequests) {
      if (Object.prototype.hasOwnProperty.call(this.queuedAutoRequests, q))
        return true;
    }
    return false;
  }

  isSourceCellPending(queueMeta) {
    var meta = queueMeta || {};
    var sheetId = String(meta.activeSheetId || '');
    var cellId = String(meta.sourceCellId || '').toUpperCase();
    if (!sheetId || !cellId) return false;
    var state = '';
    if (
      this.storageService &&
      typeof this.storageService.getCellState === 'function'
    ) {
      state = String(this.storageService.getCellState(sheetId, cellId) || '');
    }
    return state === 'pending';
  }

  appendAttachmentLinksToAnswer(answer, queueMeta) {
    var meta = queueMeta && typeof queueMeta === 'object' ? queueMeta : {};
    var links = Array.isArray(meta.attachmentLinks) ? meta.attachmentLinks : [];
    if (!links.length) return String(answer == null ? '' : answer);
    var markdown = buildAttachmentLinksMarkdown(links);
    if (!markdown) return String(answer == null ? '' : answer);
    var text = String(answer == null ? '' : answer).trim();
    if (!text) return markdown;
    return text + '\n\n' + markdown;
  }

  requestAsk(
    prompt,
    cacheKey,
    forceRefresh,
    systemPrompt,
    userContent,
    queueMeta,
  ) {
    if (this.pending[cacheKey] || SHARED_AI_PENDING[cacheKey]) {
      return;
    }

    if (!forceRefresh) {
      var existing = this.loadCache(cacheKey);
      if (typeof existing !== 'undefined') {
        return;
      }
    }

    this.pending[cacheKey] = true;
    SHARED_AI_PENDING[cacheKey] = true;

    var done = () => {
      delete this.pending[cacheKey];
      delete SHARED_AI_PENDING[cacheKey];
      this.onInvalidate(queueMeta || null);
    };

    var messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({
      role: 'user',
      content: this.buildUserMessageContent(prompt, userContent),
    });

    this.enrichPromptWithFetchedUrls(prompt)
      .then((finalPrompt) => {
        messages[messages.length - 1] = {
          role: 'user',
          content: this.buildUserMessageContent(finalPrompt, userContent),
        };
        return this.requestChat(messages, queueMeta);
      })
      .then((content) => {
        var answer = this.appendAttachmentLinksToAnswer(
          String(content || '').trim() || '(empty response)',
          queueMeta,
        );
        this.cache[cacheKey] = answer;
        this.storageService.setCacheValue(cacheKey, answer);
        done();
      })
      .catch((err) => {
        this.cache[cacheKey] = '#AI_ERROR: ' + err.message;
        done();
      });
  }

  requestList(
    prompt,
    count,
    cacheKey,
    forceRefresh,
    onResult,
    systemPrompt,
    userContent,
    queueMeta,
  ) {
    if (this.pending[cacheKey] || SHARED_AI_PENDING[cacheKey]) {
      return;
    }

    if (!forceRefresh) {
      var existing = this.loadListCache(cacheKey);
      if (existing && existing.length) {
        return;
      }
    }

    this.pending[cacheKey] = true;
    SHARED_AI_PENDING[cacheKey] = true;

    var done = () => {
      delete this.pending[cacheKey];
      delete SHARED_AI_PENDING[cacheKey];
      this.onInvalidate(queueMeta || null);
    };

    var listSystemPrompt = buildListSystemPrompt(count, AI_LIST_DELIMITER);
    var messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'system', content: listSystemPrompt });
    messages.push({
      role: 'user',
      content: this.buildUserMessageContent(prompt, userContent),
    });

    this.enrichPromptWithFetchedUrls(prompt)
      .then((finalPrompt) => {
        messages[messages.length - 1] = {
          role: 'user',
          content: this.buildUserMessageContent(finalPrompt, userContent),
        };
        return this.requestChat(messages, queueMeta);
      })
      .then((content) => {
        var enriched = this.appendAttachmentLinksToAnswer(
          String(content || ''),
          queueMeta,
        );
        var options = this.parseListOptions(enriched, count);
        this.cache[cacheKey] = options;
        this.storageService.setCacheValue(cacheKey, JSON.stringify(options));
        if (typeof onResult === 'function') onResult(options);
        done();
      })
      .catch((err) => {
        this.cache[cacheKey] = ['#AI_ERROR: ' + err.message];
        if (typeof onResult === 'function') onResult(this.cache[cacheKey]);
        done();
      });
  }

  extractPromptUrls(text) {
    var source = String(text == null ? '' : text);
    var rawMatches = source.match(/https?:\/\/[^\s<>"')\]>]+/g) || [];
    var unique = {};
    var urls = [];

    for (var i = 0; i < rawMatches.length; i++) {
      var url = rawMatches[i].replace(/[>\])]+$/, '').replace(/[.,;!?]+$/, '');
      if (!url) continue;
      if (unique[url]) continue;
      unique[url] = true;
      urls.push(url);
    }

    return urls;
  }

  htmlToMarkdown(html) {
    var text = String(html == null ? '' : html);
    var TurndownCtor =
      typeof window !== 'undefined' ? window.TurndownService : null;
    if (TurndownCtor) {
      try {
        var turndownService = new TurndownCtor();
        return turndownService.turndown(text);
      } catch (e) {}
    }

    return text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  fetchUrlAsMarkdown(url) {
    var cached = this.readUrlMarkdownCache(url);
    if (cached) return Promise.resolve(cached);

    return Meteor.callAsync('ai.fetchUrlMarkdown', url).then((markdown) => {
      markdown = this.htmlToMarkdown(markdown);
      var maxChars = 50000;
      var finalMarkdown =
        markdown.length > maxChars ? markdown.slice(0, maxChars) : markdown;
      this.writeUrlMarkdownCache(url, finalMarkdown);
      return finalMarkdown;
    });
  }

  urlMarkdownCacheKey(url) {
    return 'AI_URL_MD_CACHE:' + String(url || '');
  }

  readUrlMarkdownCache(url) {
    var key = this.urlMarkdownCacheKey(url);
    var raw = this.storageService.getCacheValue(key);
    if (!raw) return '';
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return '';
      var ts = parseInt(parsed.ts, 10);
      var markdown = String(parsed.markdown == null ? '' : parsed.markdown);
      if (!ts || !markdown) return '';
      if (Date.now() - ts > this.urlContentCacheTTLms) {
        this.storageService.removeCacheValue(key);
        return '';
      }
      return markdown;
    } catch (e) {
      this.storageService.removeCacheValue(key);
      return '';
    }
  }

  writeUrlMarkdownCache(url, markdown) {
    var key = this.urlMarkdownCacheKey(url);
    var payload = {
      ts: Date.now(),
      markdown: String(markdown == null ? '' : markdown),
    };
    try {
      this.storageService.setCacheValue(key, JSON.stringify(payload));
    } catch (e) {}
  }

  enrichPromptWithFetchedUrls(prompt) {
    var source = String(prompt == null ? '' : prompt);
    var urls = this.extractPromptUrls(source);
    if (!urls.length) return Promise.resolve(source);

    var basePrompt = source;
    for (var i = 0; i < urls.length; i++) {
      var escaped = urls[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      basePrompt = basePrompt.replace(
        new RegExp('<\\s*' + escaped + '\\s*>|' + escaped, 'g'),
        '',
      );
    }
    basePrompt = basePrompt.replace(/\s{2,}/g, ' ').trim();

    var tasks = urls.map((url) => {
      return this.fetchUrlAsMarkdown(url)
        .then((markdown) => {
          return {
            url: url,
            markdown: String(markdown || '').trim(),
          };
        })
        .catch(() => {
          return {
            url: url,
            markdown: '',
          };
        });
    });

    return Promise.all(tasks).then((results) => {
      var blocks = [];
      for (var j = 0; j < results.length; j++) {
        if (!results[j].markdown) continue;
        blocks.push(
          '<CONTENT START>\n' + results[j].markdown + '\n<CONTENT END>',
        );
      }
      if (!blocks.length) return source;
      return (basePrompt || source) + '\n\n' + blocks.join('\n\n');
    });
  }

  parseListOptions(text, count) {
    var source = String(text || '');
    var lines =
      source.indexOf(AI_LIST_DELIMITER) !== -1
        ? source.split(AI_LIST_DELIMITER)
        : source.split(/\r?\n/);
    var options = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      line = line
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .trim();
      if (!line) continue;
      options.push(line);
    }

    if (!options[0]) {
      var fallback = source
        .split(/[;,]/)
        .map(function (part) {
          return part.trim();
        })
        .filter(Boolean);
      if (fallback.length) {
        options = fallback;
      }
    }

    return options;
  }

  parseTableResponse(text, colsLimit, rowsLimit) {
    var lines = String(text || '')
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
    var tableLines = lines.filter(function (line) {
      return /\|/.test(line);
    });
    var source = tableLines.length ? tableLines : lines;

    var rows = [];
    for (var i = 0; i < source.length; i++) {
      var line = source[i];
      if (/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line))
        continue;
      if (!/\|/.test(line)) continue;
      var row = line;
      if (row.charAt(0) === '|') row = row.substring(1);
      if (row.charAt(row.length - 1) === '|')
        row = row.substring(0, row.length - 1);
      var cells = row.split('|').map(function (cell) {
        return cell.trim();
      });
      if (cells.length) rows.push(cells);
    }

    if (!rows.length) {
      rows = source
        .map(function (line) {
          return String(line || '')
            .split(/\t|,/)
            .map(function (cell) {
              return cell.trim();
            })
            .filter(function (cell) {
              return cell !== '';
            });
        })
        .filter(function (r) {
          return r.length > 0;
        });
    }

    if (colsLimit) {
      rows = rows.map(function (r) {
        return r.slice(0, colsLimit);
      });
    }
    if (rowsLimit) {
      rows = rows.slice(0, rowsLimit);
    }
    return rows;
  }

  requestChat(messages, queueMeta) {
    return Meteor.callAsync('ai.requestChat', messages, queueMeta || null);
  }

  getModel() {
    if (this.model) return Promise.resolve(this.model);

    return Meteor.callAsync('ai.getModel')
      .then((model) => {
        this.model = model || 'local-model';
        return this.model;
      })
      .catch(() => {
        this.model = 'local-model';
        return this.model;
      });
  }
}
