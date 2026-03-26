import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { printViolationsAndExit, rootDir } from './guard-utils.mjs';

const ignoredPathPrefixes = [
  '.git/',
  'node_modules/',
  'dist/',
  '.meteor/',
  '.desktop-tools/',
  'src-tauri/target/',
];

const ignoredBasenames = new Set([
  'package-lock.json',
  'Cargo.lock',
]);

const suspiciousFilePatterns = [
  /(^|\/)\.env(\.[^/]+)?$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.pypirc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)id_(rsa|ed25519)(\.pub)?$/i,
  /(^|\/)authkey_[^/]+\.p8$/i,
  /(^|\/)[^/]+\.(pem|key|p12|mobileprovision)$/i,
  /(^|\/)(secret|secrets|credential|credentials)(\.[^/]+)?$/i,
];

const contentRules = [
  {
    id: 'private-key',
    severity: 'high',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
    reason: 'private key material',
  },
  {
    id: 'openai-key',
    severity: 'high',
    regex: /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}\b/,
    reason: 'OpenAI-style API key',
  },
  {
    id: 'github-token',
    severity: 'high',
    regex: /\bgh[oprsu]_[A-Za-z0-9]{20,}\b/,
    reason: 'GitHub token',
  },
  {
    id: 'slack-token',
    severity: 'high',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    reason: 'Slack token',
  },
  {
    id: 'aws-access-key',
    severity: 'high',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
    reason: 'AWS access key id',
  },
  {
    id: 'google-api-key',
    severity: 'high',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/,
    reason: 'Google API key',
  },
  {
    id: 'bearer-token',
    severity: 'medium',
    regex: /\bBearer\s+[A-Za-z0-9._-]{24,}\b/,
    reason: 'hardcoded bearer token',
  },
  {
    id: 'apple-id-email',
    severity: 'medium',
    regex: /\bAPPLE_ID\s*[:=]\s*['"][^'"]+@[^'"]+['"]/,
    reason: 'Apple ID literal',
  },
  {
    id: 'credential-assignment',
    severity: 'medium',
    regex:
      /\b(?:apiKey|api_key|accessToken|access_token|refreshToken|refresh_token|token|password|passwd|clientSecret|client_secret|oauthClientSecret|oauthRefreshToken|smtpPassword|pageAccessToken)\b\s*[:=]\s*['"][^'"\s][^'"]{7,}['"]/,
    reason: 'hardcoded credential-like assignment',
  },
];

function listTrackedFiles() {
  const output = execFileSync('git', ['ls-files'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  return output
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
}

function shouldSkipFile(relativePath) {
  if (!relativePath) return true;
  for (const prefix of ignoredPathPrefixes) {
    if (relativePath.startsWith(prefix)) return true;
  }
  return ignoredBasenames.has(path.basename(relativePath));
}

function readTextFile(filePath) {
  const buffer = readFileSync(filePath);
  if (buffer.includes(0)) return null;
  return buffer.toString('utf8');
}

function clip(line, maxLength = 160) {
  const text = String(line || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

const violations = [];
const trackedFiles = listTrackedFiles();

for (const relativePath of trackedFiles) {
  if (shouldSkipFile(relativePath)) continue;
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const absolutePath = path.join(rootDir, relativePath);

  for (const pattern of suspiciousFilePatterns) {
    if (!pattern.test(normalizedPath)) continue;
    violations.push(
      `${normalizedPath}: suspicious tracked filename (${pattern})`,
    );
    break;
  }

  let content = null;
  try {
    content = readTextFile(absolutePath);
  } catch (error) {
    continue;
  }
  if (content == null) continue;
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || !line.trim()) continue;
    for (const rule of contentRules) {
      rule.regex.lastIndex = 0;
      if (!rule.regex.test(line)) continue;
      violations.push(
        `${normalizedPath}:${index + 1}: [${rule.severity}] ${rule.reason}: ${clip(line)}`,
      );
    }
  }
}

printViolationsAndExit(
  'Tracked files contain possible sensitive data',
  violations,
  'No sensitive data detected in tracked repository files.',
);
