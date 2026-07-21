import { io } from 'socket.io-client';

// Mirror api.js: VITE_API_URL is the backend's absolute URL in production, and
// unset in dev (falls back to the relative '/api'). Socket.IO connects to the
// server *root*, not the /api path, so strip the trailing /api. For an absolute
// URL that yields the backend host; for the relative '/api' it yields '' —
// which we turn into undefined so Socket.IO connects to the current page origin
// and the Vite /socket.io proxy forwards it to the backend.
const API_BASE = import.meta.env.VITE_API_URL || '/api';
const SOCKET_URL = API_BASE.replace(/\/api\/?$/, '') || undefined;

let socket = null;

// Lazily create a single shared socket connection the first time anything
// asks for it, instead of every component opening its own. The JWT is sent
// on the handshake (not a client-emitted event afterward) so the server can
// verify it and auto-join this user's own notification room itself — see
// backend/utils/socket.js.
export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: { token: localStorage.getItem('ev_token') || undefined },
    });
  }
  return socket;
}

// The socket is a lazy singleton that may have been created before the user
// logged in (or as a different user, in a long-lived tab). Call this right
// after login/logout so it re-handshakes with the current token instead of
// silently staying authenticated as whoever was logged in when it was first
// opened (or staying anonymous after a login that happened with no refresh).
export function reauthSocket() {
  if (!socket) return;
  socket.auth = { token: localStorage.getItem('ev_token') || undefined };
  socket.disconnect();
  socket.connect();
}
