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

function logFacebook(event, payload) {
  console.log(`[channels.facebook] ${event}`, payload);
}

function validateFacebookSettings(settings) {
  const pageAccessToken = String(
    settings && settings.pageAccessToken ? settings.pageAccessToken : '',
  ).trim();
  const pageId = String(settings && settings.pageId ? settings.pageId : '').trim();
  const apiBaseUrl = String(
    settings && settings.apiBaseUrl
      ? settings.apiBaseUrl
      : 'https://graph.facebook.com/v23.0',
  )
    .trim()
    .replace(/\/+$/, '');

  if (!pageAccessToken) {
    throw new Error('Facebook Page access token is required');
  }
  if (!pageId) {
    throw new Error('Facebook Page ID is required');
  }
  if (!apiBaseUrl) {
    throw new Error('Facebook API base URL is required');
  }

  return { pageAccessToken, pageId, apiBaseUrl };
}

function buildFacebookErrorMessage(payload, fallback) {
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

async function callFacebookApi(validated, path, options = {}) {
  const url = new URL(`${validated.apiBaseUrl}${path}`);
  url.searchParams.set('access_token', validated.pageAccessToken);

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
      buildFacebookErrorMessage(
        payload,
        text || response.statusText || 'Facebook Graph API request failed',
      ),
    );
  }

  return payload;
}

export async function testFacebookConnection(settings) {
  const validated = validateFacebookSettings(settings);

  try {
    logFacebook('test.start', { pageId: validated.pageId });
    const payload = await callFacebookApi(
      validated,
      `/${encodeURIComponent(validated.pageId)}?fields=name`,
    );
    const name = String(payload && payload.name ? payload.name : '').trim();
    logFacebook('test.success', { pageId: validated.pageId, name });
    return {
      ok: true,
      message: `Connected Facebook Page ${name || validated.pageId}`,
    };
  } catch (error) {
    const message =
      formatNestedError(error) || 'Failed to connect to Facebook channel';
    logFacebook('test.failed', { pageId: validated.pageId, message });
    throw new Error(message);
  }
}

export async function sendFacebookMessage(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const settings =
    source.settings && typeof source.settings === 'object'
      ? source.settings
      : {};
  const validated = validateFacebookSettings(settings);
  const body = String(source.body == null ? '' : source.body).trim();
  const attachments = Array.isArray(source.attachments)
    ? source.attachments.filter((item) => item && typeof item === 'object')
    : [];

  if (!body) {
    throw new Error('Facebook send requires a message body');
  }
  if (attachments.length) {
    throw new Error('Facebook send does not support attachments yet');
  }

  const response = await callFacebookApi(
    validated,
    `/${encodeURIComponent(validated.pageId)}/feed`,
    {
      method: 'POST',
      body: {
        message: body,
      },
    },
  );

  return {
    ok: true,
    postId: String((response && response.id) || ''),
  };
}

const FACEBOOK_HANDLER = defineChannelHandler({
  id: 'facebook',
  name: 'Facebook',
  summary: 'Facebook Pages posting channel.',
  docs: ['https://developers.facebook.com/docs/pages-api/posts'],
  popularMethods: ['/{page-id}', '/{page-id}/feed'],
  capabilities: {
    test: true,
    send: true,
    receive: false,
    poll: false,
    normalizeEvent: false,
    search: false,
    attachments: false,
    oauth: true,
    actions: ['test', 'post'],
    entities: ['page', 'post'],
  },
  testConnection: async ({ settings }) => testFacebookConnection(settings),
  send: async ({ settings, payload }) =>
    sendFacebookMessage({ ...(payload || {}), settings }),
});

export default FACEBOOK_HANDLER;
