import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { fetchFeedItems, fetchFeedPlaces, type FeedEntry, type FeedLens, type FeedPlace } from '../api/feed';
import { useAuth } from '../auth/AuthContext';
import { AuthImage } from '../components/AuthImage';
import { ItemCardSkeleton } from '../components/ItemCard';
import { formatCents } from '../lib/format';

const PAGE_SIZE = 24;

interface Chip {
  id: string;
  label: string;
  count?: number;
}

/** Browser geolocation, asked once on mount; null while unknown or denied. */
function useBrowserLocation(): { lat: number; lng: number } | null {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        // Denied or unavailable: browse ungeofenced instead of failing.
      },
      { maximumAge: 300_000, timeout: 10_000 },
    );
  }, []);
  return coords;
}

/**
 * The crowd feed: what other pickers have published, under the same two
 * lenses the app offers — "Up for grabs" (live leads) and "Scored" (the
 * brag wall) — narrowed by one compact bar of Shop / Category / Maker
 * dropdowns (native selects: one row on a phone, and the platform picker
 * beats any chip wall). Category/maker options are collected from the
 * loaded rows themselves; shops come from /v1/feed/places near the
 * browser's location when it grants one. The route sits behind
 * ProtectedRoute requireTier="plus".
 */
export function Browse() {
  const { token } = useAuth();
  const coords = useBrowserLocation();

  const [lens, setLens] = useState<FeedLens>('up_for_grabs');
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [makerId, setMakerId] = useState<string | null>(null);

  const [items, setItems] = useState<FeedEntry[]>([]);
  const [places, setPlaces] = useState<FeedPlace[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryChips = useMemo(() => collectChips(items, (e) => [e.categoryId, e.categoryName]), [items]);
  const makerChips = useMemo(() => collectChips(items, (e) => [e.makerId, e.makerName]), [items]);
  const placeChips = useMemo<Chip[]>(
    () =>
      places.map((p) => ({
        id: p.id,
        label: p.name,
        count: p.leftBehindCount + p.showingOffCount,
      })),
    [places],
  );

  const query = useCallback(
    (cursor: string | null) => ({
      lens,
      placeId,
      categoryId,
      makerId,
      lat: coords?.lat,
      lng: coords?.lng,
      limit: PAGE_SIZE,
      cursor,
    }),
    [lens, placeId, categoryId, makerId, coords],
  );

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchFeedItems(token, query(null))
      .then((res) => {
        setItems(res.items);
        setNextCursor(res.nextCursor);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load the feed.');
      })
      .finally(() => setLoading(false));
  }, [token, query]);

  useEffect(() => {
    if (!token) return;
    fetchFeedPlaces(token, coords ? { lat: coords.lat, lng: coords.lng } : {})
      .then(setPlaces)
      .catch(() => {
        // The shop strip is garnish; the feed itself already reports errors.
      });
  }, [token, coords]);

  async function handleLoadMore() {
    if (!token || !nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetchFeedItems(token, query(nextCursor));
      setItems((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load more.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <div className="items-toolbar">
        <div className="items-toolbar-heading">
          <h1>Finds</h1>
          {coords && <span className="items-count">near you</span>}
        </div>
        <div className="filter-group" role="tablist" aria-label="Lens">
          {(
            [
              { value: 'up_for_grabs', label: 'Up for grabs' },
              { value: 'scored', label: 'Scored' },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={lens === value}
              className={`filter-btn ${lens === value ? 'active' : ''}`}
              onClick={() => setLens(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-bar">
        <FilterSelect label="Shop" allLabel="All shops" chips={placeChips} selectedId={placeId} onSelect={setPlaceId} />
        <FilterSelect label="Category" allLabel="All categories" chips={categoryChips} selectedId={categoryId} onSelect={setCategoryId} />
        <FilterSelect label="Maker" allLabel="All makers" chips={makerChips} selectedId={makerId} onSelect={setMakerId} />
        {(placeId ?? categoryId ?? makerId) !== null && (
          <button
            type="button"
            className="btn-link filter-clear"
            onClick={() => {
              setPlaceId(null);
              setCategoryId(null);
              setMakerId(null);
            }}
          >
            Clear
          </button>
        )}
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
            🧭
          </span>
          <p className="empty-title">
            {lens === 'up_for_grabs' ? 'Nothing up for grabs around here yet' : 'No scored finds around here yet'}
          </p>
          <p className="empty-hint">The feed grows as pickers publish their finds from the app.</p>
        </div>
      ) : (
        <>
          <div className="items-grid">
            {items.map((item) => (
              <FindCard key={item.id} item={item} />
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

/** One published find in the grid — the crowd's ItemCard, photo-forward. */
function FindCard({ item }: { item: FeedEntry }) {
  return (
    <Link to={`/browse/${item.id}`} className="item-card">
      <div className="item-card-thumb">
        {item.firstPhotoId ? (
          <AuthImage
            photoId={item.firstPhotoId}
            basePath="/v1/feed/photos"
            variant="auto"
            alt=""
            className="item-card-thumb-img"
            fallback={
              <span className="placeholder" aria-hidden="true">
                🕰️
              </span>
            }
          />
        ) : (
          <span className="placeholder" aria-hidden="true">
            🕰️
          </span>
        )}
        {item.status === 'unavailable' && <span className="item-card-scrim">Gone</span>}
        {item.isMine && (
          <span className="item-card-count" aria-label="Published from your catalog">
            yours
          </span>
        )}
      </div>
      <div className="item-card-body">
        <div className="item-card-maker">{item.makerName ?? item.categoryName ?? 'Unmarked'}</div>
        <div className="item-card-store">{[item.storeName, item.storeCity].filter(Boolean).join(', ')}</div>
        <div className="item-card-footer">
          <span className="item-card-price">{formatCents(item.priceCents)}</span>
        </div>
      </div>
    </Link>
  );
}

/** One dropdown in the filter bar. Native select on purpose: it costs a
    single row on any screen, the platform supplies the picker UI, and the
    active value is always visible — everything the chip walls weren't.
    Hidden when there is nothing to narrow. */
function FilterSelect({
  label,
  allLabel,
  chips,
  selectedId,
  onSelect,
}: {
  label: string;
  allLabel: string;
  chips: Chip[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (chips.length < 2 && selectedId === null) return null;
  return (
    <select
      className={`filter-select ${selectedId !== null ? 'filter-select--active' : ''}`}
      aria-label={label}
      value={selectedId ?? ''}
      onChange={(e) => onSelect(e.target.value === '' ? null : e.target.value)}
    >
      <option value="">{allLabel}</option>
      {chips.map((chip) => (
        <option key={chip.id} value={chip.id}>
          {chip.label}
          {chip.count !== undefined ? ` (${chip.count})` : ''}
        </option>
      ))}
    </select>
  );
}

function collectChips(entries: FeedEntry[], pick: (e: FeedEntry) => [string | null, string | null]): Chip[] {
  const chips: Chip[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const [id, label] = pick(entry);
    if (id === null || label === null || seen.has(id)) continue;
    seen.add(id);
    chips.push({ id, label });
  }
  return chips.sort((a, b) => a.label.localeCompare(b.label));
}
