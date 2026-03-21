import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getRegisteredFormulaManifest } from '../../ui/metacell/runtime/formulas/index.js';

function getAppRoot() {
  const pwd = process.env.PWD;
  if (pwd) return pwd;
  return path.resolve(process.cwd(), '../../../../..');
}

function getFormulaDirectory() {
  return path.join(
    getAppRoot(),
    'imports',
    'ui',
    'metacell',
    'runtime',
    'formulas'
  );
}

function shouldIgnoreFormulaFile(fileName) {
  return /^(?:index|definition|helpers)\.js$/i.test(String(fileName || ''));
}

function hashFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function buildBundledManifestHashes(manifest) {
  return manifest.map((item) => ({
    file: String(item.file || ''),
    name: item.name,
    hash: 'bundled',
  }));
}

export function validateDiscoveredFormulasOnServer() {
  const manifest = getRegisteredFormulaManifest();
  const formulasDir = getFormulaDirectory();

  if (!fs.existsSync(formulasDir)) {
    return buildBundledManifestHashes(manifest);
  }

  const manifestByFile = new Map();

  for (let i = 0; i < manifest.length; i += 1) {
    const item = manifest[i];
    manifestByFile.set(String(item.file || ''), item);
  }

  const discoveredFiles = fs
    .readdirSync(formulasDir)
    .filter((fileName) => /\.js$/i.test(fileName))
    .filter((fileName) => !shouldIgnoreFormulaFile(fileName))
    .sort();

  console.log('[formulas] auto-discovery', {
    manifestCount: manifest.length,
    diskCount: discoveredFiles.length,
    manifestFiles: manifest.map((m) => m.file),
    diskFiles: discoveredFiles,
  });

  const fileHashes = [];

  for (let i = 0; i < discoveredFiles.length; i += 1) {
    const fileName = discoveredFiles[i];
    const manifestEntry = manifestByFile.get(fileName);

    if (!manifestEntry) {
      throw new Error(
        `Formula file ${fileName} exists on disk but was not registered by auto-discovery`
      );
    }

    fileHashes.push({
      file: fileName,
      name: manifestEntry.name,
      hash: hashFile(path.join(formulasDir, fileName)),
    });
  }

  if (manifest.length !== discoveredFiles.length) {
    const manifestFiles = manifest.map((m) => m.file);
    const missing = manifestFiles.filter((f) => !discoveredFiles.includes(f));
    const extra = discoveredFiles.filter((f) => !manifestFiles.includes(f));

    throw new Error(
      `Formula auto-discovery manifest does not match files on disk (manifest: ${manifest.length}, disk: ${discoveredFiles.length}, missing from disk: [${missing.join(', ')}], extra on disk: [${extra.join(', ')}])`
    );
  }

  return fileHashes;
}