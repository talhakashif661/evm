import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');
  console.log('ℹ️  Admin accounts are NOT seeded here on purpose — create the first');
  console.log('   admin via POST /api/auth/setup-admin (see README.md). This seed only');
  console.log('   creates demo station owners, EV users, stations, slots and EVs.');

  // Create Station Owners
  const ownerPass = await bcrypt.hash('Owner@123', 12);
  const owner1 = await prisma.user.upsert({
    where: { email: 'owner1@evmanagement.com' },
    update: {},
    create: {
      name: 'John Station',
      email: 'owner1@evmanagement.com',
      password: ownerPass,
      role: 'STATION_OWNER',
      isVerified: true,
      phone: '+1-555-100-0001',
    },
  });

  const owner2 = await prisma.user.upsert({
    where: { email: 'owner2@evmanagement.com' },
    update: {},
    create: {
      name: 'Sarah Power',
      email: 'owner2@evmanagement.com',
      password: ownerPass,
      role: 'STATION_OWNER',
      isVerified: true,
      phone: '+1-555-100-0002',
    },
  });
  console.log('✅ Station owners created');

  // Create EV Users
  const userPass = await bcrypt.hash('User@123', 12);
  const user1 = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      name: 'Alice Johnson',
      email: 'alice@example.com',
      password: userPass,
      role: 'EV_USER',
      phone: '+1-555-200-0001',
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      name: 'Bob Smith',
      email: 'bob@example.com',
      password: userPass,
      role: 'EV_USER',
      phone: '+1-555-200-0002',
    },
  });
  console.log('✅ EV users created');

  // Create Charging Stations
  const station1 = await prisma.chargingStation.upsert({
    where: { ownerId: owner1.id },
    update: {},
    create: {
      ownerId: owner1.id,
      name: 'Downtown EV Hub',
      address: '123 Main Street',
      city: 'New York',
      latitude: 40.7128,
      longitude: -74.006,
      status: 'APPROVED',
      pricePerKwh: 40,
      totalRevenue: 245075,
    },
  });

  const station2 = await prisma.chargingStation.upsert({
    where: { ownerId: owner2.id },
    update: {},
    create: {
      ownerId: owner2.id,
      name: 'Uptown Charge Point',
      address: '456 Park Avenue',
      city: 'New York',
      latitude: 40.7614,
      longitude: -73.9776,
      status: 'APPROVED',
      pricePerKwh: 32,
      totalRevenue: 182050,
    },
  });
  console.log('✅ Stations created');

  // Create Slots
  const slotsData1 = [
    { stationId: station1.id, slotNumber: 1, powerKw: 50, status: 'AVAILABLE' },
    { stationId: station1.id, slotNumber: 2, powerKw: 50, status: 'OCCUPIED' },
    { stationId: station1.id, slotNumber: 3, powerKw: 100, status: 'AVAILABLE' },
    {
      stationId: station1.id,
      slotNumber: 4,
      powerKw: 22,
      status: 'AVAILABLE',
      auctionOpen: true,
      auctionEnd: new Date(Date.now() + 3600000),
      auctionStartingBid: 500,
      auctionMinIncrement: 50,
      auctionReservationMinutes: 10,
    },
  ];

  const slotsData2 = [
    { stationId: station2.id, slotNumber: 1, powerKw: 150, status: 'AVAILABLE' },
    { stationId: station2.id, slotNumber: 2, powerKw: 50, status: 'AVAILABLE' },
    { stationId: station2.id, slotNumber: 3, powerKw: 22, status: 'MAINTENANCE' },
  ];

  const createdSlots = [];
  for (const s of [...slotsData1, ...slotsData2]) {
    const existing = await prisma.slot.findFirst({
      where: { stationId: s.stationId, slotNumber: s.slotNumber },
    });
    if (!existing) {
      const slot = await prisma.slot.create({ data: s });
      createdSlots.push(slot);
    }
  }
  console.log('✅ Slots created');

  // Create EVs
  await prisma.eV
    .create({
      data: {
        userId: user1.id,
        model: 'Tesla Model 3',
        batteryCapacity: 82,
        batteryPercentage: 45,
        licensePlate: 'NY-EV-001',
      },
    })
    .catch(() => null);

  await prisma.eV
    .create({
      data: {
        userId: user2.id,
        model: 'Nissan Leaf',
        batteryCapacity: 40,
        batteryPercentage: 22,
        licensePlate: 'NY-EV-002',
      },
    })
    .catch(() => null);
  console.log('✅ EVs created');

  console.log('\n🎉 Seed complete!');
  console.log('\n📋 Test Credentials:');
  console.log('Station Owner: owner1@evmanagement.com / Owner@123');
  console.log('Station Owner: owner2@evmanagement.com / Owner@123');
  console.log('EV User:       alice@example.com       / User@123');
  console.log('EV User:       bob@example.com         / User@123');
  console.log('\n👉 Create the admin account separately via POST /api/auth/setup-admin');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
