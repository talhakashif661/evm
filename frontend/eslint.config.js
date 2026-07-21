import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintConfigPrettier from 'eslint-config-prettier';

// Standard Vite + React setup (matches what `npm create vite -- --template
// react` scaffolds by default) — flat config, since that's the default as
// of ESLint v9, not the older .eslintrc format.
export default [
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    // Without eslint-plugin-react's jsx-uses-vars, the base no-unused-vars
    // rule doesn't recognize <Foo /> as a real usage of `Foo` — it flagged
    // genuinely-used imports (SEO, motion, Skeleton, etc.) across nearly
    // every page as "unused" on the first run, which would have meant
    // deleting real, working imports based on a tool that was
    // misconfigured, not code that was actually wrong. Verified directly
    // against the source before trusting the warning either way.
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      // eslint-plugin-react-hooks@7's "recommended" bundles a much wider
      // rule set than it used to — beyond the two classic, well-established
      // rules (rules-of-hooks, exhaustive-deps), it now includes several
      // rules specifically about compatibility with React's experimental
      // Compiler (immutability, set-state-in-effect, static-components,
      // purity, etc.). This project is React 18 and doesn't use the
      // Compiler, and spreading the full recommended set produced real
      // false positives — e.g. flagging Countdown's standard "reset a timer
      // when its deadline prop changes" useEffect pattern (verified correct
      // and already covered by Phase 6.1's own re-render isolation check) as
      // a problem. Scoped to just the two rules this project's actual setup
      // benefits from, rather than adopting Compiler-prep rules for a
      // Compiler this app doesn't use.
      'react-hooks/rules-of-hooks':
        reactHooks.configs.recommended.rules['react-hooks/rules-of-hooks'],
      'react-hooks/exhaustive-deps':
        reactHooks.configs.recommended.rules['react-hooks/exhaustive-deps'],
      'react/react-in-jsx-scope': 'off', // Vite's JSX transform doesn't need React in scope
      'react/prop-types': 'off', // this project uses prop-types selectively (see components/*.jsx), not on every function component
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-unused-vars': ['warn', { args: 'none' }],
    },
    settings: { react: { version: 'detect' } },
  },
  // Must be last: turns off any ESLint stylistic rules that would otherwise
  // conflict with Prettier's own formatting (added in Phase 8.2 Prettier setup).
  eslintConfigPrettier,
];
