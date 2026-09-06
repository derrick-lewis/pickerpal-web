import { apiRequest } from './client';

// The admin moderation queue (/v1/admin/moderation/*): content quarantined
// or flagged pending by the server's automated classifiers, awaiting a
// human verdict. 403 forbidden for anyone whose session isn't isAdmin.

export type ModerationKind =
  | 'item_photo'
  | 'item'
  | 'maker'
  | 'category'
  | 'store'
  | 'share'
  | 'share_photo'
  | 'account_name';

export type ModerationStatus = 'pending' | 'approved' | 'approved_nsfw' | 'rejected' | 'unclassifiable';

export type ModerationVerdict = 'approved' | 'approved_nsfw' | 'rejected';

export interface ModerationEntry {
  kind: ModerationKind;
  id: string;
  accountId: string;
  status: ModerationStatus;
  reason: string;
  snippet: string;
  /** Set for photo kinds; fetch via AuthImage(basePath: '/v1/admin/moderation/photos', photoId: id) rather than this path directly. */
  thumbPath: string | null;
  createdAt: number;
}

export interface ModerationCounts {
  pending: number;
  quarantined: number;
}

export interface ModerationQueueResponse {
  entries: ModerationEntry[];
  counts: ModerationCounts;
}

export function fetchModerationQueue(token: string): Promise<ModerationQueueResponse> {
  return apiRequest<ModerationQueueResponse>('/v1/admin/moderation/queue', { token });
}

export function submitModerationVerdict(
  token: string,
  kind: ModerationKind,
  id: string,
  verdict: ModerationVerdict,
): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/v1/admin/moderation/verdict', {
    method: 'POST',
    token,
    body: { kind, id, verdict },
  });
}

// --- Reports (/v1/admin/reports/*) ---
//
// A sibling queue to the moderation one above: content the automated pass
// approved but a picker flagged by hand (stolen listing, spam, etc). Reports
// are reviewed manually — no auto-hide — so this queue is the only path from
// "someone reported this" to the item actually coming down.

export type ReportReason = 'inappropriate' | 'spam' | 'stolen_listing' | 'other';

export type ReportResolution = 'dismiss' | 'remove_item';

export interface ReportEntry {
  id: string;
  itemId: string;
  reporterAccountId: string;
  publisherAccountId: string;
  reason: ReportReason;
  note: string | null;
  snippet: string;
  /** Set when the item has a lead photo; fetch via AuthImage(basePath: '/v1/admin/moderation/photos', photoId: id). */
  photoId: string | null;
  itemModerationStatus: ModerationStatus;
  createdAt: number;
}

export interface ReportsQueueResponse {
  reports: ReportEntry[];
  openCount: number;
}

export function fetchReportsQueue(token: string): Promise<ReportsQueueResponse> {
  return apiRequest<ReportsQueueResponse>('/v1/admin/reports', { token });
}

export function resolveReport(
  token: string,
  reportId: string,
  action: ReportResolution,
): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/v1/admin/reports/${reportId}/resolve`, {
    method: 'POST',
    token,
    body: { action },
  });
}

// --- Jettison (/v1/admin/jettison/*) ---
//
// The abuse response, in two deliberate steps: SEAL preserves everything
// about an offender into a separate evidence store and changes nothing the
// user can see; SCRUB then bans their identifiers and deletes them from the
// live system. The server refuses a scrub without a prior seal, so the order
// here is not merely the UI's suggestion — it is enforced.

export interface JettisonLookupUser {
  userId: string;
  email: string;
  displayName: string | null;
  createdAt: number;
  signupIp: string;
  role: string;
  /** Above 1 means a scrub will SKIP this account rather than delete it. */
  memberCount: number;
}

export interface JettisonLookupResponse {
  accountId: string;
  users: JettisonLookupUser[];
  /** False when the server has no evidence bucket configured: no seal is possible. */
  sealAvailable: boolean;
}

export interface JettisonSealResponse {
  jettisonId: string;
  evidenceObjectKey: string;
  subjectEmail: string;
  status: string;
}

export interface JettisonScrubResponse {
  jettisonId: string;
  deletedAccounts: string[];
  skippedAccounts: string[];
  bannedIdentities: number;
  userDeleted: boolean;
}

export function lookupJettisonSubject(token: string, accountId: string): Promise<JettisonLookupResponse> {
  return apiRequest<JettisonLookupResponse>(
    `/v1/admin/jettison/lookup?accountId=${encodeURIComponent(accountId)}`,
    { token },
  );
}

export function sealJettison(token: string, userId: string, reason: string): Promise<JettisonSealResponse> {
  return apiRequest<JettisonSealResponse>('/v1/admin/jettison/seal', {
    method: 'POST',
    token,
    body: { userId, reason },
  });
}

/** confirmEmail must match the sealed jettison's subject; the server checks it too. */
export function scrubJettison(
  token: string,
  jettisonId: string,
  confirmEmail: string,
): Promise<JettisonScrubResponse> {
  return apiRequest<JettisonScrubResponse>('/v1/admin/jettison/scrub', {
    method: 'POST',
    token,
    body: { jettisonId, confirmEmail },
  });
}
