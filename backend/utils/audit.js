import prisma from './prisma.js';
import logger from './logger.js';

/**
 * audit — record a sensitive admin/system action to the Log collection.
 *
 * The `Log` model existed in schema.prisma from day one but nothing ever
 * wrote to it, which meant block/delete/promote/approve actions left no
 * trail. This closes that gap.
 *
 * Fire-and-forget by design: an audit-write failure must never break the
 * action it is describing, so errors are logged and swallowed.
 *
 * @param {object} req     Express request (used for actor id + IP)
 * @param {string} action  Machine-readable action name, e.g. 'USER_BLOCKED'
 * @param {string} details Human-readable summary, e.g. 'Blocked jane@x.com'
 */
export const audit = (req, action, details) => {
  prisma.log
    .create({
      data: {
        userId: req.user?.id ?? null,
        action,
        details,
        ipAddress: req.ip ?? null,
      },
    })
    .catch((err) => logger.error(`Audit write failed for ${action}:`, err.message));
};
