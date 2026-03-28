import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { check } from '../../../lib/check.js';
import { registerMethods } from '../../../lib/rpc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..', '..', '..');
const TESTING_DIR = path.join(APP_ROOT, 'testing');

function sanitizeSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

registerMethods({
  async 'testing.saveTestResults'(openedAtTimestamp, content) {
    check(openedAtTimestamp, String);
    check(content, String);

    const suffix = sanitizeSegment(openedAtTimestamp) || String(Date.now());
    const fileName = `test_results_${suffix}.txt`;

    await fs.mkdir(TESTING_DIR, { recursive: true });

    const filePath = path.join(TESTING_DIR, fileName);
    await fs.writeFile(filePath, String(content || ''), 'utf8');

    return {
      fileName,
      filePath,
      relativePath: path.join('testing', fileName),
    };
  },
});
