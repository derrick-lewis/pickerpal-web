import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  adminPatchShopProfile,
  createPlace,
  fetchShopClaims,
  fetchShopHistory,
  grantShopOwner,
  resolveShopClaim,
  revokeShopOwner,
  searchShops,
  type ShopClaim,
  type ShopClaimAction,
  type ShopDayHours,
  type ShopHistoryEvent,
  type ShopHoursDay,
  type ShopHoursJson,
  type ShopOwner,
  type ShopSearchResult,
} from '../api/admin';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { formatDateTime } from '../lib/format';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function placeLine(shop: ShopSearchResult): string {
  return [shop.city, shop.state].filter(Boolean).join(', ');
}

/**
 * Shop ownership admin (pickerpal-api place_owners, migration 000030): find
 * a shop, see who may edit its profile in the app, grant or revoke owners by
 * email, and create a manual place for a shop nobody has synced yet. Same
 * shell idiom as the other tabs (per-row busy/error state), but driven by an
 * explicit search rather than a load-on-mount queue.
 */
export function AdminShopsTab({ onCountChange }: { onCountChange?: (n: number) => void } = {}) {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ShopSearchResult[] | null>(null);
  const [searchedFor, setSearchedFor] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Per-shop state, keyed by placeId.
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  function updateShop(placeId: string, fn: (shop: ShopSearchResult) => ShopSearchResult) {
    setResults((prev) => prev && prev.map((s) => (s.placeId === placeId ? fn(s) : s)));
  }

  function setRowError(placeId: string, message: string | null) {
    setRowErrors((prev) => {
      const next = { ...prev };
      if (message) next[placeId] = message;
      else delete next[placeId];
      return next;
    });
  }

  async function handleSearch(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!token || !q) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await searchShops(q, token);
      setResults(res);
      setSearchedFor(q);
      setRowErrors({});
    } catch (err) {
      setSearchError(errorMessage(err, 'Search failed.'));
    } finally {
      setSearching(false);
    }
  }

  async function handleGrant(shop: ShopSearchResult) {
    const email = (emailDrafts[shop.placeId] ?? '').trim();
    if (!token || !email) return;
    setBusy((prev) => ({ ...prev, [shop.placeId]: true }));
    setRowError(shop.placeId, null);
    try {
      const owner = await grantShopOwner(shop.placeId, email, token);
      updateShop(shop.placeId, (s) => ({
        ...s,
        // A re-grant of an existing owner replaces their row rather than duplicating it.
        owners: [...s.owners.filter((o) => o.userId !== owner.userId), owner],
      }));
      setEmailDrafts((prev) => ({ ...prev, [shop.placeId]: '' }));
    } catch (err) {
      setRowError(
        shop.placeId,
        err instanceof ApiError && err.code === 'user_not_found'
          ? `No PickerPal user has the email ${email}.`
          : errorMessage(err, 'Failed to grant ownership.'),
      );
    } finally {
      setBusy((prev) => ({ ...prev, [shop.placeId]: false }));
    }
  }

  async function handleRevoke(shop: ShopSearchResult, owner: ShopOwner) {
    if (!token) return;
    if (!window.confirm(`Remove ${owner.email} as an owner of ${shop.name}?`)) return;
    setBusy((prev) => ({ ...prev, [shop.placeId]: true }));
    setRowError(shop.placeId, null);
    try {
      await revokeShopOwner(shop.placeId, owner.userId, token);
      updateShop(shop.placeId, (s) => ({ ...s, owners: s.owners.filter((o) => o.userId !== owner.userId) }));
    } catch (err) {
      setRowError(shop.placeId, errorMessage(err, 'Failed to revoke ownership.'));
    } finally {
      setBusy((prev) => ({ ...prev, [shop.placeId]: false }));
    }
  }

  return (
    <div>
      <div className="mod-header">
        <h1>Shops</h1>
      </div>

      <ClaimsQueue onCountChange={onCountChange} />

      <p className="mod-blurb">
        Give a PickerPal user the right to edit a shop&rsquo;s photo, description, hours, sale and news in the
        app. Search by shop name or city, then add the owner by the email on their PickerPal account.
      </p>

      <form className="shop-search" onSubmit={handleSearch}>
        <input
          type="search"
          className="shop-input"
          placeholder="Shop name or city"
          aria-label="Search shops"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={searching || !query.trim()}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {searchError && <p className="error-banner">{searchError}</p>}

      {results !== null &&
        (results.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">No shops match &ldquo;{searchedFor}&rdquo;.</p>
            <p className="mod-blurb">If nobody has synced it yet, create it below.</p>
          </div>
        ) : (
          <div className="mod-list">
            {results.map((shop) => (
              <ShopRow
                key={shop.placeId}
                shop={shop}
                busy={!!busy[shop.placeId]}
                error={rowErrors[shop.placeId]}
                email={emailDrafts[shop.placeId] ?? ''}
                onEmailChange={(v) => setEmailDrafts((prev) => ({ ...prev, [shop.placeId]: v }))}
                onGrant={() => handleGrant(shop)}
                onRevoke={(owner) => handleRevoke(shop, owner)}
              />
            ))}
          </div>
        ))}

      <CreateShopForm />
    </div>
  );
}

/**
 * Pending shop claims (place_claims): users asking to own a shop. Fetched on
 * mount and again after every resolve; renders nothing while empty. Reports
 * its length up through onCountChange once the first load has landed (so a
 * remount never flashes the tab count back to zero).
 */
function ClaimsQueue({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const { token } = useAuth();
  const [claims, setClaims] = useState<ShopClaim[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (claims) onCountChange?.(claims.length);
  }, [claims, onCountChange]);

  async function load() {
    if (!token) return;
    try {
      setClaims(await fetchShopClaims(token));
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, 'Failed to load pending claims.'));
    }
  }

  useEffect(() => {
    void load();
    // Mount only; resolves refetch explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setClaimError(id: string, message: string | null) {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }

  async function handleResolve(claim: ShopClaim, action: ShopClaimAction) {
    if (!token) return;
    if (
      action === 'accept' &&
      !window.confirm(`Make ${claim.user.email} the owner of ${claim.placeName}?`)
    ) {
      return;
    }
    setBusy((prev) => ({ ...prev, [claim.id]: true }));
    setClaimError(claim.id, null);
    try {
      await resolveShopClaim(claim.id, action, token);
      setClaims((prev) => prev && prev.filter((c) => c.id !== claim.id));
      await load();
    } catch (err) {
      setClaimError(claim.id, errorMessage(err, `Failed to ${action} the claim.`));
      // The queue is stale if the claim was settled elsewhere or the shop got an owner.
      if (err instanceof ApiError && (err.code === 'claim_resolved' || err.code === 'shop_has_owner')) {
        await load();
      }
    } finally {
      setBusy((prev) => ({ ...prev, [claim.id]: false }));
    }
  }

  if (loadError) return <p className="error-banner">{loadError}</p>;
  if (!claims || claims.length === 0) return null;

  return (
    <section className="shop-claims">
      <h2 className="mod-subheading">Pending claims ({claims.length})</h2>
      <div className="mod-list">
        {claims.map((claim) => {
          const place = [claim.placeCity, claim.placeState].filter(Boolean).join(', ');
          const isBusy = !!busy[claim.id];
          return (
            <div key={claim.id} className="mod-entry">
              <div className="mod-entry-body">
                <div className="mod-entry-top">
                  <strong>{claim.placeName}</strong>
                  {place && <span className="mod-entry-date">{place}</span>}
                  <span className="mod-entry-date">{formatDateTime(claim.createdAt)}</span>
                </div>
                <p className="mod-entry-reporter">
                  {claim.user.email}
                  {claim.user.displayName ? ` (${claim.user.displayName})` : ''}
                </p>
                <p className="mod-entry-reason shop-claim-message">{`\u201c${claim.message}\u201d`}</p>
                {errors[claim.id] && <p className="mod-entry-error">{errors[claim.id]}</p>}
                <div className="mod-entry-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={isBusy}
                    onClick={() => handleResolve(claim, 'accept')}
                  >
                    {isBusy ? 'Working…' : 'Accept'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={isBusy}
                    onClick={() => handleResolve(claim, 'reject')}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ShopRow({
  shop,
  busy,
  error,
  email,
  onEmailChange,
  onGrant,
  onRevoke,
}: {
  shop: ShopSearchResult;
  busy: boolean;
  error?: string;
  email: string;
  onEmailChange: (value: string) => void;
  onGrant: () => void;
  onRevoke: (owner: ShopOwner) => void;
}) {
  const place = placeLine(shop);
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <div className="mod-entry">
      <div className="mod-entry-body">
        <div className="mod-entry-top">
          <strong>{shop.name}</strong>
          <span className="status-chip status-chip--pending">{shop.provider}</span>
          {place && <span className="mod-entry-date">{place}</span>}
        </div>

        {shop.owners.length === 0 ? (
          <p className="mod-entry-reporter">No owners yet.</p>
        ) : (
          <ul className="shop-owners">
            {shop.owners.map((owner) => (
              <li key={owner.userId} className="shop-owner">
                <span className="shop-owner-who">
                  {owner.email}
                  {owner.displayName ? ` (${owner.displayName})` : ''}
                  <span className="mod-entry-date"> · since {formatDateTime(owner.grantedAt)}</span>
                </span>
                <button type="button" className="btn btn-link-danger" disabled={busy} onClick={() => onRevoke(owner)}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="shop-search"
          onSubmit={(e) => {
            e.preventDefault();
            onGrant();
          }}
        >
          <input
            type="email"
            className="shop-input"
            placeholder="Add owner by email"
            aria-label={`Add owner to ${shop.name} by email`}
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            disabled={busy}
          />
          <button type="submit" className="btn btn-secondary" disabled={busy || !email.trim()}>
            {busy ? 'Working…' : 'Grant'}
          </button>
        </form>
        {error && <p className="mod-entry-error">{error}</p>}

        <div className="mod-entry-actions">
          <button
            type="button"
            className="btn btn-link"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((v) => !v)}
          >
            {historyOpen ? 'Hide history' : 'History'}
          </button>
        </div>
        <ShopHistory shop={shop} open={historyOpen} />
      </div>
    </div>
  );
}

const HISTORY_PAGE_SIZE = 50;

const HOURS_DAYS: [ShopHoursDay, string][] = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
];

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function formatEventTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "13:05" -> "1:05 PM". Falls back to the raw string if it isn't HH:MM. */
function format12h(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Hours JSON -> "Mon 9:00 AM–5:00 PM · Tue Closed · …", or "Not set" for null. */
function formatHours(hours: unknown): string {
  if (hours === null || hours === undefined) return 'Not set';
  if (typeof hours !== 'object') return String(hours);
  const obj = hours as ShopHoursJson;
  return HOURS_DAYS.map(([key, label]) => {
    const day: ShopDayHours | null | undefined = obj[key];
    return `${label} ${day ? `${format12h(day.open)}\u2013${format12h(day.close)}` : 'Closed'}`;
  }).join(' \u00b7 ');
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function quoted(text: string): string {
  return `\u201c${truncate(text, 80)}\u201d`;
}

/** The plain-English summary line for an event. Full text, when truncated, goes in the title attr. */
function summarize(event: ShopHistoryEvent, owners: ShopOwner[]): { text: string; title?: string } {
  const d = event.detail ?? {};
  const withBody = (prefix: string) => {
    const body = str(d.body);
    return { text: `${prefix}${quoted(body)}`, title: body.length > 80 ? body : undefined };
  };
  const ownerLabel = () => {
    const userId = str(d.userId);
    const match = owners.find((o) => o.userId === userId);
    return match ? match.email : userId.slice(0, 8) || 'unknown user';
  };
  switch (event.action) {
    case 'description_set':
      return { text: 'Description changed' };
    case 'hours_set':
      return { text: d.new === null || d.new === undefined ? 'Hours cleared' : 'Hours changed' };
    case 'sale_set': {
      const sale = asRecord(d.new);
      const ends = typeof sale?.endsAt === 'number' ? ` through ${formatDateTime(sale.endsAt)}` : '';
      return { text: `Sale set: ${quoted(str(sale?.label))}${ends}` };
    }
    case 'sale_cleared':
      return { text: `Sale removed: ${quoted(str(asRecord(d.old)?.label))}` };
    case 'note_posted':
      return withBody('Posted: ');
    case 'note_deleted':
      return withBody('Deleted a note: ');
    case 'note_pruned':
      return withBody('Oldest note dropped: ');
    case 'photo_set': {
      const sha = str(asRecord(d.new)?.contentSha256).slice(0, 12);
      return { text: `Photo changed${sha ? ` (now ${sha})` : ''}` };
    }
    case 'photo_cleared':
      return { text: 'Photo removed' };
    case 'owner_granted':
      return { text: `Granted ownership to ${ownerLabel()}` };
    case 'owner_revoked':
      return { text: `Revoked ownership from ${ownerLabel()}` };
    default:
      return { text: event.action };
  }
}

/**
 * Per-shop change log (place_profile_events). Stays mounted while collapsed so
 * a loaded list survives collapse/expand; it fetches the first page only the
 * first time it is opened, and again after a revert.
 */
function ShopHistory({ shop, open }: { shop: ShopSearchResult; open: boolean }) {
  const { token } = useAuth();
  const [events, setEvents] = useState<ShopHistoryEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reverting, setReverting] = useState<number | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [reverted, setReverted] = useState(false);
  const started = useRef(false);

  async function loadFirstPage() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchShopHistory(shop.placeId, { limit: HISTORY_PAGE_SIZE }, token);
      setEvents(res.events);
      setHasMore(res.hasMore);
      setLoaded(true);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load history.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !started.current) {
      started.current = true;
      void loadFirstPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function loadMore() {
    const last = events[events.length - 1];
    if (!token || !last) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await fetchShopHistory(shop.placeId, { limit: HISTORY_PAGE_SIZE, before: last.id }, token);
      setEvents((prev) => [...prev, ...res.events]);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load more history.'));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleRevert(event: ShopHistoryEvent) {
    if (!token) return;
    const isHours = event.action === 'hours_set';
    const what = isHours ? 'hours' : 'description';
    if (!window.confirm(`Revert ${shop.name}'s ${what} to the previous value?`)) return;
    setReverting(event.id);
    setRevertError(null);
    setReverted(false);
    try {
      const old = event.detail?.old;
      await adminPatchShopProfile(
        shop.placeId,
        isHours ? { hours: (old ?? null) as ShopHoursJson | null } : { description: str(old) },
        token,
      );
      await loadFirstPage();
      setReverted(true);
    } catch (err) {
      setRevertError(errorMessage(err, 'Failed to revert.'));
    } finally {
      setReverting(null);
    }
  }

  if (!open) return null;

  const busy = reverting !== null || loading || loadingMore;

  return (
    <div className="shop-history">
      {loading && events.length === 0 && <p className="mod-entry-reporter">Loading history…</p>}
      {error && <p className="mod-entry-error">{error}</p>}
      {reverted && <p className="shop-history-reverted">Reverted.</p>}
      {revertError && <p className="mod-entry-error">{revertError}</p>}
      {loaded && events.length === 0 && <p className="mod-entry-reporter">No changes recorded yet.</p>}

      {events.length > 0 && (
        <ul className="shop-history-list">
          {events.map((event) => {
            const summary = summarize(event, shop.owners);
            const revertable = event.action === 'description_set' || event.action === 'hours_set';
            const isHours = event.action === 'hours_set';
            const old = event.detail?.old;
            const next = event.detail?.new;
            return (
              <li key={event.id} className="shop-history-event">
                <div className="shop-history-meta">
                  <span className="mod-entry-date">{formatEventTime(event.createdAt)}</span>
                  <span className="mod-entry-date">
                    {event.actor ? event.actor.email : 'deleted user'}
                  </span>
                  {event.detail?.admin === true && <span className="status-chip status-chip--pending">admin</span>}
                </div>
                <div className="shop-history-summary" title={summary.title}>
                  {summary.text}
                </div>

                {event.action === 'description_set' && (
                  <div className="shop-history-diff">
                    <div className="shop-history-block shop-history-block--before">
                      <span className="mod-entry-kind">Before</span>
                      <span>{str(old) ? truncate(str(old), 200) : 'Not set'}</span>
                    </div>
                    <div className="shop-history-block">
                      <span className="mod-entry-kind">After</span>
                      <span>{str(next) ? truncate(str(next), 200) : 'Not set'}</span>
                    </div>
                  </div>
                )}
                {isHours && (
                  <div className="shop-history-diff">
                    <div className="shop-history-block shop-history-block--before">
                      <span className="mod-entry-kind">Before</span>
                      <span>{formatHours(old)}</span>
                    </div>
                    <div className="shop-history-block">
                      <span className="mod-entry-kind">After</span>
                      <span>{formatHours(next)}</span>
                    </div>
                  </div>
                )}

                {revertable && (
                  <div className="mod-entry-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => handleRevert(event)}
                    >
                      {reverting === event.id ? 'Reverting…' : 'Revert this change'}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && (
        <div className="mod-entry-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={loadMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}

function CreateShopForm() {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ShopSearchResult | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!name.trim()) {
      setError('Enter a name.');
      return;
    }
    if (latitude.trim() === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      setError('Latitude must be a number between -90 and 90.');
      return;
    }
    if (longitude.trim() === '' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setError('Longitude must be a number between -180 and 180.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const place = await createPlace(
        {
          name: name.trim(),
          latitude: lat,
          longitude: lng,
          ...(city.trim() ? { city: city.trim() } : {}),
          ...(state.trim() ? { state: state.trim() } : {}),
        },
        token,
      );
      setCreated(place);
      setName('');
      setLatitude('');
      setLongitude('');
      setCity('');
      setState('');
    } catch (err) {
      setError(errorMessage(err, 'Failed to create the shop.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="shop-create">
      <summary>Create a shop</summary>
      <p className="mod-blurb">
        For a shop nobody has synced yet. It is saved as a manual place; search for it by name afterward to add
        an owner.
      </p>
      <form className="form shop-create-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="shop-name">Name</label>
          <input id="shop-name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </div>
        <div className="shop-create-row">
          <div className="field">
            <label htmlFor="shop-lat">Latitude</label>
            <input
              id="shop-lat"
              inputMode="decimal"
              placeholder="41.8781"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="shop-lng">Longitude</label>
            <input
              id="shop-lng"
              inputMode="decimal"
              placeholder="-87.6298"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
        <div className="shop-create-row">
          <div className="field">
            <label htmlFor="shop-city">City (optional)</label>
            <input id="shop-city" value={city} onChange={(e) => setCity(e.target.value)} disabled={busy} />
          </div>
          <div className="field">
            <label htmlFor="shop-state">State (optional)</label>
            <input id="shop-state" value={state} onChange={(e) => setState(e.target.value)} disabled={busy} />
          </div>
        </div>
        {error && <p className="mod-entry-error">{error}</p>}
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create shop'}
          </button>
        </div>
      </form>

      {created && (
        <div className="mod-entry shop-created">
          <div className="mod-entry-body">
            <div className="mod-entry-top">
              <span className="mod-entry-kind">Created</span>
              <strong>{created.name}</strong>
              <span className="status-chip status-chip--pending">{created.provider}</span>
              {placeLine(created) && <span className="mod-entry-date">{placeLine(created)}</span>}
            </div>
            <p className="mod-entry-reporter">Place id {created.placeId}. Search for it by name to add an owner.</p>
          </div>
        </div>
      )}
    </details>
  );
}
