import { Collection } from './collections.js';

function resolveValue(value, context) {
  return typeof value === 'function' ? value(context) : value;
}

function applyDefaults(input, defaults) {
  const doc = structuredClone(input || {});
  Object.entries(defaults || {}).forEach(([key, value]) => {
    if (doc[key] === undefined) {
      doc[key] = resolveValue(value, doc);
    }
  });
  return doc;
}

export class Model {
  constructor(name, options = {}) {
    this.name = String(name || '').trim();
    if (!this.name) {
      throw new Error('Model requires a non-empty collection name');
    }
    this.collection = new Collection(this.name);
    this.defaults = options.defaults || {};
    this.timestamps = options.timestamps !== false;
  }

  prepareCreate(doc) {
    const nextDoc = applyDefaults(doc, this.defaults);
    if (this.timestamps) {
      const now = new Date();
      if (nextDoc.createdAt === undefined) nextDoc.createdAt = now;
      nextDoc.updatedAt = nextDoc.updatedAt === undefined ? now : nextDoc.updatedAt;
    }
    return nextDoc;
  }

  prepareUpdate(update) {
    const nextUpdate = structuredClone(update || {});
    if (this.timestamps) {
      nextUpdate.$set = nextUpdate.$set || {};
      if (nextUpdate.$set.updatedAt === undefined) {
        nextUpdate.$set.updatedAt = new Date();
      }
    }
    return nextUpdate;
  }

  find(query, opts) {
    return this.collection.find(query, opts);
  }

  async findOneAsync(query, opts) {
    return this.collection.findOneAsync(query, opts);
  }

  async findByIdAsync(id, opts) {
    return this.findOneAsync(id, opts);
  }

  async insertAsync(doc) {
    return this.collection.insertAsync(this.prepareCreate(doc));
  }

  async createAsync(doc) {
    const _id = await this.insertAsync(doc);
    return this.findOneAsync(_id);
  }

  async updateAsync(query, update, opts) {
    return this.collection.updateAsync(query, this.prepareUpdate(update), opts);
  }

  async upsertAsync(query, update) {
    return this.collection.upsertAsync(query, this.prepareUpdate(update));
  }

  async removeAsync(query) {
    return this.collection.removeAsync(query);
  }

  rawCollection() {
    return this.collection.rawCollection();
  }
}

export function defineModel(name, options = {}) {
  return new Model(name, options);
}
