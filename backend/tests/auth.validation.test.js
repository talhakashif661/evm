import request from 'supertest';
import app from '../app.js';

// These tests only exercise the express-validator rules wired up in
// routes/auth.routes.js. They deliberately never reach Prisma/MongoDB, so
// they run anywhere without a database connection or seeded data — useful
// as a fast first line of defense in CI before slower integration tests.
describe('POST /api/auth/register — validation', () => {
  it('rejects a missing email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Jane Doe', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects a password under 6 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Jane Doe', email: 'jane@example.com', password: '123' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid role', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'password123',
        role: 'ADMIN',
      });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login — validation', () => {
  it('rejects a malformed email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'whatever' });
    expect(res.status).toBe(400);
  });

  it('rejects a missing password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'jane@example.com' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/setup-admin — key protection', () => {
  it('refuses without the setup key', async () => {
    const res = await request(app)
      .post('/api/auth/setup-admin')
      .send({ name: 'Admin', email: 'admin@example.com', password: 'password123' });
    expect(res.status).toBe(403);
  });

  it('refuses with the wrong setup key', async () => {
    const res = await request(app)
      .post('/api/auth/setup-admin')
      .set('x-setup-key', 'definitely-wrong')
      .send({ name: 'Admin', email: 'admin@example.com', password: 'password123' });
    expect(res.status).toBe(403);
  });
});

describe('GET /health', () => {
  it('responds OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});
