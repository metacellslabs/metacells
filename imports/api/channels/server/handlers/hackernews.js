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

function logHackerNews(event, payload) {
  console.log(`[channels.hackernews] ${event}`, payload);
}

function validateHackerNewsSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const feed = String(source.feed || 'newstories').trim().toLowerCase();
  const limit = Math.max(1, Math.min(100, parseInt(source.limit, 10) || 20));
  const apiBaseUrl = String(
    source.apiBaseUrl || 'https://hacker-news.firebaseio.com/v0',
  )
    .trim()
    .replace(/\/+$/, '');

  const allowedFeeds = {
    newstories: true,
    topstories: true,
    beststories: true,
    askstories: true,
    showstories: true,
    jobstories: true,
  };
  if (!allowedFeeds[feed]) {
    throw new Error(
      'Hacker News feed must be one of newstories, topstories, beststories, askstories, showstories, jobstories',
    );
  }
  if (!apiBaseUrl) {
    throw new Error('Hacker News API base URL is required');
  }

  return { feed, limit, apiBaseUrl };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function normalizeStoryPayload(item, feed) {
  const source = item && typeof item === 'object' ? item : {};
  const id = Number(source.id) || 0;
  const url = String(source.url || '').trim();
  return {
    event: 'story.new',
    type: String(source.type || 'story'),
    feed: String(feed || ''),
    hnId: id,
    uid: id,
    title: String(source.title || '').trim(),
    by: String(source.by || '').trim(),
    score: Number(source.score) || 0,
    descendants: Number(source.descendants) || 0,
    time: Number(source.time) || 0,
    url,
    text: String(source.text || '').trim(),
  };
}

export async function testHackerNewsConnection(settings) {
  const validated = validateHackerNewsSettings(settings);
  try {
    const maxItem = await fetchJson(`${validated.apiBaseUrl}/maxitem.json`);
    return {
      ok: true,
      message: `Connected Hacker News feed ${validated.feed}. Latest item id: ${Number(maxItem) || 0}`,
    };
  } catch (error) {
    const message =
      formatNestedError(error) || 'Failed to connect to Hacker News channel';
    logHackerNews('test.failed', { message, feed: validated.feed });
    throw new Error(message);
  }
}

export async function handleHackerNewsEvent(eventType, payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const summary = [
    source.title ? `Title: ${String(source.title)}` : '',
    source.by ? `By: ${String(source.by)}` : '',
    Number.isFinite(Number(source.score)) ? `Score: ${Number(source.score)}` : '',
    Number.isFinite(Number(source.descendants))
      ? `Comments: ${Number(source.descendants)}`
      : '',
    source.url ? `URL: ${String(source.url)}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
  return {
    event: String(eventType || source.event || 'story.new'),
    message: {
      ...source,
      summary,
    },
  };
}

export async function pollHackerNewsStories(settings, channel) {
  const validated = validateHackerNewsSettings(settings);
  const lastSeenUid = Number(channel && channel.lastSeenUid) || 0;
  const ids = await fetchJson(
    `${validated.apiBaseUrl}/${validated.feed}.json`,
  );
  const sourceIds = Array.isArray(ids) ? ids.slice(0, validated.limit) : [];
  const freshIds = sourceIds
    .map((value) => Number(value) || 0)
    .filter((value) => value > 0 && value > lastSeenUid)
    .sort((left, right) => left - right);

  const events = [];
  for (let i = 0; i < freshIds.length; i += 1) {
    const id = freshIds[i];
    const item = await fetchJson(`${validated.apiBaseUrl}/item/${id}.json`);
    if (!item || typeof item !== 'object') continue;
    events.push(normalizeStoryPayload(item, validated.feed));
  }

  const nextLastSeenUid = freshIds.length
    ? freshIds[freshIds.length - 1]
    : lastSeenUid;

  logHackerNews('poll.complete', {
    feed: validated.feed,
    events: events.length,
    lastSeenUid: nextLastSeenUid,
  });

  return {
    ok: true,
    lastSeenUid: nextLastSeenUid,
    events,
  };
}

const HACKERNEWS_HANDLER = defineChannelHandler({
  id: 'hackernews',
  name: 'Hacker News',
  summary: 'Receive-only Hacker News channel backed by the Firebase API.',
  docs: ['https://github.com/HackerNews/API'],
  popularMethods: ['maxitem', 'newstories', 'topstories', 'item/{id}'],
  capabilities: {
    test: true,
    send: false,
    receive: true,
    poll: true,
    normalizeEvent: true,
    search: true,
    attachments: false,
    oauth: false,
    actions: ['test', 'poll', 'search'],
    entities: ['story', 'job', 'comment'],
  },
  testConnection: async ({ settings }) => testHackerNewsConnection(settings),
  poll: async ({ settings, channel }) => pollHackerNewsStories(settings, channel),
  normalizeEvent: async ({ eventType, payload }) =>
    handleHackerNewsEvent(eventType, payload),
});

export default HACKERNEWS_HANDLER;
