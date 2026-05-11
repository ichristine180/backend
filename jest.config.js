module.exports = {
  testEnvironment: 'node',
  globalSetup: './tests/globalSetup.js',
  setupFilesAfterEnv: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 15000,
  forceExit: true,
  verbose: true
};
