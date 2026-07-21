import { Server } from 'socket.io';
import { verifyToken } from './jwt.js';
import logger from './logger.js';

let io = null;

// Rooms used:
//   slot:<slotId>       - joined by anyone viewing a station/slot's bids
//                         (intentionally public — see bid.routes.js)
//   station:<stationId> - joined by the owning station-owner's dashboard
//   user:<userId>       - joined SERVER-SIDE on connection for a logged-in
//                         user's own session, for booking/payment/auction
//                         notifications addressed to them. This used to be
//                         client-driven (a `join:user` event carrying
//                         whatever id the client sent) with no verification
//                         at all — any script could join any other user's
//                         notification room. Now it's derived from a
//                         server-verified JWT during the handshake instead.
export function initSocket(httpServer, corsOrigins) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
  });

  // A connection with no token, or an invalid/expired one, still connects —
  // anonymous station/slot browsing must keep working — it just never joins
  // a user room.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        socket.userId = verifyToken(token).id;
      } catch (err) {
        logger.debug(
          'Socket handshake token invalid/expired — connecting anonymously:',
          err.message
        );
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    if (socket.userId) socket.join(`user:${socket.userId}`);

    socket.on('join:slot', (slotId) => {
      if (slotId) socket.join(`slot:${slotId}`);
    });
    socket.on('leave:slot', (slotId) => {
      if (slotId) socket.leave(`slot:${slotId}`);
    });
    socket.on('join:station', (stationId) => {
      if (stationId) socket.join(`station:${stationId}`);
    });
    socket.on('leave:station', (stationId) => {
      if (stationId) socket.leave(`station:${stationId}`);
    });
  });

  return io;
}

// Controllers import this instead of the raw `io` variable so they never
// crash if sockets haven't been initialized yet (e.g. in a test harness).
export function getIO() {
  return io;
}
