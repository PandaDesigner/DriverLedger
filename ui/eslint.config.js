// ESLint v9 flat config for the DriverLedger ui/ package.
// Uses the `eslint-config-expo` preset (AD-5) which already composes:
//   - core (RN/Expo globals + style rules)
//   - typescript (@typescript-eslint)
//   - react (eslint-plugin-react + react-hooks)
//   - expo (eslint-plugin-expo)
//
// Formatting is owned by Prettier (`bun format`); ESLint only handles logic
// rules so no `eslint-config-prettier` integration is needed.
//
// Keep this file CommonJS so the preset's `require()` interop is trivial.

const path = require('node:path');

const expoPreset = require('eslint-config-expo/flat');

module.exports = [
  ...expoPreset,
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'web-build/**',
      'coverage/**',
      'babel.config.js',
      'metro.config.js',
      '*.config.js',
    ],
  },
  {
    settings: {
      'import/resolver': {
        typescript: {
          project: path.join(__dirname, 'tsconfig.json'),
        },
        node: {
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      },
    },
  },
];
