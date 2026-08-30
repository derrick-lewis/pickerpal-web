import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import type { AccessTier } from './access';
import { tierAtLeast } from './access';
import { useAuth } from './AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  /**
   * The rung this route needs. 'account' (the default) covers everything
   * about your own catalog; 'plus' covers the crowd — other pickers' finds.
   */
  requireTier?: Exclude<AccessTier, 'anonymous'>;
}

export function ProtectedRoute({ children, requireTier = 'account' }: ProtectedRouteProps) {
  const { token, tier, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <p className="loading-state">Loading…</p>;
  }
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  // Signed in but on too low a rung. Deliberately not a redirect to /login:
  // bouncing an already-signed-in user to a sign-in form reads as a bug, and
  // signing in again would not change the answer.
  if (!tierAtLeast(tier, requireTier)) {
    return <UpgradePrompt />;
  }
  return <>{children}</>;
}

/** Shown in place of a Plus-only screen for a free account. */
function UpgradePrompt() {
  return (
    <div className="section">
      <h2>Part of PickerPal Plus</h2>
      <p>
        Your own finds are always yours — browse them any time. Seeing what <em>other</em> pickers have
        turned up, near you or in a shop you&rsquo;re about to walk into, comes with PickerPal Plus.
      </p>
      <p>Subscribe in the iPhone app under Settings &rarr; PickerPal Plus.</p>
      <Link to="/items" className="btn btn-primary">
        Back to my items
      </Link>
    </div>
  );
}
