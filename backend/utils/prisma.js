import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

// PrismaClient construction itself throws synchronously if the client hasn't
// been generated yet (e.g. `npx prisma generate` never ran, or couldn't
// download its query engine binary on a fresh machine). That would otherwise
// surface as a raw internal stack trace at import time, before any of
// server.js's boot checks get a chance to run. Catch it here and re-throw
// with an actionable message instead — this doesn't hide the failure (the
// process still can't run without a client), it just makes the cause legible.
function createPrismaClient() {
  try {
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  } catch (err) {
    console.error(
      '\n[FATAL] Failed to initialize the Prisma client. It has most likely not\n' +
        'been generated yet. Run:  npx prisma generate\n' +
        '(needs internet access on first run to download the query engine binary)\n' +
        `\nOriginal error: ${err.message}\n`
    );
    throw err;
  }
}

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
