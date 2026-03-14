import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defineChannelHandler } from '../handler-definition.js';

const execFileAsync = promisify(execFile);

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

function logGitHub(event, payload) {
  console.log(`[channels.github] ${event}`, payload);
}

function validateGitHubSettings(settings) {
  const accessToken = String(
    settings && settings.accessToken ? settings.accessToken : '',
  ).trim();
  const owner = String(settings && settings.owner ? settings.owner : '').trim();
  const repo = String(settings && settings.repo ? settings.repo : '').trim();
  const defaultBranch = String(
    settings && settings.defaultBranch ? settings.defaultBranch : 'main',
  ).trim() || 'main';
  const localRepoPath = String(
    settings && settings.localRepoPath ? settings.localRepoPath : '',
  ).trim();
  const apiBaseUrl = String(
    settings && settings.apiBaseUrl ? settings.apiBaseUrl : 'https://api.github.com',
  )
    .trim()
    .replace(/\/+$/, '');

  if (!accessToken) {
    throw new Error('GitHub access token is required');
  }
  if (!owner) {
    throw new Error('GitHub owner is required');
  }
  if (!repo) {
    throw new Error('GitHub repository is required');
  }
  if (!apiBaseUrl) {
    throw new Error('GitHub API base URL is required');
  }

  return { accessToken, owner, repo, defaultBranch, localRepoPath, apiBaseUrl };
}

async function callGitHubApi(validated, path) {
  const response = await fetch(`${validated.apiBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${validated.accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'MetaCells',
    },
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
        (payload && (payload.message || payload.error)) ||
          text ||
          response.statusText ||
          'GitHub API request failed',
      ).trim(),
    );
  }

  return payload;
}

function toEventUid(event) {
  const created = Date.parse(String((event && event.created_at) || ''));
  if (Number.isFinite(created) && created > 0) return created;
  return Date.now();
}

function summarizeEvent(event) {
  const source = event && typeof event === 'object' ? event : {};
  const actor = String(source.actor && source.actor.login ? source.actor.login : '').trim();
  const type = String(source.type || '').trim();
  const action = String(source.payload && source.payload.action ? source.payload.action : '').trim();
  const refType = String(source.payload && source.payload.ref_type ? source.payload.ref_type : '').trim();
  const ref = String(source.payload && source.payload.ref ? source.payload.ref : '').trim();
  const issueTitle = String(
    source.payload &&
      source.payload.issue &&
      source.payload.issue.title
      ? source.payload.issue.title
      : '',
  ).trim();
  const prTitle = String(
    source.payload &&
      source.payload.pull_request &&
      source.payload.pull_request.title
      ? source.payload.pull_request.title
      : '',
  ).trim();

  return [
    actor ? `Actor: ${actor}` : '',
    type ? `Type: ${type}` : '',
    action ? `Action: ${action}` : '',
    refType ? `Ref type: ${refType}` : '',
    ref ? `Ref: ${ref}` : '',
    issueTitle ? `Issue: ${issueTitle}` : '',
    prTitle ? `Pull request: ${prTitle}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

async function runGitCommand(cwd, args) {
  try {
    const result = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 1024 * 1024 * 4,
    });
    return {
      stdout: String(result.stdout || '').trim(),
      stderr: String(result.stderr || '').trim(),
    };
  } catch (error) {
    throw new Error(
      formatNestedError(error) ||
        (error && error.stderr ? String(error.stderr).trim() : '') ||
        'git command failed',
    );
  }
}

async function ensureGitRepo(localRepoPath) {
  const cwd = String(localRepoPath || '').trim();
  if (!cwd) {
    throw new Error('GitHub channel requires localRepoPath for push/pull actions');
  }
  await runGitCommand(cwd, ['rev-parse', '--is-inside-work-tree']);
  return cwd;
}

export async function testGitHubConnection(settings) {
  const validated = validateGitHubSettings(settings);
  const repoPayload = await callGitHubApi(
    validated,
    `/repos/${encodeURIComponent(validated.owner)}/${encodeURIComponent(validated.repo)}`,
  );
  const fullName = String(repoPayload && repoPayload.full_name ? repoPayload.full_name : '')
    .trim();
  return {
    ok: true,
    message: `Connected GitHub repository ${fullName || `${validated.owner}/${validated.repo}`}`,
  };
}

export async function handleGitHubEvent(eventType, payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return {
    event: String(eventType || source.type || 'repository.event'),
    message: {
      event: String(source.type || eventType || 'repository.event'),
      actor: String(source.actor && source.actor.login ? source.actor.login : ''),
      repo: String(source.repo && source.repo.name ? source.repo.name : ''),
      action: String(source.payload && source.payload.action ? source.payload.action : ''),
      createdAt: String(source.created_at || ''),
      summary: summarizeEvent(source),
      payload: source.payload && typeof source.payload === 'object' ? source.payload : {},
      sourceId: String(source.id || ''),
      htmlUrl: String(
        (source.payload &&
          source.payload.pull_request &&
          source.payload.pull_request.html_url) ||
          (source.payload && source.payload.issue && source.payload.issue.html_url) ||
          '',
      ),
    },
  };
}

export async function pollGitHubEvents(settings, channel) {
  const validated = validateGitHubSettings(settings);
  const lastSeenUid = Number(channel && channel.lastSeenUid) || 0;
  const eventsPayload = await callGitHubApi(
    validated,
    `/repos/${encodeURIComponent(validated.owner)}/${encodeURIComponent(validated.repo)}/events`,
  );
  const source = Array.isArray(eventsPayload) ? eventsPayload : [];
  const fresh = source
    .map((event) => ({
      ...(event && typeof event === 'object' ? event : {}),
      uid: toEventUid(event),
    }))
    .filter((event) => Number(event.uid) > lastSeenUid)
    .sort((left, right) => Number(left.uid) - Number(right.uid));

  const nextLastSeenUid = fresh.length
    ? Number(fresh[fresh.length - 1].uid)
    : lastSeenUid;

  logGitHub('poll.complete', {
    owner: validated.owner,
    repo: validated.repo,
    events: fresh.length,
    lastSeenUid: nextLastSeenUid,
  });

  return {
    ok: true,
    lastSeenUid: nextLastSeenUid,
    events: fresh,
  };
}

export async function sendGitHubMessage(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const settings =
    source.settings && typeof source.settings === 'object'
      ? source.settings
      : {};
  const validated = validateGitHubSettings(settings);
  const action = String(source.action || '').trim().toLowerCase();
  const branch = String(source.branch || validated.defaultBranch || 'main').trim();
  const commitMessage = String(
    source.commitMessage || source.subj || 'MetaCells update',
  ).trim();
  const pathspec = Array.isArray(source.pathspec)
    ? source.pathspec.map((item) => String(item || '').trim()).filter(Boolean)
    : String(source.pathspec || '').trim()
      ? [String(source.pathspec || '').trim()]
      : [];

  if (action !== 'pull' && action !== 'push') {
    throw new Error('GitHub send requires action "pull" or "push"');
  }

  const cwd = await ensureGitRepo(validated.localRepoPath);

  if (action === 'pull') {
    const result = await runGitCommand(cwd, [
      'pull',
      '--ff-only',
      'origin',
      branch,
    ]);
    return {
      ok: true,
      action: 'pull',
      branch,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  const status = await runGitCommand(cwd, ['status', '--porcelain']);
  if (!String(status.stdout || '').trim()) {
    const pushResult = await runGitCommand(cwd, ['push', 'origin', branch]);
    return {
      ok: true,
      action: 'push',
      branch,
      committed: false,
      stdout: pushResult.stdout,
      stderr: pushResult.stderr,
    };
  }

  await runGitCommand(
    cwd,
    pathspec.length ? ['add', '--', ...pathspec] : ['add', '-A'],
  );
  await runGitCommand(cwd, ['commit', '-m', commitMessage]);
  const pushResult = await runGitCommand(cwd, ['push', 'origin', branch]);
  return {
    ok: true,
    action: 'push',
    branch,
    committed: true,
    commitMessage,
    stdout: pushResult.stdout,
    stderr: pushResult.stderr,
  };
}

const GITHUB_HANDLER = defineChannelHandler({
  id: 'github',
  name: 'GitHub',
  summary: 'Repository channel for repo events and local git push/pull actions.',
  docs: [
    'https://docs.github.com/en/rest/activity/events',
    'https://docs.github.com/en/rest/search',
  ],
  popularMethods: [
    'repos/{owner}/{repo}/events',
    'search/issues',
    'search/repositories',
    'git pull',
    'git push',
  ],
  capabilities: {
    test: true,
    send: true,
    receive: true,
    poll: true,
    normalizeEvent: true,
    search: true,
    attachments: false,
    oauth: true,
    actions: ['test', 'push', 'pull', 'poll', 'search'],
    entities: ['repository', 'event', 'issue', 'pull_request', 'commit'],
  },
  testConnection: async ({ settings }) => testGitHubConnection(settings),
  send: async ({ settings, payload }) =>
    sendGitHubMessage({ ...(payload || {}), settings }),
  poll: async ({ settings, channel }) => pollGitHubEvents(settings, channel),
  normalizeEvent: async ({ eventType, payload }) =>
    handleGitHubEvent(eventType, payload),
});

export default GITHUB_HANDLER;
