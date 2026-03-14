import { validateChannelConnectorDefinition } from './definition.js';

function formatConnectorCapabilities(connector) {
  const capabilities =
    connector && typeof connector === 'object' && connector.capabilities
      ? connector.capabilities
      : {};
  const flags = [
    capabilities.test !== false ? 'test' : '',
    capabilities.send ? 'send' : '',
    capabilities.receive ? 'receive' : '',
    capabilities.subscribe ? 'subscribe' : '',
    capabilities.poll ? 'poll' : '',
    capabilities.normalizeEvent ? 'normalize-event' : '',
    capabilities.search ? 'search' : '',
    capabilities.attachments ? 'attachments' : '',
    capabilities.oauth ? 'oauth' : '',
  ].filter(Boolean);
  const actions = Array.isArray(capabilities.actions)
    ? capabilities.actions.filter(Boolean)
    : [];
  const entities = Array.isArray(capabilities.entities)
    ? capabilities.entities.filter(Boolean)
    : [];
  return {
    flags,
    actions,
    entities,
  };
}

function shouldIgnoreConnectorFile(key) {
  return /(?:^|\/)(?:index|definition)\.js$/i.test(String(key || ''));
}

function buildDiscoveryHash(key, definition) {
  const input = JSON.stringify({
    key: String(key || ''),
    id: String(definition.id || ''),
    name: String(definition.name || ''),
    type: String(definition.type || ''),
    packageName: String(definition.packageName || ''),
  });

  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function discoverChannelConnectors() {
  const context = import.meta.webpackContext('./', {
    recursive: false,
    regExp: /\.js$/,
  });
  const connectors = [];
  const manifest = [];
  const seenIds = {};

  context
    .keys()
    .sort()
    .forEach((key) => {
      if (shouldIgnoreConnectorFile(key)) return;
      const moduleExports = context(key);
      const definition = validateChannelConnectorDefinition(
        moduleExports && moduleExports.default,
        key,
      );
      const connectorId = String(definition.id || '');

      if (seenIds[connectorId]) {
        throw new Error(
          `Duplicate channel connector id "${connectorId}" in ${key} and ${seenIds[connectorId]}`,
        );
      }

      seenIds[connectorId] = key;
      connectors.push(definition);
      manifest.push({
        file: key.replace(/^\.\//, ''),
        id: connectorId,
        discoveryHash: buildDiscoveryHash(key, definition),
      });
    });

  return { connectors, manifest };
}

const DISCOVERED = discoverChannelConnectors();
const CONNECTORS = DISCOVERED.connectors;
const CONNECTOR_MANIFEST = DISCOVERED.manifest;

export function getRegisteredChannelConnectors() {
  return CONNECTORS.slice();
}

export function getRegisteredChannelConnectorManifest() {
  return CONNECTOR_MANIFEST.slice();
}

export function getRegisteredChannelConnectorById(connectorId) {
  const target = String(connectorId || '');
  return CONNECTORS.find((item) => item && item.id === target) || null;
}

export function buildChannelHelpSection() {
  return {
    title: 'Channels',
    items: CONNECTORS.flatMap((connector) => {
      const lines = [];
      lines.push(
        `\`${connector.name}\` uses package \`${connector.packageName || 'custom'}\``,
      );
      const capabilitySummary = formatConnectorCapabilities(connector);
      if (capabilitySummary.flags.length) {
        lines.push(
          `Capabilities: ${capabilitySummary.flags.join(', ')}`,
        );
      }
      if (capabilitySummary.actions.length) {
        lines.push(`Actions: ${capabilitySummary.actions.join(', ')}`);
      }
      if (capabilitySummary.entities.length) {
        lines.push(`Entities: ${capabilitySummary.entities.join(', ')}`);
      }
      connector.help.forEach((item) => lines.push(item));
      connector.mentioningFormulas.forEach((item) =>
        lines.push(`Example: \`${item}\``),
      );
      return lines;
    }),
  };
}
