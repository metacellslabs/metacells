import { useEffect, useRef, useState } from "react";
import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { mountSpreadsheetApp } from "../metacell/runtime/index.js";
import { HelpOverlay } from "../help/HelpOverlay.jsx";
import {
  AppSettings,
  DEFAULT_AI_PROVIDERS,
  DEFAULT_SETTINGS_ID,
} from "../../api/settings/index.js";
import { decodeWorkbookDocument } from "../../api/sheets/workbook-codec.js";
import { Sheets } from "../../api/sheets/index.js";
import { createSheetDocStorage } from "../metacell/sheetDocStorage.js";

function buildProviderDrafts(providers, savedProviders) {
  const registered = Array.isArray(providers) ? providers : [];
  const saved = Array.isArray(savedProviders) ? savedProviders : [];
  const byId = new Map();
  const byType = new Map();

  for (let i = 0; i < saved.length; i += 1) {
    const provider = saved[i];
    if (!provider || typeof provider !== "object") continue;
    if (provider.id) byId.set(String(provider.id), provider);
    if (provider.type) byType.set(String(provider.type), provider);
  }

  return registered.reduce((acc, provider) => {
    const persisted = byId.get(provider.id) || byType.get(provider.type) || {};
    acc[provider.id] = {
      ...provider,
      ...persisted,
      id: String(persisted.id || provider.id || ""),
      name: String(persisted.name || provider.name || ""),
      type: String(persisted.type || provider.type || ""),
      baseUrl: String(persisted.baseUrl || provider.baseUrl || ""),
      model: String(persisted.model || provider.model || ""),
      apiKey: String(persisted.apiKey || ""),
      enabled: persisted.enabled !== false,
      availableModels: Array.isArray(provider.availableModels) ? provider.availableModels.slice() : [],
      fields: Array.isArray(provider.fields) ? provider.fields.slice() : [],
    };
    return acc;
  }, {});
}

function HomePage() {
  useEffect(() => {
    document.body.classList.add("route-home");
    document.body.classList.remove("route-sheet");

    return () => {
      document.body.classList.remove("route-home");
    };
  }, []);

  const { isLoading, sheets } = useTracker(() => {
    const handle = Meteor.subscribe("sheets.list");

    return {
      isLoading: !handle.ready(),
      sheets: Sheets.find({}, { sort: { updatedAt: -1, createdAt: -1 } }).fetch(),
    };
  });

  const [isCreating, setIsCreating] = useState(false);
  const [deletingSheetId, setDeletingSheetId] = useState("");

  const handleCreateSheet = () => {
    if (isCreating) return;
    setIsCreating(true);

    Meteor.callAsync("sheets.create")
      .then((sheetId) => {
        setIsCreating(false);
        window.location.assign(`/metacell/${sheetId}`);
      })
      .catch((error) => {
        setIsCreating(false);
        window.alert(error.reason || error.message || "Failed to create metacell");
      });
  };

  const handleDeleteSheet = (sheetId, sheetName) => {
    if (deletingSheetId) return;
    const confirmed = window.confirm(`Delete metacell "${sheetName}"?`);
    if (!confirmed) return;

    setDeletingSheetId(sheetId);
    Meteor.callAsync("sheets.remove", sheetId)
      .then(() => setDeletingSheetId(""))
      .catch((error) => {
        setDeletingSheetId("");
        window.alert(error.reason || error.message || "Failed to delete metacell");
      });
  };

  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="home-hero-copy">
          <div className="home-brand">
            <img className="home-brand-logo" src="/logo.png" alt="MetaCells" />
          </div>
          <h1>Cells that work for you.</h1>
          <p className="home-subtitle">
            Create smart spreadsheets where cells can think, calculate, and help complete tasks automatically. Built-in AI agents can analyze data, generate content, and perform tasks right inside your sheet.
          </p>
          <div className="home-actions">
            <button type="button" className="home-create-button" onClick={handleCreateSheet} disabled={isCreating}>
              {isCreating ? "Creating..." : "Add metacell"}
            </button>
            <a className="home-secondary-link" href="/settings">Settings</a>
            <span className="home-meta">
              {isLoading ? "Loading metacells..." : `${sheets.length} metacell${sheets.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>
      </section>

      <section className="home-card">
        <div className="home-section-head">
          <h2>Your metacells</h2>
        </div>

        {!isLoading && !sheets.length ? (
          <div className="home-empty-card">
            <p className="home-empty">No metacells yet.</p>
            <p className="home-empty-note">Start with a blank metacell and the app will create a persistent document for it.</p>
          </div>
        ) : null}

        {!isLoading && sheets.length ? (
          <div className="sheet-list">
            {sheets.map((sheet) => (
              <div key={sheet._id} className="sheet-list-item">
                <a className="sheet-list-link" href={`/metacell/${sheet._id}`}>
                  <div className="sheet-list-copy">
                    <span className="sheet-list-name">{sheet.name}</span>
                  </div>
                  <div className="sheet-list-meta">
                    <span className="sheet-list-date">
                      {sheet.updatedAt ? new Date(sheet.updatedAt).toLocaleString() : ""}
                    </span>
                    <span className="sheet-list-arrow">Open</span>
                  </div>
                </a>
                <button
                  type="button"
                  className="sheet-list-delete"
                  onClick={() => handleDeleteSheet(sheet._id, sheet.name)}
                  disabled={deletingSheetId === sheet._id}
                  aria-label={`Delete ${sheet.name}`}
                >
                  {deletingSheetId === sheet._id ? "..." : "×"}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function SettingsPage() {
  const SETTINGS_TABS = [
    { id: "ai", label: "AI Providers" },
    { id: "channels", label: "Channels" },
    { id: "general", label: "General" },
    { id: "advanced", label: "Advanced" },
  ];
  const registeredProviders = DEFAULT_AI_PROVIDERS;
  const defaultProviderId = String(registeredProviders[0] && registeredProviders[0].id || "");
  const [activeSettingsTab, setActiveSettingsTab] = useState("ai");
  const [activeProviderId, setActiveProviderId] = useState(defaultProviderId);
  const [providerDrafts, setProviderDrafts] = useState(() => buildProviderDrafts(registeredProviders));
  const [savingProviderId, setSavingProviderId] = useState("");
  const [isSavingActiveProvider, setIsSavingActiveProvider] = useState(false);
  const [addingChannel, setAddingChannel] = useState("");

  useEffect(() => {
    document.body.classList.add("route-home");
    document.body.classList.remove("route-sheet");

    return () => {
      document.body.classList.remove("route-home");
    };
  }, []);

  const { isLoading, settings } = useTracker(() => {
    const handle = Meteor.subscribe("settings.default");

    return {
      isLoading: !handle.ready(),
      settings: AppSettings.findOne(DEFAULT_SETTINGS_ID),
    };
  }, []);

  useEffect(() => {
    const providers = Array.isArray(settings && settings.aiProviders) ? settings.aiProviders : [];
    setActiveProviderId((settings && settings.activeAIProviderId) || defaultProviderId);
    setProviderDrafts(buildProviderDrafts(registeredProviders, providers));
  }, [settings && settings.updatedAt ? new Date(settings.updatedAt).getTime() : 0]);

  const handleProviderDraftChange = (providerId, fieldKey, value) => {
    setProviderDrafts((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] || {}),
        [fieldKey]: value,
      },
    }));
  };

  const handleSaveProvider = (providerId) => {
    if (savingProviderId) return;
    const draft = providerDrafts[providerId];
    if (!draft) return;

    setSavingProviderId(providerId);
    Meteor.callAsync("settings.upsertAIProvider", {
      id: String(draft.id || "").trim(),
      name: String(draft.name || "").trim(),
      type: String(draft.type || "").trim(),
      baseUrl: String(draft.baseUrl || "").trim(),
      model: String(draft.model || "").trim(),
      apiKey: String(draft.apiKey || "").trim(),
      enabled: draft.enabled !== false,
    })
      .then(() => setSavingProviderId(""))
      .catch((error) => {
        setSavingProviderId("");
        window.alert(error.reason || error.message || "Failed to save AI provider");
      });
  };

  const handleSaveActiveProvider = () => {
    if (isSavingActiveProvider || !activeProviderId) return;
    setIsSavingActiveProvider(true);
    Meteor.callAsync("settings.setActiveAIProvider", activeProviderId)
      .then(() => setIsSavingActiveProvider(false))
      .catch((error) => {
        setIsSavingActiveProvider(false);
        window.alert(error.reason || error.message || "Failed to set active AI provider");
      });
  };

  const handleAddChannel = (type) => {
    if (addingChannel) return;
    setAddingChannel(type);
    Meteor.callAsync("settings.addCommunicationChannel", type)
      .then(() => setAddingChannel(""))
      .catch((error) => {
        setAddingChannel("");
        window.alert(error.reason || error.message || "Failed to add communication channel");
      });
  };

  const aiProviders = Array.isArray(settings && settings.aiProviders) ? settings.aiProviders : [];
  const communicationChannels = Array.isArray(settings && settings.communicationChannels)
    ? settings.communicationChannels
    : [];
  const activeProviderLabel = (
    aiProviders.find((provider) => provider && provider.id === activeProviderId)
    || registeredProviders.find((provider) => provider && provider.id === activeProviderId)
    || registeredProviders[0]
    || { name: "None" }
  ).name;
  const configuredChannelsCount = communicationChannels.length;
  const configuredSecretsCount = Object.values(providerDrafts).filter((provider) => String(provider && provider.apiKey || "").trim()).length;
  const renderSettingsPanel = () => {
    if (activeSettingsTab === "channels") {
      return (
        <>
          <div className="home-section-head">
            <h2>Communication Channels</h2>
          </div>
          <div className="settings-section-copy">
            <p>Connect outbound channels that MetaCells can use for communication workflows later.</p>
          </div>
          <div className="settings-channel-actions">
            <button type="button" onClick={() => handleAddChannel("gmail")} disabled={addingChannel === "gmail"}>
              {addingChannel === "gmail" ? "Connecting..." : "Connect Gmail"}
            </button>
            <button type="button" onClick={() => handleAddChannel("whatsapp")} disabled={addingChannel === "whatsapp"}>
              {addingChannel === "whatsapp" ? "Connecting..." : "Connect WhatsApp"}
            </button>
          </div>

          {!communicationChannels.length ? (
            <p className="home-empty-note">No communication channels added yet.</p>
          ) : (
            <div className="settings-channel-list">
              {communicationChannels.map((channel) => (
                <div key={channel.id} className="settings-channel-item">
                  <strong>{channel.label}</strong>
                  <span className="settings-status">{channel.status}</span>
                </div>
              ))}
            </div>
          )}
        </>
      );
    }

    if (activeSettingsTab === "general") {
      return (
        <>
          <div className="home-section-head">
            <h2>General</h2>
          </div>
          <div className="settings-section-copy">
            <p>Overview of the current AI and communication setup stored in Mongo.</p>
          </div>
          <div className="settings-kv-list">
            <div className="settings-kv-item">
              <span className="settings-label">Default AI provider</span>
              <strong>{activeProviderLabel}</strong>
            </div>
            <div className="settings-kv-item">
              <span className="settings-label">Configured providers</span>
              <strong>{registeredProviders.length}</strong>
            </div>
            <div className="settings-kv-item">
              <span className="settings-label">Connected channels</span>
              <strong>{configuredChannelsCount}</strong>
            </div>
            <div className="settings-kv-item">
              <span className="settings-label">Providers with API keys</span>
              <strong>{configuredSecretsCount}</strong>
            </div>
          </div>
        </>
      );
    }

    if (activeSettingsTab === "advanced") {
      return (
        <>
          <div className="home-section-head">
            <h2>Advanced</h2>
          </div>
          <div className="settings-section-copy">
            <p>Raw provider diagnostics and saved endpoints for debugging server-side AI calls.</p>
          </div>
          <div className="settings-kv-list">
            {registeredProviders.map((provider) => {
              const draft = providerDrafts[provider.id] || provider;
              return (
                <div key={provider.id} className="settings-kv-item">
                  <span className="settings-label">{provider.name}</span>
                  <strong>{draft.baseUrl || draft.model || "Not configured"}</strong>
                </div>
              );
            })}
          </div>
        </>
      );
    }

    return (
      <>
        <div className="home-section-head">
          <h2>AI Providers</h2>
        </div>
        <div className="settings-section-copy">
          <p>Current provider configuration is stored in Mongo and used by server-side AI requests.</p>
        </div>

        <div className="settings-provider-card">
          <div className="settings-provider-head">
            <strong>Default provider</strong>
            <span className="settings-status">{isLoading ? "Loading..." : "Saved in DB"}</span>
          </div>
          <label className="settings-label" htmlFor="active-provider-id">Active AI provider</label>
          <select
            id="active-provider-id"
            className="settings-input"
            value={activeProviderId}
            onChange={(event) => setActiveProviderId(event.target.value)}
          >
            {registeredProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
          <div className="settings-actions">
            <button type="button" onClick={handleSaveActiveProvider} disabled={isSavingActiveProvider || isLoading}>
              {isSavingActiveProvider ? "Saving..." : "Set default provider"}
            </button>
            <span className="settings-meta">Current: {activeProviderLabel}</span>
          </div>
        </div>

        {registeredProviders.map((provider) => {
          const draft = providerDrafts[provider.id] || provider;
          const isActive = activeProviderId === provider.id;
          return (
            <div key={provider.id} className="settings-provider-card">
              <div className="settings-provider-head">
                <strong>{provider.name}</strong>
                <span className="settings-status">
                  {isActive ? "Default" : isLoading ? "Loading..." : "Available"}
                </span>
              </div>
              {Array.isArray(provider.fields) && provider.fields.map((field) => (
                <div key={field.key} className="settings-field">
                  <label className="settings-label" htmlFor={`${provider.id}-${field.key}`}>{field.label}</label>
                  <input
                    id={`${provider.id}-${field.key}`}
                    className="settings-input"
                    type={field.type || "text"}
                    value={String(draft[field.key] || "")}
                    onChange={(event) => handleProviderDraftChange(provider.id, field.key, event.target.value)}
                    placeholder={field.placeholder || ""}
                  />
                </div>
              ))}
              {provider.availableModels && provider.availableModels.length ? (
                <p className="settings-provider-note">
                  Models: {provider.availableModels.join(", ")}
                </p>
              ) : null}
              <div className="settings-actions">
                <button
                  type="button"
                  onClick={() => handleSaveProvider(provider.id)}
                  disabled={Boolean(savingProviderId) || isLoading}
                >
                  {savingProviderId === provider.id ? "Saving..." : "Save provider"}
                </button>
              </div>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <main className="home-page settings-page">
      <section className="home-hero settings-hero">
        <div className="home-hero-copy">
          <div className="home-brand">
            <img className="home-brand-logo" src="/logo.png" alt="Settings" />
          </div>
          <h1>Settings</h1>
          <p className="home-subtitle">Manage AI providers and communication channel connections.</p>
          <div className="home-actions">
            <a className="home-secondary-link" href="/">Back to metacells</a>
          </div>
        </div>
      </section>

      <section className="home-card settings-card settings-layout">
        <div className="settings-tabs" role="tablist" aria-label="Settings sections">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeSettingsTab === tab.id}
              className={`settings-tab-button${activeSettingsTab === tab.id ? " active" : ""}`}
              onClick={() => setActiveSettingsTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="settings-panel" role="tabpanel">
          {renderSettingsPanel()}
        </div>
      </section>
    </main>
  );
}

function SheetPage({ sheetId, initialTabId, onOpenHelp }) {
  const appRef = useRef(null);
  const storageRef = useRef(null);
  const lastStorageJsonRef = useRef("");
  const [workbookName, setWorkbookName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  useEffect(() => {
    document.body.classList.add("route-sheet");
    document.body.classList.remove("route-home");

    return () => {
      document.body.classList.remove("route-sheet");
    };
  }, []);

  const { isLoading, sheet } = useTracker(() => {
    const handle = Meteor.subscribe("sheets.one", sheetId);

    return {
      isLoading: !handle.ready(),
      sheet: Sheets.findOne(sheetId),
    };
  }, [sheetId]);
  const sheetWorkbookJson = !isLoading && sheet ? JSON.stringify(decodeWorkbookDocument(sheet.workbook || {})) : "";

  useEffect(() => {
    if (!sheet) return;
    setWorkbookName(String(sheet.name || ""));
  }, [sheet && sheet.name]);

  const commitWorkbookRename = () => {
    if (!sheet || isRenaming) return;
    const nextName = String(workbookName || "").trim();
    const currentName = String(sheet.name || "");

    if (!nextName) {
      setWorkbookName(currentName);
      return;
    }

    if (nextName === currentName) return;

    setIsRenaming(true);
    Meteor.callAsync("sheets.rename", sheetId, nextName)
      .then(() => {
        setIsRenaming(false);
      })
      .catch((error) => {
        setIsRenaming(false);
        setWorkbookName(currentName);
        window.alert(error.reason || error.message || "Failed to rename metacell");
      });
  };

  useEffect(() => {
    if (isLoading || !sheet || appRef.current) return;

    const workbook = sheetWorkbookJson ? JSON.parse(sheetWorkbookJson) : {};
    storageRef.current = createSheetDocStorage(sheetId, workbook);
    lastStorageJsonRef.current = sheetWorkbookJson;
    appRef.current = mountSpreadsheetApp({
      storage: storageRef.current,
      sheetDocumentId: sheetId,
      initialSheetId: initialTabId,
      onActiveSheetChange: (nextTabId) => {
        const nextPath = nextTabId
          ? `/metacell/${encodeURIComponent(sheetId)}/${encodeURIComponent(nextTabId)}`
          : `/metacell/${encodeURIComponent(sheetId)}`;
        if (window.location.pathname !== nextPath) {
          window.history.replaceState({}, "", nextPath);
        }
      },
    });

    return () => {
      if (appRef.current && typeof appRef.current.destroy === "function") {
        appRef.current.destroy();
      }
      appRef.current = null;
      storageRef.current = null;
      lastStorageJsonRef.current = "";
    };
  }, [isLoading, sheetId]);

  useEffect(() => {
    if (!appRef.current || !initialTabId) return;
    if (typeof appRef.current.switchToSheet !== "function") return;
    if (typeof appRef.current.activeSheetId === "string" && appRef.current.activeSheetId === initialTabId) return;
    appRef.current.switchToSheet(initialTabId);
  }, [initialTabId]);

  useEffect(() => {
    if (isLoading || !sheet || !appRef.current || !storageRef.current) return;

    const nextWorkbookJson = sheetWorkbookJson;
    if (nextWorkbookJson === lastStorageJsonRef.current) return;
    if (typeof appRef.current.hasPendingLocalEdit === "function" && appRef.current.hasPendingLocalEdit()) return;

    lastStorageJsonRef.current = nextWorkbookJson;
    storageRef.current.replaceAll(nextWorkbookJson ? JSON.parse(nextWorkbookJson) : {});
    appRef.current.computeAll();
  }, [isLoading, sheet, sheetWorkbookJson]);

  if (isLoading) {
    return <main className="sheet-loading">Loading metacell...</main>;
  }

  if (!sheet) {
    return (
      <main className="sheet-loading">
        <p>Metacell not found.</p>
        <a href="/">Back to metacells</a>
      </main>
    );
  }

  return (
    <div className="sheet-page-shell">
      <div className="formula-bar">
        <a className="formula-home-link" href="/" aria-label="Home">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 10.5 12 4l8 6.5" />
            <path d="M7.5 9.5V20h9V9.5" />
          </svg>
        </a>
        <input
          id="workbook-name-input"
          type="text"
          value={workbookName}
          onChange={(event) => setWorkbookName(event.target.value)}
          onBlur={commitWorkbookRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              setWorkbookName(String(sheet.name || ""));
              event.currentTarget.blur();
            }
          }}
          placeholder="Metacell name"
          disabled={isRenaming}
        />
        <input id="cell-name-input" type="text" placeholder="A1 or @name" />
        <select id="named-cell-jump" defaultValue="">
          <option value=""></option>
        </select>
        <label htmlFor="formula-input">fx</label>
        <input id="formula-input" type="text" placeholder="edit active cell formula/value" />
        <button id="attach-file" type="button" aria-label="Attach file" title="Attach file">📎</button>
        <input id="attach-file-input" type="file" hidden />
        <span id="calc-progress" className="calc-progress" aria-live="polite"></span>
        <label htmlFor="ai-mode">AI</label>
        <select id="ai-mode" defaultValue="auto">
          <option value="auto">Auto</option>
          <option value="manual">Manual</option>
        </select>
        <button id="undo-action" type="button" aria-label="Undo" title="Undo">⟲</button>
        <button id="redo-action" type="button" aria-label="Redo" title="Redo">⟳</button>
        <button id="update-ai" type="button">Update</button>
        <button type="button" className="help-button" onClick={onOpenHelp}>Help</button>
      </div>
      <div className="table-wrap">
        <table></table>
      </div>
      <div className="report-wrap" style={{ display: "none" }}>
        <div className="report-toolbar">
          <button type="button" className="report-mode active" data-report-mode="edit">Edit</button>
          <button type="button" className="report-mode" data-report-mode="view">View</button>
          <button type="button" className="report-cmd" data-cmd="bold"><b>B</b></button>
          <button type="button" className="report-cmd" data-cmd="italic"><i>I</i></button>
          <button type="button" className="report-cmd" data-cmd="underline"><u>U</u></button>
          <button type="button" className="report-cmd" data-cmd="insertUnorderedList">• List</button>
          <span className="report-hint">
            Mentions: <code>Sheet 1:A1</code>, <code>@named_cell</code>, region <code>@Sheet 1!A1:B10</code>. Inputs: <code>Input:Sheet 1!A1</code> or <code>Input:@named_cell</code>
          </span>
        </div>
        <div id="report-editor" className="report-editor" contentEditable suppressContentEditableWarning />
        <div id="report-live" className="report-live"></div>
      </div>
      <div className="tabs-bar">
        <button id="add-tab" type="button"> + </button>
        <div id="tabs"></div>
        <button id="delete-tab" type="button">delete</button>
      </div>
    </div>
  );
}

export const App = () => {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const path = window.location.pathname || "/";
  const metacellMatch = path.match(/^\/metacell\/([^/]+)(?:\/([^/]+))?$/);
  const legacySheetMatch = path.match(/^\/sheet\/([^/]+)(?:\/([^/]+))?$/);
  const sheetMatch = metacellMatch || legacySheetMatch;

  let page = <HomePage />;
  if (sheetMatch) {
    page = (
      <SheetPage
        sheetId={decodeURIComponent(sheetMatch[1])}
        initialTabId={sheetMatch[2] ? decodeURIComponent(sheetMatch[2]) : ""}
        onOpenHelp={() => setIsHelpOpen(true)}
      />
    );
  } else if (path === "/settings") {
    page = <SettingsPage />;
  }

  return (
    <>
      <HelpOverlay isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      {page}
    </>
  );
};
