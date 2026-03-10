export function defineAIProvider(definition) {
  const source = definition && typeof definition === "object" ? definition : {};
  const id = String(source.id || "").trim();
  const type = String(source.type || "").trim();
  const name = String(source.name || "").trim();

  if (!id) throw new Error("AI provider definition requires an id");
  if (!type) throw new Error("AI provider definition requires a type");
  if (!name) throw new Error("AI provider definition requires a name");

  return {
    id,
    type,
    name,
    baseUrl: String(source.baseUrl || "").trim(),
    model: String(source.model || "").trim(),
    apiKey: String(source.apiKey || "").trim(),
    enabled: source.enabled !== false,
    availableModels: Array.isArray(source.availableModels)
      ? source.availableModels.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    fields: Array.isArray(source.fields)
      ? source.fields
          .filter((field) => field && typeof field === "object" && field.key)
          .map((field) => ({
            key: String(field.key || "").trim(),
            label: String(field.label || field.key || "").trim(),
            type: String(field.type || "text").trim(),
            placeholder: String(field.placeholder || "").trim(),
          }))
      : [],
  };
}

export function validateAIProviderDefinition(definition, origin) {
  const source = definition && typeof definition === "object" ? definition : null;
  const location = String(origin || "unknown provider file");

  if (!source) {
    throw new Error(`AI provider module ${location} must export a default provider definition object`);
  }
  if (!String(source.id || "").trim()) {
    throw new Error(`AI provider module ${location} is missing provider id`);
  }
  if (!String(source.type || "").trim()) {
    throw new Error(`AI provider module ${location} is missing provider type`);
  }
  if (!String(source.name || "").trim()) {
    throw new Error(`AI provider module ${location} is missing provider name`);
  }

  return source;
}
