import { jest } from '@jest/globals';
import request from 'supertest';

// See auth.validation.test.js for why this mocks Prisma before importing
// app.js — same reasoning applies here.
process.env.NODE_ENV = 'test';

const { createInMemoryPrisma } = await import('./helpers/inMemoryPrisma.js');
const mockPrisma = createInMemoryPrisma();

jest.unstable_mockModule('../utils/prisma.js', () => ({ default: mockPrisma }));

const { default: app } = await import('../app.js');

// Booking/bid creation both sit behind `authenticate`, which runs before the
// route's own express-validator rules. Without a valid JWT it short-circuits
// to 401 before ever touching Prisma/MongoDB, so these are safe to run with
// no database connection. Testing the validators themselves (missing evId,
// negative bid amount, etc.) needs a real logged-in user — see
// tests/README.md for how to run those as integration tests against a
// seeded test database.
describe('POST /api/bookings — auth guard', () => {
  it('rejects requests with no token', async () => {
    const res = await request(app).post('/api/bookings').send({});
    expect(res.status).toBe(401);
  });

  it('rejects requests with a garbage token', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({});
    expect(res.status).toBe(401);
  });
});

describe('POST /api/bids — auth guard', () => {
  it('rejects requests with no token', async () => {
    const res = await request(app).post('/api/bids').send({});
    expect(res.status).toBe(401);
  });
});

describe('GET /api/bids/slot/:slotId — public read', () => {
  it('does not require auth (bid transparency is intentionally public)', async () => {
    const res = await request(app).get('/api/bids/slot/000000000000000000000000');
    // No DB in this test run, so this may 200 with [] or error depending on
    // environment — the point of this test is just that it does NOT 401.
    expect(res.status).not.toBe(401);
  });
});
