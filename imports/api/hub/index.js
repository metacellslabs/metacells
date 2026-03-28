import JSZip from 'jszip';
import { AppError } from '../../../lib/app-error.js';
import { check, Match } from '../../../lib/check.js';
import { registerMethods, invokeMethod } from '../../../lib/rpc.js';
import { getHubPublishSettings } from '../settings/index.js';
import { decodeWorkbookDocument } from '../sheets/workbook-codec.js';

function normalizeApiBaseUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  return value.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
}

function createShortDescription(description) {
  const text = String(description || '').trim().replace(/\s+/g, ' ');
  if (text.length <= 160) return text;
  return `${text.slice(0, 157).trimEnd()}...`;
}

function buildAbsoluteHubUrl(apiBaseUrl, rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (parsed.pathname.startsWith('/uploads/')) {
        parsed.pathname = `/api${parsed.pathname}`;
        return parsed.toString();
      }
    } catch (_error) {
      return value;
    }
    return value;
  }
  const normalizedValue = value.startsWith('/uploads/') ? `/api${value}` : value;
  return `${apiBaseUrl}${normalizedValue.startsWith('/') ? '' : '/'}${normalizedValue}`;
}

function isLikelyStaticAssetUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  return (
    value.startsWith('/uploads/') ||
    /\.(png|jpe?g|webp|gif|svg|mp4|webm|zip|xlsx?|json)$/i.test(value)
  );
}

function buildWorkbookPackageName(title) {
  const slug = String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'metacells-workbook'}.zip`;
}

function parseDataUrlFile(image, fallbackName) {
  const source = image && typeof image === 'object' ? image : {};
  const dataUrl = String(source.dataUrl || '').trim();
  const match = dataUrl.match(/^data:([^;,]+)?;base64,(.+)$/);
  if (!match) {
    throw new AppError('invalid-image', 'Image payload must be a base64 data URL');
  }
  return {
    name: String(source.name || fallbackName || 'upload.bin').trim() || 'upload.bin',
    type: String(source.type || match[1] || 'application/octet-stream').trim(),
    buffer: Buffer.from(match[2], 'base64'),
  };
}

async function loginToHub(apiBaseUrl, settings) {
  const token = String(settings && settings.token ? settings.token : '').trim();
  if (token) return token;

  const username = String(
    settings && (settings.username || settings.email)
      ? settings.username || settings.email
      : '',
  ).trim();
  const password = String(settings && settings.password ? settings.password : '');
  if (!username || !password) {
    throw new AppError(
      'hub-auth-missing',
      'Hub username/password or bearer token must be configured in Settings',
    );
  }

  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !String(payload && payload.token).trim()) {
    throw new AppError(
      'hub-auth-failed',
      String(payload && payload.message ? payload.message : 'Hub login failed'),
    );
  }
  return String(payload.token || '').trim();
}

async function uploadFileToHub(apiBaseUrl, token, file) {
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([file.buffer], { type: file.type || 'application/octet-stream' }),
    file.name || 'upload.bin',
  );

  const response = await fetch(`${apiBaseUrl}/api/uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !String(payload && payload.url).trim()) {
    throw new AppError(
      'hub-upload-failed',
      String(payload && payload.message ? payload.message : 'Hub upload failed'),
    );
  }
  return payload;
}

async function fetchJson(url, options = {}, errorType = 'hub-request-failed') {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError(
      errorType,
      String(payload && payload.message ? payload.message : 'Hub request failed'),
    );
  }
  return payload;
}

async function buildWorkbookZipBuffer(sheetData, publishInput) {
  const zip = new JSZip();
  const workbookDocument =
    sheetData && sheetData.workbook && typeof sheetData.workbook === 'object'
      ? sheetData.workbook
      : {};
  const manifest = {
    format: 'metacells-hub-package',
    version: 1,
    title: String(publishInput.title || '').trim(),
    description: String(publishInput.description || '').trim(),
    tags: Array.isArray(publishInput.tags) ? publishInput.tags : [],
    sourceSheetId: String(sheetData && sheetData._id ? sheetData._id : ''),
    sourceSheetName: String(sheetData && sheetData.name ? sheetData.name : ''),
    exportedAt: new Date().toISOString(),
    documentRevision: String(
      (sheetData && sheetData.documentRevision) || '',
    ).trim(),
    runtimeRevision: String(
      (sheetData && sheetData.runtimeRevision) || '',
    ).trim(),
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('workbook.json', JSON.stringify(workbookDocument, null, 2));

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

registerMethods({
  async 'hub.listMarketplaceWorkbooks'(searchQuery) {
    check(searchQuery, Match.Maybe(String));
    const settings = await getHubPublishSettings();
    const apiBaseUrl = normalizeApiBaseUrl(settings && settings.apiBaseUrl);
    if (!apiBaseUrl) {
      throw new AppError(
        'hub-config-missing',
        'Hub API base URL must be configured in Settings',
      );
    }

    const normalizedSearchQuery = String(searchQuery || "").trim();
    const url = normalizedSearchQuery
      ? `${apiBaseUrl}/api/solutions/semantic-search?type=WORKBOOK&q=${encodeURIComponent(normalizedSearchQuery)}`
      : `${apiBaseUrl}/api/solutions?type=WORKBOOK`;
    const payload = await fetchJson(url, {}, 'hub-marketplace-list-failed');
    const items = Array.isArray(payload) ? payload : [];
    return items.map((item) => {
      const files = Array.isArray(item && item.files) ? item.files : [];
      const assets = Array.isArray(item && item.assets) ? item.assets : [];
      const primaryFile = files[0] || null;
      const primaryAsset = assets[0] || null;
      return {
        id: String((item && item.id) || ''),
        slug: String((item && item.slug) || ''),
        title: String((item && item.title) || ''),
        shortDescription: String((item && item.shortDescription) || ''),
        fullDescription: String((item && item.fullDescription) || ''),
        tags: Array.isArray(item && item.tags) ? item.tags : [],
        downloadsCount: Number((item && item.downloadsCount) || 0),
        starsCount: Number((item && item.starsCount) || 0),
        publishedAt: item && item.publishedAt ? item.publishedAt : null,
        authorName: String(
          (item && item.author && item.author.name) || '',
        ).trim(),
        previewImageUrl:
          primaryAsset && isLikelyStaticAssetUrl(primaryAsset.url)
          ? buildAbsoluteHubUrl(apiBaseUrl, primaryAsset.url)
          : '',
        fileUrl:
          primaryFile && isLikelyStaticAssetUrl(primaryFile.fileUrl)
            ? buildAbsoluteHubUrl(apiBaseUrl, primaryFile.fileUrl)
            : '',
        fileKind: String((primaryFile && primaryFile.fileKind) || ''),
      };
    });
  },

  async 'hub.importMarketplaceWorkbook'(solution) {
    check(solution, {
      id: String,
      slug: String,
      title: String,
    });

    const settings = await getHubPublishSettings();
    const apiBaseUrl = normalizeApiBaseUrl(settings && settings.apiBaseUrl);
    if (!apiBaseUrl) {
      throw new AppError(
        'hub-config-missing',
        'Hub API base URL must be configured in Settings',
      );
    }

    const solutionId = String((solution && solution.id) || '').trim();
    if (!solutionId) {
      throw new AppError(
        'hub-import-missing-id',
        'Marketplace workbook is missing its hub solution id',
      );
    }

    const downloadPayload = await fetchJson(
      `${apiBaseUrl}/api/solutions/${encodeURIComponent(solutionId)}/download`,
      {
        method: 'POST',
      },
      'hub-import-download-failed',
    );
    const fileUrl = buildAbsoluteHubUrl(apiBaseUrl, downloadPayload && downloadPayload.url);
    if (!fileUrl) {
      throw new AppError(
        'hub-import-missing-file',
        'Hub did not return a downloadable workbook package',
      );
    }

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new AppError(
        'hub-import-download-failed',
        `Failed to download workbook package [${response.status}]`,
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
    const workbookEntry = zip.file('workbook.json');
    if (!workbookEntry) {
      throw new AppError(
        'hub-import-invalid-package',
        'Workbook package is missing workbook.json',
      );
    }
    const workbookText = await workbookEntry.async('string');
    let workbookDocument = {};
    try {
      workbookDocument = JSON.parse(workbookText);
    } catch (_error) {
      throw new AppError(
        'hub-import-invalid-package',
        'Workbook package contains invalid workbook.json',
      );
    }

    const workbook = decodeWorkbookDocument(workbookDocument);
    const nextName = String(solution && solution.title ? solution.title : '').trim() || 'Imported workbook';
    const sheetId = await invokeMethod('sheets.create', nextName);
    await invokeMethod('sheets.saveWorkbook', sheetId, workbook);
    return {
      sheetId: String(sheetId || ''),
      name: nextName,
    };
  },

  async 'hub.publishWorkbook'(input) {
    check(input, {
      sheetId: String,
      title: String,
      description: String,
      tags: Match.Maybe([String]),
      images: Match.Maybe([
        {
          name: Match.Maybe(String),
          type: Match.Maybe(String),
          dataUrl: String,
        },
      ]),
    });

    const title = String(input && input.title ? input.title : '').trim();
    const description = String(
      input && input.description ? input.description : '',
    ).trim();
    const tags = Array.isArray(input && input.tags)
      ? input.tags
          .map((tag) => String(tag || '').trim().toLowerCase())
          .filter(Boolean)
      : [];
    const images = Array.isArray(input && input.images) ? input.images : [];

    if (title.length < 3) {
      throw new AppError('invalid-title', 'Title must be at least 3 characters');
    }
    if (description.length < 20) {
      throw new AppError(
        'invalid-description',
        'Description must be at least 20 characters',
      );
    }

    const settings = await getHubPublishSettings();
    const apiBaseUrl = normalizeApiBaseUrl(settings && settings.apiBaseUrl);
    if (!apiBaseUrl) {
      throw new AppError(
        'hub-config-missing',
        'Hub API base URL must be configured in Settings',
      );
    }

    const token = await loginToHub(apiBaseUrl, settings);
    const sheetData = await invokeMethod('sheets.one', String(input.sheetId || ''));
    if (!sheetData) {
      throw new AppError('not-found', 'Workbook not found');
    }

    const zipBuffer = await buildWorkbookZipBuffer(sheetData, {
      title,
      description,
      tags,
    });
    const workbookUpload = await uploadFileToHub(apiBaseUrl, token, {
      name: buildWorkbookPackageName(title),
      type: 'application/zip',
      buffer: zipBuffer,
    });

    const assetUploads = [];
    for (let index = 0; index < images.length; index += 1) {
      const parsed = parseDataUrlFile(images[index], `cover-${index + 1}.png`);
      const upload = await uploadFileToHub(apiBaseUrl, token, parsed);
      assetUploads.push({
        kind: 'IMAGE',
        url: String(upload.url || '').trim(),
        sortOrder: index,
      });
    }

    const version = new Date().toISOString().slice(0, 10);
    const solutionResponse = await fetch(`${apiBaseUrl}/api/solutions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        shortDescription: createShortDescription(description),
        fullDescription: description,
        type: 'WORKBOOK',
        tags,
        assets: assetUploads,
        files: [
          {
            fileKind: 'ZIP',
            fileUrl: String(workbookUpload.url || '').trim(),
            fileSize: Number(workbookUpload.size) || zipBuffer.length,
            version,
          },
        ],
      }),
    });
    const solutionPayload = await solutionResponse.json().catch(() => ({}));
    if (!solutionResponse.ok || !String(solutionPayload && solutionPayload.id).trim()) {
      throw new AppError(
        'hub-submit-failed',
        String(
          solutionPayload && solutionPayload.message
            ? solutionPayload.message
            : 'Failed to create hub submission',
        ),
      );
    }

    const submitResponse = await fetch(
      `${apiBaseUrl}/api/solutions/${encodeURIComponent(solutionPayload.id)}/submit`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    const submitPayload = await submitResponse.json().catch(() => ({}));
    if (!submitResponse.ok) {
      throw new AppError(
        'hub-submit-review-failed',
        String(
          submitPayload && submitPayload.message
            ? submitPayload.message
            : 'Failed to submit workbook for hub review',
        ),
      );
    }

    return {
      ok: true,
      solutionId: String(solutionPayload.id || ''),
      slug: String(solutionPayload.slug || ''),
      status: String(submitPayload.status || solutionPayload.status || ''),
      dashboardUrl: `${apiBaseUrl.replace(/\/api$/, '')}/dashboard`,
    };
  },
});
