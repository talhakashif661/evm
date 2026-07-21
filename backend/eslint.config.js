import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

// Plain Node.js ES modules setup — no React/JSX concerns here, unlike the
// frontend config. Flat config, matching ESLint v9's default.
export default [
  { ignores: ['node_modules', 'coverage'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Unused function args are common and often intentional (Express
      // middleware signatures like (err, req, res, next) where not every
      // param is used, destructured event handlers, etc.) — matches the
      // same pragmatic default used in the frontend config.
      // ignoreRestSiblings recognizes the "strip a sensitive field via
      // destructuring" idiom (e.g. `const { password: _, ...rest } = user`
      // in auth.controller.js) as intentional, not a bug — the code there
      // is already correct and idiomatic, so the config should recognize
      // the pattern rather than the code needing to change for the linter.
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
      // This phase separately audits console.* usage directly (see
      // CHANGELOG.md) rather than banning it here. Verified against source:
      // server.js is actually fully routed through logger.* already (no raw
      // console calls there) — the genuine, legitimate raw-console uses are
      // in CLI-only dev tooling that runs outside the app's request
      // lifecycle: prisma/seed.js and ../scripts/setup-env.mjs.
    },
  },
  // Must be last: turns off any ESLint stylistic rules that would otherwise
  // conflict with Prettier's own formatting (added in Phase 8.2 Prettier setup).
  eslintConfigPrettier,
];
