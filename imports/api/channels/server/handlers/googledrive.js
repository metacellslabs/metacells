import { getArtifactBinary } from '../../../artifacts/index.js';
import { defineChannelHandler } from '../handler-definition.js';

function formatNestedError(error) {
  if (!error) return '';
  if (Array.isArray(error.errors) && error.errors.length) {
    return error.errors
      .map((item) => formatNestedError(item))
      .filter(Boolean)
      .join('; ');
  }
  if (error.cause) {
    const causeMessage = formatNestedError(error.cause);
    if (causeMessage) return causeMessage;
  }
  return String(error.message || error.code || error || '').trim();
}

function logDrive(event, payload) {
  console.log(`[channels.googledrive] ${event}`, payload);
}

function validateDriveSettings(settings) {
  const accessToken = String(
    settings && settings.accessToken ? settings.accessToken : '',
  ).trim();
  const folderId = String(settings && settings.folderId ? settings.folderId : '').trim();
  const limit = Math.max(1, Math.min(100, parseInt(settings && settings.limit, 10) || 20));
  const apiBaseUrl = String(
    settings && settings.apiBaseUrl
      ? settings.apiBaseUrl
      : 'https://www.googleapis.com/drive/v3',
  )
    .trim()
    .replace(/\/+$/, '');
  const uploadBaseUrl = String(
    settings && settings.uploadBaseUrl
      ? settings.uploadBaseUrl
      : 'https://www.googleapis.com/upload/drive/v3',
  )
    .trim()
    .replace(/\/+$/, '');

  if (!accessToken) {
    throw new Error('Google Drive access token is required');
  }
  if (!apiBaseUrl) {
    throw new Error('Google Drive API base URL is required');
  }
  if (!uploadBaseUrl) {
    throw new Error('Google Drive upload base URL is required');
  }

  return { accessToken, folderId, limit, apiBaseUrl, uploadBaseUrl };
}

async function callDriveApi(validated, path, options = {}) {
  const response = await fetch(`${validated.apiBaseUrl}${path}`, {
    method: String(options.method || 'GET'),
    headers: {
      Authorization: `Bearer ${validated.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = String(await response.text()).trim();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      String(
        (payload &&
          payload.error &&
          (payload.error.message || payload.error.status || payload.error.code)) ||
          text ||
          response.statusText ||
          'Google Drive API request failed',
      ).trim(),
    );
  }
  return payload;
}

function fileUid(file) {
  const stamp = Date.parse(
    String(
      (file && (file.createdTime || file.modifiedTime)) || '',
    ),
  );
  return Number.isFinite(stamp) && stamp > 0 ? stamp : Date.now();
}

function normalizeDriveFile(file) {
  const source = file && typeof file === 'object' ? file : {};
  return {
    event: 'file.new',
    uid: fileUid(source),
    fileId: String(source.id || ''),
    name: String(source.name || ''),
    mimeType: String(source.mimeType || ''),
    createdTime: String(source.createdTime || ''),
    modifiedTime: String(source.modifiedTime || ''),
    webViewLink: String(source.webViewLink || ''),
    webContentLink: String(source.webContentLink || ''),
    size: Number(source.size) || 0,
    owners: Array.isArray(source.owners)
      ? source.owners
          .map((owner) =>
            String((owner && (owner.displayName || owner.emailAddress)) || '').trim(),
          )
          .filter(Boolean)
      : [],
  };
}

function buildDriveListQuery(validated) {
  const clauses = ['trashed = false'];
  if (validated.folderId) {
    clauses.push(`'${validated.folderId.replace(/'/g, "\\'")}' in parents`);
  }
  return clauses.join(' and ');
}

async function uploadDriveMultipart(validated, metadata, binary) {
  const boundary = `metacells-${Date.now().toString(16)}`;
  const mimeType = String(binary.mimeType || 'application/octet-stream');
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
        metadata,
      )}\r\n`,
      'utf8',
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      'utf8',
    ),
    Buffer.isBuffer(binary.buffer) ? binary.buffer : Buffer.from(binary.buffer || ''),
    Buffer.from(`\r\n--${boundary}--`, 'utf8'),
  ]);

  const response = await fetch(
    `${validated.uploadBaseUrl}/files?uploadType=multipart`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validated.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  const text = String(await response.text()).trim();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(
      String(
        (payload &&
          payload.error &&
          (payload.error.message || payload.error.status || payload.error.code)) ||
          text ||
          response.statusText ||
          'Google Drive upload failed',
      ).trim(),
    );
  }
  return payload;
}

async function resolveUploadBinary(source, attachments) {
  const list = Array.isArray(attachments) ? attachments : [];
  if (list.length) {
    const first = list.find((item) => item && typeof item === 'object');
    const binaryArtifactId = String(
      first && first.binaryArtifactId ? first.binaryArtifactId : '',
    ).trim();
    if (!binaryArtifactId) {
      throw new Error('Drive attachment upload requires binaryArtifactId');
    }
    const binary = await getArtifactBinary(binaryArtifactId);
    if (!binary || !binary.buffer) {
      throw new Error('Drive attachment binary could not be loaded');
    }
    return {
      fileName: String(first.name || binary.fileName || 'upload'),
      mimeType: String(first.type || binary.mimeType || 'application/octet-stream'),
      buffer: binary.buffer,
    };
  }

  const text = String(source.body == null ? '' : source.body);
  if (!text.trim()) {
    throw new Error('Google Drive send requires body text or an attachment');
  }
  return {
    fileName: String(source.name || 'metacells.txt').trim() || 'metacells.txt',
    mimeType: String(source.mimeType || 'text/plain').trim() || 'text/plain',
    buffer: Buffer.from(text, 'utf8'),
  };
}

export async function testGoogleDriveConnection(settings) {
  const validated = validateDriveSettings(settings);
  const payload = await callDriveApi(
    validated,
    '/files?pageSize=1&fields=files(id,name)',
  );
  const count = Array.isArray(payload && payload.files) ? payload.files.length : 0;
  return {
    ok: true,
    message: `Connected Google Drive. Probe returned ${count} file${count === 1 ? '' : 's'}.`,
  };
}

export async function handleGoogleDriveEvent(eventType, payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return {
    event: String(eventType || source.event || 'file.new'),
    message: {
      ...source,
      summary: [
        source.name ? `Name: ${String(source.name)}` : '',
        source.mimeType ? `Type: ${String(source.mimeType)}` : '',
        source.owners && source.owners.length
          ? `Owners: ${source.owners.join(', ')}`
          : '',
        source.webViewLink ? `Link: ${String(source.webViewLink)}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
    },
  };
}

export async function pollGoogleDriveFiles(settings, channel) {
  const validated = validateDriveSettings(settings);
  const lastSeenUid = Number(channel && channel.lastSeenUid) || 0;
  const q = encodeURIComponent(buildDriveListQuery(validated));
  const payload = await callDriveApi(
    validated,
    `/files?pageSize=${validated.limit}&orderBy=createdTime desc&q=${q}&fields=files(id,name,mimeType,createdTime,modifiedTime,webViewLink,webContentLink,size,owners(displayName,emailAddress))`,
  );
  const files = Array.isArray(payload && payload.files) ? payload.files : [];
  const fresh = files
    .map(normalizeDriveFile)
    .filter((file) => Number(file.uid) > lastSeenUid)
    .sort((left, right) => Number(left.uid) - Number(right.uid));
  const nextLastSeenUid = fresh.length
    ? Number(fresh[fresh.length - 1].uid)
    : lastSeenUid;

  logDrive('poll.complete', {
    folderId: validated.folderId,
    events: fresh.length,
    lastSeenUid: nextLastSeenUid,
  });

  return {
    ok: true,
    lastSeenUid: nextLastSeenUid,
    events: fresh,
  };
}

export async function sendGoogleDriveMessage(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const settings =
    source.settings && typeof source.settings === 'object'
      ? source.settings
      : {};
  const validated = validateDriveSettings(settings);
  const attachments = Array.isArray(source.attachments)
    ? source.attachments.filter((item) => item && typeof item === 'object')
    : [];
  const binary = await resolveUploadBinary(source, attachments);
  const folderId = String(source.folderId || validated.folderId || '').trim();
  const metadata = {
    name: String(source.name || binary.fileName || 'upload').trim() || 'upload',
  };
  if (folderId) metadata.parents = [folderId];

  const response = await uploadDriveMultipart(validated, metadata, {
    fileName: binary.fileName,
    mimeType: binary.mimeType,
    buffer: binary.buffer,
  });

  return {
    ok: true,
    fileId: String((response && response.id) || ''),
    name: String((response && response.name) || metadata.name || ''),
  };
}

const GOOGLE_DRIVE_HANDLER = defineChannelHandler({
  id: 'google-drive',
  name: 'Google Drive',
  summary: 'Drive channel for file polling and upload actions.',
  docs: [
    'https://developers.google.com/drive/api/reference/rest/v3/files/list',
    'https://developers.google.com/drive/api/reference/rest/v3/changes/list',
  ],
  popularMethods: [
    'files.list',
    'files.create',
    'changes.list',
    'files.get',
  ],
  capabilities: {
    test: true,
    send: true,
    receive: true,
    poll: true,
    normalizeEvent: true,
    search: true,
    attachments: true,
    oauth: true,
    actions: ['test', 'upload', 'poll', 'search'],
    entities: ['file', 'folder', 'change'],
  },
  testConnection: async ({ settings }) => testGoogleDriveConnection(settings),
  send: async ({ settings, payload }) =>
    sendGoogleDriveMessage({ ...(payload || {}), settings }),
  poll: async ({ settings, channel }) => pollGoogleDriveFiles(settings, channel),
  normalizeEvent: async ({ eventType, payload }) =>
    handleGoogleDriveEvent(eventType, payload),
});

export default GOOGLE_DRIVE_HANDLER;
