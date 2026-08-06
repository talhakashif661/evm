import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.NO_SHOW_MINUTES = '15';

const { createInMemoryPrisma } = await import('./helpers/inMemoryPrisma.js');
const mockPrisma = createInMemoryPrisma();

jest.unstable_mockModule('../utils/prisma.js', () => ({ default: mockPrisma }));

const { expireNoShowBookings } = await import('../utils/bookingExpiry.js');

const oldStart = () => new Date(Date.now() - 20 * 60 * 1000);

describe('transactional booking no-show expiration', () => {
  let owner;
  let customer;
  let station;
  let ev;

  beforeAll(async () => {
    owner = await mockPrisma.user.create({
      data: {
        name: 'Station Owner',
        email: 'expiry-owner@example.pk',
        password: 'hash',
        role: 'STATION_OWNER',
      },
    });
    customer = await mockPrisma.user.create({
      data: {
        name: 'Late Customer',
        email: 'late-customer@example.pk',
        password: 'hash',
        role: 'EV_USER',
      },
    });
    station = await mockPrisma.chargingStation.create({
      data: {
        ownerId: owner.id,
        name: 'Expiry Test Station',
        address: '1 Test Road',
        city: 'Lahore',
        latitude: 31.5,
        longitude: 74.3,
        status: 'APPROVED',
        pricePerKwh: 50,
      },
    });
    ev = await mockPrisma.eV.create({
      data: {
        userId: customer.id,
        model: 'Test EV',
        batteryCapacity: 60,
      },
    });
  });

  const createExpiredBooking = async (slotStatus, slotNumber) => {
    const slot = await mockPrisma.slot.create({
      data: {
        stationId: station.id,
        slotNumber,
        powerKw: 22,
        status: slotStatus,
      },
    });
    const startTime = oldStart();
    const booking = await mockPrisma.booking.create({
      data: {
        userId: customer.id,
        evId: ev.id,
        slotId: slot.id,
        status: 'CONFIRMED',
        startTime,
        plannedEndTime: new Date(startTime.getTime() + 60 * 60 * 1000),
      },
    });
    return { slot, booking };
  };

  it('updates the booking and releases a reserved slot through one transaction', async () => {
    const { slot, booking } = await createExpiredBooking('RESERVED', 1);
    const transaction = jest.spyOn(mockPrisma, '$transaction');

    await expect(expireNoShowBookings({ id: booking.id })).resolves.toBe(1);

    const expired = await mockPrisma.booking.findUnique({ where: { id: booking.id } });
    const released = await mockPrisma.slot.findUnique({ where: { id: slot.id } });
    expect(expired.status).toBe('CANCELLED');
    expect(expired.cancelReason).toBe('NO_SHOW');
    expect(released.status).toBe('AVAILABLE');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it.each(['MAINTENANCE', 'OFFLINE', 'FAULTED'])(
    'preserves a %s slot while expiring its booking',
    async (protectedStatus) => {
      const slotNumber = { MAINTENANCE: 2, OFFLINE: 3, FAULTED: 4 }[protectedStatus];
      const { slot, booking } = await createExpiredBooking(protectedStatus, slotNumber);

      await expect(expireNoShowBookings({ id: booking.id })).resolves.toBe(1);

      const expired = await mockPrisma.booking.findUnique({ where: { id: booking.id } });
      const protectedSlot = await mockPrisma.slot.findUnique({ where: { id: slot.id } });
      expect(expired.status).toBe('CANCELLED');
      expect(protectedSlot.status).toBe(protectedStatus);
    }
  );

  it('is idempotent when duplicate expiration sweeps target the same booking', async () => {
    const { booking } = await createExpiredBooking('RESERVED', 5);

    const [first, second] = await Promise.all([
      expireNoShowBookings({ id: booking.id }),
      expireNoShowBookings({ id: booking.id }),
    ]);

    expect(first + second).toBe(1);
    const expired = await mockPrisma.booking.findUnique({ where: { id: booking.id } });
    expect(expired.status).toBe('CANCELLED');
  });
});
