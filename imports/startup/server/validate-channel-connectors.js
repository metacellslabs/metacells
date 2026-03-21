import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getRegisteredChannelConnectorManifest } from '../../api/channels/connectors/index.js';

function getAppRoot() {
  const pwd = process.env.PWD;
  if (pwd) return pwd;
  return path.resolve(process.cwd(), '../../../../..');
}

function getConnectorDirectory() {
  return path.join(getAppRoot(), 'imports', 'api', 'channels', 'connectors');
}

function shouldIgnoreConnectorFile(fileName) {
  return /^(?:index|definition)\.js$/i.test(String(fileName || ''));
}

function hashFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function buildBundledManifestHashes(manifest) {
  return manifest.map((item) => ({
    file: String(item.file || ''),
    id: item.id,
    hash: 'bundled',
  }));
}

export function validateDiscoveredChannelConnectorsOnServer() {
  const manifest = getRegisteredChannelConnectorManifest();
  const connectorsDir = getConnectorDirectory();

  if (!fs.existsSync(connectorsDir)) {
    return buildBundledManifestHashes(manifest);
  }

  const manifestByFile = new Map();
  for (let i = 0; i < manifest.length; i += 1) {
    manifestByFile.set(String(manifest[i].file || ''), manifest[i]);
  }

  const discoveredFiles = fs
    .readdirSync(connectorsDir)
    .filter((fileName) => /\.js$/i.test(fileName))
    .filter((fileName) => !shouldIgnoreConnectorFile(fileName))
    .sort();

  const fileHashes = [];
  for (let i = 0; i < discoveredFiles.length; i += 1) {
    const fileName = discoveredFiles[i];
    const manifestEntry = manifestByFile.get(fileName);

    if (!manifestEntry) {
      throw new Error(
        `Channel connector file ${fileName} exists on disk but was not registered by auto-discovery`
      );
    }

    fileHashes.push({
      file: fileName,
      id: manifestEntry.id,
      hash: hashFile(path.join(connectorsDir, fileName)),
    });
  }

  if (manifest.length !== discoveredFiles.length) {
    throw new Error(
      'Channel connector auto-discovery manifest does not match files on disk'
    );
  }

  return fileHashes;
}