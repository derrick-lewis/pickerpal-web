import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as authApi from '../api/auth';
import { setUnauthorizedHandler } from '../api/client';
import type { AuthUser, ServerTier } from '../api/types';
import type { AccessTier } from './access';
import { loadStoredAuth, saveStoredAuth } from './storage';

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  accountId: string | null;
  /** The rung this session sits on, as reported by the server. Signed out is
   * 'anonymous'; see src/auth/access.ts for what each rung unlocks. */
  tier: AccessTier;
  /** True while the initial GET /v1/auth/me validation of a stored token is
   * in flight, so protected routes can avoid a flash of the login page. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = useMemo(() => loadStoredAuth(), []);
  const [token, setToken] = useState<string | null>(stored?.token ?? null);
  const [user, setUser] = useState<AuthUser | null>(stored?.user ?? null);
  const [accountId, setAccountId] = useState<string | null>(stored?.accountId ?? null);
  const [serverTier, setServerTier] = useState<ServerTier | null>(stored?.tier ?? null);
  const [loading, setLoading] = useState<boolean>(!!stored?.token);

  const applyAuth = useCallback(
    (res: { token: string; user: AuthUser; accountId: string; tier: ServerTier }) => {
      setToken(res.token);
      setUser(res.user);
      setAccountId(res.accountId);
      setServerTier(res.tier);
      saveStoredAuth({ token: res.token, user: res.user, accountId: res.accountId, tier: res.tier });
    },
    [],
  );

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    setAccountId(null);
    setServerTier(null);
    saveStoredAuth(null);
  }, []);

  // A 401 on any authed request means the stored token is no longer valid;
  // clear it. Protected routes react to `token` becoming null and redirect.
  useEffect(() => {
    setUnauthorizedHandler(signOut);
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  // Validate a stored token once on load, so a stale/expired token doesn't
  // silently pass as "signed in".
  useEffect(() => {
    if (!stored?.token) return;
    let cancelled = false;
    authApi
      .fetchMe(stored.token)
      .then((res) => {
        if (cancelled) return;
        setUser(res.user);
        setAccountId(res.accountId);
        // Re-reading the tier here is what makes a subscription bought (or
        // lapsed) elsewhere show up on the next page load.
        setServerTier(res.tier);
        saveStoredAuth({ token: stored.token, user: res.user, accountId: res.accountId, tier: res.tier });
      })
      .catch(() => {
        // setUnauthorizedHandler above already handles 401 by signing out;
        // other failures (network) leave the cached session in place.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Only ever run once, against the token present at load time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password);
      applyAuth(res);
    },
    [applyAuth],
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const res = await authApi.signup(email, password, displayName);
      applyAuth(res);
    },
    [applyAuth],
  );

  const signInWithGoogle = useCallback(
    async (idToken: string) => {
      const res = await authApi.loginWithGoogle(idToken);
      applyAuth(res);
    },
    [applyAuth],
  );

  const resetPassword = useCallback(
    async (token: string, password: string) => {
      const res = await authApi.resetPassword(token, password);
      applyAuth(res);
    },
    [applyAuth],
  );

  // No token means anonymous regardless of what was last stored, so a signed
  // out tab can never keep a paid rung alive.
  const tier: AccessTier = token === null ? 'anonymous' : (serverTier ?? 'account');

  const value = useMemo<AuthContextValue>(
    () => ({ token, user, accountId, tier, loading, signIn, signUp, signInWithGoogle, resetPassword, signOut }),
    [token, user, accountId, tier, loading, signIn, signUp, signInWithGoogle, resetPassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
