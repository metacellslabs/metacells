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

function logReddit(event, payload) {
  console.log(`[channels.reddit] ${event}`, payload);
}

function validateRedditSettings(settings) {
  const accessToken = String(
    settings && settings.accessToken ? settings.accessToken : '',
  ).trim();
  const defaultSubreddit = String(
    settings && settings.defaultSubreddit ? settings.defaultSubreddit : '',
  )
    .trim()
    .replace(/^r\//i, '');
  const apiBaseUrl = String(
    settings && settings.apiBaseUrl ? settings.apiBaseUrl : 'https://oauth.reddit.com',
  )
    .trim()
    .replace(/\/+$/, '');

  if (!accessToken) {
    throw new Error('Reddit access token is required');
  }
  if (!apiBaseUrl) {
    throw new Error('Reddit API base URL is required');
  }

  return { accessToken, defaultSubreddit, apiBaseUrl };
}

function buildRedditErrorMessage(payload, fallback) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const json = source.json && typeof source.json === 'object' ? source.json : {};
  const errors = Array.isArray(json.errors)
    ? json.errors
        .map((item) => (Array.isArray(item) ? item.join(': ') : String(item || '')))
        .filter(Boolean)
    : [];
  const message = String(
    source.message ||
      source.error ||
      source.reason ||
      (errors.length ? errors.join('; ') : '') ||
      fallback ||
      '',
  ).trim();
  return message;
}

async function callRedditApi(
  { accessToken, apiBaseUrl },
  path,
  options = {},
) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: String(options.method || 'GET'),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'MetaCells/1.0',
      ...(options.headers || {}),
    },
    body: options.body,
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
      buildRedditErrorMessage(
        payload,
        text || response.statusText || 'Reddit API request failed',
      ),
    );
  }

  return payload;
}

export async function testRedditConnection(settings) {
  const validated = validateRedditSettings(settings);

  try {
    logReddit('test.start', { apiBaseUrl: validated.apiBaseUrl });
    const payload = await callRedditApi(validated, '/api/v1/me');
    const name = String(payload && payload.name ? payload.name : '').trim();
    logReddit('test.success', { name });
    return {
      ok: true,
      message: `Connected Reddit account ${name ? `u/${name}` : '(unknown user)'}`,
    };
  } catch (error) {
    const message =
      formatNestedError(error) || 'Failed to connect to Reddit channel';
    logReddit('test.failed', { message });
    throw new Error(message);
  }
}

export async function sendRedditMessage(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const settings =
    source.settings && typeof source.settings === 'object'
      ? source.settings
      : {};
  const validated = validateRedditSettings(settings);
  const subreddit = String(
    source.subreddit || validated.defaultSubreddit || '',
  )
    .trim()
    .replace(/^r\//i, '');
  const title = String(source.title == null ? '' : source.title).trim();
  const body = String(source.body == null ? '' : source.body).trim();
  const attachments = Array.isArray(source.attachments)
    ? source.attachments.filter((item) => item && typeof item === 'object')
    : [];

  if (!subreddit) {
    throw new Error('Reddit send requires a subreddit or a default subreddit');
  }
  if (!title) {
    throw new Error('Reddit send requires a title');
  }
  if (!body) {
    throw new Error('Reddit send requires a message body');
  }
  if (attachments.length) {
    throw new Error('Reddit send does not support attachments yet');
  }

  const form = new URLSearchParams({
    api_type: 'json',
    kind: 'self',
    sr: subreddit,
    title,
    text: body,
    resubmit: 'true',
    sendreplies: 'true',
  });

  const response = await callRedditApi(validated, '/api/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  const json = response && response.json && typeof response.json === 'object'
    ? response.json
    : {};
  const data = json.data && typeof json.data === 'object' ? json.data : {};
  const errors = Array.isArray(json.errors) ? json.errors : [];
  if (errors.length) {
    throw new Error(buildRedditErrorMessage(response, 'Reddit submit failed'));
  }

  return {
    ok: true,
    subreddit,
    url: String(data.url || ''),
    name: String(data.name || ''),
    id: String(data.id || ''),
  };
}

const REDDIT_HANDLER = defineChannelHandler({
  id: 'reddit',
  name: 'Reddit',
  summary: 'Reddit outbound posting channel for self posts.',
  docs: ['https://developers.reddit.com/docs/api/'],
  popularMethods: ['api/v1/me', 'api/submit', 'new', 'search'],
  capabilities: {
    test: true,
    send: true,
    receive: false,
    poll: false,
    normalizeEvent: false,
    search: false,
    attachments: false,
    oauth: true,
    actions: ['test', 'submit'],
    entities: ['subreddit', 'post', 'listing'],
  },
  testConnection: async ({ settings }) => testRedditConnection(settings),
  send: async ({ settings, payload }) =>
    sendRedditMessage({ ...(payload || {}), settings }),
});

export default REDDIT_HANDLER;
