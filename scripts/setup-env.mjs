#!/usr/bin/env node
/**
 * setup-env — generate local .env files from the committed .env.example
 * templates, safely.
 *
 *   node scripts/setup-env.mjs        # from the repo root, or: npm run setup:env
 *
 * What it does:
 *   • For backend/ and frontend/: if .env is MISSING, copy .env.example -> .env.
 *   • In the backend .env, replace the placeholder JWT_SECRET and
 *     ADMIN_SETUP_KEY with fresh 64-byte random hex secrets so you never ship
 *     the example placeholders by accident.
 *
 * What it deliberately does NOT do:
 *   • Never overwrites an existing .env (your real credentials are safe).
 *   • Never invents values it can't know — DATABASE_URL, SENDGRID_API_KEY and
 *     the Stripe keys are left as the documented placeholders for you to fill.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rand = () => randomBytes(64).toString('hex');

function ensureEnv(dir, { secrets = [] } = {}) {
  const envPath = join(root, dir, '.env');
  const examplePath = join(root, dir, '.env.example');

  if (!existsSync(examplePath)) {
    console.log(`  ⚠  ${dir}/.env.example not found — skipping.`);
    return;
  }
  if (existsSync(envPath)) {
    console.log(`  •  ${dir}/.env already exists — left untouched.`);
    return;
  }

  copyFileSync(examplePath, envPath);

  if (secrets.length) {
    let text = readFileSync(envPath, 'utf8');
    for (const key of secrets) {
      // Replace the value on a line like KEY="..." or KEY=... with a fresh secret.
      const re = new RegExp(`^(${key}=).*$`, 'm');
      if (re.test(text)) text = text.replace(re, `$1"${rand()}"`);
    }
    writeFileSync(envPath, text);
  }

  console.log(`  ✓  Created ${dir}/.env from .env.example` +
    (secrets.length ? ` (generated: ${secrets.join(', ')})` : ''));
}

console.log('Setting up .env files...\n');
ensureEnv('backend', { secrets: ['JWT_SECRET', 'ADMIN_SETUP_KEY'] });
ensureEnv('frontend');
console.log(
  '\nDone. Before running the backend, open backend/.env and fill in:\n' +
  '  • DATABASE_URL       (your MongoDB / Atlas connection string)\n' +
  '  • SENDGRID_API_KEY   (optional — leave empty to disable email)\n' +
  '  • STRIPE_* keys      (only if PAYMENT_MODE="live")\n'
);
