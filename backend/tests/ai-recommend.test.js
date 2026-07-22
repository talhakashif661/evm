/**
 * AI station recommendations — GET /api/ai/recommend.
 *
 * This endpoint was shipped untested. It isn't a model call despite the
 * name; it's a deterministic scoring function (distance + price +
 * availability, with availability re-weighted by battery urgency), which
 * makes it exactly the kind of thing that *should* be pinned down by tests
 * — every input has a predictable effect on the ranking.
 *
 * The assertions below are deliberately about ORDERING and RELATIVE score,
 * not exact numbers. Pinning "station A scores 82.4" would turn every future
 * weight tweak into a failing test for no reason; pinning "the closer
 * station outranks the further one, all else equal" stays true across any
 * reasonable retune and actually describes the product requirement.
 */
import { jest } from '@jest/globals';
import request from 'supertest';

process.env.JWT_SECRET = 'ai-test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';
delete process.env.SENDGRID_API_KEY;

const { createInMemoryPrisma } = await import('./helpers/inMemoryPrisma.js');
const mockPrisma = createInMemoryPrisma();

jest.unstable_mockModule('../utils/prisma.js', () => ({ default: mockPrisma }));

const { default: app } = await import('../app.js');

const api = () => request(app);
const auth = (t) => ({ Authorization: `Bearer ${t}` });

// Lahore-ish origin; the fixtures below are placed at increasing distance
// from it so "nearer" is unambiguous.
const ORIGIN = { lat: 31.5204, lon: 74.3587 };

let token;
let ownerSeq = 0;

/**
 * Create an approved station with `available` of `total` slots free.
 *
 * Each station gets its own freshly-registered owner because
 * ChargingStation.ownerId is `@unique` in the schema — one station per
 * owner account is a real product rule, not a test artifact.
 */
async function makeStation({ name, lat, lon, price, available, total }) {
  ownerSeq += 1;
  const owner = await api()
    .post('/api/auth/register')
    .send({
      name: `Owner ${ownerSeq}`,
      email: `owner${ownerSeq}.ai@example.pk`,
      password: 'Str0ng!pass',
      role: 'STATION_OWNER',
    });
  const ownerId = owner.body.data.user.id;

  const station = await mockPrisma.chargingStation.create({
    data: {
      name,
      address: `${name} Road, Lahore`,
      latitude: lat,
      longitude: lon,
      pricePerKwh: price,
      status: 'APPROVED',
      ownerId,
    },
  });
  for (let i = 0; i < total; i += 1) {
    await mockPrisma.slot.create({
      data: {
        stationId: station.id,
        slotNumber: i + 1,
        powerKw: 50,
        status: i < available ? 'AVAILABLE' : 'OCCUPIED',
        auctionOpen: false,
      },
    });
  }
  return station;
}

beforeAll(async () => {
  const driver = await api().post('/api/auth/register').send({
    name: 'Bilal Ahmed',
    email: 'bilal.ai@example.pk',
    password: 'Str0ng!pass',
    role: 'EV_USER',
  });
  token = driver.body.data.token;
});

describe('GET /api/ai/recommend — access + input handling', () => {
  it('requires authentication', async () => {
    const res = await api()
      .get('/api/ai/recommend')
      .query({ ...ORIGIN });
    expect(res.status).toBe(401);
  });

  it('rejects a request with no coordinates', async () => {
    const res = await api().get('/api/ai/recommend').set(auth(token));
    expect(res.status).toBe(400);
  });

  it('rejects a request missing longitude', async () => {
    const res = await api()
      .get('/api/ai/recommend')
      .set(auth(token))
      .query({ latitude: ORIGIN.lat });
    expect(res.status).toBe(400);
  });

  it('returns an empty list rather than an error when no stations exist', async () => {
    const res = await api()
      .get('/api/ai/recommend')
      .set(auth(token))
      .query({ latitude: ORIGIN.lat, longitude: ORIGIN.lon });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /api/ai/recommend — scoring behaviour', () => {
  beforeAll(async () => {
    // ~1km away, cheap, fully free.
    await makeStation({
      name: 'Gulberg Hub',
      lat: 31.5294,
      lon: 74.3587,
      price: 25,
      available: 4,
      total: 4,
    });
    // ~11km away, same price, same availability — distance is the only
    // difference, which is what makes the ordering assertion meaningful.
    await makeStation({
      name: 'Ravi Point',
      lat: 31.6204,
      lon: 74.3587,
      price: 25,
      available: 4,
      total: 4,
    });
    // Near but full — availability should drag it down.
    await makeStation({
      name: 'Mall Road Charge',
      lat: 31.524,
      lon: 74.36,
      price: 25,
      available: 0,
      total: 4,
    });
  });

  it('ranks the nearer station above an otherwise identical far one', async () => {
    const res = await api()
      .get('/api/ai/recommend')
      .set(auth(token))
      .query({ latitude: ORIGIN.lat, longitude: ORIGIN.lon, batteryLevel: 60 });

    expect(res.status).toBe(200);
    const names = res.body.data.map((s) => s.name);
    expect(names.indexOf('Gulberg Hub')).toBeLessThan(names.indexOf('Ravi Point'));
  });

  it('ranks a free station above a full one at comparable distance', async () => {
    const res = await api()
      .get('/api/ai/recommend')
      .set(auth(token))
      .query({ latitude: ORIGIN.lat, longitude: ORIGIN.lon, batteryLevel: 60 });

    const names = res.body.data.map((s) => s.name);
    expect(names.indexOf('Gulberg Hub')).toBeLessThan(names.indexOf('Mall Road Charge'));
  });

  it('reports distance and availability alongside each score', async () => {
    const res = await api()
      .get('/api/ai/recommend')
      .set(auth(token))
      .query({ latitude: ORIGIN.lat, longitude: ORIGIN.lon });

    const top = res.body.data[0];
    expect(top.aiMetrics).toBeDefined();
    expect(top.aiMetrics.score).toBeGreaterThan(0);
    expect(top.aiMetrics.score).toBeLessThanOrEqual(100);
    expect(top.aiMetrics.distance).toBeGreaterThanOrEqual(0);
    expect(typeof top.aiMetrics.availableSlots).toBe('number');
  });

  it('flags a critically low battery as an emergency', async () => {
    const res = await api()
      .get('/api/ai/recommend')
      .set(auth(token))
      .query({ latitude: ORIGIN.lat, longitude: ORIGIN.lon, batteryLevel: 12 });

    expect(res.body.meta.isEmergency).toBe(true);
    // With a near-flat battery and free slots nearby, the top pick must say
    // so — this label is what the UI renders as the red "go here now" badge.
    expect(res.body.data[0].recommendation).toBe('EMERGENCY_PRIORITY');
  });

  it('does not flag an emergency at a healthy battery level', async () => {
    const res = await api()
      .get('/api/ai/recommend')
      .set(auth(token))
      .query({ latitude: ORIGIN.lat, longitude: ORIGIN.lon, batteryLevel: 80 });

    expect(res.body.meta.isEmergency).toBe(false);
    expect(res.body.data[0].recommendation).not.toBe('EMERGENCY_PRIORITY');
  });

  it('scores a low battery no worse than a high one at the same station', async () => {
    const q = { latitude: ORIGIN.lat, longitude: ORIGIN.lon };
    const low = await api()
      .get('/api/ai/recommend')
      .set(auth(token))
      .query({ ...q, batteryLevel: 10 });
    const high = await api()
      .get('/api/ai/recommend')
      .set(auth(token))
      .query({ ...q, batteryLevel: 90 });

    const pick = (r, name) => r.body.data.find((s) => s.name === name).aiMetrics.score;
    // Urgency re-weights availability upward, so a free station can only get
    // more attractive as the battery drops — never less.
    expect(pick(low, 'Gulberg Hub')).toBeGreaterThanOrEqual(pick(high, 'Gulberg Hub'));
  });

  it('honours the limit parameter', async () => {
    const res = await api()
      .get('/api/ai/recommend')
      .set(auth(token))
      .query({ latitude: ORIGIN.lat, longitude: ORIGIN.lon, limit: 2 });

    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.totalStationsAnalyzed).toBeGreaterThanOrEqual(3);
  });

  it('never recommends a station still awaiting admin approval', async () => {
    const pending = await makeStation({
      name: 'Unapproved Depot',
      lat: ORIGIN.lat,
      lon: ORIGIN.lon,
      price: 1,
      available: 4,
      total: 4,
    });
    await mockPrisma.chargingStation.update({
      where: { id: pending.id },
      data: { status: 'PENDING' },
    });

    const res = await api()
      .get('/api/ai/recommend')
      .set(auth(token))
      .query({ latitude: ORIGIN.lat, longitude: ORIGIN.lon, limit: 20 });

    // Priced at 1 and sitting exactly on the user's coordinates, this would
    // top the list if the status filter ever regressed.
    expect(res.body.data.map((s) => s.name)).not.toContain('Unapproved Depot');
  });
});
