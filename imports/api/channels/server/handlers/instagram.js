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

function logInstagram(event, payload) {
  console.log(`[channels.instagram] ${event}`, payload);
}

function validateInstagramSettings(settings) {
  const accessToken = String(
    settings && settings.accessToken ? settings.accessToken : '',
  ).trim();
  const instagramUserId = String(
    settings && settings.instagramUserId ? settings.instagramUserId : '',
  ).trim();
  const defaultImageUrl = String(
    settings && settings.defaultImageUrl ? settings.defaultImageUrl : '',
  ).trim();
  const apiBaseUrl = String(
    settings && settings.apiBaseUrl
      ? settings.apiBaseUrl
      : 'https://graph.facebook.com/v23.0',
  )
    .trim()
    .replace(/\/+$/, '');

  if (!accessToken) {
    throw new Error('Instagram access token is required');
  }
  if (!instagramUserId) {
    throw new Error('Instagram user ID is required');
  }
  if (!apiBaseUrl) {
    throw new Error('Instagram API base URL is required');
  }

  return { accessToken, instagramUserId, defaultImageUrl, apiBaseUrl };
}

function buildInstagramErrorMessage(payload, fallback) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const error =
    source.error && typeof source.error === 'object' ? source.error : source;
  return String(
    error.message ||
      error.error_user_msg ||
      error.error_user_title ||
      fallback ||
      '',
  ).trim();
}

async function callInstagramApi(validated, path, options = {}) {
  const url = new URL(`${validated.apiBaseUrl}${path}`);
  url.searchParams.set('access_token', validated.accessToken);

  const response = await fetch(url.toString(), {
    method: String(options.method || 'GET'),
    headers: {
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
      buildInstagramErrorMessage(
        payload,
        text || response.statusText || 'Instagram Graph API request failed',
      ),
    );
  }

  return payload;
}

export async function testInstagramConnection(settings) {
  const validated = validateInstagramSettings(settings);

  try {
    logInstagram('test.start', { instagramUserId: validated.instagramUserId });
    const payload = await callInstagramApi(
      validated,
      `/${encodeURIComponent(validated.instagramUserId)}?fields=id,username`,
    );
    const username = String(payload && payload.username ? payload.username : '').trim();
    logInstagram('test.success', {
      instagramUserId: validated.instagramUserId,
      username,
    });
    return {
      ok: true,
      message: `Connected Instagram account ${username || validated.instagramUserId}`,
    };
  } catch (error) {
    const message =
      formatNestedError(error) || 'Failed to connect to Instagram channel';
    logInstagram('test.failed', {
      instagramUserId: validated.instagramUserId,
      message,
    });
    throw new Error(message);
  }
}

export async function sendInstagramMessage(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const settings =
    source.settings && typeof source.settings === 'object'
      ? source.settings
      : {};
  const validated = validateInstagramSettings(settings);
  const imageUrl = String(
    source.imageUrl || validated.defaultImageUrl || '',
  ).trim();
  const caption = String(source.caption || source.body || '').trim();
  const attachments = Array.isArray(source.attachments)
    ? source.attachments.filter((item) => item && typeof item === 'object')
    : [];

  if (!imageUrl) {
    throw new Error('Instagram send requires imageUrl or defaultImageUrl');
  }
  if (attachments.length) {
    throw new Error('Instagram send does not support workbook attachments yet');
  }

  const container = await callInstagramApi(
    validated,
    `/${encodeURIComponent(validated.instagramUserId)}/media`,
    {
      method: 'POST',
      body: {
        image_url: imageUrl,
        caption,
      },
    },
  );

  const creationId = String((container && container.id) || '').trim();
  if (!creationId) {
    throw new Error('Instagram media container creation did not return an id');
  }

  const publishResult = await callInstagramApi(
    validated,
    `/${encodeURIComponent(validated.instagramUserId)}/media_publish`,
    {
      method: 'POST',
      body: {
        creation_id: creationId,
      },
    },
  );

  return {
    ok: true,
    creationId,
    postId: String((publishResult && publishResult.id) || ''),
  };
}

const INSTAGRAM_HANDLER = defineChannelHandler({
  id: 'instagram',
  name: 'Instagram',
  summary: 'Instagram content publishing channel for professional accounts.',
  docs: ['https://developers.facebook.com/docs/instagram-platform/content-publishing'],
  popularMethods: ['/{ig-user-id}', '/{ig-user-id}/media', '/{ig-user-id}/media_publish'],
  capabilities: {
    test: true,
    send: true,
    receive: false,
    poll: false,
    normalizeEvent: false,
    search: false,
    attachments: false,
    oauth: true,
    actions: ['test', 'publish'],
    entities: ['account', 'media', 'container'],
  },
  testConnection: async ({ settings }) => testInstagramConnection(settings),
  send: async ({ settings, payload }) =>
    sendInstagramMessage({ ...(payload || {}), settings }),
});

export default INSTAGRAM_HANDLER;
