import { apiRequest } from './client';
import type { AuthResponse, MeResponse } from './types';

export interface SignupRequest {
  email: string;
  password: string;
  displayName?: string;
  /** Version string of the Terms of Service the user accepted, e.g. '2026-09-05'. */
  tosVersion?: string;
}

export function signup(req: SignupRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/v1/auth/signup', {
    method: 'POST',
    body: req,
  });
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/v1/auth/google', {
    method: 'POST',
    body: { idToken },
  });
}

export function fetchMe(token: string): Promise<MeResponse> {
  return apiRequest<MeResponse>('/v1/auth/me', { token });
}

export function logout(token: string): Promise<{ status: string }> {
  return apiRequest<{ status: string }>('/v1/auth/logout', { method: 'POST', token });
}

export function forgotPassword(email: string): Promise<{ status: string }> {
  return apiRequest<{ status: string }>('/v1/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
}

export function resetPassword(token: string, password: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/v1/auth/reset-password', {
    method: 'POST',
    body: { token, password },
  });
}

export function verifyEmail(token: string): Promise<{ status: string }> {
  return apiRequest<{ status: string }>('/v1/auth/verify-email', {
    method: 'POST',
    body: { token },
  });
}
