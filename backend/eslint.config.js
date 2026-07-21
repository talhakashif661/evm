import js from '@eslint/js'
import globals from 'globals'

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
      // CHANGELOG.md) rather than banning it here — several legitimate,
      // deliberate uses exist (server.js's startup banner, for one).
    },
  },
]
