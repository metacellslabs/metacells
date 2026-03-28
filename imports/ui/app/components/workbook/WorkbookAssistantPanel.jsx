import { useEffect, useRef, useState } from 'react';
import { ServiceBadge } from '../icons/ServiceBadge.jsx';

export function WorkbookAssistantPanel({ workbookUiState, appRef }) {
  const assistantUi =
    workbookUiState && workbookUiState.assistantUi
      ? workbookUiState.assistantUi
      : null;
  const isOpen = assistantUi ? assistantUi.open === true : false;
  const providers =
    assistantUi && Array.isArray(assistantUi.providers)
      ? assistantUi.providers
      : [];
  const uploads =
    assistantUi && Array.isArray(assistantUi.uploads)
      ? assistantUi.uploads
      : [];
  const messages =
    assistantUi && Array.isArray(assistantUi.messages)
      ? assistantUi.messages
      : [];
  const activity =
    assistantUi && Array.isArray(assistantUi.activity)
      ? assistantUi.activity
      : [];
  const statusText = assistantUi ? String(assistantUi.statusText || '') : '';
  const metaText = assistantUi ? String(assistantUi.metaText || '') : '';
  const activeProviderId = assistantUi
    ? String(assistantUi.activeProviderId || '')
    : '';
  const activeProvider =
    providers.find((provider) => provider.id === activeProviderId) ||
    providers[0] ||
    null;
  const isBusy = assistantUi ? assistantUi.busy === true : false;
  const draftValue = assistantUi ? String(assistantUi.draft || '') : '';
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);
  const dragStateRef = useRef(null);
  const [panelOffset, setPanelOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handlePointerMove = (event) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      const viewportWidth =
        window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight || 0;
      const nextLeft = dragState.left + (event.clientX - dragState.startX);
      const nextTop = dragState.top + (event.clientY - dragState.startY);
      const minLeft = 8;
      const minTop = 8;
      const maxLeft = Math.max(minLeft, viewportWidth - dragState.width - 8);
      const maxTop = Math.max(minTop, viewportHeight - dragState.height - 8);
      const clampedLeft = Math.min(Math.max(nextLeft, minLeft), maxLeft);
      const clampedTop = Math.min(Math.max(nextTop, minTop), maxTop);
      setPanelOffset({
        x: dragState.originX + (clampedLeft - dragState.left),
        y: dragState.originY + (clampedTop - dragState.top),
      });
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      document.body.classList.remove('assistant-chat-dragging');
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.body.classList.remove('assistant-chat-dragging');
    };
  }, []);

  const handleClose = () => {
    if (appRef && appRef.current && typeof appRef.current.hideAssistantPanel === 'function') {
      appRef.current.hideAssistantPanel();
    }
  };

  const handleProviderChange = (event) => {
    if (appRef && appRef.current && typeof appRef.current.setAssistantProvider === 'function') {
      appRef.current.setAssistantProvider(event.target.value);
    }
  };

  const handleAttachFile = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (appRef && appRef.current && typeof appRef.current.uploadAssistantFile === 'function') {
      appRef.current.uploadAssistantFile(file);
    }
    event.target.value = '';
  };

  const handleRemoveUpload = (uploadId) => {
    if (appRef && appRef.current && typeof appRef.current.removeAssistantUpload === 'function') {
      appRef.current.removeAssistantUpload(uploadId);
    }
  };

  const handleClear = () => {
    if (appRef && appRef.current && typeof appRef.current.clearAssistantConversation === 'function') {
      appRef.current.clearAssistantConversation();
    }
  };

  const handleDraftChange = (event) => {
    if (appRef && appRef.current && typeof appRef.current.updateAssistantDraft === 'function') {
      appRef.current.updateAssistantDraft(event.target.value);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (appRef && appRef.current && typeof appRef.current.submitAssistantDraft === 'function') {
      appRef.current.submitAssistantDraft(draftValue);
    }
  };

  const handleDraftKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (appRef && appRef.current && typeof appRef.current.submitAssistantDraft === 'function') {
        appRef.current.submitAssistantDraft(draftValue);
      }
    }
  };

  const handlePanelDragStart = (event) => {
    if (event.button !== 0) return;
    if (
      event.target &&
      event.target.closest &&
      event.target.closest('button, select, input, textarea, label')
    ) {
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      originX: panelOffset.x,
      originY: panelOffset.y,
    };
    document.body.classList.add('assistant-chat-dragging');
    event.preventDefault();
  };

  return (
    <div
      ref={panelRef}
      className="assistant-chat-panel"
      hidden={!isOpen}
      style={{
        display: isOpen ? 'flex' : 'none',
        transform: `translate(${panelOffset.x}px, ${panelOffset.y}px)`,
      }}
    >
      <div className="assistant-chat-head" onPointerDown={handlePanelDragStart}>
        <div className="assistant-chat-title-wrap">
          <h2>AI Assistant</h2>
        </div>
        <div className="assistant-chat-head-actions">
          <label
            className="assistant-chat-provider assistant-chat-provider-compact"
            aria-label="Assistant provider"
          >
            {activeProvider ? (
              <ServiceBadge
                kind="provider"
                id={activeProvider.id}
                name={activeProvider.name}
                size="sm"
                className="assistant-chat-provider-badge"
              />
            ) : null}
            <select
              name="assistant-provider"
              value={activeProviderId}
              onChange={handleProviderChange}
              disabled={isBusy}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
            <span className="assistant-chat-provider-arrow" aria-hidden="true">
              ▾
            </span>
          </label>
          <div
            className="assistant-chat-status"
            style={{ display: statusText ? 'inline-flex' : 'none' }}
          >
            {statusText}
          </div>
          <button
            type="button"
            className="assistant-chat-close"
            onClick={handleClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>
      <div className="assistant-chat-meta">{metaText}</div>
      <div
        className="assistant-chat-uploads"
        style={{ display: uploads.length ? 'flex' : 'none' }}
      >
        {uploads.map((item) => (
          <div key={item.id} className="assistant-chat-upload-chip">
            <span className="assistant-chat-upload-chip-label">{item.name}</span>
            <button
              type="button"
              className="assistant-chat-upload-remove"
              onClick={() => handleRemoveUpload(item.id)}
              aria-label="Remove uploaded file"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="assistant-chat-body">
        <div className="assistant-chat-messages">
          {messages.length ? (
            messages.map((item, index) => (
              <div
                key={`${item.role}:${index}:${item.time || ''}`}
                className={`assistant-chat-message assistant-chat-message-${item.role || 'assistant'}`}
              >
                {item.role !== 'user' || item.time ? (
                  <div className="assistant-chat-message-role">
                    {item.role === 'user' ? '' : 'Assistant'}
                    {item.time ? (
                      <span className="assistant-chat-message-time">{item.time}</span>
                    ) : null}
                  </div>
                ) : null}
                <div className="assistant-chat-message-body">{item.content}</div>
              </div>
            ))
          ) : (
            <div className="assistant-chat-empty">
              <strong>Ask for workbook changes directly.</strong>
              <span>
                Try: build a report tab, rewrite these formulas using @mentions,
                add schedules, or attach an uploaded file into a cell.
              </span>
            </div>
          )}
          {isBusy ? (
            <div className="assistant-chat-message assistant-chat-message-assistant assistant-chat-message-thinking">
              <div className="assistant-chat-message-body assistant-chat-thinking-body">
                <span className="assistant-chat-thinking-dot"></span>
                <span className="assistant-chat-thinking-dot"></span>
                <span className="assistant-chat-thinking-dot"></span>
              </div>
            </div>
          ) : null}
        </div>
        <div
          className="assistant-chat-activity"
          style={{ display: activity.length ? 'flex' : 'none' }}
        >
          {activity.length ? (
            <>
              <div className="assistant-chat-activity-heading">Recent tool activity</div>
              {activity.map((item, index) => (
                <div
                  key={`${item.assistantMessage}:${index}`}
                  className="assistant-chat-activity-card"
                >
                  <div className="assistant-chat-activity-title">
                    {item.assistantMessage || 'Tool activity'}
                  </div>
                  {(Array.isArray(item.toolResults) ? item.toolResults : []).map((result, resultIndex) => (
                    <div
                      key={`${result.name}:${resultIndex}`}
                      className={`assistant-chat-activity-line${
                        result.ok === false ? ' is-error' : ''
                      }`}
                    >
                      {result.name}
                      {result.ok === false
                        ? `: ${String(result.error || 'Failed')}`
                        : ': ok'}
                    </div>
                  ))}
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>
      <form className="assistant-chat-compose" onSubmit={handleSubmit}>
        <textarea
          name="message"
          rows="4"
          placeholder="Ask AI to analyze or update this workbook"
          value={draftValue}
          onChange={handleDraftChange}
          onKeyDown={handleDraftKeyDown}
        ></textarea>
        <input
          type="file"
          name="assistant-file"
          ref={fileInputRef}
          className="assistant-chat-file-input"
          tabIndex="-1"
          aria-hidden="true"
          onChange={handleFileChange}
        />
        <div className="assistant-chat-actions">
          <div className="assistant-chat-hint">
            Use Cmd/Ctrl+Enter to send. Ask for workbook edits, reports,
            schedules, formatting, or channel actions.
          </div>
          <button
            type="button"
            className="secondary assistant-chat-attach-button"
            onClick={handleAttachFile}
            aria-label="Attach file"
            title="Attach file"
          >
            <span aria-hidden="true">📎</span>
          </button>
          <button type="button" className="secondary" onClick={handleClear}>
            Clear
          </button>
          <button type="submit" disabled={isBusy || !draftValue.trim()}>
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
