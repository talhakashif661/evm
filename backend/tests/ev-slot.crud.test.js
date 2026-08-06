/**
 * EV and Slot CRUD as standalone endpoints.
 *
 * The e2e smoke test walks these routes in passing — it registers an EV so
 * it can make a booking — but never exercises update, delete, or the
 * ownership guards. That gap matters more than it looks: both resources are
 * user-scoped, so "can driver A edit driver B's vehicle?" and "can owner A
 * delete owner B's slot?" are authorization questions, and an authorization
 * hole doesn't announce itself in the happy path.
 *
 * Every test that asserts a rejection also re-reads the record afterwards.
 * A 403 that still mutated the row is a worse bug than a 200 would be, and
 * status-code-only assertions can't tell those apart.
 */
import { jest } from '@jest/globals';
import request from 'supertest';

process.env.JWT_SECRET = 'crud-test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';
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
const auth = (t) => ({ Authorization: `Bearer ${t}` });

/** Register, then mark verified — KYC gates the routes under test. */
async function makeUser(name, email, role) {
  const res = await api()
    .post('/api/auth/register')
    .send({ name, email, password: 'Str0ng!pass', role });
  await mockPrisma.user.update({ where: { email }, data: { isVerified: true } });
  return { token: res.body.data.token, id: res.body.data.user.id };
}

let driverA;
let driverB;
let ownerA;
let ownerB;
let stationA;

beforeAll(async () => {
  driverA = await makeUser('Hina Driver', 'hina.crud@example.pk', 'EV_USER');
  driverB = await makeUser('Usman Driver', 'usman.crud@example.pk', 'EV_USER');
  ownerA = await makeUser('Owner A', 'ownera.crud@example.pk', 'STATION_OWNER');
  ownerB = await makeUser('Owner B', 'ownerb.crud@example.pk', 'STATION_OWNER');

  stationA = await mockPrisma.chargingStation.create({
    data: {
      name: 'Johar Town Charge',
      address: 'Johar Town, Lahore',
      latitude: 31.4697,
      longitude: 74.2728,
      pricePerKwh: 30,
      status: 'APPROVED',
      ownerId: ownerA.id,
    },
  });
});

describe('EV CRUD — /api/evs', () => {
  let evId;

  it('rejects an unauthenticated request', async () => {
    const res = await api().get('/api/evs');
    expect(res.status).toBe(401);
  });

  it('refuses to let a station owner register a vehicle', async () => {
    const res = await api()
      .post('/api/evs')
      .set(auth(ownerA.token))
      .send({ model: 'BYD Atto 3', batteryCapacity: 60, batteryPercentage: 70 });
    expect(res.status).toBe(403);
  });

  it('registers a vehicle for a driver', async () => {
    const res = await api().post('/api/evs').set(auth(driverA.token)).send({
      model: 'MG ZS EV',
      batteryCapacity: 51,
      batteryPercentage: 64,
      licensePlate: 'LEA-2024',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.model).toBe('MG ZS EV');
    expect(res.body.data.batteryPercentage).toBe(64);
    evId = res.body.data.id;
  });

  it('lists only the requesting driver’s own vehicles', async () => {
    await api()
      .post('/api/evs')
      .set(auth(driverB.token))
      .send({ model: 'Haval Ora', batteryCapacity: 48, batteryPercentage: 30 });

    const mine = await api().get('/api/evs').set(auth(driverA.token));
    expect(mine.status).toBe(200);
    expect(mine.body.data.every((ev) => ev.userId === driverA.id)).toBe(true);
    expect(mine.body.data.map((ev) => ev.model)).not.toContain('Haval Ora');
  });

  it('updates a vehicle the driver owns', async () => {
    const res = await api()
      .put(`/api/evs/${evId}`)
      .set(auth(driverA.token))
      .send({ model: 'MG ZS EV Long Range' });

    expect(res.status).toBe(200);
    expect((await mockPrisma.eV.findUnique({ where: { id: evId } })).model).toBe(
      'MG ZS EV Long Range'
    );
  });

  it('will not let one driver edit another driver’s vehicle', async () => {
    const res = await api()
      .put(`/api/evs/${evId}`)
      .set(auth(driverB.token))
      .send({ model: 'Hijacked' });

    expect([403, 404]).toContain(res.status);
    expect((await mockPrisma.eV.findUnique({ where: { id: evId } })).model).not.toBe('Hijacked');
  });

  it('updates the battery level', async () => {
    const res = await api()
      .patch(`/api/evs/${evId}/battery`)
      .set(auth(driverA.token))
      .send({ batteryPercentage: 18 });

    expect(res.status).toBe(200);
    expect((await mockPrisma.eV.findUnique({ where: { id: evId } })).batteryPercentage).toBe(18);
  });

  it('will not let one driver delete another driver’s vehicle', async () => {
    const res = await api().delete(`/api/evs/${evId}`).set(auth(driverB.token));
    expect([403, 404]).toContain(res.status);
    expect(await mockPrisma.eV.findUnique({ where: { id: evId } })).toBeTruthy();
  });

  it('deletes a vehicle the driver owns', async () => {
    const res = await api().delete(`/api/evs/${evId}`).set(auth(driverA.token));
    expect(res.status).toBe(200);
    expect(await mockPrisma.eV.findUnique({ where: { id: evId } })).toBeFalsy();
  });
});

describe('Slot CRUD — /api/slots', () => {
  let slotId;

  it('creates a slot on the owner’s own station', async () => {
    const res = await api()
      .post('/api/slots')
      .set(auth(ownerA.token))
      .send({ stationId: stationA.id, slotNumber: 1, powerKw: 60 });

    expect(res.status).toBe(201);
    slotId = res.body.data.id;
  });

  it('refuses to let a driver create a slot', async () => {
    const res = await api()
      .post('/api/slots')
      .set(auth(driverA.token))
      .send({ stationId: stationA.id, slotNumber: 2, powerKw: 60 });

    expect(res.status).toBe(403);
  });

  it('refuses to let a different owner add a slot to someone else’s station', async () => {
    const res = await api()
      .post('/api/slots')
      .set(auth(ownerB.token))
      .send({ stationId: stationA.id, slotNumber: 99, powerKw: 60 });

    expect([403, 404]).toContain(res.status);
    const slots = await mockPrisma.slot.findMany({ where: { stationId: stationA.id } });
    expect(slots.map((s) => s.slotNumber)).not.toContain(99);
  });

  it('lists a station’s slots publicly — no token needed', async () => {
    const res = await api().get(`/api/slots/station/${stationA.id}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('exposes slot availability without a token', async () => {
    const res = await api().get(`/api/slots/${slotId}/availability`);
    expect(res.status).not.toBe(401);
  });

  it('updates slot status for the owning owner', async () => {
    const res = await api()
      .put(`/api/slots/${slotId}/status`)
      .set(auth(ownerA.token))
      .send({ status: 'MAINTENANCE' });

    expect(res.status).toBe(200);
    expect((await mockPrisma.slot.findUnique({ where: { id: slotId } })).status).toBe(
      'MAINTENANCE'
    );
  });

  it('will not let a different owner change slot status', async () => {
    await api()
      .put(`/api/slots/${slotId}/status`)
      .set(auth(ownerA.token))
      .send({ status: 'AVAILABLE' });

    const res = await api()
      .put(`/api/slots/${slotId}/status`)
      .set(auth(ownerB.token))
      .send({ status: 'MAINTENANCE' });

    expect([403, 404]).toContain(res.status);
    expect((await mockPrisma.slot.findUnique({ where: { id: slotId } })).status).toBe('AVAILABLE');
  });

  it('will not let a different owner delete the slot', async () => {
    const res = await api().delete(`/api/slots/${slotId}`).set(auth(ownerB.token));
    expect([403, 404]).toContain(res.status);
    expect(await mockPrisma.slot.findUnique({ where: { id: slotId } })).toBeTruthy();
  });

  it('deletes a slot the owner owns', async () => {
    const res = await api().delete(`/api/slots/${slotId}`).set(auth(ownerA.token));
    expect(res.status).toBe(200);
    expect(await mockPrisma.slot.findUnique({ where: { id: slotId } })).toBeFalsy();
  });
});
