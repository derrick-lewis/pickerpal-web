// Thin fetch wrapper for the pickerpal-api contract: JSON in/out, integer
// cents, epoch-millisecond timestamps, and the `{"error":{code,message,
// request_id}}` envelope on any non-2xx response.

// Unset -> the local dev API. Explicitly EMPTY -> same-origin relative URLs,
// which is how production works (the API serves this bundle itself).
const rawApiUrl = import.meta.env.VITE_API_URL as string | undefined;
export const API_URL = rawApiUrl === undefined ? 'http://localhost:8080' : rawApiUrl.replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  code: string;
  requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Registered by AuthContext so a 401 on an authed request can clear the
 * stored session in one place, regardless of which call triggered it. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

async function parseErrorBody(res: Response): Promise<{ code: string; message: string; requestId?: string }> {
  try {
    const data = await res.json();
    const err = data?.error;
    if (err?.message) {
      return { code: err.code ?? 'unknown_error', message: err.message, requestId: err.request_id };
    }
  } catch {
    // fall through to generic message
  }
  return { code: 'unknown_error', message: `Request failed (${res.status})` };
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (opts.token) {
    headers['Authorization'] = `Bearer ${opts.token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body,
    signal: opts.signal,
  });

  if (!res.ok) {
    const { code, message, requestId } = await parseErrorBody(res);
    if (res.status === 401 && opts.token) {
      unauthorizedHandler?.();
    }
    throw new ApiError(res.status, code, message, requestId);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

/** Fetches a binary resource (photo bytes) with the auth header and returns
 * it as a Blob. Used by AuthImage, since these endpoints require
 * Authorization and so can't be used directly as an <img src>. */
export async function apiFetchBlob(path: string, token: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) {
    if (res.status === 401) {
      unauthorizedHandler?.();
    }
    const { message, code, requestId } = await parseErrorBody(res);
    throw new ApiError(res.status, code, message, requestId);
  }
  return res.blob();
}
