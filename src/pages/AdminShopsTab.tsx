import { useState, type FormEvent } from 'react';
import {
  createPlace,
  grantShopOwner,
  revokeShopOwner,
  searchShops,
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
export function AdminShopsTab() {
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
      </div>
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
