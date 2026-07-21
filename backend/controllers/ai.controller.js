import prisma from '../utils/prisma.js';

// Haversine formula for distance calculation
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// AI Scoring Algorithm
// Base score: 30% distance + 25% price + 25% availability — except the
// availability term isn't a flat 25%: it's scaled by a battery-urgency
// factor (1x at a healthy battery, up to 3x when critical), so its real
// effective weight ranges from 25% up to 75% depending on how low the
// user's battery is. On top of that base score, a flat +20 bonus is added
// whenever the battery is critical (<=20%) AND the station actually has an
// available slot right now, with the total capped at 100.
// (estimatedWaitMinutes below is informational only — queue length is
// surfaced to the user but deliberately doesn't feed into this score.)
const calculateStationScore = (station, userLat, userLon, batteryLevel) => {
  const distance = getDistance(userLat, userLon, station.latitude, station.longitude);

  const availableSlots = station.slots.filter((s) => s.status === 'AVAILABLE').length;
  const totalSlots = station.slots.length;
  const queueLength = station.slots.filter(
    (s) => s.status === 'OCCUPIED' || s.status === 'RESERVED'
  ).length;

  // Normalize scores (0-100, higher = better)
  const distanceScore = Math.max(0, 100 - distance * 10); // Penalty for each km
  const priceScore = Math.max(0, 100 - station.pricePerKwh); // Lower price (Rs./kWh) = higher score
  const availabilityScore = totalSlots > 0 ? (availableSlots / totalSlots) * 100 : 0;

  // Battery urgency modifier (critical battery gets more weight on availability)
  const batteryUrgency =
    batteryLevel <= 15 ? 3 : batteryLevel <= 30 ? 2 : batteryLevel <= 50 ? 1.5 : 1;

  const baseScore =
    distanceScore * 0.3 + priceScore * 0.25 + availabilityScore * 0.25 * batteryUrgency;

  // Urgency bonus: if battery is critical, boost nearby/available stations
  const urgencyBonus = batteryLevel <= 20 && availableSlots > 0 ? 20 : 0;

  const finalScore = Math.min(100, baseScore + urgencyBonus);

  return {
    score: parseFloat(finalScore.toFixed(2)),
    distance: parseFloat(distance.toFixed(2)),
    availableSlots,
    queueLength,
    estimatedWaitMinutes: queueLength * 30, // avg 30 min per charge
    distanceScore: parseFloat(distanceScore.toFixed(2)),
    priceScore: parseFloat(priceScore.toFixed(2)),
    availabilityScore: parseFloat(availabilityScore.toFixed(2)),
  };
};

export const getRecommendations = async (req, res, next) => {
  try {
    const { latitude, longitude, batteryLevel, limit = 5 } = req.query;

    if (!latitude || !longitude) {
      return res
        .status(400)
        .json({ success: false, message: 'Latitude and longitude are required' });
    }

    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);
    const battery = parseFloat(batteryLevel) || 50;

    // Fetch all approved stations with slots
    const stations = await prisma.chargingStation.findMany({
      where: { status: 'APPROVED' },
      include: {
        slots: {
          select: { id: true, status: true, powerKw: true, auctionOpen: true },
        },
        owner: { select: { name: true, phone: true } },
      },
    });

    if (!stations.length) {
      return res.json({ success: true, data: [], message: 'No stations available' });
    }

    // Score each station
    const scored = stations.map((station) => {
      const metrics = calculateStationScore(station, userLat, userLon, battery);
      return {
        ...station,
        aiMetrics: metrics,
        recommendation: getRecommendationLabel(metrics.score, battery, metrics.availableSlots),
      };
    });

    // Sort by score descending
    scored.sort((a, b) => b.aiMetrics.score - a.aiMetrics.score);

    const top = scored.slice(0, parseInt(limit));

    // Add AI explanation for top station
    if (top.length > 0) {
      top[0].aiExplanation = generateExplanation(top[0], battery);
    }

    res.json({
      success: true,
      message: 'AI recommendations generated',
      data: top,
      meta: {
        batteryLevel: battery,
        userLocation: { lat: userLat, lon: userLon },
        totalStationsAnalyzed: stations.length,
        isEmergency: battery <= 20,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getRecommendationLabel = (score, battery, availableSlots) => {
  if (battery <= 15 && availableSlots > 0) return 'EMERGENCY_PRIORITY';
  if (score >= 75) return 'HIGHLY_RECOMMENDED';
  if (score >= 50) return 'RECOMMENDED';
  if (score >= 25) return 'FAIR';
  return 'NOT_RECOMMENDED';
};

const generateExplanation = (station, batteryLevel) => {
  const { aiMetrics } = station;
  const parts = [];

  if (aiMetrics.distance < 2) parts.push('very close to you');
  else if (aiMetrics.distance < 5) parts.push(`only ${aiMetrics.distance}km away`);

  if (aiMetrics.availableSlots > 0) parts.push(`${aiMetrics.availableSlots} slot(s) available`);
  else parts.push('slots may become available soon');

  if (station.pricePerKwh < 40) parts.push('great pricing');

  if (batteryLevel <= 20) parts.push('prioritized due to low battery emergency');

  return `Best choice because: ${parts.join(', ')}.`;
};
