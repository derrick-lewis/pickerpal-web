import { useEffect, useState } from 'react';
import {
  lookupJettisonSubject,
  scrubJettison,
  sealJettison,
  type JettisonLookupUser,
  type JettisonScrubResponse,
  type JettisonSealResponse,
} from '../api/admin';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

/**
 * The jettison flow: seal the evidence, then scrub the offender.
 *
 * The dialog walks the two server steps in order and will not let them be
 * reordered or merged, because the order is the point — a sealed bundle is
 * the preservation copy, and for the content categories that motivate a
 * jettison at all, preserving before destroying is a legal duty, not a
 * preference. (The server refuses a scrub without a seal regardless; this UI
 * just makes the reason visible while the operator is deciding.)
 *
 * Three deliberate frictions on the second step: the scrub button only
 * appears after a seal has succeeded, it requires the subject's email typed
 * back exactly, and it says in plain words what is about to be destroyed.
 */
type Step = 'lookup' | 'reason' | 'sealed' | 'done';

export function JettisonDialog({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const [step, setStep] = useState<Step>('lookup');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<JettisonLookupUser[]>([]);
  const [sealAvailable, setSealAvailable] = useState(true);
  const [subject, setSubject] = useState<JettisonLookupUser | null>(null);
  const [reason, setReason] = useState('');
  const [sealed, setSealed] = useState<JettisonSealResponse | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [report, setReport] = useState<JettisonScrubResponse | null>(null);

  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    lookupJettisonSubject(token, accountId)
      .then((res) => {
        if (cancelled) return;
        setUsers(res.users);
        setSealAvailable(res.sealAvailable);
        if (res.users.length === 1) {
          setSubject(res.users[0]);
          setStep('reason');
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Lookup failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, token]);

  async function handleSeal() {
    if (!subject || !token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await sealJettison(token, subject.userId, reason.trim());
      setSealed(res);
      setStep('sealed');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sealing failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleScrub() {
    if (!sealed || !token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await scrubJettison(token, sealed.jettisonId, confirmEmail.trim());
      setReport(res);
      setStep('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Scrub failed.');
    } finally {
      setBusy(false);
    }
  }

  const confirmMatches =
    !!sealed && confirmEmail.trim().toLowerCase() === sealed.subjectEmail.trim().toLowerCase();

  return (
    <div className="jettison-backdrop" role="dialog" aria-modal="true" aria-label="Jettison user">
      <div className="jettison-dialog">
        <h2>Jettison user</h2>

        <p className="jettison-note">
          Two steps, in this order. <strong>Seal</strong> copies everything about this account — identity,
          addresses, every row, every photo — into the evidence store and changes nothing the user can see.
          <strong> Scrub</strong> then bans them and deletes them from the live system. If this is suspected
          CSAM, report to the NCMEC CyberTipline before scrubbing, and do not re-view or redistribute the
          material: the sealed bundle is the preservation copy.
        </p>

        {error && <p className="error-banner">{error}</p>}
        {!sealAvailable && (
          <p className="error-banner">
            This server has no evidence store configured (BLOB_EVIDENCE_BUCKET), so nothing can be sealed —
            and without a seal, nothing can be scrubbed.
          </p>
        )}

        {loading && <p className="loading-state">Looking up the account…</p>}

        {!loading && step === 'lookup' && (
          <div className="jettison-body">
            {users.length === 0 ? (
              <p>
                No signed-in user owns this account. It is a device account, so there is no identity to ban —
                reject the content instead.
              </p>
            ) : (
              <>
                <p>This account has more than one member. Pick who to jettison:</p>
                <ul className="jettison-users">
                  {users.map((u) => (
                    <li key={u.userId}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setSubject(u);
                          setStep('reason');
                        }}
                      >
                        {u.email}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {step === 'reason' && subject && (
          <div className="jettison-body">
            <dl className="jettison-facts">
              <dt>Email</dt>
              <dd>{subject.email}</dd>
              <dt>Signup IP</dt>
              <dd>{subject.signupIp || '—'}</dd>
              <dt>Account members</dt>
              <dd>{subject.memberCount}</dd>
            </dl>
            {subject.memberCount > 1 && (
              <p className="jettison-warning">
                Another person is a member of this account, so the scrub will ban and delete this user but
                leave the account&rsquo;s content in place. You will have to handle it by hand.
              </p>
            )}
            <label className="jettison-label" htmlFor="jettison-reason">
              Reason (goes in the audit record and the sealed bundle)
            </label>
            <textarea
              id="jettison-reason"
              className="jettison-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What was found, and what was done about it."
            />
            <div className="jettison-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSeal}
                disabled={busy || !reason.trim() || !sealAvailable}
              >
                {busy ? 'Sealing…' : 'Seal evidence'}
              </button>
            </div>
          </div>
        )}

        {step === 'sealed' && sealed && (
          <div className="jettison-body">
            <p className="jettison-sealed">
              Sealed. Bundle: <code>{sealed.evidenceObjectKey}</code>
            </p>
            <p>
              You can stop here — nothing has been destroyed yet. Scrubbing bans{' '}
              <strong>{sealed.subjectEmail}</strong> (plus their Google sign-in and known addresses) and
              permanently deletes their account, items, shares, and photos. It cannot be undone.
            </p>
            <label className="jettison-label" htmlFor="jettison-confirm">
              Type <strong>{sealed.subjectEmail}</strong> to confirm
            </label>
            <input
              id="jettison-confirm"
              className="jettison-confirm"
              type="text"
              autoComplete="off"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
            />
            <div className="jettison-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
                Stop here
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleScrub}
                disabled={busy || !confirmMatches}
              >
                {busy ? 'Scrubbing…' : 'Scrub from the live system'}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && report && (
          <div className="jettison-body">
            <p className="jettison-sealed">
              Scrubbed. {report.bannedIdentities} identifier{report.bannedIdentities === 1 ? '' : 's'} banned;{' '}
              {report.deletedAccounts.length} account{report.deletedAccounts.length === 1 ? '' : 's'} deleted.
            </p>
            {report.skippedAccounts.length > 0 && (
              <p className="jettison-warning">
                {report.skippedAccounts.length} shared account
                {report.skippedAccounts.length === 1 ? ' was' : 's were'} left in place because someone else is
                a member: {report.skippedAccounts.join(', ')}
              </p>
            )}
            <div className="jettison-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
