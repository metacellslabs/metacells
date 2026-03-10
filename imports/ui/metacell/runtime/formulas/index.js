import { formulaHelpers } from "./helpers.js";
import { validateFormulaDefinition } from "./definition.js";

function shouldIgnoreFormulaFile(key) {
  return /(?:^|\/)(?:index|definition|helpers)\.js$/i.test(String(key || ""));
}

function buildDiscoveryHash(key, definition) {
  const input = JSON.stringify({
    key: String(key || ""),
    name: String(definition.name || ""),
    signature: String(definition.signature || ""),
    summary: String(definition.summary || ""),
    examples: Array.isArray(definition.examples) ? definition.examples : [],
  });

  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function discoverFormulaModules() {
  const context = import.meta.webpackContext("./", {
    recursive: false,
    regExp: /\.js$/,
  });
  const formulas = [];
  const manifest = [];
  const seenNames = {};

  context.keys().sort().forEach((key) => {
    if (shouldIgnoreFormulaFile(key)) return;

    const moduleExports = context(key);
    const definition = validateFormulaDefinition(moduleExports && moduleExports.default, key);
    const formulaName = String(definition.name || "").toUpperCase();

    if (seenNames[formulaName]) {
      throw new Error(`Duplicate formula name "${formulaName}" in ${key} and ${seenNames[formulaName]}`);
    }

    seenNames[formulaName] = key;
    formulas.push(definition);
    manifest.push({
      file: key.replace(/^\.\//, ""),
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
        throw new Error(`${definition.name}: ${error && error.message ? error.message : error}`);
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
    title: "Built-in formulas",
    items: getRegisteredFormulas().map((formula) => {
      const lines = [`\`${formula.signature}\` ${formula.summary}`];
      if (formula.examples.length) {
        lines.push(`Examples: ${formula.examples.join(" | ")}`);
      }
      return lines.join("\n");
    }),
  };
}
