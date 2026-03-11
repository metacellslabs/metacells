import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getRegisteredAIProviderManifest } from '../../api/settings/providers/index.js';

function getAppRoot() {
  const pwd = process.env.PWD;
  if (pwd) return pwd;
  return path.resolve(process.cwd(), '../../../../..');
}

function getProviderDirectory() {
  return path.join(getAppRoot(), 'imports', 'api', 'settings', 'providers');
}

function shouldIgnoreProviderFile(fileName) {
  return /^(?:index|definition)\.js$/i.test(String(fileName || ''));
}

function hashFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function validateDiscoveredAIProvidersOnServer() {
  const providersDir = getProviderDirectory();
  if (!fs.existsSync(providersDir)) {
    throw new Error(`AI provider directory not found: ${providersDir}`);
  }

  const manifest = getRegisteredAIProviderManifest();
  const manifestByFile = new Map();
  for (let i = 0; i < manifest.length; i += 1) {
    manifestByFile.set(String(manifest[i].file || ''), manifest[i]);
  }

  const discoveredFiles = fs
    .readdirSync(providersDir)
    .filter((fileName) => /\.js$/i.test(fileName))
    .filter((fileName) => !shouldIgnoreProviderFile(fileName))
    .sort();

  const fileHashes = [];
  for (let i = 0; i < discoveredFiles.length; i += 1) {
    const fileName = discoveredFiles[i];
    const manifestEntry = manifestByFile.get(fileName);
    if (!manifestEntry) {
      throw new Error(
        `AI provider file ${fileName} exists on disk but was not registered by auto-discovery`,
      );
    }
    fileHashes.push({
      file: fileName,
      id: manifestEntry.id,
      hash: hashFile(path.join(providersDir, fileName)),
    });
  }

  if (manifest.length !== discoveredFiles.length) {
    throw new Error(
      'AI provider auto-discovery manifest does not match files on disk',
    );
  }

  return fileHashes;
}
