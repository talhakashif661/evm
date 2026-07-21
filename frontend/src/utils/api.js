import axios from 'axios';

// In production, VITE_API_URL is the deployed backend's absolute URL. In local
// dev, leave it unset: the base falls back to the relative '/api', which the
// Vite dev-server proxy (see vite.config.js) forwards to the backend on :5000 —
// so no CORS and no hardcoded localhost URL in the client.
const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('ev_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 as "session expired", EXCEPT when the
// 401 came from the login call itself — that's just a wrong password, not
// an expired session, and treating it the same used to wipe localStorage
// and force a jarring full-page redirect while someone was simply retyping
// their password on the login page.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('ev_token');
      localStorage.removeItem('ev_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
