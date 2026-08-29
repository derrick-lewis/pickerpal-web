// Types mirroring the pickerpal-api wire contract (camelCase, integer cents,
// epoch-millisecond timestamps, UUID strings).

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthResponse {
  token: string;
  expiresAt: number;
  user: AuthUser;
  accountId: string;
}

export interface MeResponse {
  user: AuthUser;
  accountId: string;
}

export type ItemStatus = 'available' | 'sold';

export interface Entry {
  id: string;
  storeId: string;
  categoryId: string | null;
  subcategoryId: string | null;
  boothId: string | null;
  mapId: string | null;
  mapX: number | null;
  mapY: number | null;
  makerId: string | null;
  makerUncertain: boolean;
  sellerCode: string | null;
  priceCents: number | null;
  status: ItemStatus;
  notes: string | null;
  soldAt: number | null;
  createdAt: number;
  updatedAt: number;
  storeName: string | null;
  makerName: string | null;
  firstPhotoUri: string | null;
  firstPhotoId: string | null;
  photoCount: number;
  previousPriceCents: number | null;
}

export interface ItemsResponse {
  items: Entry[];
  nextCursor: string | null;
}

export interface Photo {
  id: string;
  width: number;
  height: number;
  sortOrder: number;
}

export interface PriceRecord {
  id: string;
  priceCents: number;
  recordedAt: number;
}

export interface ItemDetail {
  id: string;
  storeId: string;
  storeName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  subcategoryId: string | null;
  subcategoryName: string | null;
  makerId: string | null;
  makerName: string | null;
  makerUncertain: boolean;
  boothId: string | null;
  boothLabel: string | null;
  mapId: string | null;
  mapX: number | null;
  mapY: number | null;
  sellerCode: string | null;
  priceCents: number | null;
  status: ItemStatus;
  notes: string | null;
  soldAt: number | null;
  createdAt: number;
  updatedAt: number;
  photos: Photo[];
  prices: PriceRecord[];
}
