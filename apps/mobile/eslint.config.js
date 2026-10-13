// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'dist-check/*', 'android/*', 'ios/*', '.expo/*', 'coverage/*'],
  },
  {
    files: ['__tests__/**', 'jest.setup.ts', 'jest.setup-after-env.ts'],
    languageOptions: {
      globals: {
        jest: 'readonly', describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly',
        beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly',
      },
    },
  },
]);
