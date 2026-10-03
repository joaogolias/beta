const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expo,
  {
    files: ['backend/**/*.ts', 'scripts/mcp-smoke.mjs'],
    settings: {
      'import/resolver': {
        typescript: {
          project: './backend/tsconfig.json',
          conditionNames: ['import', 'default'],
        },
        node: true,
      },
    },
  },
  {
    ignores: [
      '**/_generated/**',
      '**/android/**',
      '**/ios/**',
      '**/dist/**',
      '**/node_modules/**',
    ],
  },
]);
