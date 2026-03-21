import { validateAIProviderDefinition } from './definition.js';

import _CUSTOM from './CUSTOM.js';
import _DEEPSEEK from './DEEPSEEK.js';
import _FIREWORKS from './FIREWORKS.js';
import _GROQ from './GROQ.js';
import _LM_STUDIO from './LM_STUDIO.js';
import _OLLAMA from './OLLAMA.js';
import _OPENAI from './OPENAI.js';
import _OPENROUTER from './OPENROUTER.js';
import _TOGETHER from './TOGETHER.js';
import _XAI from './XAI.js';

const ALL_MODULES = {
  './CUSTOM.js': { default: _CUSTOM },
  './DEEPSEEK.js': { default: _DEEPSEEK },
  './FIREWORKS.js': { default: _FIREWORKS },
  './GROQ.js': { default: _GROQ },
  './LM_STUDIO.js': { default: _LM_STUDIO },
  './OLLAMA.js': { default: _OLLAMA },
  './OPENAI.js': { default: _OPENAI },
  './OPENROUTER.js': { default: _OPENROUTER },
  './TOGETHER.js': { default: _TOGETHER },
  './XAI.js': { default: _XAI },
};

function shouldIgnoreProviderFile(key) {
  return /(?:^|\/)(?:index|definition)\.js$/i.test(String(key || ''));
}

function buildDiscoveryHash(key, definition) {
  const input = JSON.stringify({
    key: String(key || ''),
    id: String(definition.id || ''),
    name: String(definition.name || ''),
    type: String(definition.type || ''),
    baseUrl: String(definition.baseUrl || ''),
    model: String(definition.model || ''),
    availableModels: Array.isArray(definition.availableModels)
      ? definition.availableModels
      : [],
  });

  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function discoverAIProviders() {
  const providers = [];
  const manifest = [];
  const seenIds = {};

  Object.keys(ALL_MODULES)
    .sort()
    .forEach((key) => {
      if (shouldIgnoreProviderFile(key)) return;
      const moduleExports = ALL_MODULES[key];
      const definition = validateAIProviderDefinition(
        moduleExports && moduleExports.default,
        key,
      );
      const providerId = String(definition.id || '');

      if (seenIds[providerId]) {
        throw new Error(
          `Duplicate AI provider id "${providerId}" in ${key} and ${seenIds[providerId]}`,
        );
      }

      seenIds[providerId] = key;
      providers.push(definition);
      manifest.push({
        file: key.replace(/^\.\//, ''),
        id: providerId,
        discoveryHash: buildDiscoveryHash(key, definition),
      });
    });

  return { providers, manifest };
}

const DISCOVERED = discoverAIProviders();
const PROVIDERS = DISCOVERED.providers;
const PROVIDER_MANIFEST = DISCOVERED.manifest;

export function getRegisteredAIProviders() {
  return PROVIDERS.slice();
}

export function getRegisteredAIProviderManifest() {
  return PROVIDER_MANIFEST.slice();
}

export function getRegisteredAIProviderById(providerId) {
  const target = String(providerId || '');
  return PROVIDERS.find((item) => item && item.id === target) || null;
}
