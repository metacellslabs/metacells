import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc } from '../../../../lib/rpc-client.js';
import { subscribeServerEvents } from '../../../../lib/transport/ws-client.js';
import { Link, useNavigate } from '../router.jsx';

function MarketplaceButtonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7.5 12 3l9 4.5-9 4.5z" />
      <path d="M3 12l9 4.5 9-4.5" />
      <path d="M3 16.5 12 21l9-4.5" />
    </svg>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  useEffect(() => {
    document.body.classList.add('route-home');
    document.body.classList.remove('route-sheet');

    return () => {
      document.body.classList.remove('route-home');
    };
  }, []);

  const [isLoading, setIsLoading] = useState(true);
  const [sheets, setSheets] = useState([]);
  const removedSheetIdsRef = useRef(new Set());
  const loadSheets = useCallback(() => {
    rpc('sheets.list')
      .then((data) => {
        const removedSheetIds = removedSheetIdsRef.current;
        const nextSheets = Array.isArray(data) ? data : [];
        setSheets(
          nextSheets.filter(
            (sheet) =>
              !removedSheetIds.has(String((sheet && sheet._id) || '')),
          ),
        );
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load sheets', err);
        setIsLoading(false);
      });
  }, []);
  useEffect(() => {
    loadSheets();
  }, [loadSheets]);

  useEffect(() => {
    const unsubscribe = subscribeServerEvents((message) => {
      const event =
        message &&
        message.type === 'server.event' &&
        message.event &&
        typeof message.event === 'object'
          ? message.event
          : null;
      if (!event || String(event.scope || '') !== 'sheets') return;

      const type = String(event.type || '');
      const payload =
        event.payload && typeof event.payload === 'object' ? event.payload : {};
      const sheetId = String(event.sheetId || payload.sheetId || '');
      if (!sheetId) return;

      if (type === 'sheets.removed') {
        removedSheetIdsRef.current.add(sheetId);
        setSheets((current) =>
          (Array.isArray(current) ? current : []).filter(
            (sheet) => String((sheet && sheet._id) || '') !== sheetId,
          ),
        );
        return;
      }

      if (type === 'sheets.renamed') {
        setSheets((current) =>
          (Array.isArray(current) ? current : []).map((sheet) =>
            String((sheet && sheet._id) || '') !== sheetId
              ? sheet
              : {
                  ...sheet,
                  name: String(payload.name || (sheet && sheet.name) || ''),
                  updatedAt: payload.updatedAt || (sheet && sheet.updatedAt) || null,
                },
          ),
        );
        return;
      }

      if (type === 'sheets.created') {
        removedSheetIdsRef.current.delete(sheetId);
        setSheets((current) => {
          const source = Array.isArray(current) ? current : [];
          if (
            source.some((sheet) => String((sheet && sheet._id) || '') === sheetId)
          ) {
            return source;
          }
          return [
            {
              _id: sheetId,
              name: String(payload.name || 'Untitled'),
              createdAt: payload.createdAt || null,
              updatedAt: payload.updatedAt || payload.createdAt || null,
            },
            ...source,
          ];
        });
      }
    });
    return unsubscribe;
  }, []);

  const [isCreating, setIsCreating] = useState(false);
  const [deletingSheetId, setDeletingSheetId] = useState('');
  const [deleteSheetDialog, setDeleteSheetDialog] = useState(null);

  const handleCreateSheet = () => {
    if (isCreating) return;
    setIsCreating(true);

    rpc('sheets.create')
      .then((sheetId) => {
        setIsCreating(false);
        navigate(`/metacell/${sheetId}`);
      })
      .catch((error) => {
        setIsCreating(false);
        window.alert(
          error.reason || error.message || 'Failed to create metacell',
        );
      });
  };

  const handleDeleteSheet = (sheetId, sheetName) => {
    if (deletingSheetId) return;
    setDeleteSheetDialog({
      sheetId: String(sheetId || ''),
      sheetName: String(sheetName || ''),
    });
  };

  const confirmDeleteSheet = () => {
    if (!deleteSheetDialog || deletingSheetId) return;
    const sheetId = deleteSheetDialog.sheetId;
    setDeletingSheetId(sheetId);
    setDeleteSheetDialog(null);
    removedSheetIdsRef.current.add(sheetId);
    setSheets((current) =>
      (Array.isArray(current) ? current : []).filter(
        (sheet) => String((sheet && sheet._id) || '') !== sheetId,
      ),
    );
    rpc('sheets.remove', sheetId)
      .then(() => setDeletingSheetId(''))
      .catch((error) => {
        removedSheetIdsRef.current.delete(sheetId);
        loadSheets();
        setDeletingSheetId('');
        window.alert(
          error.reason || error.message || 'Failed to delete metacell',
        );
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
            Create smart spreadsheets where cells can think, calculate, and help
            complete tasks automatically. Built-in AI agents can analyze data,
            generate content, and perform tasks right inside your sheet.
          </p>
          <div className="home-actions">
            <button
              type="button"
              className="home-create-button"
              onClick={handleCreateSheet}
              disabled={isCreating}
            >
              {isCreating ? 'Creating...' : 'Add metacell'}
            </button>
            <Link
              className="home-secondary-button"
              to="/marketplace"
              title="Browse workbooks from the hub marketplace"
            >
              <MarketplaceButtonIcon />
              Marketplace
            </Link>
            <Link className="home-secondary-link" to="/settings">
              Settings
            </Link>
            <span className="home-meta">
              {isLoading
                ? 'Loading metacells...'
                : `${sheets.length} metacell${sheets.length === 1 ? '' : 's'}`}
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
            <p className="home-empty-note">
              Start with a blank metacell and the app will create a persistent
              document for it.
            </p>
          </div>
        ) : null}

        {!isLoading && sheets.length ? (
          <div className="sheet-list">
            {sheets.map((sheet) => (
              <div key={sheet._id} className="sheet-list-item">
                <Link className="sheet-list-link" to={`/metacell/${sheet._id}`}>
                  <div className="sheet-list-copy">
                    <span className="sheet-list-name">{sheet.name}</span>
                  </div>
                </Link>
                <button
                  type="button"
                  className="sheet-list-delete"
                  onClick={() => handleDeleteSheet(sheet._id, sheet.name)}
                  disabled={deletingSheetId === sheet._id}
                  aria-label={`Delete ${sheet.name}`}
                >
                  {deletingSheetId === sheet._id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      {deleteSheetDialog ? (
        <div
          className="app-dialog-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDeleteSheetDialog(null);
          }}
        >
          <div
            className="app-dialog-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-sheet-dialog-title"
          >
            <div className="app-dialog-header">
              <h2 id="delete-sheet-dialog-title" className="app-dialog-title">
                Delete metacell?
              </h2>
              <p className="app-dialog-description">
                This will permanently remove "
                {deleteSheetDialog.sheetName}
                ".
              </p>
            </div>
            <div className="app-dialog-actions">
              <button
                type="button"
                className="app-dialog-button"
                onClick={() => setDeleteSheetDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="app-dialog-button app-dialog-button-primary is-danger"
                onClick={confirmDeleteSheet}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
