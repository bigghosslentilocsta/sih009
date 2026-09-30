/**
 * Axios instance shared by the whole app.
 *  - attaches the JWT to every request
 *  - normalises backend error shapes into `error.userMessage`
 *  - notifies subscribers when the session is rejected
 */

import axios from 'axios';

import { clearToken, getToken } from './tokenStore.js';

// Empty baseURL -> same origin, which the Vite dev proxy forwards to :5000.
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({ baseURL, headers: { 'Content-Type': 'application/json' } });

/** Registered by AuthContext so a 401 can force a global sign-out. */
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data;

    // Surface the server's validation map, otherwise a readable message.
    error.userMessage =
      data?.message ??
      data?.error ??
      (error.code === 'ERR_NETWORK'
        ? 'Cannot reach the API. Is the backend running on port 5000?'
        : 'Something went wrong. Please try again.');

    if (status === 401) {
      clearToken();
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

export default api;
