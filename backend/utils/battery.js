// Shared battery-percentage math for the check-in -> charging-complete
// lifecycle (booking.controller.js, chargingSession.controller.js) and for
// Usage Analytics (analytics.controller.js). There's no real battery
// telemetry in this system — batteryAfter is estimated from energy
// delivered and the EV's rated capacity, the same inputs the rest of the
// app already uses for cost/energy math.

export const clampBattery = (value) => Math.min(100, Math.max(0, value));

/**
 * Estimate the EV's battery % once a session ends, from how much energy was
 * delivered relative to its rated capacity. Always >= batteryBefore (energy
 * delivered is never negative), and capped at 100.
 * Returns null when there isn't enough data to make a safe estimate.
 */
export const estimateBatteryAfter = (batteryBefore, energyKwh, batteryCapacity) => {
  if (batteryBefore == null || !batteryCapacity || batteryCapacity <= 0) return null;
  if (energyKwh == null || energyKwh < 0) return null;
  const gainedPercent = (energyKwh / batteryCapacity) * 100;
  return Number(clampBattery(batteryBefore + gainedPercent).toFixed(2));
};
