// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'supabase/functions/momentum/index.ts', 'supabase/functions/momentum/store.ts', 'supabase/functions/momentum/ai.ts'],
  },
]);
