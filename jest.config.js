/** Pure-logic tests run in Node against a real SQLite engine (node:sqlite). */
// Dates are the phone's local time; tests pin it to Uruguay so they behave the same anywhere.
process.env.TZ = 'America/Montevideo';

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  transform: { '^.+\.[jt]sx?$': 'babel-jest' },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo-crypto$': '<rootDir>/test/mocks/expo-crypto.ts',
  },
};
