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

function logLinkedIn(event, payload) {
  console.log(`[channels.linkedin] ${event}`, payload);
}

function validateLinkedInSettings(settings) {
  const accessToken = String(
    settings && settings.accessToken ? settings.accessToken : '',
  ).trim();
  const authorUrn = String(
    settings && settings.authorUrn ? settings.authorUrn : '',
  ).trim();
  const apiBaseUrl = String(
    settings && settings.apiBaseUrl ? settings.apiBaseUrl : 'https://api.linkedin.com',
  )
    .trim()
    .replace(/\/+$/, '');

  if (!accessToken) {
    throw new Error('LinkedIn access token is required');
  }
  if (!apiBaseUrl) {
    throw new Error('LinkedIn API base URL is required');
  }

  return { accessToken, authorUrn, apiBaseUrl };
}

function buildLinkedInErrorMessage(payload, fallback) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const message = String(
    source.message ||
      source.error_description ||
      source.error ||
      source.detail ||
      source.title ||
      fallback ||
      '',
  ).trim();
  return message;
}

async function callLinkedInApi(
  { accessToken, apiBaseUrl },
  path,
  options = {},
) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: String(options.method || 'GET'),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
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
      buildLinkedInErrorMessage(
        payload,
        text || response.statusText || 'LinkedIn API request failed',
      ),
    );
  }

  return payload;
}

async function resolveLinkedInAuthor(settings) {
  const validated = validateLinkedInSettings(settings);
  if (validated.authorUrn) {
    return validated.authorUrn;
  }

  const payload = await callLinkedInApi(validated, '/v2/userinfo');
  const sub = String(payload && payload.sub ? payload.sub : '').trim();
  if (!sub) {
    throw new Error(
      'LinkedIn author URN is required, or the token must support /v2/userinfo',
    );
  }
  return `urn:li:person:${sub}`;
}

export async function testLinkedInConnection(settings) {
  const validated = validateLinkedInSettings(settings);

  try {
    logLinkedIn('test.start', { apiBaseUrl: validated.apiBaseUrl });
    const payload = await callLinkedInApi(validated, '/v2/userinfo');
    const sub = String(payload && payload.sub ? payload.sub : '').trim();
    const name = String(
      payload && (payload.name || payload.localizedFirstName || '') ?
        payload.name || payload.localizedFirstName || ''
      : '',
    ).trim();
    const authorUrn = validated.authorUrn || (sub ? `urn:li:person:${sub}` : '');
    logLinkedIn('test.success', { sub, authorUrn });
    return {
      ok: true,
      message: `Connected LinkedIn account ${name || authorUrn || sub || '(unknown author)'}`,
    };
  } catch (error) {
    if (validated.authorUrn) {
      logLinkedIn('test.userinfo.skipped', {
        message: formatNestedError(error),
        authorUrn: validated.authorUrn,
      });
      return {
        ok: true,
        message: `LinkedIn token configured for ${validated.authorUrn}`,
      };
    }
    const message =
      formatNestedError(error) || 'Failed to connect to LinkedIn channel';
    logLinkedIn('test.failed', { message });
    throw new Error(message);
  }
}

export async function sendLinkedInMessage(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const settings =
    source.settings && typeof source.settings === 'object'
      ? source.settings
      : {};
  const validated = validateLinkedInSettings(settings);
  const body = String(source.body == null ? '' : source.body).trim();
  const attachments = Array.isArray(source.attachments)
    ? source.attachments.filter((item) => item && typeof item === 'object')
    : [];

  if (!body) {
    throw new Error('LinkedIn send requires a message body');
  }
  if (attachments.length) {
    throw new Error('LinkedIn send does not support attachments yet');
  }

  const author = await resolveLinkedInAuthor(settings);
  const response = await callLinkedInApi(validated, '/v2/ugcPosts', {
    method: 'POST',
    body: {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: body,
          },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    },
  });

  const id = String(
    (response && (response.id || response.entityUrn)) || '',
  ).trim();

  return {
    ok: true,
    postId: id,
    author,
  };
}

const LINKEDIN_HANDLER = defineChannelHandler({
  id: 'linkedin',
  name: 'LinkedIn',
  summary: 'LinkedIn posting channel for member shares/posts.',
  docs: ['https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin'],
  popularMethods: ['ugcPosts', 'posts', 'userinfo'],
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
    entities: ['member', 'post'],
  },
  testConnection: async ({ settings }) => testLinkedInConnection(settings),
  send: async ({ settings, payload }) =>
    sendLinkedInMessage({ ...(payload || {}), settings }),
});

export default LINKEDIN_HANDLER;
