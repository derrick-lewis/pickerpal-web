import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="page--narrow">
        <h1>Check your email</h1>
        <p>If an account exists for that address, we&rsquo;ve sent a reset link.</p>
        <p className="form-footer">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page--narrow">
      <h1>Forgot password</h1>

      {error && <p className="error-banner">{error}</p>}

      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="form-footer">
        Remembered your password? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
