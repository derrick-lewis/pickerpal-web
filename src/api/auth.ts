import { apiRequest } from './client';
import type { AuthResponse, MeResponse } from './types';

export function signup(email: string, password: string, displayName?: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/v1/auth/signup', {
    method: 'POST',
    body: { email, password, displayName },
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
