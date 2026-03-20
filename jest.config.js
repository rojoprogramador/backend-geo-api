export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'controllers/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
  ],
  coverageDirectory: 'coverage',
  testTimeout: 10000,
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      testEnvironment: 'node',
      transform: {},
      collectCoverageFrom: [
        'controllers/**/*.js',
        'middleware/**/*.js',
        'utils/**/*.js',
      ],
      coverageDirectory: 'coverage',
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      testEnvironment: 'node',
      transform: {},
      globalSetup: '<rootDir>/tests/setup/globalSetup.js',
      globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',
      setupFiles: ['<rootDir>/tests/setup/loadEnv.js'],
      testTimeout: 30000,
      maxWorkers: 1,
    },
  ],
};
