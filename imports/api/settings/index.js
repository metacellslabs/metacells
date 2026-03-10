import { Mongo } from "meteor/mongo";
import { Meteor } from "meteor/meteor";
import { check, Match } from "meteor/check";
import {
  getRegisteredAIProviders,
  getRegisteredAIProviderById,
} from "./providers/index.js";

export const AppSettings = new Mongo.Collection("app_settings");

export const DEFAULT_SETTINGS_ID = "default";
export const DEFAULT_AI_PROVIDERS = getRegisteredAIProviders();
export const DEFAULT_DEEPSEEK_PROVIDER = getRegisteredAIProviderById("deepseek");
export const DEFAULT_LM_STUDIO_PROVIDER = getRegisteredAIProviderById("lm-studio");

function getDefaultProviderByType(type) {
  const target = String(type || "");
  return DEFAULT_AI_PROVIDERS.find((provider) => provider && provider.type === target) || DEFAULT_AI_PROVIDERS[0] || null;
}

function normalizeProvider(provider, fallback) {
  const source = provider && typeof provider === "object" ? provider : {};
  const base = fallback || DEFAULT_AI_PROVIDERS[0] || {};
  return {
    id: String(source.id || base.id || "").trim(),
    name: String(source.name || base.name || "").trim(),
    type: String(source.type || base.type || "").trim(),
    baseUrl: String(source.baseUrl || base.baseUrl || "").trim(),
    model: String(source.model || base.model || "").trim(),
    apiKey: String(source.apiKey || "").trim(),
    enabled: source.enabled !== false,
    availableModels: Array.isArray(base.availableModels) ? base.availableModels.slice() : [],
    fields: Array.isArray(base.fields) ? base.fields.slice() : [],
  };
}

function normalizeProviders(providers) {
  const input = Array.isArray(providers) ? providers : [];
  const byId = new Map();
  const byType = new Map();

  for (let i = 0; i < input.length; i += 1) {
    const provider = input[i];
    if (!provider || typeof provider !== "object") continue;
    if (provider.id) byId.set(String(provider.id), provider);
    if (provider.type) byType.set(String(provider.type), provider);
  }

  return DEFAULT_AI_PROVIDERS.map((provider) => {
    const matched = byId.get(provider.id) || byType.get(provider.type) || null;
    return normalizeProvider(matched, provider);
  });
}

function createDefaultSettingsDoc() {
  const now = new Date();
  return {
    _id: DEFAULT_SETTINGS_ID,
    aiProviders: normalizeProviders(DEFAULT_AI_PROVIDERS),
    activeAIProviderId: String(DEFAULT_DEEPSEEK_PROVIDER?.id || DEFAULT_AI_PROVIDERS[0]?.id || ""),
    communicationChannels: [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function ensureDefaultSettings() {
  const existing = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
  if (existing) return existing;

  const doc = createDefaultSettingsDoc();
  try {
    await AppSettings.insertAsync(doc);
    return doc;
  } catch (error) {
    if (!error || String(error.code || "") !== "11000") {
      throw error;
    }
    const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
    if (current) return current;
    throw error;
  }
}

export async function resetLMStudioBaseUrlInDb() {
  await ensureDefaultSettings();

  const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
  const providers = normalizeProviders(current && current.aiProviders);
  const lmStudioDefault = getDefaultProviderByType("lm_studio");
  const nextProviders = providers.map((provider) => {
    if (provider.type !== "lm_studio" || !lmStudioDefault) return provider;
    return {
      ...provider,
      id: lmStudioDefault.id,
      name: lmStudioDefault.name,
      type: lmStudioDefault.type,
      baseUrl: lmStudioDefault.baseUrl,
      model: lmStudioDefault.model,
      availableModels: lmStudioDefault.availableModels || [],
      fields: lmStudioDefault.fields || [],
    };
  });

  const fallbackActiveId = String(DEFAULT_DEEPSEEK_PROVIDER?.id || DEFAULT_AI_PROVIDERS[0]?.id || "");
  await AppSettings.updateAsync(
    { _id: DEFAULT_SETTINGS_ID },
    {
      $set: {
        aiProviders: nextProviders,
        activeAIProviderId: String(current && current.activeAIProviderId || "") || fallbackActiveId,
        updatedAt: new Date(),
      },
    },
  );

  return String(lmStudioDefault?.baseUrl || "");
}

export async function getLMStudioBaseUrl() {
  const settings = await ensureDefaultSettings();
  const providers = normalizeProviders(settings.aiProviders);
  const provider = providers.find((item) => item && item.type === "lm_studio" && item.enabled !== false);
  return (provider && provider.baseUrl) || String(DEFAULT_LM_STUDIO_PROVIDER?.baseUrl || "");
}

export async function getActiveAIProvider() {
  const settings = await ensureDefaultSettings();
  const providers = normalizeProviders(settings.aiProviders);
  const fallbackActiveId = String(DEFAULT_DEEPSEEK_PROVIDER?.id || DEFAULT_AI_PROVIDERS[0]?.id || "");
  const activeId = String(settings && settings.activeAIProviderId || fallbackActiveId);
  const activeProvider = providers.find((item) => item && item.id === activeId && item.enabled !== false);
  if (activeProvider) return activeProvider;
  return providers.find((item) => item && item.enabled !== false) || normalizeProvider(DEFAULT_AI_PROVIDERS[0], DEFAULT_AI_PROVIDERS[0]);
}

if (Meteor.isServer) {
  Meteor.startup(async () => {
    await ensureDefaultSettings();
    const resetUrl = await resetLMStudioBaseUrlInDb();
    console.log("[settings] lmStudioBaseUrl.reset", { baseUrl: resetUrl });
  });

  Meteor.publish("settings.default", function publishDefaultSettings() {
    return AppSettings.find(
      { _id: DEFAULT_SETTINGS_ID },
      {
        fields: {
          aiProviders: 1,
          activeAIProviderId: 1,
          communicationChannels: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    );
  });

  Meteor.methods({
    async "settings.resetLMStudioBaseUrl"() {
      return resetLMStudioBaseUrlInDb();
    },

    async "settings.upsertAIProvider"(provider) {
      check(
        provider,
        {
          id: String,
          name: String,
          type: String,
          baseUrl: String,
          model: Match.Maybe(String),
          apiKey: Match.Maybe(String),
          enabled: Boolean,
        },
      );

      await ensureDefaultSettings();

      const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
      const nextProviders = normalizeProviders(current && current.aiProviders);
      const fallback = getRegisteredAIProviderById(provider.id) || getDefaultProviderByType(provider.type);
      const nextProvider = normalizeProvider(provider, fallback);

      const index = nextProviders.findIndex((item) => item && item.id === nextProvider.id);
      if (index === -1) {
        nextProviders.push(nextProvider);
      } else {
        nextProviders[index] = nextProvider;
      }

      await AppSettings.updateAsync(
        { _id: DEFAULT_SETTINGS_ID },
        {
          $set: {
            aiProviders: nextProviders,
            updatedAt: new Date(),
          },
        },
      );
    },

    async "settings.setActiveAIProvider"(providerId) {
      check(providerId, String);

      await ensureDefaultSettings();
      const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
      const providers = normalizeProviders(current && current.aiProviders);
      const exists = providers.some((item) => item && item.id === providerId);
      if (!exists) {
        throw new Meteor.Error("provider-not-found", "AI provider not found");
      }

      await AppSettings.updateAsync(
        { _id: DEFAULT_SETTINGS_ID },
        {
          $set: {
            activeAIProviderId: String(providerId),
            updatedAt: new Date(),
          },
        },
      );
    },

    async "settings.addCommunicationChannel"(type) {
      check(type, Match.OneOf("gmail", "whatsapp"));

      await ensureDefaultSettings();

      const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
      const nextChannels = Array.isArray(current && current.communicationChannels)
        ? [...current.communicationChannels]
        : [];
      const existing = nextChannels.find((item) => item && item.type === type);
      if (!existing) {
        nextChannels.push({
          id: `${type}-${Date.now()}`,
          type,
          label: type === "gmail" ? "Gmail" : "WhatsApp",
          status: "pending",
          createdAt: new Date(),
        });
      }

      await AppSettings.updateAsync(
        { _id: DEFAULT_SETTINGS_ID },
        {
          $set: {
            communicationChannels: nextChannels,
            updatedAt: new Date(),
          },
        },
      );
    },
  });
}
