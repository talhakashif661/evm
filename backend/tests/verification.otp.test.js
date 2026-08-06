/**
 * Email verification (OTP) — the happy path, plus the failure modes that
 * gate it.
 *
 * The existing suites covered OTP *validation* errors but never a code that
 * actually works, which left the single most important branch — "correct
 * code flips isVerified to true" — unasserted. Since KYC gates booking and
 * station listing, a regression there silently locks every new user out of
 * the product.
 *
 * The OTP is stored as a sha256 hash, never in plaintext, so the test can't
 * read the emitted code back out. Two approaches are used deliberately:
 *   - send-otp is asserted on its *effect* (a hash + expiry get written),
 *     which exercises real generation/hashing/storage.
 *   - verify-otp is driven by planting a known hash, which is the only way
 *     to reach the success branch without weakening the hashing itself.
 */
import { jest } from '@jest/globals';
import crypto from 'crypto';
import request from 'supertest';

process.env.JWT_SECRET = 'otp-test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';
// Never call SMTP over the network in this suite.
delete process.env.SMTP_HOST;
delete process.env.SMTP_PORT;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.EMAIL_FROM;

const { createInMemoryPrisma } = await import('./helpers/inMemoryPrisma.js');
const mockPrisma = createInMemoryPrisma();
const sendEmailMock = jest.fn().mockResolvedValue({
  success: true,
  messageId: 'test-message-id',
});

jest.unstable_mockModule('../utils/prisma.js', () => ({ default: mockPrisma }));
jest.unstable_mockModule('../utils/email.js', () => ({
  sendEmail: sendEmailMock,
  emailTemplates: {
    welcome: () => ({ subject: 'Welcome', html: '<p>Welcome</p>' }),
  },
}));

const { default: app } = await import('../app.js');

const api = () => request(app);
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

let token;
let userId;

beforeAll(async () => {
  const res = await api().post('/api/auth/register').send({
    name: 'Ayesha Khan',
    email: 'ayesha.otp@example.pk',
    password: 'Str0ng!pass',
    role: 'EV_USER',
  });
  expect(res.status).toBe(201);
  token = res.body.data.token;
  userId = res.body.data.user.id;
});

/** Current DB row for the test user. */
const row = () => mockPrisma.user.findUnique({ where: { id: userId } });

/** Put the account back to "unverified, no code pending, no cooldown". */
async function resetVerificationState() {
  await mockPrisma.user.update({
    where: { id: userId },
    data: {
      isVerified: false,
      verifiedAt: null,
      verificationOtpHash: null,
      verificationOtpExpiry: null,
      verificationAttempts: 0,
      verificationBlockedUntil: null,
      lastOtpSentAt: null,
    },
  });
}

describe('POST /api/auth/send-otp', () => {
  beforeEach(resetVerificationState);

  it('requires authentication', async () => {
    const res = await api().post('/api/auth/send-otp').send({});
    expect(res.status).toBe(401);
  });

  it('stores a hashed code with a future expiry — never the plaintext', async () => {
    const res = await api().post('/api/auth/send-otp').set(auth(token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const user = await row();
    expect(user.verificationOtpHash).toMatch(/^[a-f0-9]{64}$/);
    expect(new Date(user.verificationOtpExpiry).getTime()).toBeGreaterThan(Date.now());
    // A 6-digit code would be 6 chars; a 64-char hex digest proves it was
    // hashed on the way in rather than parked in the column as-is.
    expect(user.verificationOtpHash).not.toMatch(/^\d{6}$/);
  });

  it('reports delivery failure and clears the unusable code and cooldown', async () => {
    sendEmailMock.mockResolvedValueOnce({ success: false, error: 'Sender is not verified' });

    const res = await api().post('/api/auth/send-otp').set(auth(token)).send({});

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('EMAIL_DELIVERY_FAILED');
    const user = await row();
    expect(user.verificationOtpHash).toBeNull();
    expect(user.verificationOtpExpiry).toBeNull();
    expect(user.lastOtpSentAt).toBeNull();
  });

  it('rejects an immediate second request with a cooldown', async () => {
    await api().post('/api/auth/send-otp').set(auth(token)).send({});
    const res = await api().post('/api/auth/send-otp').set(auth(token)).send({});
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('RESEND_COOLDOWN');
  });

  it('refuses to send once the account is already verified', async () => {
    await mockPrisma.user.update({ where: { id: userId }, data: { isVerified: true } });
    const res = await api().post('/api/auth/send-otp').set(auth(token)).send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/verify-otp', () => {
  const CODE = '135790';

  beforeEach(async () => {
    await resetVerificationState();
    await mockPrisma.user.update({
      where: { id: userId },
      data: {
        verificationOtpHash: sha256(CODE),
        verificationOtpExpiry: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
  });

  it('verifies the account when the code is correct', async () => {
    const res = await api().post('/api/auth/verify-otp').set(auth(token)).send({ otp: CODE });

    expect(res.status).toBe(200);
    expect(res.body.data.isVerified).toBe(true);

    const user = await row();
    expect(user.isVerified).toBe(true);
    expect(user.verifiedAt).toBeTruthy();
  });

  it('clears the stored code after a successful verification', async () => {
    await api().post('/api/auth/verify-otp').set(auth(token)).send({ otp: CODE });
    const user = await row();
    // Leaving the hash behind would let the same code be replayed later.
    expect(user.verificationOtpHash).toBeNull();
    expect(user.verificationOtpExpiry).toBeNull();
  });

  it('rejects a wrong code without verifying the account', async () => {
    const res = await api().post('/api/auth/verify-otp').set(auth(token)).send({ otp: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('OTP_INVALID');
    expect((await row()).isVerified).toBe(false);
  });

  it('rejects an expired code even when the digits are right', async () => {
    await mockPrisma.user.update({
      where: { id: userId },
      data: { verificationOtpExpiry: new Date(Date.now() - 60 * 1000) },
    });

    const res = await api().post('/api/auth/verify-otp').set(auth(token)).send({ otp: CODE });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('OTP_EXPIRED');
    expect((await row()).isVerified).toBe(false);
  });

  it('rejects a request with no code at all', async () => {
    const res = await api().post('/api/auth/verify-otp').set(auth(token)).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('OTP_REQUIRED');
  });

  it('reports NO_OTP_PENDING when nothing was ever sent', async () => {
    await resetVerificationState();
    const res = await api().post('/api/auth/verify-otp').set(auth(token)).send({ otp: CODE });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('NO_OTP_PENDING');
  });
});

describe('GET /api/auth/verification-status', () => {
  it('requires authentication', async () => {
    const res = await api().get('/api/auth/verification-status');
    expect(res.status).toBe(401);
  });

  it('reflects the account state', async () => {
    await resetVerificationState();
    const before = await api().get('/api/auth/verification-status').set(auth(token));
    expect(before.status).toBe(200);
    expect(before.body.data.isVerified).toBe(false);

    await mockPrisma.user.update({ where: { id: userId }, data: { isVerified: true } });

    const after = await api().get('/api/auth/verification-status').set(auth(token));
    expect(after.body.data.isVerified).toBe(true);
  });
});
