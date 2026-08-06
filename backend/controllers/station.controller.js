import prisma from '../utils/prisma.js';
import { ratingStatsFor } from './review.controller.js';
import { expireAllStaleBookings } from '../utils/bookingExpiry.js';
import { escapeRegex } from '../utils/regex.js';
import { getCached, setCached, clearCacheByPrefix } from '../utils/simpleCache.js';
import { isValidImageDataUrl } from '../utils/validateImageBytes.js';
import { paginationMeta } from '../utils/pagination.js';

const notNull = (v) => v !== undefined && v !== null && v !== '';
const eqField = (a, b) => (typeof a === 'number' ? Math.abs(a - b) < 1e-9 : a === b);

// Fixed checklist rather than free text, so the frontend renders a
// consistent badge/icon set instead of arbitrary owner-typed strings.
export const ALLOWED_AMENITIES = [
  'Fast Charging',
  'Restroom',
  'Cafe',
  'WiFi',
  'Parking',
  '24/7 Access',
  'CCTV',
  'Covered Parking',
];
const MAX_STATION_IMAGES = 5;
const MAX_IMAGE_BYTES = 80 * 1024;

const ownerBookingInclude = {
  user: { select: { name: true, email: true, phone: true } },
  ev: { select: { model: true, licensePlate: true } },
  slot: {
    select: {
      slotNumber: true,
      powerKw: true,
      station: { select: { pricePerKwh: true } },
    },
  },
  payment: true,
};

// Shared by presentOwnerBooking (full row detail) and getStationReport's
// lean summary/chart pass (which only selects booking.payment, not the full
// row) — same paid/refund math either way, one place, so the two can't drift.
const paymentFigures = (payment) => {
  const settledPayment = ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment?.status);
  const paidAmount = settledPayment ? (payment?.amount ?? 0) : 0;
  const refundAmount = payment?.refundedAmount ?? 0;
  return { paidAmount, refundAmount, finalChargedAmount: Math.max(paidAmount - refundAmount, 0) };
};

const sessionStatusFor = (booking) =>
  booking.stopReason
    ? 'EMERGENCY_STOPPED'
    : booking.status === 'COMPLETED'
      ? 'COMPLETED'
      : booking.status === 'CANCELLED'
        ? 'CANCELLED'
        : 'ACTIVE';

const presentOwnerBooking = (booking, station) => {
  const { paidAmount, refundAmount, finalChargedAmount } = paymentFigures(booking.payment);

  return {
    ...booking,
    sessionId: booking.id,
    sessionStartTime: booking.chargingStartedAt || booking.checkInTime || booking.startTime,
    sessionEndTime: booking.endTime || booking.plannedEndTime,
    sessionDurationMinutes: booking.durationMinutes,
    energyDeliveredKwh: booking.finalEnergyKwh,
    pricePerKwh: booking.ratePerKwh ?? booking.slot.station.pricePerKwh,
    totalAmount: booking.finalBill ?? booking.totalCost,
    sessionStatus: sessionStatusFor(booking),
    emergencyStop: Boolean(booking.stopReason),
    emergencyStoppedByName:
      booking.emergencyStoppedBy === station.ownerId ? station.owner.name : null,
    emergencyReason: booking.stopReason,
    paidAmount,
    refundAmount,
    finalChargedAmount,
  };
};

const dataUrlByteLength = (dataUrl) => {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.floor((base64.length * 3) / 4);
};

// Returns { ok:true, value } with value === undefined when the field wasn't
// sent at all (so callers can spread it into a Prisma `data` object without
// touching the existing column on a partial update).
const validateAmenities = (amenities) => {
  if (amenities === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(amenities)) return { ok: false, message: 'amenities must be an array' };
  const invalid = amenities.filter((a) => !ALLOWED_AMENITIES.includes(a));
  if (invalid.length) return { ok: false, message: `Unknown amenity: ${invalid.join(', ')}` };
  return { ok: true, value: [...new Set(amenities)] };
};

const validateImages = (images) => {
  if (images === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(images)) return { ok: false, message: 'images must be an array' };
  if (images.length > MAX_STATION_IMAGES) {
    return { ok: false, message: `Maximum ${MAX_STATION_IMAGES} images` };
  }
  for (const img of images) {
    if (typeof img !== 'string' || !isValidImageDataUrl(img)) {
      return { ok: false, message: 'Each image must be a valid image (JPEG, PNG, or WebP)' };
    }
    if (dataUrlByteLength(img) > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        message: `Each image must be under ${Math.round(MAX_IMAGE_BYTES / 1024)}KB`,
      };
    }
  }
  return { ok: true, value: images };
};

export const createStation = async (req, res, next) => {
  try {
    const { name, address, city, latitude, longitude, pricePerKwh, amenities, images } = req.body;

    const isMissing = (v) => v === undefined || v === null || v === '';
    const missingFields = [];
    if (isMissing(name)) missingFields.push('name');
    if (isMissing(address)) missingFields.push('address');
    if (isMissing(city)) missingFields.push('city');
    if (isMissing(latitude)) missingFields.push('latitude');
    if (isMissing(longitude)) missingFields.push('longitude');
    if (isMissing(pricePerKwh)) missingFields.push('pricePerKwh');

    if (missingFields.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required field(s): ${missingFields.join(', ')}`,
      });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const price = parseFloat(pricePerKwh);

    if (Number.isNaN(lat) || lat < -90 || lat > 90)
      return res
        .status(400)
        .json({ success: false, message: 'latitude must be between -90 and 90' });
    if (Number.isNaN(lon) || lon < -180 || lon > 180)
      return res
        .status(400)
        .json({ success: false, message: 'longitude must be between -180 and 180' });
    if (Number.isNaN(price) || price < 0)
      return res.status(400).json({ success: false, message: 'pricePerKwh must be >= 0' });

    const amenitiesCheck = validateAmenities(amenities);
    if (!amenitiesCheck.ok)
      return res.status(400).json({ success: false, message: amenitiesCheck.message });
    const imagesCheck = validateImages(images);
    if (!imagesCheck.ok)
      return res.status(413).json({ success: false, message: imagesCheck.message });

    const existing = await prisma.chargingStation.findUnique({ where: { ownerId: req.user.id } });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: 'You already have a station registered' });
    }

    const station = await prisma.chargingStation.create({
      data: {
        ownerId: req.user.id,
        name,
        address,
        city,
        latitude: lat,
        longitude: lon,
        pricePerKwh: price,
        ...(amenitiesCheck.value !== undefined && { amenities: amenitiesCheck.value }),
        ...(imagesCheck.value !== undefined && { images: imagesCheck.value }),
      },
    });

    res
      .status(201)
      .json({ success: true, message: 'Station submitted for approval', data: station });
  } catch (error) {
    next(error);
  }
};

export const getMyStation = async (req, res, next) => {
  try {
    const station = await prisma.chargingStation.findUnique({
      where: { ownerId: req.user.id },
      include: {
        slots: {
          include: {
            bookings: {
              where: { status: { in: ['PENDING', 'CONFIRMED', 'ACTIVE'] } },
              select: { id: true, status: true, startTime: true },
            },
            bids: {
              where: { status: 'PENDING' },
              orderBy: { priority: 'desc' },
              select: { id: true, amount: true, priority: true },
            },
          },
        },
        // At most one row per station (see the model comment) — PENDING
        // means it's awaiting admin review; a REJECTED one stays visible
        // too so the owner sees why, until they resubmit.
        updateRequests: true,
      },
    });

    if (!station) return res.status(404).json({ success: false, message: 'No station found' });
    res.json({ success: true, data: station });
  } catch (error) {
    next(error);
  }
};

// Location and price directly affect what a customer is charged and where
// they physically drive to — once a station is live (APPROVED), those
// fields require admin sign-off. Name/amenities/images are cosmetic and
// stay directly editable regardless of status.
const GATED_FIELDS = ['address', 'city', 'latitude', 'longitude', 'pricePerKwh'];

export const updateStation = async (req, res, next) => {
  try {
    const { name, address, city, latitude, longitude, pricePerKwh, amenities, images } = req.body;

    const station = await prisma.chargingStation.findUnique({ where: { ownerId: req.user.id } });
    if (!station) return res.status(404).json({ success: false, message: 'Station not found' });

    const amenitiesCheck = validateAmenities(amenities);
    if (!amenitiesCheck.ok)
      return res.status(400).json({ success: false, message: amenitiesCheck.message });
    const imagesCheck = validateImages(images);
    if (!imagesCheck.ok)
      return res.status(413).json({ success: false, message: imagesCheck.message });

    // FIX: use notNull() not falsy check — latitude:0 and pricePerKwh:0 are valid values
    const gated = {
      ...(notNull(address) && { address }),
      ...(notNull(city) && { city }),
      ...(notNull(latitude) &&
        !Number.isNaN(parseFloat(latitude)) && { latitude: parseFloat(latitude) }),
      ...(notNull(longitude) &&
        !Number.isNaN(parseFloat(longitude)) && { longitude: parseFloat(longitude) }),
      ...(notNull(pricePerKwh) &&
        !Number.isNaN(parseFloat(pricePerKwh)) &&
        parseFloat(pricePerKwh) >= 0 && { pricePerKwh: parseFloat(pricePerKwh) }),
    };
    // Drop anything that isn't actually a change from the live value —
    // resubmitting the same address shouldn't open a request needing review.
    for (const field of GATED_FIELDS) {
      if (field in gated && eqField(gated[field], station[field])) delete gated[field];
    }

    const data = {
      ...(notNull(name) && { name }),
      ...(amenitiesCheck.value !== undefined && { amenities: amenitiesCheck.value }),
      ...(imagesCheck.value !== undefined && { images: imagesCheck.value }),
    };

    const requiresApproval = station.status === 'APPROVED' && Object.keys(gated).length > 0;
    if (!requiresApproval) Object.assign(data, gated);

    if (!Object.keys(data).length && !requiresApproval) {
      return res
        .status(400)
        .json({ success: false, message: 'No valid fields provided for update' });
    }

    // A rejected station previously had no way back — it could be edited,
    // but never re-reviewed, and a second registration is permanently
    // blocked by the unique ownerId constraint. Editing now IS resubmission:
    // it goes back to PENDING for another look, no separate endpoint needed.
    if (station.status === 'REJECTED') {
      data.status = 'PENDING';
    }

    let pendingRequest = null;
    const [updated] = await Promise.all([
      Object.keys(data).length
        ? prisma.chargingStation.update({ where: { ownerId: req.user.id }, data })
        : station,
      requiresApproval
        ? (async () => {
            pendingRequest = await prisma.stationUpdateRequest.upsert({
              where: { stationId: station.id },
              create: { stationId: station.id, ...gated },
              // A second submission while one's already pending replaces it
              // outright (see the model comment) — including resetting a
              // previously REJECTED request back to PENDING for another look.
              update: { ...gated, status: 'PENDING', adminNote: null, reviewedAt: null },
            });
          })()
        : Promise.resolve(),
    ]);
    clearCacheByPrefix('stations:list:'); // this station's card may have just changed

    const messages = [];
    if (Object.keys(data).length) {
      messages.push(station.status === 'REJECTED' ? 'Station updated and resubmitted for approval' : 'Station updated');
    }
    if (requiresApproval) {
      messages.push('Address/price change submitted for admin approval');
    }

    res.json({
      success: true,
      message: messages.join(' — ') || 'Station updated',
      data: updated,
      pendingRequest,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllStations = async (req, res, next) => {
  try {
    const { city, name, maxPrice, minRating, page = 1, limit = 20 } = req.query;
    const take = Math.min(parseInt(limit) || 20, 100);
    const pageNum = Math.max(parseInt(page) || 1, 1);

    // The public list is hit by every visitor browsing the app, changes
    // infrequently (stations aren't approved/edited every minute), and is
    // non-trivial to compute (fetch + cross-station rating aggregation +
    // in-JS filter/paginate) — a good, low-risk candidate for a short cache.
    // Keyed on the exact query, so different filters/pages never collide;
    // explicitly invalidated in updateStation/updateStationStatus below
    // rather than left to expire on its own, so an approval or edit is
    // visible immediately instead of up to 30s later.
    const cacheKey = `stations:list:${JSON.stringify(req.query)}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const priceCeiling = maxPrice !== undefined ? parseFloat(maxPrice) : undefined;
    const ratingFloor = minRating !== undefined ? parseFloat(minRating) : undefined;

    const where = {
      status: 'APPROVED',
      ...(city &&
        typeof city === 'string' && { city: { contains: escapeRegex(city), mode: 'insensitive' } }),
      ...(name &&
        typeof name === 'string' && { name: { contains: escapeRegex(name), mode: 'insensitive' } }),
      ...(priceCeiling !== undefined &&
        !Number.isNaN(priceCeiling) && { pricePerKwh: { lte: priceCeiling } }),
    };

    // Rating isn't a column on ChargingStation (it's aggregated from Review
    // at read time), so a minRating filter can't be a Prisma `where` clause —
    // fetch every station matching the DB-level filters first, decorate with
    // ratings, filter by rating in JS, then paginate the filtered list. Fine
    // at this app's scale (dozens of stations, not thousands); pagination
    // stays correct either way, unlike filtering after a DB-level skip/take.
    // Explicit select, not a bare findMany: the public list page only ever
    // shows images[0] as a card thumbnail (never the full gallery — that's
    // the detail page's job), so returning all 5 possible photos per
    // station here is pure wasted bandwidth on every single page view.
    // Also deliberately excludes ownerId and totalRevenue — a station
    // owner's revenue figures are private business data with no reason to
    // be visible to every visitor of a public listing, even if the current
    // frontend doesn't happen to render them; anyone can call this
    // endpoint directly regardless of what the UI shows.
    const allMatching = await prisma.chargingStation.findMany({
      where,
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        latitude: true,
        longitude: true,
        pricePerKwh: true,
        amenities: true,
        images: true,
        createdAt: true,
        slots: {
          select: { id: true, status: true, slotNumber: true, powerKw: true, auctionOpen: true },
        },
        owner: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Trim to the one image the list view actually uses, after the DB call
    // (Prisma can't slice a scalar array field at the query level) — this
    // is what actually shrinks the response payload sent over the network.
    allMatching.forEach((s) => {
      s.images = s.images?.slice(0, 1) ?? [];
    });

    const stats = await ratingStatsFor(allMatching.map((s) => s.id));
    let decorated = allMatching.map((s) => ({
      ...s,
      ratingAvg: stats[s.id]?.ratingAvg ?? 0,
      ratingCount: stats[s.id]?.ratingCount ?? 0,
    }));

    if (ratingFloor !== undefined && !Number.isNaN(ratingFloor)) {
      decorated = decorated.filter((s) => s.ratingAvg >= ratingFloor);
    }

    const total = decorated.length;
    const skip = (pageNum - 1) * take;
    const paged = decorated.slice(skip, skip + take);

    const responseBody = {
      success: true,
      data: paged,
      pagination: { page: pageNum, limit: take, total, pages: Math.ceil(total / take) },
    };
    setCached(cacheKey, responseBody, 30_000);
    res.json(responseBody);
  } catch (error) {
    next(error);
  }
};

export const getStationById = async (req, res, next) => {
  try {
    const station = await prisma.chargingStation.findUnique({
      where: { id: req.params.id },
      include: {
        slots: {
          include: {
            bids: {
              where: { status: 'PENDING' },
              select: { id: true, amount: true, priority: true, createdAt: true },
            },
          },
        },
        // No email — this is a public, unauthenticated endpoint; the list
        // endpoint already omits it too, this was the one inconsistent leak.
        owner: { select: { name: true, phone: true } },
      },
    });

    // Non-approved stations (PENDING/REJECTED) aren't in the public list,
    // but were still directly reachable by ID with a "Book Now" that would
    // just 400 server-side. Owners/admins already have their own dedicated
    // views (the owner dashboard, the admin stations panel) for this data.
    if (!station || station.status !== 'APPROVED') {
      return res.status(404).json({ success: false, message: 'Station not found' });
    }

    const stats = (await ratingStatsFor([station.id]))[station.id];
    res.json({
      success: true,
      data: { ...station, ratingAvg: stats?.ratingAvg ?? 0, ratingCount: stats?.ratingCount ?? 0 },
    });
  } catch (error) {
    next(error);
  }
};

export const getStationBookings = async (req, res, next) => {
  try {
    const station = await prisma.chargingStation.findUnique({
      where: { ownerId: req.user.id },
      include: { owner: { select: { name: true } } },
    });
    if (!station) return res.status(404).json({ success: false, message: 'Station not found' });

    const { page = 1, limit = 10, status } = req.query;
    const take = Math.min(parseInt(limit) || 10, 100);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

    await expireAllStaleBookings({ slot: { stationId: station.id } });

    const where = {
      slot: { stationId: station.id },
      ...(status && { status }),
    };

    // FIX: include total count for proper pagination
    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: ownerBookingInclude,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.booking.count({ where }),
    ]);

    const bookingDetails = bookings.map((booking) => presentOwnerBooking(booking, station));

    res.json({
      success: true,
      data: bookingDetails,
      pagination: paginationMeta(total, Math.max(parseInt(page) || 1, 1), take),
    });
  } catch (error) {
    next(error);
  }
};

export const getStationBookingDetails = async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.bookingId)) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const station = await prisma.chargingStation.findUnique({
      where: { ownerId: req.user.id },
      include: { owner: { select: { name: true } } },
    });
    if (!station) return res.status(404).json({ success: false, message: 'Station not found' });

    await expireAllStaleBookings({
      id: req.params.bookingId,
      slot: { stationId: station.id },
    });

    const booking = await prisma.booking.findFirst({
      where: {
        id: req.params.bookingId,
        slot: { stationId: station.id },
      },
      include: ownerBookingInclude,
    });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    return res.json({ success: true, data: presentOwnerBooking(booking, station) });
  } catch (error) {
    next(error);
  }
};

export const getStationReport = async (req, res, next) => {
  try {
    const station = await prisma.chargingStation.findUnique({
      where: { ownerId: req.user.id },
      include: {
        owner: { select: { name: true } },
        slots: { select: { slotNumber: true }, orderBy: { slotNumber: 'asc' } },
      },
    });
    if (!station) return res.status(404).json({ success: false, message: 'Station not found' });

    const {
      search = '',
      dateFrom,
      dateTo,
      sessionStatus,
      paymentStatus,
      slotNumber,
      page = 1,
      limit = 10,
      export: exportAll,
    } = req.query;
    const normalizedSearch = String(search).trim();
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const take = Math.min(Math.max(parseInt(limit) || 10, 1), exportAll === 'true' ? 5000 : 100);
    const parsedSlot = slotNumber === undefined || slotNumber === '' ? null : parseInt(slotNumber);
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : null;

    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      return res.status(400).json({ success: false, message: 'Invalid report date range' });
    }
    if (from && to && from > to) {
      return res.status(400).json({ success: false, message: 'Start date must be before end date' });
    }
    if (parsedSlot !== null && (!Number.isInteger(parsedSlot) || parsedSlot < 1)) {
      return res.status(400).json({ success: false, message: 'Invalid slot number' });
    }
    const allowedSessionStatuses = [
      'PENDING',
      'CONFIRMED',
      'CHECKED_IN',
      'ACTIVE',
      'COMPLETED',
      'CANCELLED',
      'EMERGENCY_STOPPED',
    ];
    const allowedPaymentStatuses = [
      'PENDING',
      'COMPLETED',
      'FAILED',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
    ];
    if (sessionStatus && !allowedSessionStatuses.includes(sessionStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid session status' });
    }
    if (paymentStatus && !allowedPaymentStatuses.includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid payment status' });
    }

    const sessionWhere =
      sessionStatus === 'EMERGENCY_STOPPED'
        ? { status: 'COMPLETED', stopReason: { not: null } }
        : sessionStatus === 'COMPLETED'
          ? { status: 'COMPLETED', stopReason: { isSet: false } }
          : sessionStatus === 'ACTIVE'
            ? { status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'ACTIVE'] } }
          : sessionStatus
            ? { status: sessionStatus }
            : {};
    const where = {
      slot: {
        stationId: station.id,
        ...(parsedSlot !== null && { slotNumber: parsedSlot }),
      },
      ...sessionWhere,
      ...(paymentStatus && { payment: { status: paymentStatus } }),
      ...((from || to) && {
        startTime: {
          ...(from && { gte: from }),
          ...(to && { lte: to }),
        },
      }),
      ...(normalizedSearch && {
        OR: [
          ...(/^[a-f\d]{24}$/i.test(normalizedSearch) ? [{ id: normalizedSearch }] : []),
          { user: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
          { ev: { model: { contains: normalizedSearch, mode: 'insensitive' } } },
        ],
      }),
    };

    await expireAllStaleBookings(where);

    const skip = (parsedPage - 1) * take;
    // AND (not object-spread) with `where` — `where` may already constrain
    // status/stopReason itself when the caller filters by sessionStatus, and
    // a spread-merge would silently override that filter instead of
    // intersecting with it.
    const withStatus = (extra) => ({ AND: [where, extra] });

    // totalSessions/…/emergencyStoppedSessions and totalEnergyDelivered are
    // plain DB-side counts/sums — no rows need loading for those.
    // totalRevenue/totalRefundAmount aren't raw columns (paymentFigures
    // derives them from Payment), so they still need a row-level pass — but
    // a lean one (4 fields, not the full user/ev/slot/payment include `rows`
    // below uses). That same lean pass also builds chartSessions. Only
    // `rows` — what's actually rendered in the table — is fetched with
    // skip/take, so a normal page load pulls one page of full detail plus
    // one lightweight full-scan for the summary/chart, never the full
    // dataset with full relations like before.
    const [
      totalSessions,
      completedSessions,
      cancelledSessions,
      emergencyStoppedSessions,
      energyAgg,
      leanBookings,
      rowsRaw,
    ] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.count({
        where: withStatus({ status: 'COMPLETED', stopReason: { isSet: false } }),
      }),
      prisma.booking.count({
        where: withStatus({ status: 'CANCELLED', stopReason: { isSet: false } }),
      }),
      prisma.booking.count({ where: withStatus({ stopReason: { not: null } }) }),
      prisma.booking.aggregate({ where, _sum: { finalEnergyKwh: true } }),
      prisma.booking.findMany({
        where,
        select: {
          createdAt: true,
          status: true,
          stopReason: true,
          payment: { select: { status: true, amount: true, refundedAmount: true } },
        },
        orderBy: { startTime: 'desc' },
      }),
      prisma.booking.findMany({
        where,
        include: ownerBookingInclude,
        orderBy: { startTime: 'desc' },
        skip: exportAll === 'true' ? 0 : skip,
        take,
      }),
    ]);

    const summary = leanBookings.reduce(
      (result, booking) => {
        // totalRevenue is the gross amount collected and totalRefundAmount
        // is what was later given back — two independent totals a reader
        // can compare. Summing finalChargedAmount here instead (paid minus
        // refund) would double-subtract every refund: once out of revenue,
        // once again by displaying it in the refund total on top.
        const { paidAmount, refundAmount } = paymentFigures(booking.payment);
        result.totalRevenue += paidAmount;
        result.totalRefundAmount += refundAmount;
        return result;
      },
      {
        totalSessions,
        completedSessions,
        cancelledSessions,
        emergencyStoppedSessions,
        totalRevenue: 0,
        totalRefundAmount: 0,
        totalEnergyDelivered: energyAgg._sum.finalEnergyKwh ?? 0,
      }
    );

    const rows = rowsRaw.map((booking) => presentOwnerBooking(booking, station));
    const chartSessions = leanBookings.map((booking) => ({
      createdAt: booking.createdAt,
      sessionStatus: sessionStatusFor(booking),
      finalChargedAmount: paymentFigures(booking.payment).finalChargedAmount,
    }));

    return res.json({
      success: true,
      data: {
        summary,
        rows,
        slotNumbers: station.slots.map((slot) => slot.slotNumber),
        chartSessions,
      },
      pagination: paginationMeta(totalSessions, parsedPage, take),
    });
  } catch (error) {
    next(error);
  }
};

export const getStationRevenue = async (req, res, next) => {
  try {
    const station = await prisma.chargingStation.findUnique({ where: { ownerId: req.user.id } });
    if (!station) return res.status(404).json({ success: false, message: 'Station not found' });

    // Only count bookings that were actually paid — a completed session the
    // user never paid for isn't revenue. PARTIALLY_REFUNDED is included (an
    // emergency-stopped session where only the unused portion was refunded —
    // see chargingSession.controller.js): totalAgg still sums the full
    // totalCost, so refundAgg below nets out the refunded part. Fully
    // REFUNDED payments are correctly excluded — nothing was kept.
    const paidWhere = {
      slot: { stationId: station.id },
      status: 'COMPLETED',
      totalCost: { not: null },
      payment: { status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED'] } },
    };

    // FIX: use Prisma aggregate instead of pulling all records into JS memory
    const [totalAgg, refundAgg, completedCount, bookingsByMonth] = await Promise.all([
      prisma.booking.aggregate({
        where: paidWhere,
        _sum: { totalCost: true },
      }),
      prisma.payment.aggregate({
        where: { booking: { slot: { stationId: station.id } }, status: 'PARTIALLY_REFUNDED' },
        _sum: { refundedAmount: true },
      }),
      prisma.booking.count({
        where: { slot: { stationId: station.id }, status: 'COMPLETED' },
      }),
      prisma.booking.findMany({
        where: paidWhere,
        select: { totalCost: true, createdAt: true, payment: { select: { refundedAmount: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200, // only last 200 for the monthly chart — avoids unbounded memory
      }),
    ]);

    const monthlyRevenue = {};
    bookingsByMonth.forEach((b) => {
      const key = new Date(b.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      });
      const net = (b.totalCost || 0) - (b.payment?.refundedAmount || 0);
      monthlyRevenue[key] = parseFloat(((monthlyRevenue[key] || 0) + net).toFixed(2));
    });

    const totalRevenue = (totalAgg._sum.totalCost || 0) - (refundAgg._sum.refundedAmount || 0);

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalBookings: completedCount,
        monthlyRevenue,
      },
    });
  } catch (error) {
    next(error);
  }
};
