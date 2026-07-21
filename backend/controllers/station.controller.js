import prisma from '../utils/prisma.js';
import { ratingStatsFor } from './review.controller.js';
import { expireAllStaleBookings } from '../utils/bookingExpiry.js';
import { escapeRegex } from '../utils/regex.js';
import { getCached, setCached, clearCacheByPrefix } from '../utils/simpleCache.js';
import { isValidImageDataUrl } from '../utils/validateImageBytes.js';

const notNull = (v) => v !== undefined && v !== null && v !== '';

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
          },
        },
      },
    });

    if (!station) return res.status(404).json({ success: false, message: 'No station found' });
    res.json({ success: true, data: station });
  } catch (error) {
    next(error);
  }
};

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
    const data = {
      ...(notNull(name) && { name }),
      ...(notNull(address) && { address }),
      ...(notNull(city) && { city }),
      ...(notNull(latitude) &&
        !Number.isNaN(parseFloat(latitude)) && { latitude: parseFloat(latitude) }),
      ...(notNull(longitude) &&
        !Number.isNaN(parseFloat(longitude)) && { longitude: parseFloat(longitude) }),
      ...(notNull(pricePerKwh) &&
        !Number.isNaN(parseFloat(pricePerKwh)) &&
        parseFloat(pricePerKwh) >= 0 && { pricePerKwh: parseFloat(pricePerKwh) }),
      ...(amenitiesCheck.value !== undefined && { amenities: amenitiesCheck.value }),
      ...(imagesCheck.value !== undefined && { images: imagesCheck.value }),
    };

    if (!Object.keys(data).length) {
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

    const updated = await prisma.chargingStation.update({ where: { ownerId: req.user.id }, data });
    clearCacheByPrefix('stations:list:'); // this station's card may have just changed
    res.json({
      success: true,
      message:
        station.status === 'REJECTED'
          ? 'Station updated and resubmitted for approval'
          : 'Station updated',
      data: updated,
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
    const station = await prisma.chargingStation.findUnique({ where: { ownerId: req.user.id } });
    if (!station) return res.status(404).json({ success: false, message: 'Station not found' });

    const { page = 1, limit = 20, status } = req.query;
    const take = Math.min(parseInt(limit) || 20, 100);
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
        include: {
          user: { select: { name: true, email: true, phone: true } },
          ev: { select: { model: true, licensePlate: true } },
          slot: { select: { slotNumber: true, powerKw: true } },
          payment: true,
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({
      success: true,
      data: bookings,
      pagination: { page: parseInt(page) || 1, limit: take, total, pages: Math.ceil(total / take) },
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
    // user never paid for isn't revenue.
    const paidWhere = {
      slot: { stationId: station.id },
      status: 'COMPLETED',
      totalCost: { not: null },
      payment: { status: 'COMPLETED' },
    };

    // FIX: use Prisma aggregate instead of pulling all records into JS memory
    const [totalAgg, completedCount, bookingsByMonth] = await Promise.all([
      prisma.booking.aggregate({
        where: paidWhere,
        _sum: { totalCost: true },
      }),
      prisma.booking.count({
        where: { slot: { stationId: station.id }, status: 'COMPLETED' },
      }),
      prisma.booking.findMany({
        where: paidWhere,
        select: { totalCost: true, createdAt: true },
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
      monthlyRevenue[key] = parseFloat(
        ((monthlyRevenue[key] || 0) + (b.totalCost || 0)).toFixed(2)
      );
    });

    res.json({
      success: true,
      data: {
        totalRevenue: totalAgg._sum.totalCost || 0,
        totalBookings: completedCount,
        monthlyRevenue,
      },
    });
  } catch (error) {
    next(error);
  }
};
