jest.setTimeout(10000);

jest.mock('../../lib/helpers', () => ({
  ...jest.requireActual('../../lib/helpers'),
  getS3Client: jest.fn(),
}));
