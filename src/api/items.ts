import { apiRequest } from './client';
import type { ItemDetail, ItemsResponse, ItemStatus } from './types';

export interface FetchItemsParams {
  limit?: number;
  cursor?: string | null;
  status?: ItemStatus | null;
  orderBy?: 'newest' | 'oldest';
}

export function fetchItems(token: string, params: FetchItemsParams = {}): Promise<ItemsResponse> {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.status) query.set('status', params.status);
  if (params.orderBy) query.set('orderBy', params.orderBy);
  const qs = query.toString();
  return apiRequest<ItemsResponse>(`/v1/items${qs ? `?${qs}` : ''}`, { token });
}

export function fetchItem(token: string, id: string): Promise<ItemDetail> {
  return apiRequest<ItemDetail>(`/v1/items/${id}`, { token });
}
