#!/usr/bin/env node
/**
 * Preflight check — run before starting the backend to catch the common
 * "won't boot on a fresh machine" problems up front, each with a specific
 * fix, instead of discovering them one crash at a time.
 *
 *   npm run doctor
 *
 * Exits 0 if everything needed to boot is in place, 1 otherwise. Safe to run
 * anytime — it only reads, never writes.
 */
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

dotenv.config({ path: join(root, '.env') });

let failures = 0;
const pass = (m) => console.log(`  \u2713 ${m}`);
const fail = (m, fix) => {
  console.log(`  \u2717 ${m}\n      \u2192 ${fix}`);
  failures++;
};

console.log('\nChargeEV backend preflight check\n');

// 1. .env file present
if (existsSync(join(root, '.env'))) {
  pass('.env file found');
} else {
  fail(
    '.env file missing',
    'Run `node ../scripts/setup-env.mjs` from the repo root, then fill in DATABASE_URL.'
  );
}

// 2. Required env vars set (mirror server.js's REQUIRED_ENV_VARS)
const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length === 0) {
  pass(`required env vars set (${REQUIRED.join(', ')})`);
} else {
  fail(
    `missing env var(s): ${missing.join(', ')}`,
    'Set them in backend/.env — see backend/.env.example.'
  );
}

// 3. SMTP email configuration.
const smtpRequired = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'];
const missingSmtp = smtpRequired.filter((key) => !process.env[key]);
if (missingSmtp.length > 0) {
  fail(
    `SMTP email env var(s) missing: ${missingSmtp.join(', ')}`,
    'Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, and EMAIL_FROM in backend/.env.'
  );
} else {
  pass('SMTP email env vars are set');
}

const emailFrom = process.env.EMAIL_FROM || '';
if (!emailFrom || /noreply@example\.com|example\.com/i.test(emailFrom)) {
  fail(
    'EMAIL_FROM is missing or still contains a placeholder',
    'Set EMAIL_FROM to the sender address approved by your SMTP provider.'
  );
} else {
  pass('EMAIL_FROM is configured');
}

// 4. Prisma client generated
const clientGenerated = existsSync(join(root, 'node_modules/.prisma/client'));
if (clientGenerated) {
  pass('Prisma client generated');
} else {
  fail(
    'Prisma client not generated',
    'Run `npx prisma generate` (needs internet on first run to fetch the query engine binary).'
  );
}

// 4. Live DB connection — only attempt if the prerequisites above hold, since
//    importing the client when it isn't generated would just throw.
if (missing.length === 0 && clientGenerated) {
  try {
    const { default: prisma } = await import('../utils/prisma.js');
    await prisma.$runCommandRaw({ ping: 1 });
    await prisma.$disconnect();
    pass('database reachable (MongoDB ping succeeded)');
  } catch (err) {
    fail(
      `database not reachable: ${err.message.split('\n')[0]}`,
      'Check DATABASE_URL and that the database server is running.'
    );
  }
} else {
  console.log('  \u2013 skipping DB connection test (fix the above first)');
}

console.log('');
if (failures === 0) {
  console.log('All checks passed \u2014 the server should boot cleanly.\n');
  process.exit(0);
} else {
  console.log(`${failures} check(s) failed \u2014 fix the above before running \`npm start\`.\n`);
  process.exit(1);
}
