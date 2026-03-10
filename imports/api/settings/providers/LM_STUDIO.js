import { defineAIProvider } from "./definition.js";

export default defineAIProvider({
  id: "lm-studio",
  name: "LM Studio",
  type: "lm_studio",
  baseUrl: "http://127.0.0.1:1234/v1",
  model: "",
  apiKey: "",
  enabled: true,
  availableModels: [],
  fields: [
    { key: "baseUrl", label: "Base URL", type: "text", placeholder: "http://127.0.0.1:1234/v1" },
    { key: "model", label: "Model override", type: "text", placeholder: "Leave empty to auto-detect" },
  ],
});
