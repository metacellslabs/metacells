import { useEffect, useState } from 'react';
import { rpc } from '../../../../lib/rpc-client.js';
import { Link, useNavigate } from '../router.jsx';

function formatPublishedDate(value) {
  if (!value) return 'Unscheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unscheduled';
  return date.toLocaleDateString();
}

export function MarketplacePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [importingSlug, setImportingSlug] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');

  useEffect(() => {
    document.body.classList.add('route-home');
    document.body.classList.remove('route-sheet');
    return () => {
      document.body.classList.remove('route-home');
    };
  }, []);

  useEffect(() => {
    setIsLoading(true);
    rpc('hub.listMarketplaceWorkbooks', searchQuery)
      .then((result) => {
        setItems(Array.isArray(result) ? result : []);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error('Failed to load marketplace', error);
        setIsLoading(false);
        window.alert(
          error.reason || error.message || 'Failed to load marketplace',
        );
      });
  }, [searchQuery]);

  const tagCounts = new Map();
  for (const item of items) {
    const tags = Array.isArray(item && item.tags) ? item.tags : [];
    for (const tag of tags) {
      const normalizedTag = String(tag || '').trim();
      if (!normalizedTag) continue;
      tagCounts.set(normalizedTag, (tagCounts.get(normalizedTag) || 0) + 1);
    }
  }
  const availableTags = Array.from(tagCounts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })
    .map(([tag, count]) => ({ tag, count }));
  const visibleItems = selectedTag
    ? items.filter((item) =>
        Array.isArray(item && item.tags) &&
        item.tags.some((tag) => String(tag || '').trim() === selectedTag),
      )
    : items;

  const handleImport = (item) => {
    const slug = String((item && item.slug) || '');
    if (!slug || importingSlug) return;
    setImportingSlug(slug);
    rpc('hub.importMarketplaceWorkbook', {
      id: String((item && item.id) || ''),
      slug: slug,
      title: String((item && item.title) || ''),
    })
      .then((result) => {
        setImportingSlug('');
        navigate(`/metacell/${encodeURIComponent(result.sheetId)}`);
      })
      .catch((error) => {
        setImportingSlug('');
        window.alert(
          error.reason || error.message || 'Failed to import workbook',
        );
      });
  };

  return (
    <main className="home-page marketplace-page">
      <section className="home-card">
        <div className="home-section-head">
          <h2>Marketplace</h2>
          <div className="home-actions">
            <Link className="home-secondary-link" to="/">
              ← Back
            </Link>
            <span className="home-meta">
              {isLoading
                ? 'Loading marketplace...'
                : `${items.length} workbook${items.length === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>
        <div className="marketplace-search-row">
          <input
            className="settings-input marketplace-search-input"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Semantic search: quarterly finance dashboard, sales pipeline tracker, hiring workflow..."
          />
        </div>
        {availableTags.length ? (
          <div className="marketplace-tag-cloud">
            {availableTags.map((entry) => (
              <button
                key={entry.tag}
                type="button"
                className={`marketplace-tag-cloud-item${selectedTag === entry.tag ? ' is-active' : ''}`}
                onClick={() =>
                  setSelectedTag((current) =>
                    current === entry.tag ? '' : entry.tag,
                  )
                }
              >
                <span>{entry.tag}</span>
                <strong>{entry.count}</strong>
              </button>
            ))}
          </div>
        ) : null}

        {!isLoading && !visibleItems.length ? (
          <div className="home-empty-card">
            <p className="home-empty">No workbooks found.</p>
            <p className="home-empty-note">
              Try a different semantic query or clear the selected tag filter.
            </p>
          </div>
        ) : null}

        {!isLoading && visibleItems.length ? (
          <div className="marketplace-grid">
            {visibleItems.map((item) => (
              <article key={item.slug} className="marketplace-card">
                {item.previewImageUrl ? (
                  <img
                    className="marketplace-card-image"
                    src={item.previewImageUrl}
                    alt={item.title}
                  />
                ) : (
                  <div className="marketplace-card-image marketplace-card-image-placeholder">
                    Workbook
                  </div>
                )}
                <div className="marketplace-card-copy">
                  <div className="marketplace-card-meta">
                    <span>{formatPublishedDate(item.publishedAt)}</span>
                    <span>{item.authorName || 'Unknown author'}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.shortDescription || item.fullDescription}</p>
                  {Array.isArray(item.tags) && item.tags.length ? (
                    <div className="marketplace-tags">
                      {item.tags.map((tag) => (
                        <span key={`${item.slug}-${tag}`} className="marketplace-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="marketplace-card-stats">
                    <span>{Number(item.downloadsCount || 0)} downloads</span>
                    <span>{Number(item.starsCount || 0)} stars</span>
                  </div>
                </div>
                <div className="marketplace-card-actions">
                  <button
                    type="button"
                    className="home-create-button"
                    onClick={() => handleImport(item)}
                    disabled={importingSlug === item.slug}
                  >
                    {importingSlug === item.slug ? 'Importing...' : 'Import to app'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
