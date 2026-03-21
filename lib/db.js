import { MongoClient } from 'mongodb';

let db = null;
let client = null;

export async function connectToDatabase(url) {
  if (db) return db;
  client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db();
  console.log('[db] connected to', url.replace(/\/\/[^@]*@/, '//***@'));
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not connected. Call connectToDatabase() first.');
  return db;
}

export async function closeDatabase() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
