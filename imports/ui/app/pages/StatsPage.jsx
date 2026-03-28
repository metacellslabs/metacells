import { useEffect, useMemo, useState } from 'react';
import { rpc } from '../../../../lib/rpc-client.js';
import { subscribeServerEvents } from '../../../../lib/transport/ws-client.js';
import { Link } from '../router.jsx';

function normalizeJobRecord(job) {
  const source = job && typeof job === 'object' ? job : {};
  return {
    _id: String(source._id || source.jobId || ''),
    type: String(source.type || ''),
    status: String(source.status || source.jobStatus || ''),
    attempts: Number(source.attempts) || 0,
    maxAttempts: Number(source.maxAttempts) || 0,
    dedupeKey: String(source.dedupeKey || ''),
    error: String(source.error || source.lastError || ''),
    ownerType: String(source.ownerType || ''),
    ownerId: String(source.ownerId || ''),
    sheetDocumentId: String(source.sheetDocumentId || ''),
    sheetId: String(source.sheetId || ''),
    cellId: String(source.cellId || ''),
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null,
    startedAt: source.startedAt || null,
    finishedAt: source.finishedAt || source.completedAt || null,
    active: source.active !== false,
  };
}

function upsertJobRecord(current, nextJob) {
  const normalized = normalizeJobRecord(nextJob);
  if (!normalized._id) return current;
  const list = Array.isArray(current) ? current.slice() : [];
  const index = list.findIndex((item) => String((item && item._id) || '') === normalized._id);
  if (index === -1) {
    list.unshift(normalized);
  } else {
    list[index] = {
      ...list[index],
      ...normalized,
    };
  }
  list.sort((a, b) => {
    const aTime = new Date(a && (a.updatedAt || a.createdAt || 0)).getTime() || 0;
    const bTime = new Date(b && (b.updatedAt || b.createdAt || 0)).getTime() || 0;
    return bTime - aTime;
  });
  return list.slice(0, 500);
}

function removeJobRecord(current, jobId) {
  const target = String(jobId || '');
  return (Array.isArray(current) ? current : []).filter(
    (item) => String((item && item._id) || '') !== target,
  );
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function formatStatusLabel(status) {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return 'Unknown';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function StatsPage() {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    document.body.classList.add('route-home');
    document.body.classList.remove('route-sheet');
    return () => {
      document.body.classList.remove('route-home');
    };
  }, []);

  useEffect(() => {
    rpc('jobs.manager.listActive', 200)
      .then((records) => {
        setJobs(
          (Array.isArray(records) ? records : []).map((item) =>
            normalizeJobRecord(item),
          ),
        );
        setLoadError('');
        setIsLoading(false);
      })
      .catch((error) => {
        console.error('Failed to load jobs', error);
        setLoadError(String((error && (error.reason || error.message)) || 'Failed to load jobs'));
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeServerEvents((message) => {
      const event =
        message &&
        message.type === 'server.event' &&
        message.event &&
        typeof message.event === 'object'
          ? message.event
          : null;
      if (!event || String(event.scope || '') !== 'jobs_manager') return;
      const jobId = String(event.jobId || '');
      if (!jobId) return;
      const payload =
        event.payload && typeof event.payload === 'object' ? event.payload : null;
      if (!payload) return;

      if (payload.active === false) {
        setJobs((current) => removeJobRecord(current, jobId));
        return;
      }

      setJobs((current) => upsertJobRecord(current, payload));
    });
    return unsubscribe;
  }, []);

  const jobStats = useMemo(() => {
    return jobs.reduce(
      (acc, job) => {
        const status = String((job && job.status) || '').toLowerCase();
        if (status === 'queued') acc.queued += 1;
        else if (status === 'running' || status === 'leased') acc.running += 1;
        else if (status === 'retrying') acc.retrying += 1;
        return acc;
      },
      {
        queued: 0,
        running: 0,
        retrying: 0,
        failed: 0,
        completed: 0,
        cancelled: 0,
      },
    );
  }, [jobs]);

  return (
    <main className="home-page settings-page">
      <section className="home-hero settings-hero">
        <div className="home-hero-copy">
          <div className="home-brand">
            <img className="home-brand-logo" src="/logo.png" alt="Stats" />
          </div>
          <h1>Stats</h1>
          <p className="home-subtitle">Live jobs overview updated through WebSocket events.</p>
          <div className="home-actions">
            <Link className="home-secondary-link" to="/">
              Home
            </Link>
            <Link className="home-secondary-link" to="/settings?tab=jobs">
              Job settings
            </Link>
          </div>
        </div>
      </section>

      <section className="home-card">
        <div className="home-section-head">
          <h2>Current Jobs</h2>
        </div>

        <div className="settings-jobs-summary">
          <div className="settings-kv-item">
            <span className="settings-label">Queued</span>
            <strong>{jobStats.queued}</strong>
          </div>
          <div className="settings-kv-item">
            <span className="settings-label">Running</span>
            <strong>{jobStats.running}</strong>
          </div>
          <div className="settings-kv-item">
            <span className="settings-label">Retrying</span>
            <strong>{jobStats.retrying}</strong>
          </div>
        </div>

        {isLoading ? (
          <p className="home-empty-note">Loading jobs...</p>
        ) : loadError ? (
          <p className="home-empty-note">
            Failed to load jobs snapshot: {loadError}
          </p>
        ) : !jobs.length ? (
          <p className="home-empty-note">No jobs yet.</p>
        ) : (
          <div className="stats-jobs-table-wrap">
            <table className="stats-jobs-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Job ID</th>
                  <th>Attempts</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Owner</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job._id}>
                    <td>
                      <span
                        className={`settings-status settings-status-${String(
                          job.status || 'pending',
                        ).toLowerCase()}`}
                      >
                        {formatStatusLabel(job.status)}
                      </span>
                    </td>
                    <td>{job.type || '—'}</td>
                    <td className="stats-jobs-mono">{job._id || '—'}</td>
                    <td className="stats-jobs-mono">
                      {job.attempts || 0}
                      {job.maxAttempts ? ` / ${job.maxAttempts}` : ''}
                    </td>
                    <td>{formatDateTime(job.createdAt)}</td>
                    <td>{formatDateTime(job.updatedAt)}</td>
                    <td className="stats-jobs-mono">
                      {job.ownerType && job.ownerId
                        ? `${job.ownerType}:${job.ownerId}`
                        : '—'}
                    </td>
                    <td>{job.error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
