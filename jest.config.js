/** Pure-logic tests run in Node against a real SQLite engine (node:sqlite). */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  transform: { '^.+\.[jt]sx?$': 'babel-jest' },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo-crypto$': '<rootDir>/test/mocks/expo-crypto.ts',
  },
};
