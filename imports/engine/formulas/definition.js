export function defineFormula(definition) {
  const source = definition && typeof definition === 'object' ? definition : {};
  const name = String(source.name || '')
    .trim()
    .toUpperCase();
  if (!name) {
    throw new Error('Formula definition requires a name');
  }

  return {
    name,
    aliases: Array.isArray(source.aliases)
      ? source.aliases
          .map((alias) =>
            String(alias || '')
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean)
      : [],
    summary: String(source.summary || '').trim(),
    signature: String(source.signature || `${name}(...)`).trim(),
    examples: Array.isArray(source.examples)
      ? source.examples.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    execute: typeof source.execute === 'function' ? source.execute : () => '',
  };
}

export function validateFormulaDefinition(definition, origin) {
  const source =
    definition && typeof definition === 'object' ? definition : null;
  const location = String(origin || 'unknown formula file');

  if (!source) {
    throw new Error(
      `Formula module ${location} must export a default formula definition object`,
    );
  }

  if (!String(source.name || '').trim()) {
    throw new Error(`Formula module ${location} is missing a formula name`);
  }

  if (typeof source.execute !== 'function') {
    throw new Error(
      `Formula module ${location} must provide an execute(args) function`,
    );
  }

  return source;
}
