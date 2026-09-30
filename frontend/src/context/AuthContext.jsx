/**
 * Global authentication state.
 *
 * On mount the app revalidates the stored token against `GET /api/auth/me`,
 * so a revoked or expired session cannot be revived by a stale localStorage
 * entry alone.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import api, { setUnauthorizedHandler } from '../lib/apiClient.js';
import { ROLE_HOME } from '../lib/roles.js';
import { clearToken, getToken, setToken } from '../lib/tokenStore.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous

  /** Pull the canonical user document from the API. */
  const loadUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setStatus('anonymous');
      return null;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      setStatus('authenticated');
      return data.user;
    } catch {
      clearToken();
      setUser(null);
      setStatus('anonymous');
      return null;
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // A 401 from anywhere in the app tears down the session once, globally.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('anonymous');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const { data } = await api.post('/auth/login', { email, password });
    setToken(data.token);
    setUser(data.user);
    setStatus('authenticated');
    return { user: data.user, home: data.home ?? ROLE_HOME[data.user.role] ?? '/dashboard' };
  }, []);

  const logout = useCallback(() => {
    // Best-effort server acknowledgement; the token is stateless either way.
    api.post('/auth/logout').catch(() => {});
    clearToken();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const { data } = await api.patch('/auth/profile', payload);
    setUser(data.user);
    return data.user;
  }, []);

  const changePassword = useCallback(async ({ currentPassword, newPassword }) => {
    const { data } = await api.post('/auth/change-password', { currentPassword, newPassword });
    if (data.token) setToken(data.token); // keep the current session alive
    return data;
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      isLoading: status === 'loading',
      isAuthenticated: status === 'authenticated',
      home: user ? (ROLE_HOME[user.role] ?? '/dashboard') : '/login',
      login,
      logout,
      refresh: loadUser,
      updateProfile,
      changePassword,
    }),
    [user, status, login, logout, loadUser, updateProfile, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Consume the auth context. Throws if used outside <AuthProvider>. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an <AuthProvider>');
  return ctx;
}
