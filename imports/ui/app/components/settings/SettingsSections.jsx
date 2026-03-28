import { Link } from '../../router.jsx';
import { ServiceBadge } from '../icons/ServiceBadge.jsx';

export function SettingsTabs({ tabs, activeTab, onSelect }) {
  return (
    <div className="settings-tabs" role="tablist" aria-label="Settings sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`settings-tab-button${activeTab === tab.id ? ' active' : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsAIProvidersSection(props) {
  const {
    registeredProviders,
    selectedChipId,
    setSelectedChipId,
    providerDrafts,
    providerDraftDirtyById,
    fetchedModels,
    fetchingModelsForId,
    activeProviderId,
    handleProviderDraftChange,
    handleFetchModels,
    handleTestProvider,
    handleSaveProvider,
    handleSaveAndActivate,
    savingProviderId,
    testingProviderId,
  } = props;
  const selectedProvider = registeredProviders.find((p) => p.id === selectedChipId);
  const draft = selectedProvider ? providerDrafts[selectedProvider.id] || selectedProvider : null;
  const models = selectedProvider ? fetchedModels[selectedProvider.id] || [] : [];
  const isFetching = selectedProvider && fetchingModelsForId === selectedProvider.id;
  const isTesting = selectedProvider && testingProviderId === selectedProvider.id;
  const isActive = selectedProvider && activeProviderId === selectedProvider.id;
  const isDirty = !!(
    selectedProvider &&
    providerDraftDirtyById &&
    providerDraftDirtyById[selectedProvider.id]
  );
  const suggestedModels =
    selectedProvider && Array.isArray(selectedProvider.availableModels)
      ? selectedProvider.availableModels
      : [];
  const hasCredentialHelp =
    selectedProvider &&
    ((Array.isArray(selectedProvider.credentialSteps) &&
      selectedProvider.credentialSteps.length > 0) ||
      (Array.isArray(selectedProvider.credentialLinks) &&
        selectedProvider.credentialLinks.length > 0));

  return (
    <>
      <div className="home-section-head">
        <h2>AI Provider</h2>
      </div>
      <div className="settings-section-copy">
        <p>
          Select your AI provider, enter credentials, load available models,
          and activate.
        </p>
      </div>

      <div className="settings-provider-chips">
        {registeredProviders.map((provider) => (
          <button
            key={provider.id}
            type="button"
            className={`settings-provider-chip${selectedChipId === provider.id ? ' active' : ''}`}
            onClick={() => setSelectedChipId(provider.id)}
          >
            <span className="settings-chip-name-wrap">
              <ServiceBadge
                kind="provider"
                id={provider.id}
                name={provider.name}
                size="sm"
              />
              <span className="settings-chip-name">{provider.name}</span>
            </span>
            {activeProviderId === provider.id ? (
              <span className="settings-chip-check" aria-label="Active">
                ✓
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {selectedProvider && draft ? (
        <div className="settings-provider-config">
          <div className="settings-provider-config-head">
            <div className="settings-provider-title">
              <ServiceBadge
                kind="provider"
                id={selectedProvider.id}
                name={selectedProvider.name}
              />
              <strong>{selectedProvider.name}</strong>
            </div>
            {isActive ? (
              <span className="settings-chip-active-badge">Active provider</span>
            ) : null}
          </div>

          {hasCredentialHelp ? (
            <div className="settings-help-panel">
              {selectedProvider.credentialSteps &&
              selectedProvider.credentialSteps.length ? (
                <ol className="settings-help-steps">
                  {selectedProvider.credentialSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              ) : null}
              {selectedProvider.credentialLinks &&
              selectedProvider.credentialLinks.length ? (
                <div className="settings-help-links">
                  {selectedProvider.credentialLinks.map((link) => (
                    <a
                      key={`${selectedProvider.id}-${link.url}`}
                      className="settings-help-link"
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="settings-field">
            <label
              className="settings-label"
              htmlFor={`provider-${selectedProvider.id}-baseUrl`}
            >
              Base URL
            </label>
            <input
              id={`provider-${selectedProvider.id}-baseUrl`}
              className="settings-input"
              type="text"
              value={String(draft.baseUrl || '')}
              onChange={(e) =>
                handleProviderDraftChange(selectedProvider.id, 'baseUrl', e.target.value)
              }
              placeholder={
                selectedProvider.fields?.find((f) => f.key === 'baseUrl')?.placeholder ||
                'https://...'
              }
            />
          </div>

          {selectedProvider.fields?.some((f) => f.key === 'apiKey') ? (
            <div className="settings-field">
              <label
                className="settings-label"
                htmlFor={`provider-${selectedProvider.id}-apiKey`}
              >
                API Key
              </label>
              <input
                id={`provider-${selectedProvider.id}-apiKey`}
                className="settings-input"
                type="password"
                value={String(draft.apiKey || '')}
                onChange={(e) =>
                  handleProviderDraftChange(selectedProvider.id, 'apiKey', e.target.value)
                }
                placeholder={
                  selectedProvider.fields?.find((f) => f.key === 'apiKey')?.placeholder ||
                  'sk-...'
                }
              />
            </div>
          ) : null}

          <div className="settings-field">
            <label
              className="settings-label"
              htmlFor={`provider-${selectedProvider.id}-model`}
            >
              Model
              {models.length ? (
                <>
                  {' '}
                  <span className="settings-models-count">{models.length} available</span>
                </>
              ) : null}
            </label>
            <div className="settings-model-row">
              {models.length ? (
                <select
                  id={`provider-${selectedProvider.id}-model`}
                  className="settings-input settings-model-select"
                  value={String(draft.model || '')}
                  onChange={(e) =>
                    handleProviderDraftChange(selectedProvider.id, 'model', e.target.value)
                  }
                >
                  <option value="">Select a model…</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                      {m.owned_by ? ` (${m.owned_by})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`provider-${selectedProvider.id}-model`}
                  className="settings-input"
                  type="text"
                  value={String(draft.model || '')}
                  onChange={(e) =>
                    handleProviderDraftChange(selectedProvider.id, 'model', e.target.value)
                  }
                  placeholder="Click 'Load models' or type a model ID"
                />
              )}
              <button
                type="button"
                className="settings-fetch-models-button"
                onClick={() => handleFetchModels(selectedProvider.id)}
                disabled={!!isFetching || !String(draft.baseUrl || '').trim()}
              >
                {isFetching ? 'Loading…' : 'Load models'}
              </button>
              <button
                type="button"
                className="settings-fetch-models-button"
                onClick={() => handleTestProvider(selectedProvider.id)}
                disabled={
                  !!isTesting ||
                  !!savingProviderId ||
                  !String(draft.baseUrl || '').trim() ||
                  !String(draft.model || '').trim()
                }
              >
                {isTesting ? 'Testing…' : 'Test'}
              </button>
            </div>
            {suggestedModels.length > 0 && !models.length ? (
              <p className="settings-provider-note">
                Suggested: {suggestedModels.join(', ')}
              </p>
            ) : null}
          </div>

          <div className="settings-actions">
            {isActive ? (
              <button
                type="button"
                className="settings-save-activate-button"
                onClick={() => handleSaveProvider(selectedProvider.id)}
                disabled={!!savingProviderId || !isDirty}
              >
                {savingProviderId === selectedProvider.id ? 'Saving…' : 'Save'}
              </button>
            ) : (
              <button
                type="button"
                className="settings-save-activate-button"
                onClick={() => handleSaveAndActivate(selectedProvider.id)}
                disabled={!!savingProviderId}
              >
                {savingProviderId === selectedProvider.id ? 'Saving…' : 'Save & activate'}
              </button>
            )}
            {!isActive ? (
              <button
                type="button"
                onClick={() => handleSaveProvider(selectedProvider.id)}
                disabled={!!savingProviderId || !isDirty}
              >
                {savingProviderId === selectedProvider.id ? 'Saving…' : 'Save only'}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="settings-provider-config settings-provider-config-empty">
          <p>Select a provider above to configure it.</p>
        </div>
      )}
    </>
  );
}

export function SettingsChannelsSection(props) {
  const {
    communicationChannels,
    registeredChannelConnectors,
    pollingNow,
    handlePollNow,
    addingChannel,
    handleAddChannel,
    channelDrafts,
    handleChannelDraftChange,
    handleSaveChannel,
    savingChannelId,
    handleTestChannel,
    testingChannelId,
    channelActivity,
  } = props;

  return (
    <>
      <div className="home-section-head">
        <h2>Communication Channels</h2>
      </div>
      <div className="settings-section-copy">
        <p>
          Connector files define settings schema, test/send behavior, event
          hooks, and formula mention patterns for each channel type.
        </p>
      </div>
      <div className="settings-channel-actions">
        <button
          type="button"
          onClick={handlePollNow}
          disabled={pollingNow || !communicationChannels.length}
        >
          {pollingNow ? 'Polling...' : 'Poll now'}
        </button>
        {registeredChannelConnectors.map((connector) => (
          <button
            key={connector.id}
            type="button"
            onClick={() => handleAddChannel(connector.id)}
            disabled={addingChannel === connector.id}
          >
            <span className="settings-inline-service-label">
              <ServiceBadge
                kind="channel"
                id={connector.id}
                name={connector.name}
                size="sm"
              />
              <span>
                {addingChannel === connector.id ? 'Adding...' : connector.name}
              </span>
            </span>
          </button>
        ))}
      </div>

      {channelActivity && channelActivity.length ? (
        <div className="settings-live-feed">
          <div className="settings-live-feed-head">Live activity</div>
          <div className="settings-live-feed-list">
            {channelActivity.map((item) => (
              <div key={item.id} className="settings-live-feed-item">
                <strong>{item.label}</strong>
                <span>{item.text}</span>
                <time>{new Date(item.timestamp).toLocaleTimeString()}</time>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!communicationChannels.length ? (
        <p className="home-empty-note">No communication channels added yet.</p>
      ) : (
        <div className="settings-channel-list">
          {communicationChannels.map((channel) => {
            const connector = registeredChannelConnectors.find(
              (item) => item.id === channel.connectorId,
            );
            const draft = channelDrafts[channel.id] || {};
            const draftSettings = draft.settings || {};

            return (
              <div key={channel.id} className="settings-provider-card">
                <div className="settings-provider-head">
                  <div className="settings-provider-title">
                    <ServiceBadge
                      kind="channel"
                      id={connector?.id || channel.connectorId}
                      name={connector?.name || channel.connectorId}
                    />
                    <div className="settings-provider-title-copy">
                      <strong>{draft.label || channel.label}</strong>
                      {connector ? (
                        <span className="settings-provider-subtitle">
                          {connector.name}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className={`settings-status settings-status-${String(
                      draft.status || channel.status || 'pending',
                    ).toLowerCase()}`}
                  >
                    {draft.status || channel.status}
                  </span>
                </div>
                <div className="settings-checkbox-row">
                  <label
                    className="settings-checkbox-label"
                    htmlFor={`channel-${channel.id}-enabled`}
                  >
                    <input
                      id={`channel-${channel.id}-enabled`}
                      type="checkbox"
                      checked={draft.enabled !== false}
                      onChange={(event) =>
                        handleChannelDraftChange(
                          channel.id,
                          'enabled',
                          event.target.checked,
                        )
                      }
                    />
                    <span>Enabled</span>
                  </label>
                </div>
                <div className="settings-field">
                  <label
                    className="settings-label"
                    htmlFor={`channel-${channel.id}-label`}
                  >
                    Channel label
                  </label>
                  <input
                    id={`channel-${channel.id}-label`}
                    className="settings-input"
                    type="text"
                    value={String(draft.label || channel.label || '')}
                    onChange={(event) =>
                      handleChannelDraftChange(channel.id, 'label', event.target.value)
                    }
                    placeholder="Channel label"
                  />
                </div>
                {(connector?.settingsFields || []).map((field) =>
                  field.key === 'label' ? null : (
                    <div key={field.key} className="settings-field">
                      <label
                        className="settings-label"
                        htmlFor={`channel-${channel.id}-${field.key}`}
                      >
                        {field.label}
                      </label>
                      {field.type === 'checkbox' ? (
                        <input
                          id={`channel-${channel.id}-${field.key}`}
                          type="checkbox"
                          checked={Boolean(draftSettings[field.key])}
                          onChange={(event) =>
                            handleChannelDraftChange(
                              channel.id,
                              'settings',
                              event.target.checked,
                              field.key,
                            )
                          }
                        />
                      ) : (
                        <input
                          id={`channel-${channel.id}-${field.key}`}
                          className="settings-input"
                          type={field.type === 'password' ? 'password' : 'text'}
                          value={String(draftSettings[field.key] ?? '')}
                          onChange={(event) =>
                            handleChannelDraftChange(
                              channel.id,
                              'settings',
                              event.target.value,
                              field.key,
                            )
                          }
                          placeholder={field.placeholder || ''}
                        />
                      )}
                    </div>
                  ),
                )}
                {connector ? (
                  <p className="settings-provider-note">
                    Mentioning: {connector.mentioningFormulas.join(' | ')}
                  </p>
                ) : null}
                <div className="settings-kv-list settings-kv-list-compact">
                  <div className="settings-kv-item">
                    <span className="settings-label">Last seen UID</span>
                    <strong>{draft.lastSeenUid || 0}</strong>
                  </div>
                  <div className="settings-kv-item">
                    <span className="settings-label">Last event at</span>
                    <strong>
                      {draft.lastEventAt
                        ? new Date(draft.lastEventAt).toLocaleString()
                        : 'Never'}
                    </strong>
                  </div>
                  <div className="settings-kv-item">
                    <span className="settings-label">Last polled at</span>
                    <strong>
                      {draft.lastPolledAt
                        ? new Date(draft.lastPolledAt).toLocaleString()
                        : 'Never'}
                    </strong>
                  </div>
                </div>
                {draft.lastEventPreview ? (
                  <div className="settings-channel-event">
                    <div className="settings-channel-event-head">Latest event</div>
                    {draft.lastEventId ? (
                      <p className="settings-provider-note">
                        Event ID: {draft.lastEventId}
                      </p>
                    ) : null}
                    <pre className="settings-channel-event-body">
                      {JSON.stringify(draft.lastEventPreview, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <p className="settings-provider-note">No event received yet.</p>
                )}
                {draft.lastTestMessage ? (
                  <p className="settings-provider-note">{draft.lastTestMessage}</p>
                ) : null}
                {draft.watchError ? (
                  <p className="settings-provider-note settings-provider-note-error">
                    {draft.watchError}
                  </p>
                ) : null}
                <div className="settings-actions">
                  <button
                    type="button"
                    onClick={() => handleSaveChannel(channel.id)}
                    disabled={savingChannelId === channel.id}
                  >
                    {savingChannelId === channel.id ? 'Saving...' : 'Save channel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTestChannel(channel.id)}
                    disabled={testingChannelId === channel.id}
                  >
                    {testingChannelId === channel.id ? 'Testing...' : 'Test connection'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export function SettingsGeneralSection({
  activeProviderLabel,
  registeredProviders,
  configuredChannelsCount,
  configuredSecretsCount,
  hubPublishDraft,
  onHubPublishDraftChange,
  onSaveHubPublishSettings,
  savingHubPublishSettings,
  hubPublishDirty,
  workbookUiDraft,
  onWorkbookUiDraftChange,
  onSaveWorkbookUiSettings,
  savingWorkbookUiSettings,
  workbookUiDirty,
}) {
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

      <div className="settings-provider-card">
        <div className="settings-provider-head">
          <strong>Workbook UI</strong>
          <span className="settings-status">local editing tools</span>
        </div>
        <div className="settings-checkbox-row">
          <label
            className="settings-checkbox-label"
            htmlFor="workbook-ui-show-debug-console"
          >
            <input
              id="workbook-ui-show-debug-console"
              type="checkbox"
              checked={!!(workbookUiDraft && workbookUiDraft.showDebugConsole)}
              onChange={(event) =>
                onWorkbookUiDraftChange('showDebugConsole', event.target.checked)
              }
            />
            <span>Show workbook debug console</span>
          </label>
        </div>
        <p className="settings-provider-note">
          Off by default. Enable only when you need low-level workbook/socket event diagnostics.
        </p>
        <div className="settings-actions">
          <button
            type="button"
            onClick={onSaveWorkbookUiSettings}
            disabled={!!savingWorkbookUiSettings || !workbookUiDirty}
          >
            {savingWorkbookUiSettings ? 'Saving...' : 'Save workbook UI settings'}
          </button>
        </div>
      </div>

      <div className="settings-provider-card">
        <div className="settings-provider-head">
          <strong>Hub Publishing</strong>
          <span className="settings-status">used by workbook publish dialog</span>
        </div>
        <div className="settings-field">
          <label className="settings-label" htmlFor="hub-publish-api-base-url">
            Marketplace URL
          </label>
          <input
            id="hub-publish-api-base-url"
            className="settings-input"
            type="text"
            value={String((hubPublishDraft && hubPublishDraft.apiBaseUrl) || '')}
            onChange={(event) =>
              onHubPublishDraftChange('apiBaseUrl', event.target.value)
            }
            placeholder="https://hub.metacells.dev or http://localhost:4001"
          />
        </div>
        <div className="settings-field-grid">
          <div className="settings-field">
            <label className="settings-label" htmlFor="hub-publish-username">
              Hub username
            </label>
            <input
              id="hub-publish-username"
              className="settings-input"
              type="text"
              value={String((hubPublishDraft && hubPublishDraft.username) || '')}
              onChange={(event) =>
                onHubPublishDraftChange('username', event.target.value)
              }
              placeholder="yuriy"
            />
          </div>
          <div className="settings-field">
            <label className="settings-label" htmlFor="hub-publish-password">
              Hub password
            </label>
            <input
              id="hub-publish-password"
              className="settings-input"
              type="password"
              value={String((hubPublishDraft && hubPublishDraft.password) || '')}
              onChange={(event) =>
                onHubPublishDraftChange('password', event.target.value)
              }
              placeholder="Password"
            />
          </div>
        </div>
        <div className="settings-field">
          <label className="settings-label" htmlFor="hub-publish-token">
            Bearer token override
          </label>
          <input
            id="hub-publish-token"
            className="settings-input"
            type="password"
            value={String((hubPublishDraft && hubPublishDraft.token) || '')}
            onChange={(event) =>
              onHubPublishDraftChange('token', event.target.value)
            }
            placeholder="Optional. If set, username/password are ignored."
          />
        </div>
        <p className="settings-provider-note">
          Use `https://hub.metacells.dev` normally, or your local hub URL during development.
        </p>
        <div className="settings-actions">
          <button
            type="button"
            onClick={onSaveHubPublishSettings}
            disabled={!!savingHubPublishSettings || !hubPublishDirty}
          >
            {savingHubPublishSettings ? 'Saving...' : 'Save hub settings'}
          </button>
        </div>
      </div>
    </>
  );
}

export function SettingsJobsSection({
  jobSettingsDraft,
  handleJobSettingsDraftChange,
  handleSaveJobSettings,
  savingJobSettings,
  jobActivity,
  jobStats,
}) {
  return (
    <>
      <div className="home-section-head">
        <h2>Jobs</h2>
      </div>
      <div className="settings-section-copy">
        <p>
          Durable server jobs back AI calls and file conversion. These settings are
          stored in Mongo and are designed to map cleanly to a future external broker.
        </p>
      </div>
      <div className="settings-provider-card">
        <div className="settings-provider-head">
          <strong>Worker control</strong>
          <span className="settings-status">
            {jobSettingsDraft.workerEnabled ? 'Enabled' : 'Paused'}
          </span>
        </div>
        <div className="settings-checkbox-row">
          <label
            className="settings-checkbox-label"
            htmlFor="job-settings-worker-enabled"
          >
            <input
              id="job-settings-worker-enabled"
              type="checkbox"
              checked={jobSettingsDraft.workerEnabled !== false}
              onChange={(event) =>
                handleJobSettingsDraftChange('workerEnabled', event.target.checked)
              }
            />
            <span>Enable durable job worker</span>
          </label>
        </div>
        <p className="settings-provider-note">
          If disabled, queued jobs stay persisted in Mongo and will resume when the
          worker is re-enabled.
        </p>
      </div>

      <div className="settings-provider-card">
        <div className="settings-provider-head">
          <strong>Live job activity</strong>
          <span className="settings-status">websocket events</span>
        </div>
        <div className="settings-kv-list settings-kv-list-compact">
          <div className="settings-kv-item">
            <span className="settings-label">Queued</span>
            <strong>{Number((jobStats && jobStats.queued) || 0)}</strong>
          </div>
          <div className="settings-kv-item">
            <span className="settings-label">Running</span>
            <strong>{Number((jobStats && jobStats.running) || 0)}</strong>
          </div>
          <div className="settings-kv-item">
            <span className="settings-label">Retrying</span>
            <strong>{Number((jobStats && jobStats.retrying) || 0)}</strong>
          </div>
          <div className="settings-kv-item">
            <span className="settings-label">Failed</span>
            <strong>{Number((jobStats && jobStats.failed) || 0)}</strong>
          </div>
          <div className="settings-kv-item">
            <span className="settings-label">Completed</span>
            <strong>{Number((jobStats && jobStats.completed) || 0)}</strong>
          </div>
        </div>
        {jobActivity && jobActivity.length ? (
          <div className="settings-live-feed">
            <div className="settings-live-feed-list">
              {jobActivity.map((item) => (
                <div key={item.id} className="settings-live-feed-item">
                  <strong>{item.label}</strong>
                  <span>
                    {item.text}
                    {item.jobId ? ` (${item.jobId})` : ''}
                  </span>
                  <time>{new Date(item.timestamp).toLocaleTimeString()}</time>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="settings-provider-note">No live job events yet.</p>
        )}
      </div>

      <div className="settings-provider-card">
        <div className="settings-provider-head">
          <strong>AI jobs</strong>
          <span className="settings-status">applies to server AI queue</span>
        </div>
        <div className="settings-field-grid">
          {[
            ['aiChatConcurrency', 'job-settings-ai-concurrency', 'Concurrency'],
            ['aiChatMaxAttempts', 'job-settings-ai-attempts', 'Max attempts'],
            ['aiChatRetryDelayMs', 'job-settings-ai-delay', 'Retry delay ms'],
            ['aiChatTimeoutMs', 'job-settings-ai-timeout', 'Timeout ms'],
            ['aiChatLeaseTimeoutMs', 'job-settings-ai-lease', 'Lease timeout ms'],
            ['aiChatHeartbeatIntervalMs', 'job-settings-ai-heartbeat', 'Heartbeat ms'],
          ].map(([key, id, label]) => (
            <div key={key} className="settings-field">
              <label className="settings-label" htmlFor={id}>
                {label}
              </label>
              <input
                id={id}
                className="settings-input"
                type="number"
                min="1"
                step={String(key).includes('Delay') ? '250' : String(key).includes('Heartbeat') ? '500' : String(key).includes('Timeout') || String(key).includes('Lease') ? '1000' : undefined}
                value={String(jobSettingsDraft[key])}
                onChange={(event) => handleJobSettingsDraftChange(key, event.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="settings-provider-card">
        <div className="settings-provider-head">
          <strong>File extraction jobs</strong>
          <span className="settings-status">applies to converter jobs</span>
        </div>
        <div className="settings-field-grid">
          {[
            ['fileExtractConcurrency', 'job-settings-file-concurrency', 'Concurrency'],
            ['fileExtractMaxAttempts', 'job-settings-file-attempts', 'Max attempts'],
            ['fileExtractRetryDelayMs', 'job-settings-file-delay', 'Retry delay ms'],
            ['fileExtractTimeoutMs', 'job-settings-file-timeout', 'Timeout ms'],
            ['fileExtractLeaseTimeoutMs', 'job-settings-file-lease', 'Lease timeout ms'],
            ['fileExtractHeartbeatIntervalMs', 'job-settings-file-heartbeat', 'Heartbeat ms'],
          ].map(([key, id, label]) => (
            <div key={key} className="settings-field">
              <label className="settings-label" htmlFor={id}>
                {label}
              </label>
              <input
                id={id}
                className="settings-input"
                type="number"
                min="1"
                step={String(key).includes('Delay') ? '250' : String(key).includes('Heartbeat') ? '500' : String(key).includes('Timeout') || String(key).includes('Lease') ? '1000' : undefined}
                value={String(jobSettingsDraft[key])}
                onChange={(event) => handleJobSettingsDraftChange(key, event.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="settings-actions">
          <button type="button" onClick={handleSaveJobSettings} disabled={savingJobSettings}>
            {savingJobSettings ? 'Saving...' : 'Save job settings'}
          </button>
        </div>
      </div>
    </>
  );
}

export function SettingsAdvancedSection({ registeredProviders, providerDrafts }) {
  return (
    <>
      <div className="home-section-head">
        <h2>Advanced</h2>
      </div>
      <div className="settings-section-copy">
        <p>
          Raw provider diagnostics and saved endpoints for debugging server-side AI
          calls.
        </p>
      </div>
      <div className="settings-actions">
        <Link className="home-secondary-link" to="/stats">
          Stats
        </Link>
      </div>
      <div className="settings-kv-list">
        {registeredProviders.map((provider) => {
          const draft = providerDrafts[provider.id] || provider;
          return (
            <div key={provider.id} className="settings-kv-item">
              <span className="settings-provider-title settings-provider-title-compact">
                <ServiceBadge
                  kind="provider"
                  id={provider.id}
                  name={provider.name}
                  size="sm"
                />
                <span className="settings-label">{provider.name}</span>
              </span>
              <strong>{draft.baseUrl || draft.model || 'Not configured'}</strong>
            </div>
          );
        })}
      </div>
    </>
  );
}
