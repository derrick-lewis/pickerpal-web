import { apiRequest } from './client';

// The crowd feed (/v1/feed): other pickers' published items. Plus-only on
// both sides — the viewer must subscribe (the route is behind
// ProtectedRoute requireTier="plus"), and the server serves only items
// whose publisher's subscription is live. Notes and booth positions never
// appear in these shapes; sellerCode rides only on left_behind items.

export type FeedLens = 'left_behind' | 'showing_off';

export interface FeedEntry {
  id: string;
  visibility: FeedLens;
  status: 'available' | 'unavailable';
  priceCents: number | null;
  sellerCode?: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  makerId: string | null;
  createdAt: number;
  soldAt: number | null;
  isMine: boolean;
  placeId: string | null;
  storeName: string;
  storeCity: string | null;
  storeState: string | null;
  latitude: number | null;
  longitude: number | null;
  makerName: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  firstPhotoId: string | null;
  photoCount: number;
}

export interface FeedResponse {
  items: FeedEntry[];
  nextCursor: string | null;
}

export interface FeedPhotoMeta {
  id: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
  hasFile: boolean;
}

export interface FeedDetail extends FeedEntry {
  makerUncertain: boolean;
  photos: FeedPhotoMeta[];
}

export interface FeedPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
  leftBehindCount: number;
  showingOffCount: number;
}

export interface FeedQuery {
  lens?: FeedLens;
  placeId?: string | null;
  categoryId?: string | null;
  makerId?: string | null;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  limit?: number;
  cursor?: string | null;
}

function feedQueryString(query: FeedQuery): string {
  const params = new URLSearchParams();
  if (query.lens) params.set('lens', query.lens);
  if (query.placeId) params.set('placeId', query.placeId);
  if (query.categoryId) params.set('categoryId', query.categoryId);
  if (query.makerId) params.set('makerId', query.makerId);
  if (query.lat !== undefined && query.lng !== undefined) {
    params.set('lat', String(query.lat));
    params.set('lng', String(query.lng));
    if (query.radiusKm !== undefined) params.set('radiusKm', String(query.radiusKm));
  }
  if (query.limit) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function fetchFeedItems(token: string, query: FeedQuery = {}): Promise<FeedResponse> {
  return apiRequest<FeedResponse>(`/v1/feed/items${feedQueryString(query)}`, { token });
}

export function fetchFeedItem(token: string, id: string): Promise<FeedDetail> {
  return apiRequest<FeedDetail>(`/v1/feed/items/${id}`, { token });
}

export function fetchFeedPlaces(
  token: string,
  query: Pick<FeedQuery, 'lat' | 'lng' | 'radiusKm'> = {},
): Promise<FeedPlace[]> {
  return apiRequest<{ places: FeedPlace[] }>(`/v1/feed/places${feedQueryString(query)}`, { token }).then(
    (r) => r.places,
  );
}
