/** Minimal Jest config for pure unit tests (no MongoDB, no setup file). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  maxWorkers: 1,
};
