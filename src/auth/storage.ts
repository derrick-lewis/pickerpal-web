import type { AuthUser } from '../api/types';

const STORAGE_KEY = 'pickerpal.auth';

export interface StoredAuth {
  token: string;
  user: AuthUser;
  accountId: string;
}

export function loadStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === 'string' && parsed.user && typeof parsed.accountId === 'string') {
      return parsed as StoredAuth;
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
