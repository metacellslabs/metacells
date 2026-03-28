import crypto from 'crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  deserializeDocument,
  getDb,
  runInTransaction,
  serializeDocument,
} from './db.js';

function randomId() {
  return crypto.randomBytes(12).toString('hex');
}

function normalizeSelector(query) {
  if (query == null) return {};
  if (typeof query === 'string') return { _id: query };
  return query;
}

function cloneValue(value) {
  return structuredClone(value);
}

function getPathSegments(pathSpec) {
  return String(pathSpec || '')
    .split('.')
    .filter(Boolean);
}

function getValueByPath(doc, pathSpec) {
  const segments = getPathSegments(pathSpec);
  let current = doc;
  for (let index = 0; index < segments.length; index += 1) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = current[segments[index]];
  }
  return current;
}

function setValueByPath(doc, pathSpec, value) {
  const segments = getPathSegments(pathSpec);
  if (!segments.length) return;
  let current = doc;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
      current[key] = {};
    }
    current = current[key];
  }
  current[segments[segments.length - 1]] = value;
}

function unsetValueByPath(doc, pathSpec) {
  const segments = getPathSegments(pathSpec);
  if (!segments.length) return;
  let current = doc;
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (current == null || typeof current !== 'object') {
      return;
    }
    current = current[segments[index]];
  }
  if (current && typeof current === 'object') {
    delete current[segments[segments.length - 1]];
  }
}

function isOperatorObject(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    Object.keys(value).some((key) => key.startsWith('$'))
  );
}

function compareValues(left, right) {
  const normalize = (value) => {
    if (value instanceof Date) return value.getTime();
    return value;
  };
  const a = normalize(left);
  const b = normalize(right);
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a < b ? -1 : 1;
}

function matchesCondition(value, condition) {
  if (!isOperatorObject(condition)) {
    return isDeepStrictEqual(value, condition);
  }

  return Object.entries(condition).every(([operator, expected]) => {
    switch (operator) {
      case '$in':
        if (!Array.isArray(expected)) return false;
        if (Array.isArray(value)) {
          return value.some((entry) =>
            expected.some((candidate) => isDeepStrictEqual(entry, candidate)),
          );
        }
        return expected.some((candidate) => isDeepStrictEqual(value, candidate));
      case '$lte':
        return compareValues(value, expected) <= 0;
      case '$lt':
        return compareValues(value, expected) < 0;
      case '$gte':
        return compareValues(value, expected) >= 0;
      case '$gt':
        return compareValues(value, expected) > 0;
      case '$ne':
        return !isDeepStrictEqual(value, expected);
      case '$exists':
        return Boolean(expected) ? value !== undefined : value === undefined;
      default:
        throw new Error(`Unsupported query operator: ${operator}`);
    }
  });
}

function matchesQuery(doc, query) {
  const selector = normalizeSelector(query);
  return Object.entries(selector).every(([key, expected]) => {
    if (key === '$or') {
      return Array.isArray(expected) && expected.some((entry) => matchesQuery(doc, entry));
    }
    if (key === '$and') {
      return Array.isArray(expected) && expected.every((entry) => matchesQuery(doc, entry));
    }
    return matchesCondition(getValueByPath(doc, key), expected);
  });
}

function applyProjection(doc, fields) {
  if (!fields) return cloneValue(doc);
  const entries = Object.entries(fields);
  const includeEntries = entries.filter(([, value]) => Boolean(value));
  const excludeId = Object.prototype.hasOwnProperty.call(fields, '_id') && !fields._id;

  if (!includeEntries.length) {
    if (!excludeId) return cloneValue(doc);
    const copy = cloneValue(doc);
    delete copy._id;
    return copy;
  }

  const projected = {};
  if (!excludeId && Object.prototype.hasOwnProperty.call(doc, '_id')) {
    projected._id = cloneValue(doc._id);
  }

  includeEntries.forEach(([key]) => {
    const value = getValueByPath(doc, key);
    if (value !== undefined) {
      setValueByPath(projected, key, cloneValue(value));
    }
  });
  return projected;
}

function applySort(docs, sortSpec = {}) {
  const sortEntries = Object.entries(sortSpec);
  if (!sortEntries.length) return docs;

  return docs.sort((left, right) => {
    for (let index = 0; index < sortEntries.length; index += 1) {
      const [key, direction] = sortEntries[index];
      const comparison = compareValues(getValueByPath(left, key), getValueByPath(right, key));
      if (comparison !== 0) {
        return direction < 0 ? -comparison : comparison;
      }
    }
    return 0;
  });
}

function buildUpsertDocument(query) {
  const selector = normalizeSelector(query);
  const doc = {};
  Object.entries(selector).forEach(([key, value]) => {
    if (key.startsWith('$') || isOperatorObject(value)) return;
    setValueByPath(doc, key, cloneValue(value));
  });
  if (!doc._id) {
    doc._id = randomId();
  }
  return doc;
}

function applyUpdateOperators(targetDoc, update, { isUpsert = false } = {}) {
  const nextDoc = cloneValue(targetDoc);
  const hasOperators = Object.keys(update || {}).some((key) => key.startsWith('$'));

  if (!hasOperators) {
    const replacement = cloneValue(update || {});
    if (!replacement._id) {
      replacement._id = nextDoc._id || randomId();
    }
    return replacement;
  }

  Object.entries(update || {}).forEach(([operator, payload]) => {
    switch (operator) {
      case '$set':
        Object.entries(payload || {}).forEach(([key, value]) => {
          setValueByPath(nextDoc, key, cloneValue(value));
        });
        break;
      case '$unset':
        Object.keys(payload || {}).forEach((key) => {
          unsetValueByPath(nextDoc, key);
        });
        break;
      case '$inc':
        Object.entries(payload || {}).forEach(([key, value]) => {
          const current = getValueByPath(nextDoc, key);
          const base = typeof current === 'number' ? current : 0;
          setValueByPath(nextDoc, key, base + Number(value || 0));
        });
        break;
      case '$setOnInsert':
        if (isUpsert) {
          Object.entries(payload || {}).forEach(([key, value]) => {
            setValueByPath(nextDoc, key, cloneValue(value));
          });
        }
        break;
      default:
        throw new Error(`Unsupported update operator: ${operator}`);
    }
  });

  if (!nextDoc._id) {
    nextDoc._id = randomId();
  }
  return nextDoc;
}

function loadCollectionDocs(collectionName) {
  const rows = getDb()
    .prepare('SELECT id, doc FROM documents WHERE collection_name = ?')
    .all(collectionName);
  return rows.map((row) => deserializeDocument(row.doc));
}

function writeDocument(collectionName, doc) {
  const nextDoc = cloneValue(doc);
  if (!nextDoc._id) nextDoc._id = randomId();
  getDb()
    .prepare(`
      INSERT INTO documents (collection_name, id, doc)
      VALUES (?, ?, ?)
      ON CONFLICT(collection_name, id)
      DO UPDATE SET doc = excluded.doc
    `)
    .run(collectionName, String(nextDoc._id), serializeDocument(nextDoc));
  return nextDoc;
}

function removeDocument(collectionName, id) {
  return getDb()
    .prepare('DELETE FROM documents WHERE collection_name = ? AND id = ?')
    .run(collectionName, String(id)).changes;
}

class SqliteCursor {
  constructor(collectionName, query, opts) {
    this._collectionName = collectionName;
    this._query = normalizeSelector(query);
    this._opts = { ...(opts || {}) };
  }

  _resolveDocuments() {
    let docs = loadCollectionDocs(this._collectionName).filter((doc) =>
      matchesQuery(doc, this._query),
    );
    docs = applySort(docs, this._opts.sort || {});
    if (this._opts.skip) {
      docs = docs.slice(this._opts.skip);
    }
    if (this._opts.limit) {
      docs = docs.slice(0, this._opts.limit);
    }
    return docs.map((doc) => applyProjection(doc, this._opts.fields));
  }

  async fetchAsync() {
    return this._resolveDocuments();
  }

  async countAsync() {
    return loadCollectionDocs(this._collectionName).filter((doc) =>
      matchesQuery(doc, this._query),
    ).length;
  }

  async forEachAsync(fn) {
    const docs = this._resolveDocuments();
    for (const doc of docs) {
      await fn(doc);
    }
  }

  sort(spec) {
    this._opts.sort = spec;
    return this;
  }

  limit(n) {
    this._opts.limit = n;
    return this;
  }
}

class RawCollection {
  constructor(collectionName) {
    this._collectionName = collectionName;
  }

  async findOneAndUpdate(query, update, options = {}) {
    return runInTransaction(() => {
      let docs = loadCollectionDocs(this._collectionName).filter((doc) =>
        matchesQuery(doc, normalizeSelector(query)),
      );
      docs = applySort(docs, options.sort || {});
      const currentDoc = docs[0] || null;

      if (!currentDoc) {
        if (!options.upsert) {
          return { value: null };
        }
        const inserted = writeDocument(
          this._collectionName,
          applyUpdateOperators(buildUpsertDocument(query), update, { isUpsert: true }),
        );
        return { value: cloneValue(inserted) };
      }

      const updatedDoc = writeDocument(
        this._collectionName,
        applyUpdateOperators(currentDoc, update),
      );

      if (options.returnDocument === 'before') {
        return { value: cloneValue(currentDoc) };
      }
      return { value: cloneValue(updatedDoc) };
    });
  }
}

export class Collection {
  constructor(name) {
    this._name = name;
  }

  async findOneAsync(query, opts) {
    const selector = normalizeSelector(query);
    const docs = loadCollectionDocs(this._name).filter((doc) => matchesQuery(doc, selector));
    return docs.length ? applyProjection(docs[0], opts && opts.fields) : null;
  }

  async insertAsync(doc) {
    const nextDoc = cloneValue(doc || {});
    if (!nextDoc._id) nextDoc._id = randomId();
    writeDocument(this._name, nextDoc);
    return nextDoc._id;
  }

  async updateAsync(query, update, opts = {}) {
    return runInTransaction(() => {
      const selector = normalizeSelector(query);
      const allDocs = loadCollectionDocs(this._name);
      const matchedDocs = allDocs.filter((doc) => matchesQuery(doc, selector));

      if (!matchedDocs.length) {
        if (!opts.upsert) {
          return 0;
        }
        writeDocument(
          this._name,
          applyUpdateOperators(buildUpsertDocument(selector), update, { isUpsert: true }),
        );
        return 1;
      }

      const docsToUpdate = opts.multi ? matchedDocs : matchedDocs.slice(0, 1);
      docsToUpdate.forEach((doc) => {
        writeDocument(this._name, applyUpdateOperators(doc, update));
      });
      return docsToUpdate.length;
    });
  }

  async upsertAsync(query, update) {
    return this.rawCollection().findOneAndUpdate(query, update, {
      upsert: true,
      returnDocument: 'after',
    });
  }

  async removeAsync(query) {
    return runInTransaction(() => {
      const selector = normalizeSelector(query);
      const docs = loadCollectionDocs(this._name).filter((doc) => matchesQuery(doc, selector));
      docs.forEach((doc) => {
        removeDocument(this._name, doc._id);
      });
      return docs.length;
    });
  }

  find(query, opts) {
    return new SqliteCursor(this._name, query, opts || {});
  }

  rawCollection() {
    return new RawCollection(this._name);
  }
}
