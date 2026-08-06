/**
 * End-to-end smoke test — the whole product flow with NO database.
 *
 * utils/prisma.js is swapped for the in-memory client (tests/helpers), so the
 * REAL Express app, real routes, real middleware, real controllers, and real
 * bcrypt/JWT run end to end:
 *
 *   admin bootstrap (POST /api/auth/setup-admin) → register EV user + station
 *   owner → login all three roles → role guards → station approval → slots →
 *   time-window bookings incl. overlap rejection → check-in locks in cost →
 *   a locally-signed fake Stripe webhook event pays it exactly once (retried
 *   delivery is a no-op) → payment history → auction (owner-bid block,
 *   priority, close → winner booking → the SAME check-in/webhook/complete
 *   path proves out for auction wins too) → admin audit log → login-response
 *   leak check.
 *
 * The webhook tests never call the real Stripe API (no network, no real key
 * needed) — they use the installed `stripe` package's own local
 * `generateTestHeaderString` helper to produce a validly-signed event, the
 * same way `stripe.webhooks.constructEvent` verifies real ones.
 */
import { jest } from '@jest/globals';
import request from 'supertest';
import stripe from '../utils/stripe.js';

process.env.JWT_SECRET = 'e2e-test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.ADMIN_SETUP_KEY = 'e2e-setup-key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_e2e_test_secret';
process.env.NODE_ENV = 'test';
// Leave SMTP unset so sendEmail() takes its no-config short-circuit instead
// of making a real network call during tests.
delete process.env.SMTP_HOST;
delete process.env.SMTP_PORT;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.EMAIL_FROM;

const { createInMemoryPrisma } = await import('./helpers/inMemoryPrisma.js');
const mockPrisma = createInMemoryPrisma();

jest.unstable_mockModule('../utils/prisma.js', () => ({ default: mockPrisma }));

const { default: app } = await import('../app.js');

const api = () => request(app);
const auth = (token) => ({ Authorization: `Bearer ${token}` });

// stripe.refunds.create is a real network call (unlike webhooks.constructEvent,
// which verifies purely locally) — mocked so the emergency-stop refund path
// can be exercised without a live key, same "no network" guarantee as above.
const refundSpy = jest.spyOn(stripe.refunds, 'create').mockResolvedValue({ id: 're_test_1' });

// Builds a validly-signed fake Stripe webhook request body + signature for
// a payment_intent.succeeded event, entirely locally (no network call).
function fakeSucceededWebhook(bookingId, intentId) {
  const payloadString = JSON.stringify({
    id: `evt_test_${intentId}`,
    type: 'payment_intent.succeeded',
    data: { object: { id: intentId, metadata: { bookingId } } },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: payloadString,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
    timestamp: Math.floor(Date.now() / 1000),
  });
  return { payloadString, signature };
}

async function postWebhook(payloadString, signature) {
  return api()
    .post('/api/payments/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', signature)
    .send(payloadString);
}

let adminToken, ownerToken, evToken, ev2Token;
let stationId, slot1Id, slot2Id, evId, ev2Id, booking1Id, auctionBookingId;

describe('E2E: admin bootstrap via POST /api/auth/setup-admin', () => {
  it('refuses the wrong key', async () => {
    const res = await api()
      .post('/api/auth/setup-admin')
      .set('x-setup-key', 'wrong')
      .send({ name: 'Root', email: 'admin@chargeev.pk', password: 'admin123' });
    expect(res.status).toBe(403);
  });

  it('creates the first admin with the correct key', async () => {
    const res = await api()
      .post('/api/auth/setup-admin')
      .set('x-setup-key', 'e2e-setup-key')
      .send({ name: 'Root Admin', email: 'admin@chargeev.pk', password: 'admin123' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('ADMIN');
    expect(res.body.data.user.isVerified).toBe(true);
    adminToken = res.body.data.token;
  });

  it('refuses to run a second time once an admin exists', async () => {
    const res = await api()
      .post('/api/auth/setup-admin')
      .set('x-setup-key', 'e2e-setup-key')
      .send({ name: 'Evil Twin', email: 'admin2@chargeev.pk', password: 'admin123' });
    expect(res.status).toBe(409);
  });
});

describe('E2E: registration + login for every role', () => {
  it('registers an EV user and a station owner', async () => {
    const r1 = await api()
      .post('/api/auth/register')
      .send({ name: 'Eva Driver', email: 'eva@x.pk', password: 'secret1', role: 'EV_USER' });
    expect(r1.status).toBe(201);
    evToken = r1.body.data.token;

    const r2 = await api()
      .post('/api/auth/register')
      .send({ name: 'Omar Owner', email: 'omar@x.pk', password: 'secret1', role: 'STATION_OWNER' });
    expect(r2.status).toBe(201);
    ownerToken = r2.body.data.token;

    const r3 = await api()
      .post('/api/auth/register')
      .send({ name: 'Zed Second', email: 'zed@x.pk', password: 'secret1', role: 'EV_USER' });
    expect(r3.status).toBe(201);
    ev2Token = r3.body.data.token;
  });

  it('rejects registering directly as ADMIN', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Sneaky', email: 'sneak@x.pk', password: 'secret1', role: 'ADMIN' });
    expect(res.status).toBe(400);
  });

  it('rejects a wrong password on login', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'eva@x.pk', password: 'nope99' });
    expect(res.status).toBe(401);
  });

  it('logs in the EV user — and never leaks internal hashes (security regression test)', async () => {
    // Plant internal secrets on the row; the login response must not echo them.
    await mockPrisma.user.update({
      where: { email: 'eva@x.pk' },
      data: { verificationOtpHash: 'deadbeef', resetTokenHash: 'cafebabe' },
    });
    const res = await api()
      .post('/api/auth/login')
      .send({ email: 'eva@x.pk', password: 'secret1' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('EV_USER');
    expect(res.body.data.user).not.toHaveProperty('password');
    expect(res.body.data.user).not.toHaveProperty('verificationOtpHash');
    expect(res.body.data.user).not.toHaveProperty('resetTokenHash');
    expect(res.body.data.user).not.toHaveProperty('resetTokenExpiry');
    evToken = res.body.data.token;
  });

  it('logs in the admin (the account created via Postman-style POST)', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: 'admin@chargeev.pk', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('ADMIN');
    adminToken = res.body.data.token;
  });
});

describe('E2E: role guards', () => {
  it('EV user cannot access admin routes', async () => {
    const res = await api().get('/api/admin/users').set(auth(evToken));
    expect(res.status).toBe(403);
  });
  it('station owner cannot manage EVs (EV_USER-only routes)', async () => {
    const res = await api()
      .post('/api/evs')
      .set(auth(ownerToken))
      .send({ model: 'X', batteryCapacity: 50 });
    expect(res.status).toBe(403);
  });
  it('EV user cannot add slots (STATION_OWNER-only routes)', async () => {
    const res = await api()
      .post('/api/slots')
      .set(auth(evToken))
      .send({ slotNumber: 1, powerKw: 22 });
    expect(res.status).toBe(403);
  });
  it('unverified users are blocked from booking (KYC gate)', async () => {
    const res = await api()
      .post('/api/bookings')
      .set(auth(evToken))
      .send({ slotId: '0'.repeat(24), evId: '0'.repeat(24), startTime: new Date().toISOString() });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('E2E: station lifecycle (owner creates → admin approves)', () => {
  it('verified owner creates a station (PENDING)', async () => {
    // Simulate completed email verification for the three non-admin users.
    for (const email of ['eva@x.pk', 'omar@x.pk', 'zed@x.pk']) {
      await mockPrisma.user.update({ where: { email }, data: { isVerified: true } });
    }
    const res = await api().post('/api/stations').set(auth(ownerToken)).send({
      name: 'GreenVolt Gulberg',
      address: '12 Main Blvd',
      city: 'Lahore',
      latitude: 31.5204,
      longitude: 74.3587,
      pricePerKwh: 0.18,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    stationId = res.body.data.id;
  });

  it('owner cannot add slots before approval', async () => {
    const res = await api()
      .post('/api/slots')
      .set(auth(ownerToken))
      .send({ slotNumber: 1, powerKw: 22 });
    expect(res.status).toBe(400);
  });

  it('admin approves the station (and it is audited)', async () => {
    const res = await api()
      .patch(`/api/admin/stations/${stationId}/status`)
      .set(auth(adminToken))
      .send({ action: 'APPROVED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('after approval, an address/price change is queued for admin review instead of applying instantly', async () => {
    const res = await api()
      .put('/api/stations/owner/mine')
      .set(auth(ownerToken))
      .send({
        name: 'GreenVolt Gulberg',
        address: '99 New Blvd',
        city: 'Lahore',
        latitude: 31.6,
        longitude: 74.4,
        pricePerKwh: 0.25,
        amenities: [],
        images: [],
      });
    expect(res.status).toBe(200);
    // The live station is untouched — still the original address/price.
    expect(res.body.data.address).toBe('12 Main Blvd');
    expect(res.body.data.pricePerKwh).toBeCloseTo(0.18, 2);
    expect(res.body.pendingRequest).toBeTruthy();
    expect(res.body.pendingRequest.status).toBe('PENDING');
    expect(res.body.pendingRequest.address).toBe('99 New Blvd');
    expect(res.body.pendingRequest.pricePerKwh).toBeCloseTo(0.25, 2);
  });

  it('the owner sees the pending request on their own station', async () => {
    const res = await api().get('/api/stations/owner/mine').set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.updateRequests).toHaveLength(1);
    expect(res.body.data.updateRequests[0].status).toBe('PENDING');
  });

  it('a non-owner cannot review station update requests', async () => {
    const res = await api().get('/api/admin/station-requests').set(auth(ownerToken));
    expect(res.status).toBe(403);
  });

  it('admin sees and approves the pending request, which then applies to the live station', async () => {
    const list = await api().get('/api/admin/station-requests').set(auth(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    const requestId = list.body.data[0].id;
    expect(list.body.data[0].station.name).toBe('GreenVolt Gulberg');

    const approve = await api()
      .patch(`/api/admin/station-requests/${requestId}`)
      .set(auth(adminToken))
      .send({ action: 'APPROVED' });
    expect(approve.status).toBe(200);

    const station = await mockPrisma.chargingStation.findUnique({ where: { id: stationId } });
    expect(station.address).toBe('99 New Blvd');
    expect(station.pricePerKwh).toBeCloseTo(0.25, 2);

    // Already-reviewed requests can't be reviewed again.
    const again = await api()
      .patch(`/api/admin/station-requests/${requestId}`)
      .set(auth(adminToken))
      .send({ action: 'REJECTED' });
    expect(again.status).toBe(409);

    // Restore the original address/price — later tests in this file
    // (check-in cost, payment amount) are pinned to the original
    // 0.18/kWh rate, so this scenario can't leave it changed.
    const revert = await api()
      .put('/api/stations/owner/mine')
      .set(auth(ownerToken))
      .send({ address: '12 Main Blvd', city: 'Lahore', latitude: 31.5204, longitude: 74.3587, pricePerKwh: 0.18 });
    expect(revert.body.pendingRequest).toBeTruthy();
    const revertId = revert.body.pendingRequest.id;
    const revertApprove = await api()
      .patch(`/api/admin/station-requests/${revertId}`)
      .set(auth(adminToken))
      .send({ action: 'APPROVED' });
    expect(revertApprove.status).toBe(200);
    const restored = await mockPrisma.chargingStation.findUnique({ where: { id: stationId } });
    expect(restored.address).toBe('12 Main Blvd');
    expect(restored.pricePerKwh).toBeCloseTo(0.18, 2);
  });

  it('amenities changes still apply directly, with no approval needed', async () => {
    // Deliberately doesn't touch name/address/price — this only proves the
    // still-directly-editable fields aren't gated, without disturbing the
    // station name/address later tests in this file assert against.
    const res = await api()
      .put('/api/stations/owner/mine')
      .set(auth(ownerToken))
      .send({ amenities: ['WiFi'], images: [] });
    expect(res.status).toBe(200);
    expect(res.body.data.amenities).toEqual(['WiFi']);
    expect(res.body.pendingRequest).toBeNull();
  });

  it('owner adds two slots after approval', async () => {
    const s1 = await api()
      .post('/api/slots')
      .set(auth(ownerToken))
      .send({ slotNumber: 1, powerKw: 22 });
    expect(s1.status).toBe(201);
    slot1Id = s1.body.data.id;
    const s2 = await api()
      .post('/api/slots')
      .set(auth(ownerToken))
      .send({ slotNumber: 2, powerKw: 50 });
    expect(s2.status).toBe(201);
    slot2Id = s2.body.data.id;
  });
});

describe('E2E: time-window bookings + overlap detection', () => {
  it('EV users register their EVs', async () => {
    const r1 = await api()
      .post('/api/evs')
      .set(auth(evToken))
      .send({ model: 'Nissan Leaf', batteryCapacity: 40, batteryPercentage: 35 });
    expect(r1.status).toBe(201);
    evId = r1.body.data.id;
    const r2 = await api()
      .post('/api/evs')
      .set(auth(ev2Token))
      .send({ model: 'MG ZS EV', batteryCapacity: 50, batteryPercentage: 60 });
    expect(r2.status).toBe(201);
    ev2Id = r2.body.data.id;
  });

  it('rejects garbage battery capacity on EV creation (NaN regression test)', async () => {
    const res = await api()
      .post('/api/evs')
      .set(auth(evToken))
      .send({ model: 'Junk', batteryCapacity: 'abc' });
    expect(res.status).toBe(400);
  });

  it('books slot 1 for a 60-minute window starting now', async () => {
    const res = await api()
      .post('/api/bookings')
      .set(auth(evToken))
      .send({ slotId: slot1Id, evId, startTime: new Date().toISOString(), durationMinutes: 60 });
    expect(res.status).toBe(201);
    expect(res.body.data.plannedEndTime).toBeTruthy();
    booking1Id = res.body.data.id;
    // The active window flips the slot card to RESERVED
    const slot = await mockPrisma.slot.findUnique({ where: { id: slot1Id } });
    expect(slot.status).toBe('RESERVED');
  });

  it('REJECTS an overlapping window on the same slot (the new conflict check)', async () => {
    const inThirty = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const res = await api()
      .post('/api/bookings')
      .set(auth(ev2Token))
      .send({ slotId: slot1Id, evId: ev2Id, startTime: inThirty, durationMinutes: 60 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already booked/i);
  });

  it('ACCEPTS a non-overlapping later window on the same slot (multi-window booking)', async () => {
    const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const res = await api()
      .post('/api/bookings')
      .set(auth(ev2Token))
      .send({ slotId: slot1Id, evId: ev2Id, startTime: inTwoHours, durationMinutes: 60 });
    expect(res.status).toBe(201);
  });

  // Every other overlap test here is sequential (await A, then send B, so B
  // is checked against A's already-committed row) — that proves the
  // friendly pre-check works, but not the actual race the code's own
  // comment calls out: "the pre-check can still race... optimistically
  // INSERT, then re-query... deterministic on both sides, no lock needed."
  // Firing both requests at once with Promise.all is what actually
  // exercises that reconciliation path, not just the pre-check in front of it.
  it('two truly simultaneous requests for the SAME window on a slot — exactly one wins, not zero or two', async () => {
    const start = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(); // clear of slot2's other bookings
    const [resA, resB] = await Promise.all([
      api()
        .post('/api/bookings')
        .set(auth(evToken))
        .send({ slotId: slot2Id, evId, startTime: start, durationMinutes: 60 }),
      api()
        .post('/api/bookings')
        .set(auth(ev2Token))
        .send({ slotId: slot2Id, evId: ev2Id, startTime: start, durationMinutes: 60 }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]); // exactly one succeeds, the other is rejected — never both, never neither

    const survivors = await mockPrisma.booking.findMany({
      where: {
        slotId: slot2Id,
        startTime: new Date(start),
        status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'ACTIVE'] },
      },
    });
    expect(survivors.length).toBe(1); // the database itself has exactly one live booking for this window
  });

  it('rejects a start time in the past and an out-of-range duration', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const r1 = await api()
      .post('/api/bookings')
      .set(auth(ev2Token))
      .send({ slotId: slot2Id, evId: ev2Id, startTime: past, durationMinutes: 60 });
    expect(r1.status).toBe(400);
    const r2 = await api().post('/api/bookings').set(auth(ev2Token)).send({
      slotId: slot2Id,
      evId: ev2Id,
      startTime: new Date().toISOString(),
      durationMinutes: 5,
    });
    expect(r2.status).toBe(400);
  });
});

describe('E2E: check-in locks cost, webhook pays exactly once, then completion', () => {
  it('completeBooking rejects a booking that has not been paid yet (still CONFIRMED)', async () => {
    const res = await api().patch(`/api/bookings/${booking1Id}/complete`).set(auth(ownerToken));
    expect(res.status).toBe(400);
  });

  it('the customer checks in; totalCost locks in from the planned 1h window', async () => {
    const res = await api().patch(`/api/bookings/${booking1Id}/check-in`).set(auth(evToken));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CHECKED_IN');
    // 1h × 22kW × Rs. 0.18/kWh = Rs. 3.96 — locked in from the booked
    // duration, independent of when check-in/completion actually happen.
    expect(res.body.data.totalCost).toBeCloseTo(3.96, 1);
  });

  it('a fake (locally-signed) Stripe webhook event pays it exactly once', async () => {
    const { payloadString, signature } = fakeSucceededWebhook(booking1Id, 'pi_test_1');

    const first = await postWebhook(payloadString, signature);
    expect(first.status).toBe(200);
    const afterFirst = await mockPrisma.booking.findUnique({ where: { id: booking1Id } });
    expect(afterFirst.status).toBe('ACTIVE');

    // Webhook delivery can retry — the exact same event landing twice must
    // not create a second Payment or re-apply anything.
    const second = await postWebhook(payloadString, signature);
    expect(second.status).toBe(200);
  });

  it('the booking user cannot complete their own booking', async () => {
    const res = await api().patch(`/api/bookings/${booking1Id}/complete`).set(auth(evToken));
    expect(res.status).toBe(403);
  });

  it('only the owner can read their real live charging sessions', async () => {
    const forbidden = await api().get('/api/stations/owner/live-sessions').set(auth(evToken));
    expect(forbidden.status).toBe(403);

    const res = await api().get('/api/stations/owner/live-sessions').set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].bookingId).toBe(booking1Id);
    expect(res.body.data[0].customer.name).toBe('Eva Driver');
    expect(res.body.data[0].slot.slotNumber).toBe(1);
    expect(res.body.data[0].sessionStatus).toBe('ACTIVE');
  });

  it('emergency stop requires a reason and rejects non-owners', async () => {
    const missingReason = await api()
      .patch(`/api/bookings/${booking1Id}/emergency-stop`)
      .set(auth(ownerToken))
      .send({ reason: ' ' });
    expect(missingReason.status).toBe(400);

    const wrongRole = await api()
      .patch(`/api/bookings/${booking1Id}/emergency-stop`)
      .set(auth(evToken))
      .send({ reason: 'Driver attempted stop' });
    expect(wrongRole.status).toBe(403);
  });

  it('the station owner emergency-stops it and final session data is persisted', async () => {
    const res = await api()
      .patch(`/api/bookings/${booking1Id}/emergency-stop`)
      .set(auth(ownerToken))
      .send({ reason: 'Connector temperature exceeded safe limit' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.finalEnergyKwh).toBeGreaterThanOrEqual(0);
    expect(res.body.data.finalBill).toBeGreaterThanOrEqual(0);

    const booking = await mockPrisma.booking.findUnique({ where: { id: booking1Id } });
    expect(booking.endTime).toBeTruthy();
    expect(booking.durationMinutes).toBeGreaterThanOrEqual(0);
    expect(booking.stopReason).toBe('Connector temperature exceeded safe limit');
    expect(booking.ratePerKwh).toBeCloseTo(0.18, 2);
    expect(booking.emergencyStoppedBy).toBeTruthy();
    expect(booking.emergencyStoppedAt).toBeTruthy();

    const slot = await mockPrisma.slot.findUnique({ where: { id: slot1Id } });
    expect(slot.status).toBe('AVAILABLE');

    // Charged Rs. 3.96 upfront for the full 1h window, stopped almost
    // immediately — nearly the whole amount is owed back as a refund.
    expect(res.body.data.refundAmount).toBeGreaterThan(0);
    expect(refundSpy).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_test_1' })
    );
    const payment = await mockPrisma.payment.findUnique({ where: { bookingId: booking1Id } });
    expect(['REFUNDED', 'PARTIALLY_REFUNDED']).toContain(payment.status);
    expect(payment.refundedAmount).toBeCloseTo(res.body.data.refundAmount, 2);
  });

  it('only the station owner can load complete emergency-stop booking details', async () => {
    const forbidden = await api()
      .get(`/api/stations/owner/bookings/${booking1Id}`)
      .set(auth(evToken));
    expect(forbidden.status).toBe(403);

    const res = await api()
      .get(`/api/stations/owner/bookings/${booking1Id}`)
      .set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(booking1Id);
    expect(res.body.data.sessionStatus).toBe('EMERGENCY_STOPPED');
    expect(res.body.data.emergencyReason).toBe(
      'Connector temperature exceeded safe limit'
    );
    expect(res.body.data.emergencyStoppedByName).toBe('Omar Owner');
    expect(res.body.data.energyDeliveredKwh).toBeGreaterThanOrEqual(0);
    expect(res.body.data.sessionDurationMinutes).toBeGreaterThanOrEqual(0);
    expect(res.body.data.totalAmount).toBeGreaterThanOrEqual(0);
  });

  it('returns a filterable station-owner report with database-backed totals', async () => {
    const forbidden = await api().get('/api/stations/owner/reports').set(auth(evToken));
    expect(forbidden.status).toBe(403);

    const res = await api()
      .get('/api/stations/owner/reports')
      .query({ sessionStatus: 'EMERGENCY_STOPPED', search: 'Eva Driver' })
      .set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0].id).toBe(booking1Id);
    expect(res.body.data.rows[0].sessionStatus).toBe('EMERGENCY_STOPPED');
    expect(res.body.data.rows[0].refundAmount).toBeGreaterThanOrEqual(0);
    expect(res.body.data.rows[0].finalChargedAmount).toBeGreaterThanOrEqual(0);
    expect(res.body.data.summary.totalSessions).toBe(1);
    expect(res.body.data.summary.emergencyStoppedSessions).toBe(1);
    expect(res.body.data.summary.totalRefundAmount).toBeGreaterThanOrEqual(0);
    expect(res.body.data.summary.totalEnergyDelivered).toBeGreaterThanOrEqual(0);
    expect(res.body.data.slotNumbers).toContain(1);
  });

  it('payment history returns exactly one real Stripe-tagged payment with its station chain', async () => {
    const res = await api().get('/api/payments/history').set(auth(evToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].method).toBe('STRIPE');
    expect(res.body.data[0].booking.slot.station.name).toBe('GreenVolt Gulberg');
    expect(res.body.data[0].amount).toBeCloseTo(3.96, 1);
  });
});

describe('E2E: auction flow', () => {
  it('owner opens an auction on slot 2 (duration, starting bid, reservation time validated)', async () => {
    const bad = await api()
      .post(`/api/slots/${slot2Id}/auction/open`)
      .set(auth(ownerToken))
      .send({ durationMinutes: 99999, startingBid: 500, reservationMinutes: 10 });
    expect(bad.status).toBe(400);

    const noStartingBid = await api()
      .post(`/api/slots/${slot2Id}/auction/open`)
      .set(auth(ownerToken))
      .send({ durationMinutes: 30, reservationMinutes: 10 });
    expect(noStartingBid.status).toBe(400);

    const noReservationTime = await api()
      .post(`/api/slots/${slot2Id}/auction/open`)
      .set(auth(ownerToken))
      .send({ durationMinutes: 30, startingBid: 500 });
    expect(noReservationTime.status).toBe(400);

    const res = await api()
      .post(`/api/slots/${slot2Id}/auction/open`)
      .set(auth(ownerToken))
      .send({ durationMinutes: 30, startingBid: 500, minIncrement: 50, reservationMinutes: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.auctionOpen).toBe(true);
    expect(res.body.data.auctionStartingBid).toBe(500);
    expect(res.body.data.auctionMinIncrement).toBe(50);
    expect(res.body.data.auctionReservationMinutes).toBe(10);
  });

  it('the owner CANNOT bid on their own slot (new guard)', async () => {
    const res = await api()
      .post('/api/bids')
      .set(auth(ownerToken))
      .send({ slotId: slot2Id, amount: 10, batteryLevel: 50 });
    expect(res.status).toBe(403);
  });

  it('an EV user cannot bid below the station owner\'s starting bid price', async () => {
    const res = await api()
      .post('/api/bids')
      .set(auth(evToken))
      .send({ slotId: slot2Id, amount: 100, batteryLevel: 15 });
    expect(res.status).toBe(400);
  });

  it('an EV user bids; priority = 60% bid + 40% urgency against the fixed ceiling', async () => {
    const res = await api()
      .post('/api/bids')
      .set(auth(evToken))
      .send({ slotId: slot2Id, amount: 1000, batteryLevel: 15 });
    expect(res.status).toBe(201);
    // 1000/2000 × 0.6 + 1.0 × 0.4 = 0.7 → 70
    expect(res.body.data.bid.priority).toBeCloseTo(70, 5);
  });

  it('a second EV user cannot bid below the leading bid + minimum increment', async () => {
    const res = await api()
      .post('/api/bids')
      .set(auth(ev2Token))
      .send({ slotId: slot2Id, amount: 1010, batteryLevel: 50 });
    expect(res.status).toBe(400);
  });

  it('closing the auction crowns the winner and auto-creates a CONFIRMED booking', async () => {
    const res = await api().post(`/api/slots/${slot2Id}/auction/close`).set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.winner.status).toBe('WON');
    expect(res.body.data.booking.status).toBe('CONFIRMED');
    expect(res.body.data.booking.totalCost).toBe(1000);
    auctionBookingId = res.body.data.booking.id;
  });

  it('the auction winner can check in too — open-ended bookings use the SAME unified lifecycle', async () => {
    const res = await api().patch(`/api/bookings/${auctionBookingId}/check-in`).set(auth(evToken));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CHECKED_IN');
    // The winning bid amount, unchanged — not recomputed from any duration
    // (an auction win has none).
    expect(res.body.data.totalCost).toBe(1000);
  });

  it('the same webhook path pays the auction booking', async () => {
    const { payloadString, signature } = fakeSucceededWebhook(auctionBookingId, 'pi_test_2');
    const res = await postWebhook(payloadString, signature);
    expect(res.status).toBe(200);
    const booking = await mockPrisma.booking.findUnique({ where: { id: auctionBookingId } });
    expect(booking.status).toBe('ACTIVE');
  });

  it('the owner completes the auction booking; the customer pays exactly their bid, not a recomputed usage figure', async () => {
    const res = await api()
      .patch(`/api/bookings/${auctionBookingId}/complete`)
      .set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.totalCost).toBe(1000);

    // Regression: durationMinutes/finalEnergyKwh used to only ever get
    // persisted by the emergency-stop path — a normal completion left them
    // null forever, so the owner's Session Details view always showed a
    // blank dash for Duration/Energy Delivered even on a finished session.
    const booking = await mockPrisma.booking.findUnique({ where: { id: auctionBookingId } });
    expect(booking.durationMinutes).toBeGreaterThanOrEqual(0);
    expect(booking.finalEnergyKwh).toBeGreaterThanOrEqual(0);
  });

  it('bids on the now-closed auction are rejected', async () => {
    const res = await api()
      .post('/api/bids')
      .set(auth(ev2Token))
      .send({ slotId: slot2Id, amount: 60, batteryLevel: 40 });
    expect(res.status).toBe(400);
  });
});

describe('E2E: admin dashboard + audit trail', () => {
  it('dashboard stats aggregate correctly', async () => {
    const res = await api().get('/api/admin/dashboard').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.stats.totalUsers).toBe(2); // EV users only
    expect(res.body.data.stats.totalStations).toBe(1); // approved
    expect(res.body.data.stats.totalBookings).toBe(4); // 2 windows + the concurrent-race winner + auction win
    expect(res.body.data.chartData).toHaveLength(6);
    expect(res.body.data.chartData[5].bookings).toBe(4); // all created this month
  });

  it('admin can block a user and the action lands in the audit log', async () => {
    const zed = await mockPrisma.user.findUnique({ where: { email: 'zed@x.pk' } });
    const block = await api().patch(`/api/admin/users/${zed.id}/block`).set(auth(adminToken));
    expect(block.status).toBe(200);

    const logs = await api().get('/api/admin/logs').set(auth(adminToken));
    expect(logs.status).toBe(200);
    const actions = logs.body.data.map((l) => l.action);
    expect(actions).toContain('USER_BLOCKED');
    expect(actions).toContain('STATION_APPROVED');
    expect(actions).toContain('ADMIN_BOOTSTRAPPED');
    // Actor names resolved
    const blockEntry = logs.body.data.find((l) => l.action === 'USER_BLOCKED');
    expect(blockEntry.actor.name).toBe('Root Admin');
  });

  it('a blocked user can no longer authenticate', async () => {
    const res = await api().get('/api/auth/me').set(auth(ev2Token));
    expect(res.status).toBe(403);
  });

  it('the audit log itself is admin-only', async () => {
    const res = await api().get('/api/admin/logs').set(auth(evToken));
    expect(res.status).toBe(403);
  });
});

describe('E2E: complaints (Contact Us -> admin inbox)', () => {
  let complaintId;

  it('a GUEST (no token) can submit a complaint', async () => {
    const res = await api().post('/api/complaints').send({
      name: 'Guest Visitor',
      email: 'guest@x.pk',
      phone: '+92 300 1234567',
      subject: 'Charger sparked',
      message: 'Slot 1 at GreenVolt Gulberg sparked when I plugged in my car.',
    });
    expect(res.status).toBe(201);
    complaintId = res.body.data.id;
  });

  it('a LOGGED-IN user submission records their account id', async () => {
    const res = await api().post('/api/complaints').set(auth(evToken)).send({
      name: 'Eva Driver',
      email: 'eva@x.pk',
      subject: 'Overcharged for session',
      message: 'My last session shows a higher amount than the on-screen estimate.',
    });
    expect(res.status).toBe(201);
    const eva = await mockPrisma.user.findUnique({ where: { email: 'eva@x.pk' } });
    expect(res.body.data.userId).toBe(eva.id);
  });

  it('rejects an invalid submission (bad email, short message)', async () => {
    const res = await api().post('/api/complaints').send({
      name: 'X',
      email: 'not-an-email',
      subject: 'hm',
      message: 'short',
    });
    expect(res.status).toBe(400);
  });

  it('non-admins cannot read the inbox; admin can, newest first', async () => {
    const forbidden = await api().get('/api/complaints').set(auth(evToken));
    expect(forbidden.status).toBe(403);

    const res = await api().get('/api/complaints').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.data[0].subject).toBe('Overcharged for session'); // newest first
    expect(res.body.data[1].phone).toBe('+92 300 1234567'); // WhatsApp reply data
  });

  it('admin deletes a handled complaint — and the deletion is audited', async () => {
    const del = await api().delete(`/api/complaints/${complaintId}`).set(auth(adminToken));
    expect(del.status).toBe(200);

    const list = await api().get('/api/complaints').set(auth(adminToken));
    expect(list.body.pagination.total).toBe(1);

    const logs = await api().get('/api/admin/logs').set(auth(adminToken));
    expect(logs.body.data.map((l) => l.action)).toContain('COMPLAINT_DELETED');
  });
});

describe('E2E: station ratings & reviews (verified purchase only)', () => {
  let noorToken, reviewId;

  it('station owners cannot post reviews (EV users only)', async () => {
    const res = await api()
      .post('/api/reviews')
      .set(auth(ownerToken))
      .send({ stationId, rating: 5 });
    expect(res.status).toBe(403);
  });

  it('an EV user with NO paid session at the station is rejected', async () => {
    const reg = await api()
      .post('/api/auth/register')
      .send({ name: 'Noor Fresh', email: 'noor@x.pk', password: 'secret1', role: 'EV_USER' });
    noorToken = reg.body.data.token;
    await mockPrisma.user.update({ where: { email: 'noor@x.pk' }, data: { isVerified: true } });

    const res = await api()
      .post('/api/reviews')
      .set(auth(noorToken))
      .send({ stationId, rating: 5, comment: 'Never even charged here' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/completed and paid/i);
  });

  it('a paying customer (Eva) CAN post a review', async () => {
    const res = await api()
      .post('/api/reviews')
      .set(auth(evToken))
      .send({ stationId, rating: 5, comment: 'Fast charger, clean spot.' });
    expect(res.status).toBe(201);
    expect(res.body.data.stats).toEqual({ ratingAvg: 5, ratingCount: 1 });
    reviewId = res.body.data.review.id;
  });

  it('posting again UPDATES the same review (one per user per station)', async () => {
    const res = await api()
      .post('/api/reviews')
      .set(auth(evToken))
      .send({ stationId, rating: 3, comment: 'Second visit was slower.' });
    expect(res.status).toBe(200);
    expect(res.body.data.review.id).toBe(reviewId);
    expect(res.body.data.stats).toEqual({ ratingAvg: 3, ratingCount: 1 });
  });

  it('rejects an out-of-range rating', async () => {
    const res = await api().post('/api/reviews').set(auth(evToken)).send({ stationId, rating: 9 });
    expect(res.status).toBe(400);
  });

  it('reviews are publicly readable and station cards carry the stars', async () => {
    const pub = await api().get(`/api/reviews/station/${stationId}`); // no token
    expect(pub.status).toBe(200);
    expect(pub.body.stats).toEqual({ ratingAvg: 3, ratingCount: 1 });
    expect(pub.body.data[0].user.name).toBe('Eva Driver');

    const list = await api().get('/api/stations');
    const st = list.body.data.find((s) => s.id === stationId);
    expect(st.ratingAvg).toBe(3);
    expect(st.ratingCount).toBe(1);

    const detail = await api().get(`/api/stations/${stationId}`);
    expect(detail.body.data.ratingAvg).toBe(3);
  });

  it('only the author or an admin can delete; admin moderation is audited', async () => {
    const notYours = await api().delete(`/api/reviews/${reviewId}`).set(auth(noorToken));
    expect(notYours.status).toBe(403);

    const mod = await api().delete(`/api/reviews/${reviewId}`).set(auth(adminToken));
    expect(mod.status).toBe(200);

    const logs = await api().get('/api/admin/logs').set(auth(adminToken));
    expect(logs.body.data.map((l) => l.action)).toContain('REVIEW_DELETED');

    const pub = await api().get(`/api/reviews/station/${stationId}`);
    expect(pub.body.stats.ratingCount).toBe(0);
  });
});

describe('E2E: logout revokes the token server-side', () => {
  it('a token stops working immediately after logout, even though its signature is still valid', async () => {
    const reg = await api()
      .post('/api/auth/register')
      .send({ name: 'Lena Logout', email: 'lena@x.pk', password: 'secret1', role: 'EV_USER' });
    expect(reg.status).toBe(201);
    const lenaToken = reg.body.data.token;

    const before = await api().get('/api/auth/me').set(auth(lenaToken));
    expect(before.status).toBe(200);

    const out = await api().post('/api/auth/logout').set(auth(lenaToken));
    expect(out.status).toBe(200);

    // The exact same, still cryptographically valid and unexpired token is
    // now rejected — proof logout does something server-side, not just a
    // client-side token deletion.
    const after = await api().get('/api/auth/me').set(auth(lenaToken));
    expect(after.status).toBe(401);
  });
});
