import { defineAIProvider } from "./definition.js";

export default defineAIProvider({
  id: "deepseek",
  name: "DeepSeek",
  type: "deepseek",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
  apiKey: "",
  enabled: true,
  availableModels: [
    "deepseek-chat",
    "deepseek-reasoner",
  ],
  fields: [
    { key: "baseUrl", label: "Base URL", type: "text", placeholder: "https://api.deepseek.com" },
    { key: "model", label: "Model", type: "text", placeholder: "deepseek-chat" },
    { key: "apiKey", label: "API key", type: "password", placeholder: "sk-..." },
  ],
});
