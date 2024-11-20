module.exports = {
  rootDir: '.', 
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  moduleNameMapper: {
    '^aws-sdk$': '<rootDir>/tests/__mocks__/aws-sdk.js',
    '^redis$': '<rootDir>/tests/__mocks__/redis.js',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.js'],
  testEnvironment: 'node',
  unhandledRejections: 'strict',
};
  