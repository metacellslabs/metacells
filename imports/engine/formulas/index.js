import { formulaHelpers } from './helpers.js';
import { validateFormulaDefinition } from './definition.js';

import _ABS from './ABS.js';
import _AND from './AND.js';
import _AVERAGE from './AVERAGE.js';
import _COUNT from './COUNT.js';
import _COUNTA from './COUNTA.js';
import _COUNTIF from './COUNTIF.js';
import _DATEDIF from './DATEDIF.js';
import _DOCX from './DOCX.js';
import _FILE from './FILE.js';
import _FILTER from './FILTER.js';
import _IF from './IF.js';
import _IFERROR from './IFERROR.js';
import _INDEX_FORMULA from './INDEX_FORMULA.js';
import _LEFT from './LEFT.js';
import _LEN from './LEN.js';
import _LOWER from './LOWER.js';
import _MATCH from './MATCH.js';
import _MAX from './MAX.js';
import _MIN from './MIN.js';
import _OR from './OR.js';
import _PDF from './PDF.js';
import _RIGHT from './RIGHT.js';
import _ROUND from './ROUND.js';
import _SUM from './SUM.js';
import _SUMIF from './SUMIF.js';
import _TODAY from './TODAY.js';
import _TRIM from './TRIM.js';
import _UPPER from './UPPER.js';
import _VLOOKUP from './VLOOKUP.js';
import _XLOOKUP from './XLOOKUP.js';

const ALL_MODULES = {
  './ABS.js': { default: _ABS },
  './AND.js': { default: _AND },
  './AVERAGE.js': { default: _AVERAGE },
  './COUNT.js': { default: _COUNT },
  './COUNTA.js': { default: _COUNTA },
  './COUNTIF.js': { default: _COUNTIF },
  './DATEDIF.js': { default: _DATEDIF },
  './DOCX.js': { default: _DOCX },
  './FILE.js': { default: _FILE },
  './FILTER.js': { default: _FILTER },
  './IF.js': { default: _IF },
  './IFERROR.js': { default: _IFERROR },
  './INDEX_FORMULA.js': { default: _INDEX_FORMULA },
  './LEFT.js': { default: _LEFT },
  './LEN.js': { default: _LEN },
  './LOWER.js': { default: _LOWER },
  './MATCH.js': { default: _MATCH },
  './MAX.js': { default: _MAX },
  './MIN.js': { default: _MIN },
  './OR.js': { default: _OR },
  './PDF.js': { default: _PDF },
  './RIGHT.js': { default: _RIGHT },
  './ROUND.js': { default: _ROUND },
  './SUM.js': { default: _SUM },
  './SUMIF.js': { default: _SUMIF },
  './TODAY.js': { default: _TODAY },
  './TRIM.js': { default: _TRIM },
  './UPPER.js': { default: _UPPER },
  './VLOOKUP.js': { default: _VLOOKUP },
  './XLOOKUP.js': { default: _XLOOKUP },
};

function shouldIgnoreFormulaFile(key) {
  return /(?:^|\/)(?:index|definition|helpers)\.js$/i.test(String(key || ''));
}

function buildDiscoveryHash(key, definition) {
  const input = JSON.stringify({
    key: String(key || ''),
    name: String(definition.name || ''),
    signature: String(definition.signature || ''),
    summary: String(definition.summary || ''),
    examples: Array.isArray(definition.examples) ? definition.examples : [],
  });

  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function discoverFormulaModules() {
  const formulas = [];
  const manifest = [];
  const seenNames = {};

  Object.keys(ALL_MODULES)
    .sort()
    .forEach((key) => {
      if (shouldIgnoreFormulaFile(key)) return;

      const moduleExports = ALL_MODULES[key];
      const definition = validateFormulaDefinition(
        moduleExports && moduleExports.default,
        key,
      );
      const formulaName = String(definition.name || '').toUpperCase();

      if (seenNames[formulaName]) {
        throw new Error(
          `Duplicate formula name "${formulaName}" in ${key} and ${seenNames[formulaName]}`,
        );
      }

      seenNames[formulaName] = key;
      formulas.push(definition);
      manifest.push({
        file: key.replace(/^\.\//, ''),
        name: formulaName,
        discoveryHash: buildDiscoveryHash(key, definition),
      });
    });

  return { formulas, manifest };
}

const DISCOVERED = discoverFormulaModules();
const FORMULAS = DISCOVERED.formulas;
const FORMULA_MANIFEST = DISCOVERED.manifest;

export function getRegisteredFormulas() {
  return FORMULAS.slice();
}

export function getRegisteredFormulaManifest() {
  return FORMULA_MANIFEST.slice();
}

export function buildFormulaContext(engine, executionContext) {
  const context = {};
  const formulas = getRegisteredFormulas();

  formulas.forEach((definition) => {
    const handler = (...args) => {
      try {
        return definition.execute({
          args,
          engine,
          helpers: formulaHelpers,
          ...executionContext,
        });
      } catch (error) {
        throw new Error(
          `${definition.name}: ${error && error.message ? error.message : error}`,
        );
      }
    };

    context[definition.name] = handler;
    context[definition.name.toLowerCase()] = handler;
    definition.aliases.forEach((alias) => {
      context[alias] = handler;
      context[alias.toLowerCase()] = handler;
    });
  });

  return context;
}

export function buildFormulaHelpSection() {
  return {
    title: 'Built-in formulas',
    items: getRegisteredFormulas().map((formula) => {
      const lines = [`\`${formula.signature}\` ${formula.summary}`];
      if (formula.examples.length) {
        lines.push(`Examples: ${formula.examples.join(' | ')}`);
      }
      return lines.join('\n');
    }),
  };
}
