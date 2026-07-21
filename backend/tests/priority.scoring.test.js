import { jest } from '@jest/globals';

// calculatePriority itself is a pure function (see comment below) but it
// lives in bid.controller.js, which imports prisma.js at the top — so
// importing the controller at all drags in the real @prisma/client even
// though this file never touches the database. Mocking Prisma first (same
// pattern as e2e.smoke.test.js / health.test.js) sidesteps that entirely,
// including in this sandbox specifically, where the real client can't
// initialize because binaries.prisma.sh being blocked prevented the query
// engine binary from downloading.
process.env.NODE_ENV = 'test';

const { createInMemoryPrisma } = await import('./helpers/inMemoryPrisma.js');
jest.unstable_mockModule('../utils/prisma.js', () => ({ default: createInMemoryPrisma() }));

const { calculatePriority } = await import('../controllers/bid.controller.js');

// Pure-function tests for the auction priority formula. No DB, no network —
// calculatePriority(amount, batteryLevel) depends only on its arguments and a
// FIXED reference ceiling, which is exactly what makes auction rankings stable
// and order-independent. These tests pin that contract down.
//
// The reference ceiling defaults to 2000 (PKR) — realistic for a full
// charging session at this app's example station prices — read from
// BID_REFERENCE_MAX_PKR with no override here, so these amounts are scaled
// to that default (e.g. "at the ceiling" is now 2000, not the old 100).

describe('calculatePriority — weighting', () => {
  it('is 60% normalized bid + 40% battery urgency', () => {
    // amount 2000 == reference ceiling -> normalizedBid 1.0
    // battery 10 (<=20) -> urgency 1.0
    // (1*0.6 + 1*0.4) * 100 = 100
    expect(calculatePriority(2000, 10)).toBeCloseTo(100, 5);

    // amount 1000 -> normalizedBid 0.5 ; battery 50 (<=60) -> urgency 0.4
    // (0.5*0.6 + 0.4*0.4) * 100 = 46
    expect(calculatePriority(1000, 50)).toBeCloseTo(46, 5);

    // amount 2000 -> 1.0 ; battery 90 (>60) -> urgency 0.1
    // (1*0.6 + 0.1*0.4) * 100 = 64
    expect(calculatePriority(2000, 90)).toBeCloseTo(64, 5);
  });

  it('clamps bids above the reference ceiling to a normalized 1.0', () => {
    // A huge bid can't score more than a bid exactly at the ceiling.
    expect(calculatePriority(100000, 10)).toBeCloseTo(calculatePriority(2000, 10), 5);
  });

  it('gives critical batteries (<=20%) the strongest urgency boost', () => {
    const criticalTiny = calculatePriority(20, 15); // near-zero bid, critical battery
    const healthyHuge = calculatePriority(1200, 90); // large bid, healthy battery
    // Urgency alone contributes 0.4*100 = 40 for a critical battery, so even a
    // tiny bid stays competitive against a big bid from a full battery.
    expect(criticalTiny).toBeGreaterThan(35);
    expect(criticalTiny).toBeLessThanOrEqual(healthyHuge + 40);
  });
});

describe('calculatePriority — order independence', () => {
  it('produces identical rankings no matter what order bids arrive in', () => {
    const bids = [
      { id: 'A', amount: 1600, battery: 15 },
      { id: 'B', amount: 2000, battery: 70 },
      { id: 'C', amount: 400, battery: 45 },
      { id: 'D', amount: 1100, battery: 22 },
    ].map((b) => ({ ...b, priority: calculatePriority(b.amount, b.battery) }));

    const rankOf = (arr) => [...arr].sort((x, y) => y.priority - x.priority).map((b) => b.id);

    const order1 = rankOf(bids);
    const order2 = rankOf([...bids].reverse());
    const order3 = rankOf([bids[2], bids[0], bids[3], bids[1]]); // arbitrary shuffle

    // Same ranking regardless of insertion order — the whole point of
    // normalizing against a fixed ceiling instead of the current max bid.
    expect(order2).toEqual(order1);
    expect(order3).toEqual(order1);
  });
});
