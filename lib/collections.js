import { getDb } from './db.js';
import crypto from 'crypto';

function randomId() {
  return crypto.randomBytes(12).toString('hex');
}

function normalizeSelector(query) {
  if (query == null) return {};
  if (typeof query === 'string') return { _id: query };
  return query;
}

class FindCursor {
  constructor(col, query, opts) {
    const options = {};
    if (opts.fields) options.projection = opts.fields;
    let cursor = col.find(normalizeSelector(query), options);
    if (opts.sort) cursor = cursor.sort(opts.sort);
    if (opts.skip) cursor = cursor.skip(opts.skip);
    if (opts.limit) cursor = cursor.limit(opts.limit);
    this._cursor = cursor;
    this._col = col;
    this._query = query;
  }

  async fetchAsync() {
    return this._cursor.toArray();
  }

  async countAsync() {
    return this._col.countDocuments(this._query);
  }

  async forEachAsync(fn) {
    const docs = await this._cursor.toArray();
    for (const doc of docs) {
      await fn(doc);
    }
  }

  sort(spec) {
    this._cursor = this._cursor.sort(spec);
    return this;
  }

  limit(n) {
    this._cursor = this._cursor.limit(n);
    return this;
  }
}

export class Collection {
  constructor(name) {
    this._name = name;
  }

  _col() {
    return getDb().collection(this._name);
  }

  async findOneAsync(query, opts) {
    const options = {};
    if (opts && opts.fields) options.projection = opts.fields;
    return this._col().findOne(normalizeSelector(query), options);
  }

  async insertAsync(doc) {
    if (!doc._id) doc._id = randomId();
    await this._col().insertOne(doc);
    return doc._id;
  }

  async updateAsync(query, update, opts) {
    const result = await this._col().updateOne(normalizeSelector(query), update, opts);
    return result.modifiedCount;
  }

  async upsertAsync(query, update) {
    return this._col().updateOne(normalizeSelector(query), update, { upsert: true });
  }

  async removeAsync(query) {
    const result = await this._col().deleteOne(normalizeSelector(query));
    return result.deletedCount;
  }

  find(query, opts) {
    return new FindCursor(this._col(), normalizeSelector(query), opts || {});
  }

  rawCollection() {
    return this._col();
  }
}
