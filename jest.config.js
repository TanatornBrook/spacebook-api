'use strict';

module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: { statements: 70, branches: 60, functions: 70, lines: 70 }
  },
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true
};
