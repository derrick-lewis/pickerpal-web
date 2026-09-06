import { useCallback, useEffect, useState } from 'react';
import {
  fetchModerationQueue,
  submitModerationVerdict,
  type ModerationEntry,
  type ModerationStatus,
  type ModerationVerdict,
} from '../api/admin';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AuthImage } from '../components/AuthImage';
import { JettisonDialog } from '../components/JettisonDialog';
import { formatDateTime } from '../lib/format';

const KIND_LABELS: Record<ModerationEntry['kind'], string> = {
  item_photo: 'Item photo',
  item: 'Item',
  maker: 'Maker',
  category: 'Category',
  store: 'Store',
  share: 'Share',
  share_photo: 'Share photo',
};

// 'unclassifiable' is the server's "the automated pass couldn't classify
// this, a human has to" bucket — the more urgent of the two, so the queue
// (and its counts) puts it first as "quarantined". Plain 'pending' items are
// waiting behind it. approved/approved_nsfw/rejected are terminal verdicts
// and shouldn't appear in the queue at all, but are labeled defensively.
function isQuarantined(status: ModerationStatus): boolean {
  return status === 'unclassifiable';
}

function statusLabel(status: ModerationStatus): string {
  switch (status) {
    case 'unclassifiable':
      return 'Quarantined';
    case 'pending':
      return 'Pending';
    case 'approved':
      return 'Approved';
    case 'approved_nsfw':
      return 'Approved (NSFW)';
    case 'rejected':
      return 'Rejected';
  }
}

function entryKey(entry: ModerationEntry): string {
  return `${entry.kind}:${entry.id}`;
}

/**
 * The moderation queue: content a picker submitted that the server's
 * automated pass quarantined or flagged pending, waiting on a human verdict.
 * Admin-only. ProtectedRoute already proves the visitor is signed in; this
 * page adds its own isAdmin check on top (rendering "Not authorized" rather
 * than redirecting, since bouncing a signed-in admin-page visitor elsewhere
 * reads as a bug) — the server enforces the real boundary regardless.
 */
export function AdminModeration() {
  const { token, isAdmin } = useAuth();
  const [entries, setEntries] = useState<ModerationEntry[]>([]);
  const [counts, setCounts] = useState({ pending: 0, quarantined: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<Record<string, boolean>>({});
  // The account whose owner a jettison is being considered for; null closes
  // the dialog. Held here rather than per-row so only one can ever be open.
  const [jettisonAccountId, setJettisonAccountId] = useState<string | null>(null);

  const load = useCallback(
    (silent = false) => {
      if (!token) return;
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      fetchModerationQueue(token)
        .then((res) => {
          setEntries(res.entries);
          setCounts(res.counts);
        })
        .catch((err) => {
          setError(err instanceof ApiError ? err.message : 'Failed to load the moderation queue.');
        })
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [token],
  );

  useEffect(() => {
    if (!isAdmin) return;
    load();
    // Only the initial mount needs this; the Refresh button drives the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function handleVerdict(entry: ModerationEntry, verdict: ModerationVerdict) {
    if (!token) return;
    const key = entryKey(entry);
    setActing((prev) => ({ ...prev, [key]: true }));
    setEntryErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      await submitModerationVerdict(token, entry.kind, entry.id, verdict);
      setEntries((prev) => prev.filter((e) => entryKey(e) !== key));
      setCounts((prev) => ({
        pending: entry.status === 'pending' ? Math.max(0, prev.pending - 1) : prev.pending,
        quarantined: isQuarantined(entry.status) ? Math.max(0, prev.quarantined - 1) : prev.quarantined,
      }));
    } catch (err) {
      setEntryErrors((prev) => ({
        ...prev,
        [key]: err instanceof ApiError ? err.message : 'Failed to record the verdict.',
      }));
      setActing((prev) => ({ ...prev, [key]: false }));
      return;
    }
    setActing((prev) => ({ ...prev, [key]: false }));
  }

  if (!isAdmin) {
    return (
      <div className="section">
        <h2>Not authorized</h2>
        <p>This page is for PickerPal admins only.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mod-header">
        <h1>Moderation</h1>
        <div className="mod-header-actions">
          {!loading && (
            <span className="mod-counts">
              {counts.quarantined} quarantined &middot; {counts.pending} pending
            </span>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => load(true)}
            disabled={loading || refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <p className="mod-blurb">
        If something is truly bad (suspected CSAM or other criminal content): don&rsquo;t re-view or share it.
        Report to the NCMEC CyberTipline first, then use <strong>Jettison user</strong> on the row — it seals
        an evidence bundle before anything is deleted, which is what makes the preservation copy exist.
      </p>

      {error && <p className="error-banner">{error}</p>}

      {loading ? (
        <p className="loading-state">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <span className="empty-glyph" aria-hidden="true">
            ✅
          </span>
          <p className="empty-title">Nothing waiting.</p>
        </div>
      ) : (
        <div className="mod-list">
          {entries.map((entry) => (
            <ModEntry
              key={entryKey(entry)}
              entry={entry}
              busy={!!acting[entryKey(entry)]}
              error={entryErrors[entryKey(entry)]}
              onVerdict={(verdict) => handleVerdict(entry, verdict)}
              onJettison={entry.accountId ? () => setJettisonAccountId(entry.accountId) : undefined}
            />
          ))}
        </div>
      )}

      {jettisonAccountId && (
        <JettisonDialog
          accountId={jettisonAccountId}
          onClose={() => {
            setJettisonAccountId(null);
            // A scrub deletes rows the queue is still showing, so reload
            // rather than leave entries pointing at content that is gone.
            load(true);
          }}
        />
      )}
    </div>
  );
}

function ModEntry({
  entry,
  busy,
  error,
  onVerdict,
  onJettison,
}: {
  entry: ModerationEntry;
  busy: boolean;
  error?: string;
  onVerdict: (verdict: ModerationVerdict) => void;
  /** Absent for a row with no owning account (nothing to jettison). */
  onJettison?: () => void;
}) {
  const quarantined = isQuarantined(entry.status);
  return (
    <div className="mod-entry">
      {entry.thumbPath ? (
        <div className="mod-entry-thumb">
          <AuthImage
            photoId={entry.id}
            basePath="/v1/admin/moderation/photos"
            variant="thumb"
            alt=""
            fallback={
              <span className="placeholder" aria-hidden="true">
                🖼️
              </span>
            }
          />
        </div>
      ) : (
        <div className="mod-entry-snippet">{entry.snippet || '—'}</div>
      )}
      <div className="mod-entry-body">
        <div className="mod-entry-top">
          <span className="mod-entry-kind">{KIND_LABELS[entry.kind]}</span>
          <span className={`status-chip ${quarantined ? 'status-chip--quarantined' : 'status-chip--pending'}`}>
            {statusLabel(entry.status)}
          </span>
          <span className="mod-entry-date">{formatDateTime(entry.createdAt)}</span>
        </div>
        {entry.reason && <p className="mod-entry-reason">{entry.reason}</p>}
        {error && <p className="mod-entry-error">{error}</p>}
        <div className="mod-entry-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onVerdict('approved')}>
            Approve
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => onVerdict('approved_nsfw')}
          >
            Mark NSFW
          </button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => onVerdict('rejected')}>
            Reject
          </button>
          {onJettison && (
            <button type="button" className="btn btn-link-danger" disabled={busy} onClick={onJettison}>
              Jettison user…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
