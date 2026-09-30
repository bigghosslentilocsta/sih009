/**
 * Browser-side token storage.
 *
 * Note: `localStorage` is XSS-readable. For a higher-assurance deployment
 * move this to httpOnly refresh cookies + short-lived access tokens; the
 * backend is already structured for that (stateless JWT, no server session).
 */

const TOKEN_KEY = 'sih26009.token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing / storage disabled - session stays in memory only */
  }
};

export const clearToken = () => setToken(null);
