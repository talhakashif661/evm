/**
 * inMemoryPrisma — a tiny, dependency-free stand-in for the generated Prisma
 * client, implementing exactly the query surface this codebase uses:
 *
 *   findUnique / findFirst / findMany / create / update / updateMany /
 *   delete / count / aggregate({_sum}) / $transaction
 *   where: equality, in, gt/gte/lt/lte, not, OR/AND, contains(+insensitive),
 *          one-level belongsTo relation filters (e.g. { slot: { stationId } })
 *   select / include (recursive, with nested where/orderBy/take/select),
 *   _count selects, orderBy, skip, take, unique-constraint enforcement (P2002)
 *
 * Why it exists: full success-path integration tests previously required a
 * real MongoDB. With this, `npm test` exercises register → login → admin
 * bootstrap → station approval → booking (incl. overlap) → payments →
 * auctions END TO END on any machine, with no DATABASE_URL at all.
 * It is used ONLY by tests (via jest.unstable_mockModule) — production code
 * still uses the real @prisma/client.
 */

let counter = 0;
const objectId = () => {
  // ObjectId-shaped and monotonically increasing, so lexicographic order on
  // id matches creation order — the booking race tiebreak relies on this.
  const ts = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, '0');
  return ts + (++counter).toString(16).padStart(16, '0');
};

const p2002 = (field) => {
  const err = new Error(`Unique constraint failed on the fields: (\`${field}\`)`);
  err.code = 'P2002';
  err.meta = { target: [field] };
  return err;
};

// model -> { uniques, defaults, relations }
// relation kinds: 'belongsTo' (fk on this model), 'hasMany' / 'hasOne' (fk on target)
const MODELS = {
  user: {
    uniques: ['id', 'email'],
    defaults: () => ({
      role: 'EV_USER',
      isBlocked: false,
      isVerified: false,
      verificationOtpHash: null,
      verificationOtpExpiry: null,
      verifiedAt: null,
      verificationAttempts: 0,
      lastVerificationAttempt: null,
      verificationBlockedUntil: null,
      lastOtpSentAt: null,
      phone: null,
      avatar: null,
      resetTokenHash: null,
      resetTokenExpiry: null,
    }),
    relations: {
      evs: { model: 'eV', fk: 'userId', kind: 'hasMany' },
      bookings: { model: 'booking', fk: 'userId', kind: 'hasMany' },
      bids: { model: 'bid', fk: 'userId', kind: 'hasMany' },
      payments: { model: 'payment', fk: 'userId', kind: 'hasMany' },
      station: { model: 'chargingStation', fk: 'ownerId', kind: 'hasOne' },
    },
  },
  eV: {
    uniques: ['id'],
    defaults: () => ({ batteryPercentage: 100, licensePlate: null }),
    relations: {
      user: { model: 'user', fk: 'userId', kind: 'belongsTo' },
      bookings: { model: 'booking', fk: 'evId', kind: 'hasMany' },
    },
  },
  chargingStation: {
    uniques: ['id', 'ownerId'],
    defaults: () => ({ status: 'PENDING', totalRevenue: 0 }),
    relations: {
      owner: { model: 'user', fk: 'ownerId', kind: 'belongsTo' },
      slots: { model: 'slot', fk: 'stationId', kind: 'hasMany' },
    },
  },
  slot: {
    uniques: ['id'],
    defaults: () => ({ status: 'AVAILABLE', auctionOpen: false, auctionEnd: null }),
    relations: {
      station: { model: 'chargingStation', fk: 'stationId', kind: 'belongsTo' },
      bookings: { model: 'booking', fk: 'slotId', kind: 'hasMany' },
      bids: { model: 'bid', fk: 'slotId', kind: 'hasMany' },
    },
  },
  booking: {
    uniques: ['id'],
    defaults: () => ({
      status: 'PENDING',
      plannedEndTime: null,
      endTime: null,
      totalCost: null,
      checkInTime: null,
      paymentDeadline: null,
      actualEvId: null,
      paymentIntentId: null,
      overageAmount: null,
      cancelReason: null,
    }),
    relations: {
      user: { model: 'user', fk: 'userId', kind: 'belongsTo' },
      ev: { model: 'eV', fk: 'evId', kind: 'belongsTo' },
      actualEv: { model: 'eV', fk: 'actualEvId', kind: 'belongsTo' },
      slot: { model: 'slot', fk: 'slotId', kind: 'belongsTo' },
      payment: { model: 'payment', fk: 'bookingId', kind: 'hasOne' },
    },
  },
  bid: {
    uniques: ['id'],
    defaults: () => ({ priority: 0, status: 'PENDING' }),
    relations: {
      user: { model: 'user', fk: 'userId', kind: 'belongsTo' },
      slot: { model: 'slot', fk: 'slotId', kind: 'belongsTo' },
    },
  },
  payment: {
    uniques: ['id', 'bookingId'],
    defaults: () => ({ status: 'PENDING', method: 'SIMULATION', stripePaymentIntentId: null }),
    relations: {
      user: { model: 'user', fk: 'userId', kind: 'belongsTo' },
      booking: { model: 'booking', fk: 'bookingId', kind: 'belongsTo' },
    },
  },
  log: {
    uniques: ['id'],
    defaults: () => ({ userId: null, details: null, ipAddress: null }),
    relations: {},
  },
  complaint: {
    uniques: ['id'],
    defaults: () => ({ userId: null, phone: null }),
    relations: {},
  },
  review: {
    uniques: ['id'],
    defaults: () => ({ comment: null }),
    relations: {
      user: { model: 'user', fk: 'userId', kind: 'belongsTo' },
      station: { model: 'chargingStation', fk: 'stationId', kind: 'belongsTo' },
    },
  },
};

const OPS = [
  'equals',
  'in',
  'notIn',
  'not',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'mode',
  'startsWith',
  'endsWith',
];
const isOpObject = (v) =>
  v !== null &&
  typeof v === 'object' &&
  !(v instanceof Date) &&
  Object.keys(v).every((k) => OPS.includes(k));

const cmp = (a, b) => {
  const av = a instanceof Date ? a.getTime() : a;
  const bv = b instanceof Date ? b.getTime() : b;
  return av < bv ? -1 : av > bv ? 1 : 0;
};
const eq = (a, b) => {
  if (a instanceof Date || b instanceof Date) {
    if (a == null || b == null) return a === b;
    return new Date(a).getTime() === new Date(b).getTime();
  }
  return a === b;
};

export function createInMemoryPrisma() {
  const store = Object.fromEntries(Object.keys(MODELS).map((m) => [m, []]));

  const matches = (model, rec, where) => {
    if (!where) return true;
    return Object.entries(where).every(([key, cond]) => {
      if (key === 'AND')
        return (Array.isArray(cond) ? cond : [cond]).every((w) => matches(model, rec, w));
      if (key === 'OR')
        return (Array.isArray(cond) ? cond : [cond]).some((w) => matches(model, rec, w));
      if (key === 'NOT')
        return !(Array.isArray(cond) ? cond : [cond]).some((w) => matches(model, rec, w));

      const rel = MODELS[model].relations[key];
      if (
        rel &&
        cond !== null &&
        typeof cond === 'object' &&
        !isOpObject(cond) &&
        !(cond instanceof Date)
      ) {
        if (rel.kind === 'belongsTo') {
          const target = store[rel.model].find((r) => r.id === rec[rel.fk]);
          return target ? matches(rel.model, target, cond) : false;
        }
        // hasMany relation filter: support { some: {...} } and bare object as `some`
        const sub = cond.some || cond;
        return store[rel.model].some((r) => r[rel.fk] === rec.id && matches(rel.model, r, sub));
      }

      const val = rec[key];
      if (isOpObject(cond)) {
        return Object.entries(cond).every(([op, opv]) => {
          switch (op) {
            case 'equals':
              return eq(val, opv);
            case 'in':
              return opv.some((x) => eq(val, x));
            case 'notIn':
              return !opv.some((x) => eq(val, x));
            case 'not':
              return !eq(val, opv);
            case 'gt':
              return val != null && cmp(val, opv) > 0;
            case 'gte':
              return val != null && cmp(val, opv) >= 0;
            case 'lt':
              return val != null && cmp(val, opv) < 0;
            case 'lte':
              return val != null && cmp(val, opv) <= 0;
            case 'contains': {
              if (typeof val !== 'string') return false;
              const insensitive = cond.mode === 'insensitive';
              return insensitive
                ? val.toLowerCase().includes(String(opv).toLowerCase())
                : val.includes(String(opv));
            }
            case 'startsWith':
              return typeof val === 'string' && val.startsWith(opv);
            case 'endsWith':
              return typeof val === 'string' && val.endsWith(opv);
            case 'mode':
              return true; // handled inside contains
            default:
              return false;
          }
        });
      }
      return eq(val, cond);
    });
  };

  const applyOrder = (rows, orderBy) => {
    if (!orderBy) return rows;
    const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
    return [...rows].sort((a, b) => {
      for (const o of orders) {
        const [field, dir] = Object.entries(o)[0];
        const c = cmp(a[field] ?? 0, b[field] ?? 0);
        if (c !== 0) return dir === 'desc' ? -c : c;
      }
      return 0;
    });
  };

  const shape = (model, rec, args = {}) => {
    if (!rec) return null;
    const { select, include } = args;
    const rels = MODELS[model].relations;

    const resolveRel = (name, relArgs) => {
      const rel = rels[name];
      if (!rel) return undefined;
      const sub = relArgs === true ? {} : relArgs;
      if (rel.kind === 'belongsTo') {
        const target = store[rel.model].find((r) => r.id === rec[rel.fk]);
        return shape(rel.model, target, sub);
      }
      let rows = store[rel.model].filter((r) => r[rel.fk] === rec.id);
      if (sub.where) rows = rows.filter((r) => matches(rel.model, r, sub.where));
      rows = applyOrder(rows, sub.orderBy);
      if (sub.skip) rows = rows.slice(sub.skip);
      if (sub.take !== undefined) rows = rows.slice(0, sub.take);
      const shaped = rows.map((r) => shape(rel.model, r, sub));
      return rel.kind === 'hasOne' ? (shaped[0] ?? null) : shaped;
    };

    if (select) {
      const out = {};
      for (const [key, v] of Object.entries(select)) {
        if (!v) continue;
        if (key === '_count') {
          const counts = {};
          for (const [relName, on] of Object.entries(v.select || {})) {
            if (!on) continue;
            const rel = rels[relName];
            counts[relName] = rel ? store[rel.model].filter((r) => r[rel.fk] === rec.id).length : 0;
          }
          out._count = counts;
        } else if (rels[key]) {
          out[key] = resolveRel(key, v);
        } else {
          out[key] = rec[key];
        }
      }
      return out;
    }

    const out = { ...rec };
    if (include) {
      for (const [key, v] of Object.entries(include)) {
        if (!v) continue;
        if (key === '_count') {
          const counts = {};
          for (const [relName, on] of Object.entries(v.select || {})) {
            if (!on) continue;
            const rel = rels[relName];
            counts[relName] = rel ? store[rel.model].filter((r) => r[rel.fk] === rec.id).length : 0;
          }
          out._count = counts;
        } else {
          out[key] = resolveRel(key, v);
        }
      }
    }
    return out;
  };

  const enforceUniques = (model, data, ignoreId = null) => {
    for (const u of MODELS[model].uniques) {
      if (u === 'id' || data[u] === undefined || data[u] === null) continue;
      const clash = store[model].find((r) => r[u] === data[u] && r.id !== ignoreId);
      if (clash) throw p2002(u);
    }
  };

  const applyData = (rec, data) => {
    for (const [k, v] of Object.entries(data)) {
      if (v !== null && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) {
        rec[k] = (rec[k] || 0) + v.increment;
      } else if (v !== null && typeof v === 'object' && !(v instanceof Date) && 'decrement' in v) {
        rec[k] = (rec[k] || 0) - v.decrement;
      } else {
        rec[k] = v;
      }
    }
    rec.updatedAt = new Date();
  };

  const delegate = (model) => ({
    findUnique: async ({ where, ...args } = {}) => {
      const rec = store[model].find((r) => Object.entries(where).every(([k, v]) => eq(r[k], v)));
      return shape(model, rec, args);
    },
    findFirst: async ({ where, orderBy, ...args } = {}) => {
      const rows = applyOrder(
        store[model].filter((r) => matches(model, r, where)),
        orderBy
      );
      return shape(model, rows[0], args);
    },
    findMany: async ({ where, orderBy, skip, take, ...args } = {}) => {
      let rows = store[model].filter((r) => matches(model, r, where));
      rows = applyOrder(rows, orderBy);
      if (skip) rows = rows.slice(skip);
      if (take !== undefined) rows = rows.slice(0, take);
      return rows.map((r) => shape(model, r, args));
    },
    create: async ({ data, ...args } = {}) => {
      enforceUniques(model, data);
      const now = new Date();
      const rec = {
        id: objectId(),
        createdAt: now,
        updatedAt: now,
        ...MODELS[model].defaults(),
        ...data,
      };
      store[model].push(rec);
      return shape(model, rec, args);
    },
    update: async ({ where, data, ...args } = {}) => {
      const rec = store[model].find((r) => Object.entries(where).every(([k, v]) => eq(r[k], v)));
      if (!rec) {
        const e = new Error('Record to update not found.');
        e.code = 'P2025';
        throw e;
      }
      enforceUniques(model, data, rec.id);
      applyData(rec, data);
      return shape(model, rec, args);
    },
    updateMany: async ({ where, data } = {}) => {
      const rows = store[model].filter((r) => matches(model, r, where));
      rows.forEach((r) => applyData(r, data));
      return { count: rows.length };
    },
    delete: async ({ where } = {}) => {
      const idx = store[model].findIndex((r) =>
        Object.entries(where).every(([k, v]) => eq(r[k], v))
      );
      if (idx === -1) {
        const e = new Error('Record to delete does not exist.');
        e.code = 'P2025';
        throw e;
      }
      const [rec] = store[model].splice(idx, 1);
      return rec;
    },
    deleteMany: async ({ where } = {}) => {
      const keep = [],
        gone = [];
      for (const r of store[model]) (matches(model, r, where) ? gone : keep).push(r);
      store[model] = keep;
      return { count: gone.length };
    },
    count: async ({ where } = {}) => store[model].filter((r) => matches(model, r, where)).length,
    aggregate: async ({ where, _sum } = {}) => {
      const rows = store[model].filter((r) => matches(model, r, where));
      const out = {};
      if (_sum) {
        out._sum = {};
        for (const f of Object.keys(_sum)) {
          out._sum[f] = rows.reduce((s, r) => s + (r[f] || 0), 0);
        }
      }
      return out;
    },
  });

  const client = {
    $connect: async () => {},
    $disconnect: async () => {},
    $transaction: async (arg) => (typeof arg === 'function' ? arg(client) : Promise.all(arg)),
    // Real Prisma Client's $queryRaw is a tagged-template function; the health
    // check only cares that the promise resolves, not the shape of the rows,
    // so this stand-in ignores its arguments and mimics a trivial SELECT 1.
    // A test can override this per-case (e.g. `mockPrisma.$queryRaw = async
    // () => { throw new Error('down') }`) to simulate the DB being down.
    $queryRaw: async () => [{ '?column?': 1 }],
    _store: store, // exposed for test setup/inspection
  };
  for (const m of Object.keys(MODELS)) client[m] = delegate(m);
  return client;
}
