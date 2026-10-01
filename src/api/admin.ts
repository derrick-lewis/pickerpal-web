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
  | 'account_name'
  | 'place_sale';

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

// --- Second Opinions: maker reviews (/v1/admin/maker-reviews/*) ---
//
// The crowd's maker-attribution disputes/consensus (pickerpal-api
// internal/identify, migration 000028): pending ratifications (a candidate
// crossed the weighted-consensus threshold and is queued for a one-tap
// human call) and contested items (the owner chose Keep-mine on a
// 'proposed' item, so an admin sides with one of them). Same shell as the
// moderation/reports queues above, two lists in one response.

export interface MakerVoteBreakdown {
  /** Null is the "not this one" bucket, not a specific alternative. */
  makerId: string | null;
  makerName: string | null;
  weightedSum: number;
  voterCount: number;
}

export interface PendingMakerReview {
  itemId: string;
  /** Set when the item has a lead photo; fetch via AuthImage(basePath: '/v1/admin/moderation/photos', photoId). */
  photoId: string | null;
  currentMakerName: string | null;
  pendingMakerId: string;
  pendingMakerName: string;
  votes: MakerVoteBreakdown[];
}

export interface ContestedMakerReview {
  itemId: string;
  photoId: string | null;
  ownerMakerName: string | null;
  crowdMakerId: string;
  crowdMakerName: string;
  votes: MakerVoteBreakdown[];
}

export interface MakerReviewsResponse {
  pending: PendingMakerReview[];
  contested: ContestedMakerReview[];
}

export type MakerReviewAction = 'ratify' | 'dismiss' | 'side_owner' | 'side_crowd';

export function fetchMakerReviews(token: string): Promise<MakerReviewsResponse> {
  return apiRequest<MakerReviewsResponse>('/v1/admin/maker-reviews', { token });
}

export function resolveMakerReview(
  token: string,
  itemId: string,
  action: MakerReviewAction,
): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/v1/admin/maker-reviews/${itemId}/resolve`, {
    method: 'POST',
    token,
    body: { action },
  });
}

// --- Second Opinions: the weekly maker quiz (/v1/admin/quiz/*, SO-3) ---
//
// Curation only -- pickerpal-api's internal/quiz owns the weight math this
// feeds (identify_weights), entirely server-side and invisible here. This
// tab just builds and publishes the multiple-choice set.

export interface QuizObscureRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface QuizCandidate {
  itemId: string;
  makerId: string;
  makerName: string;
  categoryId: string | null;
  categoryName: string | null;
  /** Fetch via AuthImage(basePath: '/v1/admin/moderation/photos', photoId). */
  firstPhotoId: string;
}

export function fetchQuizCandidates(token: string, categoryId?: string | null): Promise<QuizCandidate[]> {
  const qs = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : '';
  return apiRequest<QuizCandidate[]>(`/v1/admin/quiz/candidates${qs}`, { token });
}

export interface QuizDistractor {
  makerId: string;
  makerName: string;
}

export function fetchQuizDistractors(
  token: string,
  makerId: string,
  categoryId: string | null,
): Promise<QuizDistractor[]> {
  const params = new URLSearchParams({ makerId });
  if (categoryId) params.set('categoryId', categoryId);
  return apiRequest<QuizDistractor[]>(`/v1/admin/quiz/distractors?${params.toString()}`, { token });
}

export interface CreateQuizQuestionInput {
  photoItemId: string;
  photoId: string;
  obscureRect: QuizObscureRect | null;
  correctMakerId: string;
  distractorMakerIds: string[];
  categoryId: string | null;
}

export function createQuiz(
  token: string,
  weekOf: string,
  questions: CreateQuizQuestionInput[],
): Promise<{ id: string }> {
  return apiRequest<{ id: string }>('/v1/admin/quiz', {
    method: 'POST',
    token,
    body: { weekOf, questions },
  });
}

export function publishQuiz(token: string, id: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/v1/admin/quiz/${id}/publish`, { method: 'POST', token });
}

export interface LatestQuizQuestion {
  id: string;
  photoItemId: string;
  photoId: string;
  obscureRect: QuizObscureRect | null;
  correctMakerId: string;
  correctMakerName: string;
  distractorMakerIds: string[];
  categoryId: string | null;
  answerCount: number;
  correctCount: number;
}

export interface LatestQuiz {
  id: string;
  weekOf: string;
  published: boolean;
  publishedAt: number | null;
  questions: LatestQuizQuestion[];
}

export function fetchLatestQuiz(token: string): Promise<{ quiz: LatestQuiz | null }> {
  return apiRequest<{ quiz: LatestQuiz | null }>('/v1/admin/quiz/latest', { token });
}

// --- Shops (/v1/admin/shops/*, /v1/admin/places) ---
//
// Shop ownership: an admin grants a PickerPal user the right to edit a
// shop's profile (a `places` row) in the app. Search finds the place, grant
// and revoke manage its owners, and createPlace adds a manual place for a
// shop nobody has synced yet (provider 'manual').

export interface ShopOwner {
  userId: string;
  email: string;
  displayName: string | null;
  /** Epoch ms. */
  grantedAt: number;
}

export interface ShopSearchResult {
  placeId: string;
  name: string;
  city: string | null;
  state: string | null;
  /** 'apple' | 'osm' | 'manual'; kept open so a new provider never breaks the type. */
  provider: string;
  owners: ShopOwner[];
}

export interface CreatePlaceInput {
  name: string;
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
}

// The contract pins the per-place shape but not the envelope around a list
// or a single place, so accept a bare value or a one-key wrapper and fill in
// an empty owners list rather than trusting it to be present.
function normalizeShop(raw: Partial<ShopSearchResult>): ShopSearchResult {
  return {
    placeId: raw.placeId ?? '',
    name: raw.name ?? '',
    city: raw.city ?? null,
    state: raw.state ?? null,
    provider: raw.provider ?? '',
    owners: raw.owners ?? [],
  };
}

function unwrap<T>(value: unknown, keys: string[]): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of keys) {
      if (obj[key] !== undefined) return obj[key] as T;
    }
  }
  return value as T;
}

export async function searchShops(q: string, token: string): Promise<ShopSearchResult[]> {
  const res = await apiRequest<unknown>(`/v1/admin/shops/search?q=${encodeURIComponent(q)}`, { token });
  const list = unwrap<Partial<ShopSearchResult>[] | null>(res, ['shops', 'places', 'results']);
  return (list ?? []).map(normalizeShop);
}

export async function createPlace(input: CreatePlaceInput, token: string): Promise<ShopSearchResult> {
  const res = await apiRequest<unknown>('/v1/admin/places', { method: 'POST', token, body: input });
  return normalizeShop(unwrap<Partial<ShopSearchResult>>(res, ['place', 'shop']));
}

/** 404 user_not_found when no PickerPal user has that email. */
export async function grantShopOwner(placeId: string, email: string, token: string): Promise<ShopOwner> {
  const res = await apiRequest<unknown>(`/v1/admin/shops/${encodeURIComponent(placeId)}/owners`, {
    method: 'POST',
    token,
    body: { email },
  });
  return unwrap<ShopOwner>(res, ['owner']);
}

export function revokeShopOwner(placeId: string, userId: string, token: string): Promise<void> {
  return apiRequest<void>(
    `/v1/admin/shops/${encodeURIComponent(placeId)}/owners/${encodeURIComponent(userId)}`,
    { method: 'DELETE', token },
  );
}

// --- Shop history (/v1/admin/shops/{placeID}/history, /profile) ---
//
// Append-only audit log of a shop's owner-edited profile (pickerpal-api
// place_profile_events, migration 000031). `detail` is the jsonb verbatim;
// its keys depend on `action` (see the viewer in AdminShopsTab). An admin
// can revert description/hours by PATCHing the old value back.

export type ShopHistoryAction =
  | 'description_set'
  | 'hours_set'
  | 'sale_set'
  | 'sale_cleared'
  | 'note_posted'
  | 'note_deleted'
  | 'note_pruned'
  | 'photo_set'
  | 'photo_cleared'
  | 'owner_granted'
  | 'owner_revoked';

/** One day's opening hours; null means closed. Times are 24h "HH:MM". */
export interface ShopDayHours {
  open: string;
  close: string;
}

export type ShopHoursDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type ShopHoursJson = Partial<Record<ShopHoursDay, ShopDayHours | null>>;

export interface ShopHistoryActor {
  userId: string;
  email: string;
  displayName: string | null;
}

export interface ShopHistoryEvent {
  id: number;
  /** Kept open so a server-side new action never breaks the viewer. */
  action: ShopHistoryAction | (string & {});
  detail: Record<string, unknown>;
  /** Null when the acting user has since been deleted. */
  actor: ShopHistoryActor | null;
  /** Epoch ms. */
  createdAt: number;
}

export interface ShopHistoryResponse {
  events: ShopHistoryEvent[];
  hasMore: boolean;
}

export function fetchShopHistory(
  placeId: string,
  opts: { limit?: number; before?: number },
  token: string,
): Promise<ShopHistoryResponse> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.before !== undefined) params.set('before', String(opts.before));
  const qs = params.toString();
  return apiRequest<ShopHistoryResponse>(
    `/v1/admin/shops/${encodeURIComponent(placeId)}/history${qs ? `?${qs}` : ''}`,
    { token },
  );
}

/** Admin override (same validation/moderation as the owner PATCH). `hours: null` clears. */
export function adminPatchShopProfile(
  placeId: string,
  patch: { description?: string; hours?: ShopHoursJson | null },
  token: string,
): Promise<unknown> {
  return apiRequest<unknown>(`/v1/admin/shops/${encodeURIComponent(placeId)}/profile`, {
    method: 'PATCH',
    token,
    body: patch,
  });
}

// --- Shop claims (/v1/admin/shops/claims) ---
//
// A signed-in user claims an unowned shop from the app; the claim lands here
// as a pending queue (oldest first). Accepting grants ownership exactly like
// grantShopOwner above (and auto-rejects other pending claims on the same
// place); rejecting just closes the claim. 404 for an unknown claim, 409
// `claim_resolved` if it is no longer pending, 409 `shop_has_owner` if the
// place gained an owner in the meantime (the claim then stays pending).

export interface ShopClaimUser {
  userId: string;
  email: string;
  displayName: string | null;
}

export interface ShopClaim {
  id: string;
  placeId: string;
  placeName: string;
  placeCity: string | null;
  placeState: string | null;
  user: ShopClaimUser;
  /** The claimer's note. */
  message: string;
  /** Epoch ms. */
  createdAt: number;
}

export type ShopClaimAction = 'accept' | 'reject';

export async function fetchShopClaims(token: string): Promise<ShopClaim[]> {
  const res = await apiRequest<{ claims: ShopClaim[] | null }>('/v1/admin/shops/claims', { token });
  return res.claims ?? [];
}

/** `owner` is present for an accept only. */
export function resolveShopClaim(
  claimId: string,
  action: ShopClaimAction,
  token: string,
): Promise<{ ok: boolean; owner?: ShopOwner }> {
  return apiRequest<{ ok: boolean; owner?: ShopOwner }>(
    `/v1/admin/shops/claims/${encodeURIComponent(claimId)}/resolve`,
    { method: 'POST', token, body: { action } },
  );
}
