/**
 * /health endpoint — added as part of Phase 8.3 (Deployment Preparation).
 *
 * The route previously returned 200 unconditionally, which only proved the
 * Express process was up, not that the app could actually serve a request.
 * These tests confirm the upgraded version does a real check: it queries the
 * database and reflects the result in both the HTTP status and payload,
 * using the same mock-Prisma-swap pattern as e2e.smoke.test.js.
 */
import { jest } from '@jest/globals';
import request from 'supertest';

process.env.NODE_ENV = 'test';

const { createInMemoryPrisma } = await import('./helpers/inMemoryPrisma.js');
const mockPrisma = createInMemoryPrisma();

jest.unstable_mockModule('../utils/prisma.js', () => ({ default: mockPrisma }));

const { default: app } = await import('../app.js');

const api = () => request(app);

describe('GET /health', () => {
  it('returns 200 and status OK when the database is reachable', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body.database).toBe('connected');
    expect(res.body.timestamp).toBeTruthy();
  });

  it('returns 503 and status ERROR when the database is unreachable', async () => {
    const original = mockPrisma.$queryRaw;
    mockPrisma.$queryRaw = async () => {
      throw new Error('connection refused');
    };

    const res = await api().get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('ERROR');
    expect(res.body.database).toBe('disconnected');

    mockPrisma.$queryRaw = original; // restore so this file's tests stay order-independent
  });

  it('is not rate-limited by the /api limiter (lives outside the /api prefix)', async () => {
    // apiLimiter caps most /api routes at 300 req/15min; /health is polled far
    // more often than that by uptime monitors and PaaS health checks, so it
    // must not share that budget. 20 rapid requests should all still succeed.
    const results = await Promise.all(Array.from({ length: 20 }, () => api().get('/health')));
    expect(results.every((r) => r.status === 200)).toBe(true);
  });
});
