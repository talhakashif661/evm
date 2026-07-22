/**
 * Socket.IO — real delivery to a real connected client.
 *
 * This was the last "present but unverified" area. Everything else in the
 * suite runs against the Express app in-process; sockets can't be tested
 * that way, so this file starts an actual HTTP server on an ephemeral port
 * and connects genuine socket.io-client instances over the loopback
 * interface. It is the only suite here that opens a port.
 *
 * The security property being pinned down matters more than the plumbing:
 * `user:<id>` rooms are joined SERVER-side from a verified JWT during the
 * handshake. An earlier version let the client send `join:user` with any id
 * it liked, which meant any script could subscribe to a stranger's booking
 * and payment notifications. A test that only checked "a message arrives"
 * would have passed against that broken version too — so the assertions
 * below deliberately include the negative case: a client holding user A's
 * token must NOT receive user B's notifications.
 */
import { jest } from '@jest/globals';
import http from 'http';
import { io as ioClient } from 'socket.io-client';

process.env.JWT_SECRET = 'socket-test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

const { createInMemoryPrisma } = await import('./helpers/inMemoryPrisma.js');
const mockPrisma = createInMemoryPrisma();
jest.unstable_mockModule('../utils/prisma.js', () => ({ default: mockPrisma }));

const { initSocket, getIO } = await import('../utils/socket.js');
const { generateToken } = await import('../utils/jwt.js');

let server;
let port;
const openClients = [];

/** Connect a client and resolve once it's actually connected. */
function connect(auth = {}) {
  const socket = ioClient(`http://localhost:${port}`, {
    auth,
    transports: ['websocket'],
    reconnection: false,
  });
  openClients.push(socket);
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

/**
 * Resolve with the first `event` payload, or resolve with null after `ms`.
 *
 * Resolving-on-timeout rather than rejecting is what makes the negative
 * tests readable: "expected null" states the security requirement directly,
 * instead of dressing it up as a caught error.
 */
function nextEvent(socket, event, ms = 400) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Wait for a client's join/leave to be applied on the server. */
const settle = () => new Promise((r) => setTimeout(r, 60));

beforeAll(async () => {
  server = http.createServer();
  initSocket(server, ['http://localhost:3000']);
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
});

afterAll(async () => {
  openClients.forEach((s) => s.disconnect());
  const io = getIO();
  if (io) await new Promise((resolve) => io.close(resolve));
  await new Promise((resolve) => server.close(resolve));
});

describe('handshake', () => {
  it('accepts an anonymous connection — public station browsing must work', async () => {
    const socket = await connect();
    expect(socket.connected).toBe(true);
  });

  it('still connects when the token is garbage, just without a user room', async () => {
    // A hard rejection here would log out every user with a stale tab open,
    // rather than degrading them to anonymous browsing.
    const socket = await connect({ token: 'not-a-real-jwt' });
    expect(socket.connected).toBe(true);
  });
});

describe('slot rooms — live bid updates', () => {
  it('delivers a bid update to a client watching that slot', async () => {
    const socket = await connect();
    socket.emit('join:slot', 'slot-abc');
    await settle();

    const received = nextEvent(socket, 'bid:new');
    getIO().to('slot:slot-abc').emit('bid:new', { amount: 450 });

    expect(await received).toEqual({ amount: 450 });
  });

  it('does not deliver another slot’s bids', async () => {
    const socket = await connect();
    socket.emit('join:slot', 'slot-abc');
    await settle();

    const received = nextEvent(socket, 'bid:new');
    getIO().to('slot:slot-xyz').emit('bid:new', { amount: 999 });

    expect(await received).toBeNull();
  });

  it('stops delivering after the client leaves the slot', async () => {
    const socket = await connect();
    socket.emit('join:slot', 'slot-abc');
    await settle();
    socket.emit('leave:slot', 'slot-abc');
    await settle();

    const received = nextEvent(socket, 'bid:new');
    getIO().to('slot:slot-abc').emit('bid:new', { amount: 10 });

    expect(await received).toBeNull();
  });

  it('fans a single emit out to every client watching the slot', async () => {
    const a = await connect();
    const b = await connect();
    a.emit('join:slot', 'slot-shared');
    b.emit('join:slot', 'slot-shared');
    await settle();

    const both = Promise.all([nextEvent(a, 'auction:closed'), nextEvent(b, 'auction:closed')]);
    getIO().to('slot:slot-shared').emit('auction:closed', { winnerId: 'u1' });

    expect(await both).toEqual([{ winnerId: 'u1' }, { winnerId: 'u1' }]);
  });
});

describe('user rooms — private notifications', () => {
  const userA = '507f1f77bcf86cd799439011';
  const userB = '507f1f77bcf86cd799439012';

  it('joins the authenticated user’s own room without the client asking', async () => {
    const socket = await connect({ token: generateToken({ id: userA, role: 'EV_USER' }) });
    await settle();

    const received = nextEvent(socket, 'notification');
    getIO().to(`user:${userA}`).emit('notification', { message: 'Booking confirmed' });

    expect(await received).toEqual({ message: 'Booking confirmed' });
  });

  it('never delivers another user’s notifications', async () => {
    const socket = await connect({ token: generateToken({ id: userA, role: 'EV_USER' }) });
    await settle();

    const received = nextEvent(socket, 'notification');
    getIO().to(`user:${userB}`).emit('notification', { message: 'Private to B' });

    expect(await received).toBeNull();
  });

  it('ignores a client-supplied join:user attempt', async () => {
    // The old client-driven join is gone. If it were ever reintroduced, this
    // is the test that catches it: an anonymous socket asking to join user
    // B's room must get nothing.
    const socket = await connect();
    socket.emit('join:user', userB);
    await settle();

    const received = nextEvent(socket, 'notification');
    getIO().to(`user:${userB}`).emit('notification', { message: 'Private to B' });

    expect(await received).toBeNull();
  });

  it('gives an anonymous socket no user room at all', async () => {
    const socket = await connect();
    await settle();

    const received = nextEvent(socket, 'notification');
    getIO().to(`user:${userA}`).emit('notification', { message: 'For A' });

    expect(await received).toBeNull();
  });
});

describe('station rooms — owner dashboard', () => {
  it('delivers station events only to clients watching that station', async () => {
    const watching = await connect();
    const other = await connect();
    watching.emit('join:station', 'station-1');
    other.emit('join:station', 'station-2');
    await settle();

    const hit = nextEvent(watching, 'slot:updated');
    const miss = nextEvent(other, 'slot:updated');
    getIO().to('station:station-1').emit('slot:updated', { slotId: 's9' });

    expect(await hit).toEqual({ slotId: 's9' });
    expect(await miss).toBeNull();
  });
});
