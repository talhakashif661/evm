import prisma from '../utils/prisma.js';

export const addEV = async (req, res, next) => {
  try {
    const { model, batteryCapacity, batteryPercentage, licensePlate } = req.body;

    if (!model || batteryCapacity === undefined || batteryCapacity === null || batteryCapacity === '') {
      return res.status(400).json({ success: false, message: 'Model and battery capacity are required' });
    }

    // Validate the parsed numbers so a non-numeric string (e.g. "abc") can't be
    // written to MongoDB as NaN — the same class of bug that was fixed in
    // updateEV / updateBatteryLevel but was still present on the create path.
    const parsedCapacity = parseFloat(batteryCapacity);
    if (Number.isNaN(parsedCapacity) || parsedCapacity <= 0) {
      return res.status(400).json({ success: false, message: 'Battery capacity must be a positive number' });
    }

    let parsedPercentage = 100;
    if (batteryPercentage !== undefined && batteryPercentage !== null && batteryPercentage !== '') {
      parsedPercentage = parseFloat(batteryPercentage);
      if (Number.isNaN(parsedPercentage) || parsedPercentage < 0 || parsedPercentage > 100) {
        return res.status(400).json({ success: false, message: 'Battery percentage must be between 0 and 100' });
      }
    }

    const ev = await prisma.eV.create({
      data: {
        userId: req.user.id,
        model,
        batteryCapacity: parsedCapacity,
        batteryPercentage: parsedPercentage,
        licensePlate
      }
    });

    res.status(201).json({ success: true, message: 'EV added successfully', data: ev });
  } catch (error) {
    next(error);
  }
};

export const getMyEVs = async (req, res, next) => {
  try {
    const evs = await prisma.eV.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: evs });
  } catch (error) {
    next(error);
  }
};

export const updateEV = async (req, res, next) => {
  try {
    const { model, batteryCapacity, batteryPercentage, licensePlate } = req.body;

    const ev = await prisma.eV.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!ev) return res.status(404).json({ success: false, message: 'EV not found' });

    // BUG FIX: previously `batteryPercentage !== undefined` let any non-numeric
    // value (e.g. "abc") through, and `parseFloat("abc")` silently wrote NaN
    // to MongoDB. Same for batteryCapacity: `parseFloat(x) && ...` would also
    // reject a legitimate value of 0. Validate the parsed number explicitly.
    const parsedCapacity = batteryCapacity !== undefined ? parseFloat(batteryCapacity) : undefined;
    const parsedPercentage = batteryPercentage !== undefined ? parseFloat(batteryPercentage) : undefined;

    if (parsedCapacity !== undefined && (Number.isNaN(parsedCapacity) || parsedCapacity <= 0)) {
      return res.status(400).json({ success: false, message: 'Battery capacity must be a positive number' });
    }
    if (parsedPercentage !== undefined && (Number.isNaN(parsedPercentage) || parsedPercentage < 0 || parsedPercentage > 100)) {
      return res.status(400).json({ success: false, message: 'Battery percentage must be between 0 and 100' });
    }

    const updated = await prisma.eV.update({
      where: { id: req.params.id },
      data: {
        ...(model && { model }),
        ...(parsedCapacity !== undefined && { batteryCapacity: parsedCapacity }),
        ...(parsedPercentage !== undefined && { batteryPercentage: parsedPercentage }),
        ...(licensePlate && { licensePlate })
      }
    });

    res.json({ success: true, message: 'EV updated', data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteEV = async (req, res, next) => {
  try {
    const ev = await prisma.eV.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!ev) return res.status(404).json({ success: false, message: 'EV not found' });

    // Guard: Booking.ev is onDelete: Cascade, so deleting an EV with a live
    // booking would silently cancel it too — including an already-paid one,
    // with no refund and no notice to the station. Same guard as deleteSlot.
    const activeBooking = await prisma.booking.findFirst({
      where: {
        evId: req.params.id,
        status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'ACTIVE'] }
      }
    });

    if (activeBooking) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete an EV that has an active or upcoming booking. Cancel that booking first.'
      });
    }

    await prisma.eV.delete({ where: { id: req.params.id } });

    res.json({ success: true, message: 'EV deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const updateBatteryLevel = async (req, res, next) => {
  try {
    const { batteryPercentage } = req.body;

    // BUG FIX: `batteryPercentage < 0` / `> 100` on a non-numeric string like
    // "abc" both evaluate to false (NaN comparisons are always false), so the
    // old check let garbage through and `parseFloat("abc")` wrote NaN to the
    // database. Parse first, then validate the parsed number.
    const parsed = parseFloat(batteryPercentage);
    if (batteryPercentage === undefined || Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
      return res.status(400).json({ success: false, message: 'Battery percentage must be a number between 0 and 100' });
    }

    const ev = await prisma.eV.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!ev) return res.status(404).json({ success: false, message: 'EV not found' });

    const updated = await prisma.eV.update({
      where: { id: req.params.id },
      data: { batteryPercentage: parsed }
    });

    res.json({ success: true, message: 'Battery level updated', data: updated });
  } catch (error) {
    next(error);
  }
};
