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

function logTwitter(event, payload) {
  console.log(`[channels.twitter] ${event}`, payload);
}

function validateTwitterSettings(settings) {
  const accessToken = String(
    settings && settings.accessToken ? settings.accessToken : '',
  ).trim();
  const apiBaseUrl = String(
    settings && settings.apiBaseUrl ? settings.apiBaseUrl : 'https://api.x.com',
  )
    .trim()
    .replace(/\/+$/, '');

  if (!accessToken) {
    throw new Error('Twitter/X access token is required');
  }
  if (!apiBaseUrl) {
    throw new Error('Twitter/X API base URL is required');
  }

  return { accessToken, apiBaseUrl };
}

function buildTwitterErrorMessage(payload, fallback) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const errors = Array.isArray(source.errors) ? source.errors : [];
  const detail = String(source.detail || source.title || fallback || '').trim();
  if (!errors.length) return detail;
  const nested = errors
    .map((item) =>
      String(
        (item && (item.message || item.detail || item.title || item.value)) ||
          '',
      ).trim(),
    )
    .filter(Boolean)
    .join('; ');
  return nested || detail;
}

async function callTwitterApi({ accessToken, apiBaseUrl }, path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: String(options.method || 'GET'),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      buildTwitterErrorMessage(
        payload,
        response.statusText || 'Twitter/X API request failed',
      ),
    );
  }

  return payload;
}

export async function testTwitterConnection(settings) {
  const validated = validateTwitterSettings(settings);

  try {
    logTwitter('test.start', { apiBaseUrl: validated.apiBaseUrl });
    const payload = await callTwitterApi(validated, '/2/users/me');
    const user = payload && payload.data && typeof payload.data === 'object'
      ? payload.data
      : {};
    const handle = String(user.username || '').trim();
    const userId = String(user.id || '').trim();
    logTwitter('test.success', { handle, userId });
    return {
      ok: true,
      message: `Connected Twitter/X account ${handle ? `@${handle}` : userId || '(unknown user)'}`,
    };
  } catch (error) {
    const message =
      formatNestedError(error) || 'Failed to connect to Twitter/X channel';
    logTwitter('test.failed', { message });
    throw new Error(message);
  }
}

export async function sendTwitterMessage(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const settings =
    source.settings && typeof source.settings === 'object'
      ? source.settings
      : {};
  const validated = validateTwitterSettings(settings);
  const body = String(source.body == null ? '' : source.body).trim();
  const attachments = Array.isArray(source.attachments)
    ? source.attachments.filter((item) => item && typeof item === 'object')
    : [];

  if (attachments.length) {
    throw new Error('Twitter/X send does not support attachments yet');
  }
  if (!body) {
    throw new Error('Twitter/X send requires a message body');
  }

  const response = await callTwitterApi(validated, '/2/tweets', {
    method: 'POST',
    body: {
      text: body,
    },
  });
  const data =
    response && response.data && typeof response.data === 'object'
      ? response.data
      : {};

  return {
    ok: true,
    tweetId: String(data.id || ''),
    text: String(data.text || ''),
  };
}

const TWITTER_HANDLER = defineChannelHandler({
  id: 'twitter',
  name: 'X',
  summary: 'X/Twitter outbound posting channel.',
  docs: [
    'https://developer.x.com/en/docs/x-api/tweets/manage-tweets/introduction',
    'https://developer.x.com/en/docs/x-api/tweets/search/introduction',
  ],
  popularMethods: ['POST /2/tweets', 'GET /2/tweets/search/recent', 'GET /2/users/me'],
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
    entities: ['tweet', 'user'],
  },
  testConnection: async ({ settings }) => testTwitterConnection(settings),
  send: async ({ settings, payload }) =>
    sendTwitterMessage({ ...(payload || {}), settings }),
});

export default TWITTER_HANDLER;
