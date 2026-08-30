import type { AuthUser, ServerTier } from '../api/types';

const STORAGE_KEY = 'pickerpal.auth';

export interface StoredAuth {
  token: string;
  user: AuthUser;
  accountId: string;
  tier: ServerTier;
}

export function loadStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === 'string' && parsed.user && typeof parsed.accountId === 'string') {
      // A session stored before tiers existed has no tier; treat it as the
      // free rung until GET /v1/auth/me says otherwise. Guessing low only
      // ever hides a Plus feature for one request, where guessing high
      // would render a screen the API then refuses.
      return { ...parsed, tier: parsed.tier === 'plus' ? 'plus' : 'account' } as StoredAuth;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveStoredAuth(auth: StoredAuth | null): void {
  try {
    if (auth) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable (private mode, etc.) — session just won't persist.
  }
}
