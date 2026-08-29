import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type Status = 'verifying' | 'success' | 'error';

export function VerifyEmail() {
  const { token: sessionToken } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error');
  const [error, setError] = useState<string | null>(token ? null : 'This verification link is missing a token.');
  const fired = useRef(false);

  useEffect(() => {
    if (!token || fired.current) return;
    fired.current = true;
    authApi
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
        setStatus('error');
      });
  }, [token]);

  return (
    <div className="page--narrow">
      <h1>Verify email</h1>

      {status === 'verifying' && <p>Verifying…</p>}

      {status === 'success' && (
        <>
          <p>Email verified.</p>
          <p className="form-footer">
            {sessionToken ? <Link to="/items">Go to your items</Link> : <Link to="/login">Sign in</Link>}
          </p>
        </>
      )}

      {status === 'error' && <p className="error-banner">{error}</p>}
    </div>
  );
}
