import { useCallback, useEffect, useState } from 'react';
import { fetchItems } from '../api/items';
import { ApiError } from '../api/client';
import type { Entry, ItemStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ItemCard, ItemCardSkeleton } from '../components/ItemCard';

type StatusFilter = 'all' | ItemStatus;

const PAGE_SIZE = 24;

export function ItemsList() {
  const { token } = useAuth();
  const [items, setItems] = useState<Entry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(
    (status: StatusFilter) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      fetchItems(token, { limit: PAGE_SIZE, status: status === 'all' ? null : status })
        .then((res) => {
          setItems(res.items);
          setNextCursor(res.nextCursor);
        })
        .catch((err) => {
          setError(err instanceof ApiError ? err.message : 'Failed to load items.');
        })
        .finally(() => setLoading(false));
    },
    [token],
  );

  useEffect(() => {
    loadFirstPage(filter);
  }, [filter, loadFirstPage]);

  async function handleLoadMore() {
    if (!token || !nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await fetchItems(token, {
        limit: PAGE_SIZE,
        cursor: nextCursor,
        status: filter === 'all' ? null : filter,
      });
      setItems((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load more items.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <div className="items-toolbar">
        <div className="items-toolbar-heading">
          <h1>My items</h1>
          {!loading && (
            <span className="items-count">
              {items.length}
              {nextCursor ? '+' : ''} {items.length === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>
        <div className="filter-group" role="tablist" aria-label="Filter by status">
          {(['all', 'available', 'unavailable'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              className={`filter-btn ${filter === value ? 'active' : ''}`}
              onClick={() => setFilter(value)}
            >
              {value === 'all' ? 'All' : value === 'available' ? 'Available' : 'Gone'}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="error-banner">{error}</p>}

      {loading ? (
        <div className="items-grid" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <ItemCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-glyph" aria-hidden="true">
            🏺
          </span>
          <p className="empty-title">
            {filter === 'unavailable' ? 'Nothing marked gone yet' : filter === 'available' ? 'Nothing available' : 'No items yet'}
          </p>
          <p className="empty-hint">Finds you back up from the app will show here.</p>
        </div>
      ) : (
        <>
          <div className="items-grid">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
          {nextCursor && (
            <div className="load-more">
              <button type="button" className="btn btn-secondary" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
