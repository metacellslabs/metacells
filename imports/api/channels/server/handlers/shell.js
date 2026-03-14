import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defineChannelHandler } from '../handler-definition.js';

const execFileAsync = promisify(execFile);

function validateShellSettings(settings) {
  const shellPath = String(
    settings && settings.shellPath ? settings.shellPath : '/bin/zsh',
  ).trim() || '/bin/zsh';
  const workingDirectory = String(
    settings && settings.workingDirectory ? settings.workingDirectory : '',
  ).trim();
  const defaultCommand = String(
    settings && settings.defaultCommand ? settings.defaultCommand : '',
  ).trim();
  const timeoutMs = Math.max(
    1000,
    Math.min(300000, parseInt(settings && settings.timeoutMs, 10) || 30000),
  );

  return {
    shellPath,
    workingDirectory,
    defaultCommand,
    timeoutMs,
  };
}

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

function logShell(event, payload) {
  console.log(`[channels.shell] ${event}`, payload);
}

async function runShellCommand(validated, command) {
  const shellCommand = String(command || '').trim();
  if (!shellCommand) {
    throw new Error('Shell command is required');
  }

  try {
    const result = await execFileAsync(validated.shellPath, ['-lc', shellCommand], {
      cwd: validated.workingDirectory || undefined,
      timeout: validated.timeoutMs,
      maxBuffer: 1024 * 1024 * 4,
    });
    return {
      stdout: String(result.stdout || '').trim(),
      stderr: String(result.stderr || '').trim(),
    };
  } catch (error) {
    throw new Error(
      formatNestedError(error) ||
        String(error && error.stderr ? error.stderr : '').trim() ||
        'Shell command failed',
    );
  }
}

export async function testShellConnection(settings) {
  const validated = validateShellSettings(settings);
  const probeCommand = validated.defaultCommand || 'pwd';
  logShell('test.start', {
    shellPath: validated.shellPath,
    workingDirectory: validated.workingDirectory,
    command: probeCommand,
  });
  const result = await runShellCommand(validated, probeCommand);
  return {
    ok: true,
    message: result.stdout || result.stderr || 'Shell command completed',
  };
}

export async function sendShellMessage(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const settings =
    source.settings && typeof source.settings === 'object'
      ? source.settings
      : {};
  const validated = validateShellSettings(settings);
  const command = String(
    source.command || source.body || validated.defaultCommand || '',
  ).trim();

  const result = await runShellCommand(validated, command);
  return {
    ok: true,
    command,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

const SHELL_HANDLER = defineChannelHandler({
  id: 'shell',
  name: 'Shell',
  summary: 'Local shell execution channel for trusted environments.',
  docs: ['https://pubs.opengroup.org/onlinepubs/9699919799/utilities/V3_chap02.html'],
  popularMethods: ['execute command', 'pwd', 'git status', 'ls'],
  capabilities: {
    test: true,
    send: true,
    receive: false,
    poll: false,
    normalizeEvent: false,
    search: false,
    attachments: false,
    oauth: false,
    actions: ['test', 'exec'],
    entities: ['command', 'stdout', 'stderr'],
  },
  testConnection: async ({ settings }) => testShellConnection(settings),
  send: async ({ settings, payload }) =>
    sendShellMessage({ ...(payload || {}), settings }),
});

export default SHELL_HANDLER;
