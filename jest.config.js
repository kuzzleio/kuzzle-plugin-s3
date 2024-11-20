module.exports = {
  rootDir: '.', 
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.js'],
  testEnvironment: 'node',
};
  