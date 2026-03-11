export function defineChannelConnector(definition) {
  const source = definition && typeof definition === 'object' ? definition : {};
  const id = String(source.id || '').trim();
  const type = String(source.type || '').trim();
  const name = String(source.name || '').trim();

  if (!id) throw new Error('Channel connector definition requires an id');
  if (!type) throw new Error('Channel connector definition requires a type');
  if (!name) throw new Error('Channel connector definition requires a name');

  return {
    id,
    type,
    name,
    description: String(source.description || '').trim(),
    packageName: String(source.packageName || '').trim(),
    supportsReceive: source.supportsReceive !== false,
    supportsSend: !!source.supportsSend,
    settingsFields: Array.isArray(source.settingsFields)
      ? source.settingsFields
          .filter((field) => field && typeof field === 'object' && field.key)
          .map((field) => ({
            key: String(field.key || '').trim(),
            label: String(field.label || field.key || '').trim(),
            type: String(field.type || 'text').trim(),
            placeholder: String(field.placeholder || '').trim(),
            defaultValue: field.defaultValue == null ? '' : field.defaultValue,
          }))
      : [],
    sendParams: Array.isArray(source.sendParams)
      ? source.sendParams
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      : [],
    mentioningFormulas: Array.isArray(source.mentioningFormulas)
      ? source.mentioningFormulas
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      : [],
    help: Array.isArray(source.help)
      ? source.help.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  };
}

export function validateChannelConnectorDefinition(definition, origin) {
  const source =
    definition && typeof definition === 'object' ? definition : null;
  const location = String(origin || 'unknown channel connector file');

  if (!source) {
    throw new Error(
      `Channel connector module ${location} must export a default connector definition object`,
    );
  }
  if (!String(source.id || '').trim()) {
    throw new Error(
      `Channel connector module ${location} is missing connector id`,
    );
  }
  if (!String(source.type || '').trim()) {
    throw new Error(
      `Channel connector module ${location} is missing connector type`,
    );
  }
  if (!String(source.name || '').trim()) {
    throw new Error(
      `Channel connector module ${location} is missing connector name`,
    );
  }

  return source;
}
