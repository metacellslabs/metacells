import fs from "node:fs/promises";

import JSZip from "jszip";

export async function readZipEntries(filePath) {
  return JSZip.loadAsync(await fs.readFile(filePath));
}

export function listZipFiles(zip, predicate) {
  return Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .filter((entry) => (predicate ? predicate(entry.name) : true));
}

export async function readZipText(zip, entryName) {
  const entry = zip.file(entryName);
  return entry ? entry.async("text") : null;
}

export async function readZipBuffer(zip, entryName) {
  const entry = zip.file(entryName);
  return entry ? Buffer.from(await entry.async("uint8array")) : null;
}
