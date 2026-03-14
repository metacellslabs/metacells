import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { Mongo } from 'meteor/mongo';
import { Sheets } from '../sheets/index.js';
import {
  decodeWorkbookDocument,
  encodeWorkbookForDocument,
} from '../sheets/workbook-codec.js';
import { WorkbookStorageAdapter } from '../../engine/workbook-storage-adapter.js';
import { StorageService } from '../../engine/storage-service.js';
import { getRegisteredFormulas } from '../../engine/formulas/index.js';
import {
  getRegisteredChannelConnectors,
} from '../channels/connectors/index.js';
import {
  AppSettings,
  DEFAULT_SETTINGS_ID,
  ensureDefaultSettings,
  getActiveAIProvider,
} from '../settings/index.js';
import { getRegisteredAIProviders } from '../settings/providers/index.js';
import {
  buildAttachmentSourceValue,
  getArtifactText,
  hydrateWorkbookAttachmentArtifacts,
  parseAttachmentSourceValue,
} from '../artifacts/index.js';

const assistantToolRegistry = [];
export const AssistantConversations = new Mongo.Collection(
  'assistant_conversations',
);

function normalizeToolSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function createConversationMessage(role, content, extraFields) {
  const now = new Date();
  return {
    id:
      'assistant-msg-' +
      now.getTime() +
      '-' +
      Math.random().toString(36).slice(2, 10),
    role: String(role || 'assistant'),
    content: String(content == null ? '' : content),
    createdAt: now.toISOString(),
    ...(isPlainObject(extraFields) ? extraFields : {}),
  };
}

async function loadAssistantConversationDoc(sheetDocumentId) {
  return (
    (await AssistantConversations.findOneAsync({
      sheetDocumentId: String(sheetDocumentId || ''),
    })) || null
  );
}

async function getStoredConversationMessages(sheetDocumentId) {
  const doc = await loadAssistantConversationDoc(sheetDocumentId);
  return Array.isArray(doc && doc.messages) ? doc.messages.slice() : [];
}

async function getStoredConversationUploads(sheetDocumentId) {
  const doc = await loadAssistantConversationDoc(sheetDocumentId);
  return Array.isArray(doc && doc.uploads) ? doc.uploads.slice() : [];
}

async function saveAssistantConversationMessages(
  sheetDocumentId,
  messages,
  extraFields,
) {
  const now = new Date();
  const current = await loadAssistantConversationDoc(sheetDocumentId);
  const nextMessages = Array.isArray(messages) ? messages.slice() : [];
  if (current && current._id) {
    await AssistantConversations.updateAsync(
      { _id: current._id },
      {
        $set: {
          sheetDocumentId: String(sheetDocumentId || ''),
          messages: nextMessages,
          updatedAt: now,
          ...(isPlainObject(extraFields) ? extraFields : {}),
        },
      },
    );
    return current._id;
  }
  return AssistantConversations.insertAsync({
    sheetDocumentId: String(sheetDocumentId || ''),
    messages: nextMessages,
    createdAt: now,
    updatedAt: now,
    ...(isPlainObject(extraFields) ? extraFields : {}),
  });
}

function serializeAssistantUpload(upload, includeContent) {
  const source = isPlainObject(upload) ? upload : {};
  const next = {
    id: String(source.id || ''),
    name: String(source.name || ''),
    type: String(source.type || ''),
    contentArtifactId: String(source.contentArtifactId || ''),
    binaryArtifactId: String(source.binaryArtifactId || ''),
    downloadUrl: String(source.downloadUrl || ''),
    previewUrl: String(source.previewUrl || ''),
    createdAt: String(source.createdAt || ''),
  };
  if (includeContent) {
    next.content = String(source.content || '');
  }
  return next;
}

async function hydrateAssistantUploadsForPrompt(uploads) {
  const source = Array.isArray(uploads) ? uploads : [];
  const hydrated = [];
  for (let i = 0; i < source.length; i += 1) {
    const upload = isPlainObject(source[i]) ? source[i] : null;
    if (!upload) continue;
    const content =
      upload.contentArtifactId && !upload.content
        ? await getArtifactText(String(upload.contentArtifactId || ''))
        : String(upload.content || '');
    hydrated.push(
      serializeAssistantUpload(
        {
          ...upload,
          content,
        },
        true,
      ),
    );
  }
  return hydrated;
}

async function saveAssistantConversationUploads(sheetDocumentId, uploads) {
  const now = new Date();
  const current = await loadAssistantConversationDoc(sheetDocumentId);
  const nextUploads = Array.isArray(uploads) ? uploads.slice() : [];
  if (current && current._id) {
    await AssistantConversations.updateAsync(
      { _id: current._id },
      {
        $set: {
          sheetDocumentId: String(sheetDocumentId || ''),
          uploads: nextUploads,
          updatedAt: now,
        },
      },
    );
    return current._id;
  }
  return AssistantConversations.insertAsync({
    sheetDocumentId: String(sheetDocumentId || ''),
    messages: [],
    uploads: nextUploads,
    createdAt: now,
    updatedAt: now,
  });
}

async function appendAssistantConversationUpload(sheetDocumentId, upload) {
  const current = await getStoredConversationUploads(sheetDocumentId);
  const source = isPlainObject(upload) ? upload : {};
  const uploadId =
    String(source.id || '').trim() ||
    'assistant-upload-' +
      Date.now() +
      '-' +
      Math.random().toString(36).slice(2, 10);
  const nextUpload = {
    id: uploadId,
    name: String(source.name || ''),
    type: String(source.type || ''),
    contentArtifactId: String(source.contentArtifactId || ''),
    binaryArtifactId: String(source.binaryArtifactId || ''),
    downloadUrl: String(source.downloadUrl || ''),
    previewUrl: String(source.previewUrl || ''),
    createdAt: String(source.createdAt || new Date().toISOString()),
  };
  const deduped = current.filter((item) => String(item && item.id) !== uploadId);
  deduped.push(nextUpload);
  await saveAssistantConversationUploads(sheetDocumentId, deduped);
  return nextUpload;
}

async function removeAssistantConversationUpload(sheetDocumentId, uploadId) {
  const current = await getStoredConversationUploads(sheetDocumentId);
  const nextUploads = current.filter(
    (item) => String(item && item.id) !== String(uploadId || ''),
  );
  await saveAssistantConversationUploads(sheetDocumentId, nextUploads);
  return nextUploads;
}

function buildAttachmentSourceFromAssistantUpload(upload) {
  if (!upload) {
    throw new Error('Assistant upload not found');
  }
  return buildAttachmentSourceValue({
    name: String(upload.name || 'Attached file'),
    type: String(upload.type || ''),
    content: '',
    contentArtifactId: String(upload.contentArtifactId || ''),
    binaryArtifactId: String(upload.binaryArtifactId || ''),
    downloadUrl: String(upload.downloadUrl || ''),
    previewUrl: String(upload.previewUrl || ''),
    pending: false,
  });
}

async function getAssistantUploadById(sheetDocumentId, uploadId) {
  const uploads = await getStoredConversationUploads(sheetDocumentId);
  return (
    uploads.find((item) => item && String(item.id || '') === String(uploadId || '')) ||
    null
  );
}

function toPlainTextContent(content) {
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'string'
          ? part
          : part && typeof part === 'object'
            ? String(part.text || '')
            : '',
      )
      .join('\n\n')
      .trim();
  }
  return String(content == null ? '' : content);
}

function getDefaultFormattingManifest() {
  return {
    formats: [
      'text',
      'number',
      'number_0',
      'number_2',
      'percent',
      'percent_2',
      'date',
      'currency_usd',
      'currency_eur',
      'currency_gbp',
    ],
    align: ['left', 'center', 'right'],
    fontFamilies: ['default', 'serif', 'sans', 'mono', 'display'],
    fontSizeRange: { min: 10, max: 28 },
    decimalPlacesRange: { min: 0, max: 6 },
    borders: ['top', 'right', 'bottom', 'left'],
  };
}

function getDefaultScheduleManifest() {
  return {
    supported: true,
    kinds: ['once', 'daily', 'weekly', 'monthly', 'interval', 'cron'],
    note:
      'Schedules run server-side. Mutations to schedules should use tools, not free text.',
  };
}

function getFormulaLanguageGuide() {
  return {
    shortcuts: [
      {
        prefix: "'",
        meaning: 'Single-cell AI answer. Returns one response in the same cell.',
      },
      {
        prefix: '>',
        meaning:
          'AI list spill. Returns a delimited list and fills cells below the formula cell.',
      },
      {
        prefix: '#',
        meaning:
          'AI table spill. Returns a markdown table and fills a grid below the formula cell.',
      },
    ],
    mentions: [
      {
        syntax: '@idea',
        meaning: 'Use the computed value of the named cell idea.',
      },
      {
        syntax: '@B1',
        meaning: 'Use the computed value of cell B1 from the current sheet.',
      },
      {
        syntax: '@Sheet 1!B1',
        meaning: 'Use the computed value from another sheet.',
      },
      {
        syntax: '@B1:C5',
        meaning: 'Use the values from a region.',
      },
      {
        syntax: '_@idea',
        meaning:
          'Use the raw source/formula of the referenced cell instead of its computed value.',
      },
      {
        syntax: '@@brief',
        meaning:
          'Use the named cell as hidden AI context or instruction, not visible prompt text.',
      },
      {
        syntax: '@policy',
        meaning:
          'If the cell is a file cell, the extracted file content is used in AI prompts.',
      },
    ],
    examples: [
      {
        title: 'Long formula AI',
        formula:
          '=IF(B1="","", AI_COMPLETION("Generate key partners for the business idea: " & B1))',
        meaning:
          'Traditional spreadsheet formula that calls AI for one cell when B1 is present.',
      },
      {
        title: 'Single-cell AI shortcut',
        formula: "'Generate key partners for the business idea: @B1",
        meaning:
          'Shorter equivalent single-cell AI prompt using a mention instead of string concatenation.',
      },
      {
        title: 'AI list spill',
        formula: '>top 10 customer pains for @B1',
        meaning:
          'Generates a list and spills one item per row below the cell.',
      },
      {
        title: 'AI table spill',
        formula: '#compare @B1 with competitors;4;6',
        meaning:
          'Generates a table with up to 4 columns and 6 rows and spills it below/right.',
      },
      {
        title: 'Region mention',
        formula: "'Summarise @B2:D12 for @B1",
        meaning: 'Uses a whole cell range as prompt context.',
      },
      {
        title: 'Hidden context mention',
        formula: "'Write partner ideas for @B1 with @@brief",
        meaning:
          'Uses @B1 visibly and @@brief as hidden instruction/persona context.',
      },
      {
        title: 'Channel table feed',
        formula: '#7 /sf extract action items for @B1',
        meaning:
          'Processes the last 7 days of channel events and fills one result row per event.',
      },
    ],
    guidance: [
      'Prefer the shortcut syntax when editing AI cells unless the user specifically wants a classic =formula form.',
      'When creating AI formulas, use mentions like @B1 or @idea instead of manually concatenating cell values into strings where possible.',
      'Use single quote for one-cell AI, > for list spill, and # for table spill.',
    ],
  };
}

function buildFormulaManifest() {
  return getRegisteredFormulas().map((formula) => ({
    name: String(formula.name || ''),
    signature: String(formula.signature || ''),
    summary: String(formula.summary || ''),
    aliases: Array.isArray(formula.aliases) ? formula.aliases.slice() : [],
    examples: Array.isArray(formula.examples) ? formula.examples.slice() : [],
  }));
}

function buildChannelManifest(settingsDoc) {
  const configuredChannels = Array.isArray(
    settingsDoc && settingsDoc.communicationChannels,
  )
    ? settingsDoc.communicationChannels
    : [];
  const configuredByConnector = new Map();
  for (let i = 0; i < configuredChannels.length; i += 1) {
    const channel = configuredChannels[i];
    if (!channel || !channel.connectorId) continue;
    const key = String(channel.connectorId || '');
    if (!configuredByConnector.has(key)) configuredByConnector.set(key, []);
    configuredByConnector.get(key).push({
      id: String(channel.id || ''),
      label: String(channel.label || ''),
      enabled: channel.enabled !== false,
      status: String(channel.status || ''),
    });
  }
  return getRegisteredChannelConnectors().map((connector) => ({
    id: String(connector.id || ''),
    name: String(connector.name || ''),
    type: String(connector.type || ''),
    description: String(connector.description || ''),
    descriptionWithCapabilities: [
      String(connector.description || ''),
      Array.isArray(connector.capabilities && connector.capabilities.actions) &&
      connector.capabilities.actions.length
        ? `Actions: ${connector.capabilities.actions.join(', ')}.`
        : '',
      Array.isArray(connector.capabilities && connector.capabilities.entities) &&
      connector.capabilities.entities.length
        ? `Entities: ${connector.capabilities.entities.join(', ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
    supportsReceive: connector.supportsReceive !== false,
    supportsSend: !!connector.supportsSend,
    supportsSearch: connector.supportsSearch !== false,
    capabilities:
      connector && connector.capabilities && typeof connector.capabilities === 'object'
        ? {
            ...connector.capabilities,
            actions: Array.isArray(connector.capabilities.actions)
              ? connector.capabilities.actions.slice()
              : [],
            entities: Array.isArray(connector.capabilities.entities)
              ? connector.capabilities.entities.slice()
              : [],
          }
        : null,
    sendParams: Array.isArray(connector.sendParams)
      ? connector.sendParams.slice()
      : [],
    searchParams: Array.isArray(connector.searchParams)
      ? connector.searchParams.slice()
      : ['query', 'limit'],
    mentioningFormulas: Array.isArray(connector.mentioningFormulas)
      ? connector.mentioningFormulas.slice()
      : [],
    configuredChannels: configuredByConnector.get(String(connector.id || '')) || [],
  }));
}

function buildChannelLanguageGuide(channels) {
  const source = Array.isArray(channels) ? channels : [];
  const configuredChannels = [];
  const receiveExamples = [];
  const sendExamples = [];
  const guidance = [
    'Treat configured receive-capable channels as live event streams that the workbook can process with formulas.',
    'If the user asks about incoming emails, messages, notifications, tickets, or channel events, prefer workbook formulas using the configured channel label instead of generic prose.',
    'To build a running list or table from incoming channel events, prefer # formulas like `# /label classify each event` or `#7 /label extract action items`.',
    'A plain channel mention like `/label` inside a formula binds the prompt to that channel payload. Use # for row-per-event tables and > or single-quote only when the user clearly wants a different shape.',
    'If the user asks to include only events matching a condition, encode that condition in the formula prompt so each event is filtered/classified during processing.',
    'Use outbound channel send tools or `/label:send:{...}` formulas only when the user wants to send a message. Do not confuse receive flows with send flows.',
  ];

  source.forEach((connector) => {
    if (!connector || !Array.isArray(connector.configuredChannels)) return;
    connector.configuredChannels
      .filter((channel) => channel && channel.enabled !== false)
      .forEach((channel) => {
        const label = String(channel.label || '').trim();
        if (!label) return;
        configuredChannels.push({
          label,
          connectorName: String(connector.name || ''),
          connectorType: String(connector.type || ''),
          supportsReceive: connector.supportsReceive !== false,
          supportsSend: !!connector.supportsSend,
          status: String(channel.status || ''),
          mentioningFormulas: Array.isArray(connector.mentioningFormulas)
            ? connector.mentioningFormulas.slice(0, 3)
            : [],
          help: Array.isArray(connector.help) ? connector.help.slice(0, 4) : [],
        });

        if (connector.supportsReceive !== false) {
          receiveExamples.push(
            `# /${label} summarise each incoming event in one line`,
            `#7 /${label} extract action items`,
            `# /${label} include only payment requests and return one row per matching event`,
          );
        }
        if (connector.supportsSend) {
          sendExamples.push(
            `/${label}:send:{"to":"user@example.com","subj":"Hi","body":"hello"}`,
          );
        }
      });
  });

  return {
    configuredChannels,
    receiveExamples: Array.from(new Set(receiveExamples)),
    sendExamples: Array.from(new Set(sendExamples)),
    guidance,
  };
}

function summarizeWorkbook(workbook) {
  const normalized = decodeWorkbookDocument(workbook || {});
  const tabs = Array.isArray(normalized.tabs) ? normalized.tabs : [];
  const sheets = isPlainObject(normalized.sheets) ? normalized.sheets : {};
  const sheetSummaries = tabs.map((tab) => {
    const sheet = sheets[tab.id] || {};
    const cells = isPlainObject(sheet.cells) ? sheet.cells : {};
    const reportContent = String(sheet.reportContent || '');
    const scheduledCells = [];
    Object.keys(cells).forEach((cellId) => {
      const cell = cells[cellId];
      if (!isPlainObject(cell) || !cell.schedule || cell.schedule.enabled === false)
        return;
      scheduledCells.push({
        cellId,
        kind: String(cell.schedule.kind || ''),
        origin: String(cell.schedule.origin || ''),
        label: String(cell.schedule.label || ''),
      });
    });
    return {
      id: String(tab.id || ''),
      name: String(tab.name || ''),
      type: tab.type === 'report' ? 'report' : 'sheet',
      cellCount: Object.keys(cells).length,
      scheduledCells,
      reportLength: reportContent.length,
    };
  });
  return {
    activeTabId: String(normalized.activeTabId || ''),
    aiMode: String(normalized.aiMode || ''),
    namedCells: normalized.namedCells || {},
    tabs: sheetSummaries,
  };
}

export function registerAssistantTool(definition) {
  if (!definition || typeof definition !== 'object' || !definition.name) {
    throw new Error('Assistant tool definition requires a name');
  }
  assistantToolRegistry.push(definition);
}

export function getRegisteredAssistantTools() {
  return assistantToolRegistry.slice();
}

function buildStaticAssistantToolsManifest() {
  return getRegisteredAssistantTools().map((tool) => ({
    name: String(tool.name || ''),
    description: String(tool.description || ''),
    args: isPlainObject(tool.args) ? tool.args : {},
    mutatesWorkbook: tool.mutatesWorkbook !== false,
    capabilityTags: Array.isArray(tool.capabilityTags)
      ? tool.capabilityTags.slice()
      : [],
  }));
}

function buildDynamicChannelToolsManifest(channels) {
  const seenToolNames = {};
  return (Array.isArray(channels) ? channels : []).flatMap((channel) => {
    if (
      !channel ||
      !Array.isArray(channel.configuredChannels) ||
      !channel.configuredChannels.length
    ) {
      return [];
    }
    return channel.configuredChannels
      .filter((configured) => configured && configured.enabled !== false)
      .flatMap((configured) => {
        const label = String(configured.label || channel.name || channel.id || '')
          .trim();
        const labelSlug = normalizeToolSlug(label || configured.id || channel.id);
        const connectorId = String(channel.id || '');
        const configuredId = String(configured.id || '');
        const tools = [];

        if (channel.supportsSend === true) {
          const baseToolName = `channel_send_${labelSlug}`;
          const seenCount = Number(seenToolNames[baseToolName] || 0);
          seenToolNames[baseToolName] = seenCount + 1;
          const toolName =
            seenCount > 0
              ? `${baseToolName}_${normalizeToolSlug(configuredId || 'channel')}`
              : baseToolName;
          const args = {};
          (Array.isArray(channel.sendParams) ? channel.sendParams : []).forEach(
            (param) => {
              if (param === 'attachments') args[param] = 'array';
              else if (param === 'to') args[param] = 'string|array';
              else args[param] = 'string';
            },
          );
          if (!Object.prototype.hasOwnProperty.call(args, 'body')) {
            args.body = 'string';
          }
          tools.push({
            name: toolName,
            description: `Send an outbound message through configured channel /${label}.`,
            args,
            mutatesWorkbook: false,
            capabilityTags: ['channels', 'send', connectorId],
            channelId: configuredId,
            channelLabel: label,
            connectorId,
            dynamicType: 'send',
          });
        }

        if (channel.supportsSearch !== false) {
          const baseToolName = `channel_search_${labelSlug}`;
          const seenCount = Number(seenToolNames[baseToolName] || 0);
          seenToolNames[baseToolName] = seenCount + 1;
          const toolName =
            seenCount > 0
              ? `${baseToolName}_${normalizeToolSlug(configuredId || 'channel')}`
              : baseToolName;
          const args = {};
          (Array.isArray(channel.searchParams) ? channel.searchParams : ['query', 'limit'])
            .forEach((param) => {
              args[param] = param === 'limit' ? 'number' : 'string';
            });
          if (!Object.prototype.hasOwnProperty.call(args, 'query')) {
            args.query = 'string';
          }
          if (!Object.prototype.hasOwnProperty.call(args, 'limit')) {
            args.limit = 'number';
          }
          tools.push({
            name: toolName,
            description: `Search configured channel /${label} and return standardized results.`,
            args,
            mutatesWorkbook: false,
            capabilityTags: ['channels', 'search', connectorId],
            channelId: configuredId,
            channelLabel: label,
            connectorId,
            dynamicType: 'search',
          });
        }

        return tools;
      });
  });
}

function buildAssistantToolsManifest(channels) {
  return buildStaticAssistantToolsManifest().concat(
    buildDynamicChannelToolsManifest(channels),
  );
}

async function loadSettingsDoc() {
  await ensureDefaultSettings();
  return (
    (await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID)) || {
      communicationChannels: [],
    }
  );
}

async function buildAssistantManifest(sheetDocumentId, workbook) {
  const settingsDoc = await loadSettingsDoc();
  const channelManifest = buildChannelManifest(settingsDoc);
  const providers = getRegisteredAIProviders().map((provider) => ({
    id: String(provider.id || ''),
    name: String(provider.name || ''),
    type: String(provider.type || ''),
    models: Array.isArray(provider.availableModels)
      ? provider.availableModels.slice()
      : [],
  }));
  return {
    workbookId: String(sheetDocumentId || ''),
    activeProviderId: String((settingsDoc && settingsDoc.activeAIProviderId) || ''),
    providers,
    formulas: buildFormulaManifest(),
    formulaLanguage: getFormulaLanguageGuide(),
    channelLanguage: buildChannelLanguageGuide(channelManifest),
    channels: channelManifest,
    formatting: getDefaultFormattingManifest(),
    schedules: getDefaultScheduleManifest(),
    reports: {
      supported: true,
      note: 'Reports are stored as report tabs with HTML/markdown-like rich content.',
    },
    workbookSummary: summarizeWorkbook(workbook),
    tools: buildAssistantToolsManifest(channelManifest),
  };
}

function buildAssistantSystemPrompt(manifest) {
  return [
    'You are the MetaCells workbook assistant.',
    'You help edit sheets, reports, formatting, schedules, and workbook structure.',
    'Use tools for any workbook mutation. Do not claim changes unless the tool call succeeded.',
    'You receive a manifest describing formulas, channels, schedules, reports, formatting, and tools.',
    'Pay close attention to formulaLanguage in the manifest. It explains AI shortcut syntax, mentions, and examples.',
    'Pay close attention to channelLanguage and channels in the manifest. They describe configured live channels, their labels, and examples.',
    'You also receive the current workbook JSON with every user message.',
    'The user payload also includes workbookContext. Use workbookContext.fileCells first when the user refers to a document, attachment, or file cell like C3.',
    'The user payload also includes channelContext. Use it when the user refers to email, inbox, incoming messages, connected channels, notifications, or message automation.',
    'If configured receive-capable channels exist and the user asks to collect, list, classify, summarise, or filter incoming emails/messages, prefer creating or editing workbook formulas that use those channel labels.',
    'For row-per-event results, prefer `# /label ...` formulas. For lookback windows, prefer `#7 /label ...` or `#30 /label ...` when the user implies recent history.',
    'If the user asks for a list of payment-request emails, assume they likely want a channel-driven table or list in the workbook, not a general explanation.',
    'Do not say that channel setup is required if channelContext already shows configured enabled channels.',
    'When responding, return JSON only with this schema:',
    '{"message":"string","toolCalls":[{"name":"tool_name","arguments":{}}]}',
    'If no tool is needed, return an empty toolCalls array.',
    'If a user asks for unsupported behavior, explain that in message and do not invent tools.',
    'Prefer minimal, precise tool calls.',
    'MetaCells manifest:',
    JSON.stringify(manifest),
  ].join('\n');
}

function buildChannelPromptContext(manifest) {
  const channels = Array.isArray(manifest && manifest.channels)
    ? manifest.channels
    : [];
  return {
    configuredChannels: channels.flatMap((connector) =>
      (Array.isArray(connector && connector.configuredChannels)
        ? connector.configuredChannels
        : []
      )
        .filter((channel) => channel && channel.enabled !== false)
        .map((channel) => ({
          label: String(channel.label || ''),
          connectorName: String(connector.name || ''),
          connectorType: String(connector.type || ''),
          supportsReceive: connector.supportsReceive !== false,
          supportsSend: !!connector.supportsSend,
          status: String(channel.status || ''),
          mentioningExamples: Array.isArray(connector.mentioningFormulas)
            ? connector.mentioningFormulas.slice(0, 3)
            : [],
          help: Array.isArray(connector.help) ? connector.help.slice(0, 4) : [],
        })),
    ),
    receiveCapableLabels: channels.flatMap((connector) =>
      connector && connector.supportsReceive !== false
        ? (Array.isArray(connector.configuredChannels)
            ? connector.configuredChannels
            : []
          )
            .filter((channel) => channel && channel.enabled !== false)
            .map((channel) => String(channel.label || '').trim())
            .filter(Boolean)
        : [],
    ),
    sendCapableLabels: channels.flatMap((connector) =>
      connector && connector.supportsSend
        ? (Array.isArray(connector.configuredChannels)
            ? connector.configuredChannels
            : []
          )
            .filter((channel) => channel && channel.enabled !== false)
            .map((channel) => String(channel.label || '').trim())
            .filter(Boolean)
        : [],
    ),
    guidance:
      manifest && manifest.channelLanguage && Array.isArray(manifest.channelLanguage.guidance)
        ? manifest.channelLanguage.guidance
        : [],
    receiveExamples:
      manifest && manifest.channelLanguage && Array.isArray(manifest.channelLanguage.receiveExamples)
        ? manifest.channelLanguage.receiveExamples
        : [],
    sendExamples:
      manifest && manifest.channelLanguage && Array.isArray(manifest.channelLanguage.sendExamples)
        ? manifest.channelLanguage.sendExamples
        : [],
  };
}

function buildWorkbookPromptContext(workbook) {
  const normalized = decodeWorkbookDocument(workbook || {});
  const tabs = Array.isArray(normalized.tabs) ? normalized.tabs : [];
  const sheets = isPlainObject(normalized.sheets) ? normalized.sheets : {};
  const fileCells = [];
  const populatedCells = [];

  tabs.forEach((tab) => {
    const sheet = sheets[tab.id] || {};
    const cells = isPlainObject(sheet.cells) ? sheet.cells : {};
    Object.keys(cells).forEach((cellId) => {
      const cell = cells[cellId];
      if (!isPlainObject(cell)) return;
      const source = String(cell.source || '');
      const value = String(cell.value || '');
      const attachment = parseAttachmentSourceValue(source);
      if (attachment) {
        fileCells.push({
          tabId: String(tab.id || ''),
          tabName: String(tab.name || ''),
          cellId: String(cellId || '').toUpperCase(),
          name: String(attachment.name || ''),
          mimeType: String(attachment.type || ''),
          contentPreview: String(attachment.content || '').slice(0, 4000),
          hasContent: !!String(attachment.content || '').trim(),
        });
        return;
      }
      if (!source && !value) return;
      populatedCells.push({
        tabId: String(tab.id || ''),
        tabName: String(tab.name || ''),
        cellId: String(cellId || '').toUpperCase(),
        source: source.slice(0, 500),
        value: value.slice(0, 500),
      });
    });
  });

  return {
    activeTabId: String(normalized.activeTabId || ''),
    fileCells,
    populatedCells: populatedCells.slice(0, 200),
  };
}

function buildConversationMessages(
  systemPrompt,
  conversation,
  manifest,
  workbook,
  userMessage,
  uploads,
) {
  const messages = [{ role: 'system', content: systemPrompt }];
  const history = Array.isArray(conversation) ? conversation : [];
  for (let i = 0; i < history.length; i += 1) {
    const item = history[i];
    if (!item || typeof item !== 'object') continue;
    const role = String(item.role || '').trim().toLowerCase();
    if (!role || ['system', 'user', 'assistant'].indexOf(role) === -1)
      continue;
    messages.push({
      role,
      content: toPlainTextContent(item.content),
    });
  }
  messages.push({
    role: 'user',
    content: JSON.stringify({
      message: String(userMessage || ''),
      workbook,
      workbookContext: buildWorkbookPromptContext(workbook),
      channelContext: buildChannelPromptContext(manifest),
      chatFiles: Array.isArray(uploads) ? uploads : [],
    }),
  });
  return messages;
}

async function callProviderChat(messages) {
  const provider = await getActiveAIProvider();
  const model = String(
    provider && provider.model
      ? provider.model
      : provider && provider.type === 'openai'
        ? 'gpt-4.1-mini'
        : 'deepseek-chat',
  );
  const requestBaseUrl = String(provider.baseUrl || '').replace(/\/+$/, '');
  const requestHeaders = { 'Content-Type': 'application/json' };
  if (
    (provider.type === 'deepseek' || provider.type === 'openai') &&
    provider.apiKey
  ) {
    requestHeaders.Authorization = `Bearer ${provider.apiKey}`;
  }
  const response = await fetch(`${requestBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({
      model,
      messages: Array.isArray(messages)
        ? messages.map((message) => ({
            role: String(message.role || 'user'),
            content: toPlainTextContent(message.content),
          }))
        : [],
    }),
  });
  if (!response.ok) {
    const errorText = String(await response.text()).trim();
    throw new Error(
      `Assistant chat failed with HTTP ${response.status}${
        errorText ? `: ${errorText}` : ''
      }`,
    );
  }
  const data = await response.json();
  const message =
    data && data.choices && data.choices[0] && data.choices[0].message;
  return toPlainTextContent(message && message.content);
}

function parseAssistantEnvelope(text) {
  const raw = String(text || '').trim();
  if (!raw) return { message: '', toolCalls: [] };
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { message: raw, toolCalls: [] };
  try {
    const parsed = JSON.parse(match[0]);
    return {
      message: String((parsed && parsed.message) || '').trim(),
      toolCalls: Array.isArray(parsed && parsed.toolCalls)
        ? parsed.toolCalls
        : [],
    };
  } catch (error) {
    return { message: raw, toolCalls: [] };
  }
}

function makeTabId(kind) {
  return `${kind === 'report' ? 'report' : 'sheet'}-${Date.now()}-${Math.floor(
    Math.random() * 10000,
  )}`;
}

async function persistAssistantWorkbook(sheetDocumentId, workbook) {
  const saveWorkbook =
    Meteor.server &&
    Meteor.server.method_handlers &&
    Meteor.server.method_handlers['sheets.saveWorkbook'];
  const computeGrid =
    Meteor.server &&
    Meteor.server.method_handlers &&
    Meteor.server.method_handlers['sheets.computeGrid'];
  if (typeof saveWorkbook !== 'function' || typeof computeGrid !== 'function') {
    throw new Error('Workbook persistence methods are unavailable');
  }
  await saveWorkbook.apply({}, [sheetDocumentId, workbook]);
  const activeTabId = String(workbook.activeTabId || '') || 'sheet-1';
  const result = await computeGrid.apply({}, [
    sheetDocumentId,
    activeTabId,
    { workbookSnapshot: workbook, forceRefreshAI: false, manualTriggerAI: false },
  ]);
  return result && result.workbook ? decodeWorkbookDocument(result.workbook) : decodeWorkbookDocument(workbook);
}

async function sendAssistantChannelMessage(channelLabel, payload, channelId) {
  const sendByLabel =
    Meteor.server &&
    Meteor.server.method_handlers &&
    Meteor.server.method_handlers['channels.sendByLabel'];
  if (typeof sendByLabel === 'function') {
    return sendByLabel.apply({}, [channelLabel, payload]);
  }
  const sendChannel =
    Meteor.server &&
    Meteor.server.method_handlers &&
    Meteor.server.method_handlers['channels.send'];
  if (typeof sendChannel !== 'function') {
    throw new Error('Channel send method is unavailable');
  }
  return sendChannel.apply({}, [channelId, payload]);
}

async function searchAssistantChannel(channelLabel, payload, channelId) {
  const searchByLabel =
    Meteor.server &&
    Meteor.server.method_handlers &&
    Meteor.server.method_handlers['channels.searchByLabel'];
  if (typeof searchByLabel === 'function') {
    return searchByLabel.apply({}, [
      channelLabel,
      String((payload && payload.query) || ''),
      payload,
    ]);
  }
  const searchChannel =
    Meteor.server &&
    Meteor.server.method_handlers &&
    Meteor.server.method_handlers['channels.search'];
  if (typeof searchChannel !== 'function') {
    throw new Error('Channel search method is unavailable');
  }
  return searchChannel.apply({}, [
    channelId,
    String((payload && payload.query) || ''),
    payload,
  ]);
}

function normalizeChannelPayloadValue(key, value) {
  if (key === 'attachments') {
    return Array.isArray(value) ? value : [];
  }
  if (key === 'limit') {
    return Math.max(1, Math.min(100, parseInt(value, 10) || 20));
  }
  if (key === 'to') {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) return value;
    return [];
  }
  return String(value == null ? '' : value);
}

function getDynamicAssistantTool(toolName, context) {
  const tools = buildDynamicChannelToolsManifest(
    context && context.manifest ? context.manifest.channels : [],
  );
  const match = tools.find((tool) => tool && tool.name === toolName);
  if (!match) return null;
  return {
    ...match,
    run: async (args) => {
      const payload = {};
      Object.keys(match.args || {}).forEach((key) => {
        payload[key] = normalizeChannelPayloadValue(key, args && args[key]);
      });
      if (match.dynamicType === 'search') {
        return searchAssistantChannel(match.channelLabel, payload, match.channelId);
      }
      return sendAssistantChannelMessage(match.channelLabel, payload, match.channelId);
    },
  };
}

async function runAssistantTool(toolCall, context) {
  const name = String(toolCall && toolCall.name ? toolCall.name : '').trim();
  const args = isPlainObject(toolCall && toolCall.arguments)
    ? toolCall.arguments
    : {};
  const registry = getRegisteredAssistantTools();
  const tool =
    registry.find((item) => item && item.name === name) ||
    getDynamicAssistantTool(name, context);
  if (!tool) {
    throw new Error(`Unknown assistant tool: ${name}`);
  }
  return tool.run(args, context);
}

function registerBuiltInAssistantTools() {
  if (assistantToolRegistry.length) return;

  registerAssistantTool({
    name: 'patch_workbook',
    description:
      'Apply a batch workbook patch across many cells, reports, schedules, and tabs in one tool call.',
    args: {
      cellUpdates: 'array',
      reportUpdates: 'array',
      tabUpdates: 'array',
      activeTabId: 'string',
    },
    capabilityTags: ['workbook', 'batch', 'write'],
    run: async (args, context) => {
      const cellUpdates = Array.isArray(args && args.cellUpdates)
        ? args.cellUpdates
        : [];
      const reportUpdates = Array.isArray(args && args.reportUpdates)
        ? args.reportUpdates
        : [];
      const tabUpdates = Array.isArray(args && args.tabUpdates)
        ? args.tabUpdates
        : [];
      const changed = [];

      for (let i = 0; i < cellUpdates.length; i += 1) {
        const update = cellUpdates[i];
        if (!isPlainObject(update)) continue;
        check(update.sheetId, String);
        check(update.cellId, String);
        const sheetId = String(update.sheetId || '');
        const cellId = String(update.cellId || '').toUpperCase();
        if (update.clear === true) {
          context.storage.setCellSchedule(sheetId, cellId, null);
          context.storage.setCellValue(sheetId, cellId, '');
          changed.push({ kind: 'clear_cell', sheetId, cellId });
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(update, 'source')) {
          context.storage.setCellValue(sheetId, cellId, String(update.source || ''));
          changed.push({ kind: 'set_cell_source', sheetId, cellId });
        }
        if (Object.prototype.hasOwnProperty.call(update, 'attachmentUploadId')) {
          check(update.attachmentUploadId, String);
          const upload = await context.getUpload(update.attachmentUploadId);
          if (!upload) {
            throw new Error(
              `Assistant upload not found: ${String(update.attachmentUploadId || '')}`,
            );
          }
          context.storage.setCellValue(
            sheetId,
            cellId,
            buildAttachmentSourceFromAssistantUpload(upload),
          );
          changed.push({
            kind: 'set_file_cell',
            sheetId,
            cellId,
            uploadId: String(update.attachmentUploadId || ''),
          });
        }
        if (Object.prototype.hasOwnProperty.call(update, 'presentation')) {
          check(update.presentation, Match.Where(isPlainObject));
          context.storage.setCellPresentation(sheetId, cellId, update.presentation);
          changed.push({ kind: 'set_cell_presentation', sheetId, cellId });
        }
        if (Object.prototype.hasOwnProperty.call(update, 'schedule')) {
          context.storage.setCellSchedule(
            sheetId,
            cellId,
            update.schedule == null ? null : update.schedule,
          );
          changed.push({ kind: 'set_cell_schedule', sheetId, cellId });
        }
      }

      for (let i = 0; i < reportUpdates.length; i += 1) {
        const update = reportUpdates[i];
        if (!isPlainObject(update)) continue;
        check(update.reportTabId, String);
        check(update.content, String);
        context.storage.setReportContent(update.reportTabId, update.content);
        changed.push({
          kind: 'set_report_content',
          reportTabId: String(update.reportTabId || ''),
        });
      }

      for (let i = 0; i < tabUpdates.length; i += 1) {
        const update = tabUpdates[i];
        if (!isPlainObject(update)) continue;
        const action = String(update.action || '').trim().toLowerCase();
        const tabs = context.storage.readTabs();
        if (action === 'create') {
          check(update.name, String);
          const type =
            String(update.type || 'sheet').trim().toLowerCase() === 'report'
              ? 'report'
              : 'sheet';
          const id = String(update.tabId || '') || makeTabId(type);
          tabs.push({
            id,
            name: String(update.name || '').trim() || id,
            type,
          });
          context.storage.saveTabs(tabs);
          changed.push({ kind: 'create_tab', id, type });
          continue;
        }
        if (action === 'rename') {
          check(update.tabId, String);
          check(update.name, String);
          context.storage.saveTabs(
            tabs.map((tab) =>
              tab && tab.id === update.tabId
                ? { ...tab, name: String(update.name || '').trim() || tab.name }
                : tab,
            ),
          );
          changed.push({ kind: 'rename_tab', tabId: String(update.tabId || '') });
          continue;
        }
        if (action === 'delete') {
          check(update.tabId, String);
          const tabId = String(update.tabId || '');
          context.storage.clearSheetStorage(tabId);
          context.storage.saveTabs(tabs.filter((tab) => tab && tab.id !== tabId));
          changed.push({ kind: 'delete_tab', tabId });
        }
      }

      if (args && typeof args.activeTabId === 'string' && args.activeTabId.trim()) {
        context.storage.setActiveSheetId(args.activeTabId);
        changed.push({ kind: 'set_active_tab', tabId: String(args.activeTabId) });
      }

      if (!changed.length) {
        return { ok: true, changed: 0 };
      }
      context.markMutated('patch_workbook', { changed });
      return { ok: true, changed: changed.length };
    },
  });

  registerAssistantTool({
    name: 'set_file_cell_from_upload',
    description:
      'Attach an uploaded chat file to a workbook cell, turning it into a file cell.',
    args: {
      sheetId: 'string',
      cellId: 'string',
      uploadId: 'string',
    },
    capabilityTags: ['cells', 'files', 'write'],
    run: async (args, context) => {
      check(args.sheetId, String);
      check(args.cellId, String);
      check(args.uploadId, String);
      const upload = await context.getUpload(args.uploadId);
      if (!upload) {
        throw new Error(`Assistant upload not found: ${String(args.uploadId || '')}`);
      }
      context.storage.setCellValue(
        args.sheetId,
        args.cellId,
        buildAttachmentSourceFromAssistantUpload(upload),
      );
      context.markMutated('set_file_cell_from_upload', {
        sheetId: args.sheetId,
        cellId: String(args.cellId || '').toUpperCase(),
        uploadId: String(args.uploadId || ''),
      });
      return {
        ok: true,
        upload: serializeAssistantUpload(upload, false),
      };
    },
  });

  registerAssistantTool({
    name: 'get_workbook',
    description: 'Return the current workbook JSON snapshot.',
    args: {},
    mutatesWorkbook: false,
    capabilityTags: ['workbook', 'read'],
    run: async (_args, context) => ({
      workbook: context.getWorkbook(),
    }),
  });

  registerAssistantTool({
    name: 'set_cell_source',
    description: 'Set the raw source/formula of a cell.',
    args: {
      sheetId: 'string',
      cellId: 'string',
      source: 'string',
    },
    capabilityTags: ['cells', 'write'],
    run: async (args, context) => {
      check(args.sheetId, String);
      check(args.cellId, String);
      check(args.source, String);
      context.storage.setCellValue(args.sheetId, args.cellId, args.source);
      context.markMutated('set_cell_source', {
        sheetId: args.sheetId,
        cellId: String(args.cellId || '').toUpperCase(),
      });
      return { ok: true };
    },
  });

  registerAssistantTool({
    name: 'clear_cell',
    description: 'Clear cell source and schedule.',
    args: {
      sheetId: 'string',
      cellId: 'string',
    },
    capabilityTags: ['cells', 'write', 'schedules'],
    run: async (args, context) => {
      check(args.sheetId, String);
      check(args.cellId, String);
      context.storage.setCellSchedule(args.sheetId, args.cellId, null);
      context.storage.setCellValue(args.sheetId, args.cellId, '');
      context.markMutated('clear_cell', {
        sheetId: args.sheetId,
        cellId: String(args.cellId || '').toUpperCase(),
      });
      return { ok: true };
    },
  });

  registerAssistantTool({
    name: 'set_cell_presentation',
    description: 'Update formatting and presentation fields for a cell.',
    args: {
      sheetId: 'string',
      cellId: 'string',
      presentation: 'object',
    },
    capabilityTags: ['formatting', 'write'],
    run: async (args, context) => {
      check(args.sheetId, String);
      check(args.cellId, String);
      check(args.presentation, Match.Where(isPlainObject));
      context.storage.setCellPresentation(
        args.sheetId,
        args.cellId,
        args.presentation,
      );
      context.markMutated('set_cell_presentation', {
        sheetId: args.sheetId,
        cellId: String(args.cellId || '').toUpperCase(),
      });
      return { ok: true };
    },
  });

  registerAssistantTool({
    name: 'set_cell_schedule',
    description: 'Create, update, or clear a server schedule for a cell.',
    args: {
      sheetId: 'string',
      cellId: 'string',
      schedule: 'object|null',
    },
    capabilityTags: ['schedules', 'write'],
    run: async (args, context) => {
      check(args.sheetId, String);
      check(args.cellId, String);
      context.storage.setCellSchedule(
        args.sheetId,
        args.cellId,
        args.schedule == null ? null : args.schedule,
      );
      context.markMutated('set_cell_schedule', {
        sheetId: args.sheetId,
        cellId: String(args.cellId || '').toUpperCase(),
      });
      return { ok: true };
    },
  });

  registerAssistantTool({
    name: 'set_report_content',
    description: 'Replace the content of a report tab.',
    args: {
      reportTabId: 'string',
      content: 'string',
    },
    capabilityTags: ['reports', 'write'],
    run: async (args, context) => {
      check(args.reportTabId, String);
      check(args.content, String);
      context.storage.setReportContent(args.reportTabId, args.content);
      context.markMutated('set_report_content', {
        reportTabId: args.reportTabId,
      });
      return { ok: true };
    },
  });

  registerAssistantTool({
    name: 'create_tab',
    description: 'Create a new sheet or report tab.',
    args: {
      name: 'string',
      type: 'string',
    },
    capabilityTags: ['tabs', 'write', 'reports'],
    run: async (args, context) => {
      check(args.name, String);
      const type = String(args.type || 'sheet').trim().toLowerCase() === 'report'
        ? 'report'
        : 'sheet';
      const tabs = context.storage.readTabs();
      const id = makeTabId(type);
      tabs.push({ id, name: String(args.name || '').trim() || id, type });
      context.storage.saveTabs(tabs);
      context.storage.setActiveSheetId(id);
      context.markMutated('create_tab', { id, type });
      return { ok: true, id, type };
    },
  });

  registerAssistantTool({
    name: 'rename_tab',
    description: 'Rename an existing tab.',
    args: {
      tabId: 'string',
      name: 'string',
    },
    capabilityTags: ['tabs', 'write'],
    run: async (args, context) => {
      check(args.tabId, String);
      check(args.name, String);
      const tabs = context.storage.readTabs().map((tab) =>
        tab && tab.id === args.tabId
          ? { ...tab, name: String(args.name || '').trim() || tab.name }
          : tab,
      );
      context.storage.saveTabs(tabs);
      context.markMutated('rename_tab', { tabId: args.tabId });
      return { ok: true };
    },
  });

  registerAssistantTool({
    name: 'delete_tab',
    description: 'Delete an existing tab.',
    args: {
      tabId: 'string',
    },
    capabilityTags: ['tabs', 'write'],
    run: async (args, context) => {
      check(args.tabId, String);
      const tabId = String(args.tabId || '');
      const tabs = context.storage.readTabs().filter((tab) => tab && tab.id !== tabId);
      context.storage.clearSheetStorage(tabId);
      context.storage.saveTabs(tabs);
      if (String(context.storage.getActiveSheetId('') || '') === tabId && tabs[0]) {
        context.storage.setActiveSheetId(tabs[0].id);
      }
      context.markMutated('delete_tab', { tabId });
      return { ok: true };
    },
  });

  registerAssistantTool({
    name: 'list_channels',
    description: 'Return configured channels and connector capabilities.',
    args: {},
    mutatesWorkbook: false,
    capabilityTags: ['channels', 'read'],
    run: async (_args, context) => ({
      channels: context.manifest.channels,
    }),
  });
}

async function handleAssistantChat({
  sheetDocumentId,
  workbookSnapshot,
  message,
}) {
  const sheetId = String(sheetDocumentId || '').trim();
  if (!sheetId) throw new Error('Assistant chat requires sheetDocumentId');
  const sheetDoc = await Sheets.findOneAsync({ _id: sheetId }, { fields: { workbook: 1 } });
  if (!sheetDoc) throw new Meteor.Error('not-found', 'Workbook not found');
  let workbook = await hydrateWorkbookAttachmentArtifacts(
    decodeWorkbookDocument(workbookSnapshot || sheetDoc.workbook || {}),
  );
  const persistedConversation = await getStoredConversationMessages(sheetId);
  const persistedUploads = await getStoredConversationUploads(sheetId);
  const promptUploads = await hydrateAssistantUploadsForPrompt(persistedUploads);
  const manifest = await buildAssistantManifest(sheetId, workbook);
  const systemPrompt = buildAssistantSystemPrompt(manifest);
  const userTurn = createConversationMessage('user', String(message || ''));
  const conversation = persistedConversation.concat(userTurn);
  let messages = buildConversationMessages(
    systemPrompt,
    conversation,
    manifest,
    workbook,
    message,
    promptUploads,
  );
  const activity = [];
  let workbookMutated = false;
  let assistantMessage = '';

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const responseText = await callProviderChat(messages);
    const envelope = parseAssistantEnvelope(responseText);
    assistantMessage = envelope.message || assistantMessage;
    if (!Array.isArray(envelope.toolCalls) || !envelope.toolCalls.length) {
      break;
    }

    const adapter = new WorkbookStorageAdapter(workbook);
    const storage = new StorageService(adapter);
    const mutationLog = [];
    const context = {
      manifest,
      storage,
      getWorkbook: () => adapter.snapshot(),
      getUpload: (uploadId) => getAssistantUploadById(sheetId, uploadId),
      markMutated: (kind, details) => {
        workbookMutated = true;
        mutationLog.push({
          kind: String(kind || ''),
          details: isPlainObject(details) ? details : {},
        });
      },
    };

    const toolResults = [];
    for (let i = 0; i < envelope.toolCalls.length; i += 1) {
      const toolCall = envelope.toolCalls[i];
      try {
        const result = await runAssistantTool(toolCall, context);
        toolResults.push({
          name: String(toolCall && toolCall.name ? toolCall.name : ''),
          ok: true,
          result,
        });
      } catch (error) {
        toolResults.push({
          name: String(toolCall && toolCall.name ? toolCall.name : ''),
          ok: false,
          error: error && error.message ? error.message : String(error),
        });
      }
    }

    if (mutationLog.length) {
      workbook = await persistAssistantWorkbook(sheetId, adapter.snapshot());
      workbook = await hydrateWorkbookAttachmentArtifacts(workbook);
    } else {
      workbook = adapter.snapshot();
    }

    activity.push({
      assistantMessage: envelope.message || '',
      toolResults,
      mutations: mutationLog,
    });

    messages.push({
      role: 'assistant',
      content: JSON.stringify({
        message: envelope.message || '',
        toolCalls: envelope.toolCalls,
      }),
    });
    messages.push({
      role: 'user',
      content: JSON.stringify({
        message:
          'Tool results for the previous assistant action. Use these results to continue, summarize, or issue the next tool calls if needed.',
        workbook,
        workbookContext: buildWorkbookPromptContext(workbook),
        channelContext: buildChannelPromptContext(manifest),
        chatFiles: promptUploads,
        toolResults,
      }),
    });
  }

  return {
    message: assistantMessage,
    workbook,
    manifest,
    activity,
    workbookMutated,
    uploads: persistedUploads.map((item) => serializeAssistantUpload(item, false)),
    conversation: conversation.concat(
      assistantMessage
        ? [createConversationMessage('assistant', assistantMessage)]
        : [],
    ),
  };
}

registerBuiltInAssistantTools();

if (Meteor.isServer) {
  Meteor.methods({
    async 'assistant.chat'(payload) {
      check(payload, Match.Where(isPlainObject));
      check(payload.sheetDocumentId, String);
      check(payload.message, String);
      const result = await handleAssistantChat(payload);
      await saveAssistantConversationMessages(
        payload.sheetDocumentId,
        Array.isArray(result && result.conversation) ? result.conversation : [],
        {
          lastMessageAt: new Date(),
        },
      );
      return result;
    },
    async 'assistant.getManifest'(sheetDocumentId, workbookSnapshot) {
      check(sheetDocumentId, String);
      const sheetDoc = await Sheets.findOneAsync(
        { _id: sheetDocumentId },
        { fields: { workbook: 1 } },
      );
      if (!sheetDoc) throw new Meteor.Error('not-found', 'Workbook not found');
      return buildAssistantManifest(
        sheetDocumentId,
        workbookSnapshot || sheetDoc.workbook || {},
      );
    },
    async 'assistant.getConversation'(sheetDocumentId) {
      check(sheetDocumentId, String);
      const sheetDoc = await Sheets.findOneAsync(
        { _id: sheetDocumentId },
        { fields: { _id: 1 } },
      );
      if (!sheetDoc) throw new Meteor.Error('not-found', 'Workbook not found');
      const doc = await loadAssistantConversationDoc(sheetDocumentId);
      return {
        messages:
          Array.isArray(doc && doc.messages) ? doc.messages.slice() : [],
        uploads: Array.isArray(doc && doc.uploads)
          ? doc.uploads.map((item) => serializeAssistantUpload(item, false))
          : [],
        updatedAt:
          doc && doc.updatedAt instanceof Date
            ? doc.updatedAt.toISOString()
            : String((doc && doc.updatedAt) || ''),
      };
    },
    async 'assistant.uploadFile'(sheetDocumentId, fileName, mimeType, base64Data) {
      check(sheetDocumentId, String);
      check(fileName, String);
      check(mimeType, String);
      check(base64Data, String);
      const sheetDoc = await Sheets.findOneAsync(
        { _id: sheetDocumentId },
        { fields: { _id: 1 } },
      );
      if (!sheetDoc) throw new Meteor.Error('not-found', 'Workbook not found');
      const extractContent =
        Meteor.server &&
        Meteor.server.method_handlers &&
        Meteor.server.method_handlers['files.extractContent'];
      if (typeof extractContent !== 'function') {
        throw new Meteor.Error(
          'files-unavailable',
          'File extraction method is unavailable',
        );
      }
      const extracted = await extractContent.apply({}, [
        fileName,
        mimeType,
        base64Data,
      ]);
      const upload = await appendAssistantConversationUpload(sheetDocumentId, {
        id:
          'assistant-upload-' +
          Date.now() +
          '-' +
          Math.random().toString(36).slice(2, 10),
        name: String((extracted && extracted.name) || fileName || 'Attached file'),
        type: String((extracted && extracted.type) || mimeType || ''),
        contentArtifactId: String(
          (extracted && extracted.contentArtifactId) || '',
        ),
        binaryArtifactId: String(
          (extracted && extracted.binaryArtifactId) || '',
        ),
        downloadUrl: String((extracted && extracted.downloadUrl) || ''),
        previewUrl: String((extracted && extracted.previewUrl) || ''),
        createdAt: new Date().toISOString(),
      });
      return serializeAssistantUpload(upload, false);
    },
    async 'assistant.clearConversation'(sheetDocumentId) {
      check(sheetDocumentId, String);
      await AssistantConversations.removeAsync({
        sheetDocumentId: String(sheetDocumentId || ''),
      });
      return { ok: true };
    },
    async 'assistant.removeUpload'(sheetDocumentId, uploadId) {
      check(sheetDocumentId, String);
      check(uploadId, String);
      const uploads = await removeAssistantConversationUpload(
        sheetDocumentId,
        uploadId,
      );
      return {
        ok: true,
        uploads: uploads.map((item) => serializeAssistantUpload(item, false)),
      };
    },
  });
}
