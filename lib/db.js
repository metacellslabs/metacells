import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

let db = null;
let dbPath = '';

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function encodeForStorage(value) {
  if (value instanceof Date) {
    return { __metacellsDate: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => encodeForStorage(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, encodeForStorage(entry)]),
    );
  }
  return value;
}

export function decodeFromStorage(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => decodeFromStorage(entry));
  }
  if (value && typeof value === 'object') {
    if (
      Object.keys(value).length === 1 &&
      typeof value.__metacellsDate === 'string'
    ) {
      return new Date(value.__metacellsDate);
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, decodeFromStorage(entry)]),
    );
  }
  return value;
}

export function serializeDocument(doc) {
  return JSON.stringify(encodeForStorage(doc));
}

export function deserializeDocument(text) {
  return decodeFromStorage(JSON.parse(text));
}

function initializeSchema(database) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS documents (
      collection_name TEXT NOT NULL,
      id TEXT NOT NULL,
      doc TEXT NOT NULL,
      PRIMARY KEY (collection_name, id)
    );
    CREATE INDEX IF NOT EXISTS documents_collection_idx
      ON documents (collection_name);
  `);
}

export async function connectToDatabase(filename) {
  if (db) return db;
  dbPath = path.resolve(String(filename || 'metacells.db'));
  ensureParentDir(dbPath);
  db = new DatabaseSync(dbPath);
  initializeSchema(db);
  console.log('[db] connected to sqlite', dbPath);
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not connected. Call connectToDatabase() first.');
  return db;
}

export function getDbPath() {
  return dbPath;
}

export function runInTransaction(fn, mode = 'IMMEDIATE') {
  const database = getDb();
  database.exec(`BEGIN ${mode}`);
  try {
    const result = fn(database);
    database.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures from already-aborted transactions.
    }
    throw error;
  }
}

export async function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    dbPath = '';
  }
}
