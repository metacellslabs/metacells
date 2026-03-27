import { useEffect, useRef, useState } from 'react';
import { subscribeServerEvents } from '../../../../../lib/transport/ws-client.js';

export function WorkbookEditorOverlay({ workbookUiState, appRef }) {
  const overlayUi =
    workbookUiState && workbookUiState.editorOverlayUi
      ? workbookUiState.editorOverlayUi
      : null;
  const mentionUi =
    workbookUiState && workbookUiState.mentionAutocompleteUi
      ? workbookUiState.mentionAutocompleteUi
      : null;
  const overlayValue = String(
    (workbookUiState && workbookUiState.formulaValue) || '',
  );
  const inputRef = useRef(null);
  const dragRef = useRef(null);
  const dragCellIdRef = useRef('');
  const overlayVisibilityRef = useRef(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const frameStyle =
    overlayUi && overlayUi.visible ? undefined : { display: 'none' };
  const showEmbeddedMention =
    !!(overlayUi && overlayUi.visible && mentionUi && mentionUi.visible);
  const overlayMentionItems =
    showEmbeddedMention && Array.isArray(mentionUi.items)
      ? mentionUi.items
      : [];
  const modalStyle =
    dragOffset.x || dragOffset.y
      ? {
          transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
        }
      : undefined;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (document.activeElement === input) return;
    input.value = overlayValue;
  }, [overlayValue, overlayUi && overlayUi.visible]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input || !(overlayUi && overlayUi.visible)) return;
    const rafId = window.requestAnimationFrame(() => {
      if (document.activeElement !== input) {
        input.focus();
      }
      const end = String(input.value || '').length;
      if (typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(end, end);
      }
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [overlayUi && overlayUi.visible, overlayUi && overlayUi.cellId]);

  useEffect(() => {
    const isVisible = !!(overlayUi && overlayUi.visible);
    const cellId = overlayUi ? String(overlayUi.cellId || '') : '';
    const wasVisible = overlayVisibilityRef.current;
    const previousCellId = dragCellIdRef.current;

    if (!isVisible) {
      setDragOffset({ x: 0, y: 0 });
      dragRef.current = null;
      dragCellIdRef.current = '';
      overlayVisibilityRef.current = false;
      return;
    }

    if (!wasVisible || previousCellId !== cellId) {
      setDragOffset({ x: 0, y: 0 });
      dragRef.current = null;
    }

    dragCellIdRef.current = cellId;
    overlayVisibilityRef.current = true;
  }, [overlayUi && overlayUi.visible, overlayUi && overlayUi.cellId]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      setDragOffset({
        x: drag.startX + (event.clientX - drag.pointerStartX),
        y: drag.startY + (event.clientY - drag.pointerStartY),
      });
    };
    const handlePointerUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  return (
    <div
      className="cell-editor-overlay"
      style={frameStyle}
      aria-hidden={overlayUi && overlayUi.visible ? 'false' : 'true'}
      data-cell-id={overlayUi ? String(overlayUi.cellId || '') : ''}
    >
      <div className="cell-editor-overlay-modal" style={modalStyle}>
        <div
          className="cell-editor-overlay-head"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            if (
              event.target &&
              event.target.closest &&
              event.target.closest('button')
            ) {
              return;
            }
            dragRef.current = {
              pointerStartX: event.clientX,
              pointerStartY: event.clientY,
              startX: dragOffset.x,
              startY: dragOffset.y,
            };
            event.preventDefault();
          }}
        >
          <div className="cell-editor-overlay-head-actions">
            <button
              type="button"
              className="app-dialog-button app-dialog-button-primary cell-editor-overlay-save"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                if (appRef?.current?.commitEditorOverlay) {
                  appRef.current.commitEditorOverlay();
                }
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="cell-editor-overlay-close"
              title="Close editor"
              aria-label="Close editor"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                if (appRef?.current?.dismissEditorOverlay) {
                  appRef.current.dismissEditorOverlay();
                }
              }}
            >
              ×
            </button>
          </div>
        </div>
        <textarea
          ref={inputRef}
          className="cell-editor-overlay-input app-dialog-input"
          spellCheck={false}
          rows={4}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        />
        {showEmbeddedMention ? (
          <div className="cell-editor-overlay-mention">
            <div className="mention-autocomplete mention-autocomplete-embedded">
              <div className="mention-autocomplete-list">
                {overlayMentionItems.map((item, index) => (
                  <button
                    key={`${item.token || item.label || 'item'}:${index}`}
                    type="button"
                    className={`mention-autocomplete-item${
                      mentionUi.activeIndex === index ? ' active' : ''
                    }`}
                    data-index={String(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!appRef || !appRef.current) return;
                      appRef.current.applyMentionAutocompleteSelection(index);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function buildLiveIndicatorFromEvent(event) {
  const payload =
    event && event.payload && typeof event.payload === 'object'
      ? event.payload
      : {};
  const type = String((event && event.type) || '');
  const timestamp = Number((event && event.timestamp) || Date.now());

  if (type === 'channels.event.received') {
    return {
      id: `channel:${timestamp}:${event.sequence || 0}`,
      tone: 'info',
      title: String(event.channelLabel || 'Channel event'),
      text: `New ${String(payload.eventType || 'event')} received`,
      timestamp,
    };
  }

  if (type === 'jobs.failed') {
    return {
      id: `job-failed:${timestamp}:${event.sequence || 0}`,
      tone: 'error',
      title: String(event.jobType || 'Job failed'),
      text: String(payload.message || 'Background job failed'),
      timestamp,
    };
  }

  if (type === 'jobs.completed') {
    return {
      id: `job-completed:${timestamp}:${event.sequence || 0}`,
      tone: 'success',
      title: String(event.jobType || 'Job completed'),
      text: 'Background task finished',
      timestamp,
    };
  }

  if (type === 'jobs.retrying') {
    return {
      id: `job-retrying:${timestamp}:${event.sequence || 0}`,
      tone: 'warn',
      title: String(event.jobType || 'Job retrying'),
      text: payload.delayMs
        ? `Retry scheduled in ${Number(payload.delayMs) || 0}ms`
        : 'Retry scheduled',
      timestamp,
    };
  }

  return null;
}

export function WorkbookLiveIndicators() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeServerEvents((message) => {
      const event =
        message &&
        message.type === 'server.event' &&
        message.event &&
        typeof message.event === 'object'
          ? message.event
          : null;
      if (!event) return;

      const indicator = buildLiveIndicatorFromEvent(event);
      if (!indicator) return;

      setItems((current) => [indicator, ...current].slice(0, 4));

      window.setTimeout(() => {
        setItems((current) =>
          current.filter((entry) => entry && entry.id !== indicator.id),
        );
      }, indicator.tone === 'error' ? 6000 : 3600);
    });
    return unsubscribe;
  }, []);

  if (!items.length) return null;

  return (
    <div className="workbook-live-indicators" aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <div
          key={item.id}
          className={`workbook-live-indicator workbook-live-indicator-${item.tone}`}
        >
          <div className="workbook-live-indicator-title">{item.title}</div>
          <div className="workbook-live-indicator-text">{item.text}</div>
        </div>
      ))}
    </div>
  );
}

export function WorkbookAttachmentOverlays({ workbookUiState, appRef }) {
  const contentUi =
    workbookUiState && workbookUiState.attachmentContentUi
      ? workbookUiState.attachmentContentUi
      : null;
  const previewUi =
    workbookUiState && workbookUiState.floatingAttachmentPreviewUi
      ? workbookUiState.floatingAttachmentPreviewUi
      : null;

  return (
    <>
      <div
        className="attachment-content-overlay"
        style={{ display: contentUi && contentUi.open ? 'flex' : 'none' }}
        onMouseDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (appRef?.current?.hideAttachmentContentOverlay) {
            appRef.current.hideAttachmentContentOverlay();
          }
        }}
      >
        <div className="attachment-content-panel">
          <div className="attachment-content-header">
            <div className="attachment-content-title">
              {contentUi ? contentUi.title : ''}
            </div>
            <button
              type="button"
              className="attachment-content-close"
              title="Close"
              onClick={() => {
                if (appRef?.current?.hideAttachmentContentOverlay) {
                  appRef.current.hideAttachmentContentOverlay();
                }
              }}
            >
              ✕
            </button>
          </div>
          <pre className="attachment-content-body">
            {contentUi ? contentUi.body : ''}
          </pre>
        </div>
      </div>
      <div
        className="floating-attachment-preview"
        style={{
          display: previewUi && previewUi.open ? 'block' : 'none',
          left: `${Number((previewUi && previewUi.left) || 0)}px`,
          top: `${Number((previewUi && previewUi.top) || 0)}px`,
        }}
      >
        {previewUi && previewUi.open ? (
          <>
            <div className="floating-attachment-preview-head">
              <div className="floating-attachment-preview-title">
                {String(previewUi.previewName || 'attachment')}
              </div>
              <button
                type="button"
                className="floating-attachment-preview-close"
                title="Close preview"
                aria-label="Close preview"
                onClick={() => {
                  if (appRef?.current?.hideFloatingAttachmentPreview) {
                    appRef.current.hideFloatingAttachmentPreview();
                  }
                }}
              >
                ×
              </button>
            </div>
            <div className="floating-attachment-preview-media">
              {previewUi.previewKind === 'pdf' ? (
                <iframe
                  src={String(previewUi.previewUrl || '')}
                  title={String(previewUi.previewName || 'attachment')}
                  loading="lazy"
                />
              ) : (
                <img
                  src={String(previewUi.previewUrl || '')}
                  alt={String(previewUi.previewName || 'attachment')}
                />
              )}
            </div>
            <div className="floating-attachment-preview-actions">
              <a
                className="floating-attachment-preview-fullscreen"
                href={String(previewUi.previewUrl || '')}
                target="_blank"
                rel="noopener noreferrer"
                title="Open fullscreen"
                aria-label="Open fullscreen"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 3H3v5" />
                  <path d="M16 3h5v5" />
                  <path d="M21 16v5h-5" />
                  <path d="M8 21H3v-5" />
                  <path d="M3 8l6-6" />
                  <path d="M21 8l-6-6" />
                  <path d="M3 16l6 6" />
                  <path d="M21 16l-6 6" />
                </svg>
              </a>
              <a
                className="embedded-attachment-open"
                href={String(previewUi.previewUrl || '')}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open
              </a>
              <a
                className="embedded-attachment-download"
                href={String(previewUi.previewUrl || '')}
                download={String(previewUi.previewName || 'attachment')}
              >
                Download
              </a>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

export { WorkbookCellContentLayer } from './WorkbookCellContentLayer.jsx';

export function WorkbookSelectionOverlay({ workbookUiState, appRef }) {
  const selectionUi =
    workbookUiState && workbookUiState.selectionUi
      ? workbookUiState.selectionUi
      : null;
  const activeRect =
    selectionUi && selectionUi.activeRect ? selectionUi.activeRect : null;
  const rangeRect =
    selectionUi && selectionUi.rangeRect ? selectionUi.rangeRect : null;
  const fillHandleRect =
    selectionUi && selectionUi.fillHandleRect ? selectionUi.fillHandleRect : null;
  const headerRects =
    selectionUi && selectionUi.headerRects ? selectionUi.headerRects : null;
  const dependencyRects =
    selectionUi && Array.isArray(selectionUi.dependencyRects)
      ? selectionUi.dependencyRects
      : [];

  const renderRectList = (items, className, styleFactory) =>
    (Array.isArray(items) ? items : []).map((rect, index) => (
      <div
        key={`${className}:${index}`}
        className={className}
        style={styleFactory(rect)}
      />
    ));

  return (
    <div
      className="selection-overlay-layer"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 40,
      }}
    >
      {rangeRect ? (
        <div
          className="selection-overlay-range"
          data-testid="selection-range"
          data-selection-sheet-id={String(selectionUi?.selectionSheetId || '')}
          data-selection-start-cell-id={String(
            selectionUi?.selectionStartCellId || '',
          )}
          data-selection-end-cell-id={String(
            selectionUi?.selectionEndCellId || '',
          )}
          style={{
            position: 'absolute',
            left: `${Number(rangeRect.left || 0)}px`,
            top: `${Number(rangeRect.top || 0)}px`,
            width: `${Math.max(0, Number(rangeRect.width || 0))}px`,
            height: `${Math.max(0, Number(rangeRect.height || 0))}px`,
            boxSizing: 'border-box',
            border: '1px solid rgba(15, 106, 78, 0.45)',
            background: 'transparent',
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {renderRectList(
        dependencyRects,
        'selection-overlay-dependency',
        (rect) => ({
          position: 'absolute',
          left: `${Number(rect.left || 0)}px`,
          top: `${Number(rect.top || 0)}px`,
          width: `${Math.max(0, Number(rect.width || 0))}px`,
          height: `${Math.max(0, Number(rect.height || 0))}px`,
          boxSizing: 'border-box',
          border: '1px dashed rgba(50, 113, 233, 0.38)',
          background: 'transparent',
          borderRadius: '6px',
          pointerEvents: 'none',
        }),
      )}
      {activeRect ? (
        <div
          className="selection-overlay-active"
          data-testid="selection-active"
          data-selection-sheet-id={String(selectionUi?.selectionSheetId || '')}
          data-active-cell-id={String(selectionUi?.activeCellId || '')}
          style={{
            position: 'absolute',
            left: `${Number(activeRect.left || 0)}px`,
            top: `${Number(activeRect.top || 0)}px`,
            width: `${Math.max(0, Number(activeRect.width || 0))}px`,
            height: `${Math.max(0, Number(activeRect.height || 0))}px`,
            boxSizing: 'border-box',
            border: '0 solid transparent',
            borderRadius: '0',
            boxShadow: 'none',
            background: 'transparent',
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {fillHandleRect ? (
        <div
          className="selection-overlay-fill-handle fill-handle"
          style={{
            position: 'absolute',
            left: `${Number(fillHandleRect.left || 0)}px`,
            top: `${Number(fillHandleRect.top || 0)}px`,
            width: `${Math.max(0, Number(fillHandleRect.width || 0))}px`,
            height: `${Math.max(0, Number(fillHandleRect.height || 0))}px`,
            display: 'block',
            background: '#1f6bff',
            cursor: 'crosshair',
            pointerEvents: 'auto',
            zIndex: 6,
          }}
          onMouseDown={(event) => {
            const app = appRef && appRef.current ? appRef.current : null;
            const activeCellId =
              app && typeof app.getSelectionActiveCellId === 'function'
                ? app.getSelectionActiveCellId()
                : '';
            const sourceInput =
              app && typeof app.getCellInput === 'function' && activeCellId
                ? app.getCellInput(activeCellId)
                : app && app.inputById && activeCellId
                  ? app.inputById[activeCellId]
                  : null;
            if (!app || !sourceInput || typeof app.startFillDrag !== 'function') {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            app.startFillDrag(sourceInput, event.nativeEvent || event);
          }}
        />
      ) : null}
      {headerRects
        ? renderRectList(
            headerRects.activeCols,
            'selection-overlay-header-active-col',
            (rect) => ({
              position: 'absolute',
              left: `${Number(rect.left || 0)}px`,
              top: `${Number(rect.top || 0)}px`,
              width: `${Math.max(0, Number(rect.width || 0))}px`,
              height: `${Math.max(0, Number(rect.height || 0))}px`,
              background: 'rgba(50, 113, 233, 0.08)',
              pointerEvents: 'none',
            }),
          )
        : null}
      {headerRects
        ? renderRectList(
            headerRects.activeRows,
            'selection-overlay-header-active-row',
            (rect) => ({
              position: 'absolute',
              left: `${Number(rect.left || 0)}px`,
              top: `${Number(rect.top || 0)}px`,
              width: `${Math.max(0, Number(rect.width || 0))}px`,
              height: `${Math.max(0, Number(rect.height || 0))}px`,
              background: 'rgba(50, 113, 233, 0.08)',
              pointerEvents: 'none',
            }),
          )
        : null}
      {headerRects
        ? renderRectList(
            headerRects.selectedCols,
            'selection-overlay-header-selected-col',
            (rect) => ({
              position: 'absolute',
              left: `${Number(rect.left || 0)}px`,
              top: `${Number(rect.top || 0)}px`,
              width: `${Math.max(0, Number(rect.width || 0))}px`,
              height: `${Math.max(0, Number(rect.height || 0))}px`,
              background: 'rgba(15, 106, 78, 0.08)',
              pointerEvents: 'none',
            }),
          )
        : null}
      {headerRects
        ? renderRectList(
            headerRects.selectedRows,
            'selection-overlay-header-selected-row',
            (rect) => ({
              position: 'absolute',
              left: `${Number(rect.left || 0)}px`,
              top: `${Number(rect.top || 0)}px`,
              width: `${Math.max(0, Number(rect.width || 0))}px`,
              height: `${Math.max(0, Number(rect.height || 0))}px`,
              background: 'rgba(15, 106, 78, 0.08)',
              pointerEvents: 'none',
            }),
          )
        : null}
      {headerRects && headerRects.selectedCorner ? (
        <div
          className="selection-overlay-header-corner"
          style={{
            position: 'absolute',
            left: `${Number(headerRects.selectedCorner.left || 0)}px`,
            top: `${Number(headerRects.selectedCorner.top || 0)}px`,
            width: `${Math.max(0, Number(headerRects.selectedCorner.width || 0))}px`,
            height: `${Math.max(0, Number(headerRects.selectedCorner.height || 0))}px`,
            background: 'rgba(15, 106, 78, 0.08)',
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {headerRects
        ? renderRectList(
            headerRects.dependencyCols,
            'selection-overlay-header-dependency-col',
            (rect) => ({
              position: 'absolute',
              left: `${Number(rect.left || 0)}px`,
              top: `${Number(rect.top || 0)}px`,
              width: `${Math.max(0, Number(rect.width || 0))}px`,
              height: `${Math.max(0, Number(rect.height || 0))}px`,
              background: 'rgba(50, 113, 233, 0.08)',
            }),
          )
        : null}
      {headerRects
        ? renderRectList(
            headerRects.dependencyRows,
            'selection-overlay-header-dependency-row',
            (rect) => ({
              position: 'absolute',
              left: `${Number(rect.left || 0)}px`,
              top: `${Number(rect.top || 0)}px`,
              width: `${Math.max(0, Number(rect.width || 0))}px`,
              height: `${Math.max(0, Number(rect.height || 0))}px`,
              background: 'rgba(50, 113, 233, 0.08)',
            }),
          )
        : null}
    </div>
  );
}

export function WorkbookFullscreenOverlay({ workbookUiState, appRef }) {
  const fullscreenUi =
    workbookUiState && workbookUiState.fullscreenUi
      ? workbookUiState.fullscreenUi
      : null;
  const isActive = fullscreenUi ? fullscreenUi.active === true : false;
  const isEditing = fullscreenUi ? fullscreenUi.isEditing === true : false;
  const editMode = fullscreenUi
    ? String(fullscreenUi.editMode || 'value')
    : 'value';
  const cellId = fullscreenUi ? String(fullscreenUi.cellId || '') : '';
  const draftValue = fullscreenUi ? String(fullscreenUi.draft || '') : '';

  const handleClose = () => {
    if (appRef?.current?.closeFullscreenCell) {
      appRef.current.closeFullscreenCell();
    }
  };

  const handleSetMode = (mode) => {
    if (appRef?.current?.startFullscreenEditing) {
      appRef.current.startFullscreenEditing(mode);
      return;
    }
    if (appRef?.current?.setFullscreenMode) {
      appRef.current.setFullscreenMode(mode);
    }
  };

  const handleEdit = () => {
    if (appRef?.current?.startFullscreenEditing) {
      appRef.current.startFullscreenEditing('value');
      return;
    }
    if (appRef?.current?.setFullscreenMode) {
      appRef.current.setFullscreenMode('value');
    }
  };

  const handleMarkdownCommand = (command) => {
    if (appRef?.current?.applyFullscreenMarkdownCommand) {
      appRef.current.applyFullscreenMarkdownCommand(command);
    }
  };

  const handleSave = () => {
    if (appRef?.current?.saveFullscreenDraft) {
      appRef.current.saveFullscreenDraft();
    }
  };

  const handleDraftChange = (event) => {
    if (appRef?.current?.setFullscreenDraft) {
      appRef.current.setFullscreenDraft(event.target.value);
    }
  };

  return (
    <div
      className={`fullscreen-overlay${isEditing ? ' fullscreen-is-editing' : ''}`}
      hidden={!isActive}
      style={{ display: isActive ? 'flex' : 'none' }}
    >
      <div className="fullscreen-panel">
        <div className="fullscreen-toolbar">
          <div className="fullscreen-toolbar-group">
            <span className="fullscreen-cell-label">{cellId}</span>
            <div className="fullscreen-mode-switch">
              <button
                type="button"
                className={`fullscreen-mode-button${
                  editMode === 'formula' ? ' is-active' : ''
                }`}
                data-mode="formula"
                title="Edit formula"
                onClick={() => handleSetMode('formula')}
              >
                Formula
              </button>
              <button
                type="button"
                className={`fullscreen-mode-button${
                  editMode === 'value' ? ' is-active' : ''
                }`}
                data-mode="value"
                title="Edit value"
                onClick={() => handleSetMode('value')}
              >
                Value
              </button>
            </div>
            <div className="fullscreen-preview-toggle">
              <span className="fullscreen-preview-label">Preview</span>
              <button
                type="button"
                className="fullscreen-edit-toggle"
                title="Edit"
                aria-label="Edit"
                onClick={handleEdit}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </div>
            <button type="button" className="fullscreen-md-button" data-cmd="heading" title="Heading" onClick={() => handleMarkdownCommand('heading')}>H</button>
            <button type="button" className="fullscreen-md-button" data-cmd="bold" title="Bold" onClick={() => handleMarkdownCommand('bold')}>B</button>
            <button type="button" className="fullscreen-md-button" data-cmd="italic" title="Italic" onClick={() => handleMarkdownCommand('italic')}>I</button>
            <button type="button" className="fullscreen-md-button" data-cmd="list" title="Bullet list" onClick={() => handleMarkdownCommand('list')}>List</button>
            <button type="button" className="fullscreen-md-button" data-cmd="link" title="Link" onClick={() => handleMarkdownCommand('link')}>Link</button>
            <button type="button" className="fullscreen-md-button" data-cmd="code" title="Code" onClick={() => handleMarkdownCommand('code')}>Code</button>
          </div>
          <div className="fullscreen-toolbar-group">
            <button type="button" className="fullscreen-save" title="Save" onClick={handleSave}>Save</button>
            <button type="button" className="fullscreen-close" title="Close" onClick={handleClose}>✕</button>
          </div>
        </div>
        <div className="fullscreen-content">
          <div className="fullscreen-pane fullscreen-pane-editor">
            <div className="fullscreen-pane-title">Markdown</div>
            <textarea
              className="fullscreen-editor"
              spellCheck={false}
              value={draftValue}
              onChange={handleDraftChange}
            />
          </div>
          <div className="fullscreen-pane fullscreen-pane-preview">
            <div className="fullscreen-pane-title">Preview</div>
            <div className="fullscreen-preview" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkbookMentionAutocomplete({ workbookUiState, appRef }) {
  const ui =
    workbookUiState && workbookUiState.mentionAutocompleteUi
      ? workbookUiState.mentionAutocompleteUi
      : null;
  const overlayUi =
    workbookUiState && workbookUiState.editorOverlayUi
      ? workbookUiState.editorOverlayUi
      : null;
  if (overlayUi && overlayUi.visible && ui && ui.visible) return null;
  const style = ui
    ? {
        display: ui.visible ? 'block' : 'none',
        left: `${Number(ui.left || 0)}px`,
        top: `${Number(ui.top || 0)}px`,
        minWidth: `${Number(ui.minWidth || 0)}px`,
      }
    : { display: 'none' };
  const items = ui && Array.isArray(ui.items) ? ui.items : [];

  return (
    <div
      className={`mention-autocomplete${
        ui && ui.sourceKind === 'overlay' ? ' is-overlay-editor' : ''
      }`}
      style={style}
    >
      <div className="mention-autocomplete-list">
        {items.map((item, index) => (
          <button
            key={`${item.token || item.label || 'item'}:${index}`}
            type="button"
            className={`mention-autocomplete-item${
              ui && ui.activeIndex === index ? ' active' : ''
            }`}
            data-index={String(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!appRef || !appRef.current) return;
              appRef.current.applyMentionAutocompleteSelection(index);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
