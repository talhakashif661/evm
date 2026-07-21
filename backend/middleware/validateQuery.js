/**
 * validateQuery
 *
 * Prevents Prisma operator injection through query strings (e.g.
 * `?role[not]=ADMIN`). Express's default query parser (`qs`) turns bracket
 * syntax into nested objects, so without this guard a raw `req.query.role`
 * could be an object like `{ not: 'ADMIN' }` instead of a plain string, and
 * that object would be passed straight into a Prisma `where` clause.
 *
 * Usage:
 *   router.get('/users', validateQuery({ role: ['EV_USER','STATION_OWNER','ADMIN'] }), getAllUsers);
 *
 * @param {Object<string, string[]|null>} fieldRules - map of query param name
 *   to either an array of allowed literal values, or `null` for fields that
 *   just need to be a plain string (e.g. free-text search).
 */
export const validateQuery = (fieldRules = {}) => {
  return (req, res, next) => {
    for (const [field, allowedValues] of Object.entries(fieldRules)) {
      const value = req.query[field];
      if (value === undefined) continue;

      if (typeof value !== 'string') {
        return res.status(400).json({
          success: false,
          message: `Invalid query parameter "${field}": must be a plain string value`
        });
      }

      if (Array.isArray(allowedValues) && !allowedValues.includes(value)) {
        return res.status(400).json({
          success: false,
          message: `Invalid query parameter "${field}": must be one of [${allowedValues.join(', ')}]`
        });
      }
    }

    // Strip any query keys that aren't explicitly whitelisted, plus the
    // standard pagination keys, so nothing unexpected reaches a controller.
    const allowedKeys = new Set([...Object.keys(fieldRules), 'page', 'limit']);
    for (const key of Object.keys(req.query)) {
      if (!allowedKeys.has(key)) delete req.query[key];
    }

    next();
  };
};
