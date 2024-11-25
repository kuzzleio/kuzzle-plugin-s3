jest.mock('aws-sdk', () => {
  const mockS3 = jest.fn(() => ({ // Return an object to simulate an S3 instance
    getSignedUrl: jest.fn(),
    deleteObject: jest.fn(),
    listObjectsV2: jest.fn(),
  }));
  return {
    S3: mockS3,
  };
});
  
jest.mock('../../lib/helpers', () => jest.requireActual('../../lib/helpers'));

const { getS3Client, clients } = require('../../lib/helpers');
  
describe('getS3Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line guard-for-in
    for (const key in clients) {
      delete clients[key];
    }
  });
  
  test('creates a new S3 client for an endpoint', () => {
    const mockS3Instance = {};
    require('aws-sdk').S3.mockImplementation(() => mockS3Instance);
    const client = getS3Client('https://custom-endpoint.com');
    expect(client).toBe(mockS3Instance);
    expect(require('aws-sdk').S3).toHaveBeenCalledWith({ endpoint: 'https://custom-endpoint.com' });
  });
  
  
  test('throws an error if endpoint is not provided', () => {
    expect(() => {
      getS3Client();
    }).toThrow('Endpoint is required to initialize the S3 client.');
  });
  
  test('reuses an existing client for the same endpoint', () => {
    const mockS3Instance = {};
    require('aws-sdk').S3.mockImplementation(() => mockS3Instance);
  
    const client1 = getS3Client('https://custom-endpoint.com');
    const client2 = getS3Client('https://custom-endpoint.com');
  
    expect(client1).toBe(client2); // Verify the same instance is reused
    expect(Object.keys(clients)).toHaveLength(1); // Ensure only one client exists in the cache
  });
  
  
  test('creates a new client for a different endpoint', () => {
    const mockS3Instance1 = {};
    const mockS3Instance2 = {};
    const mockS3 = require('aws-sdk').S3;
  
    mockS3.mockImplementationOnce(() => mockS3Instance1);
    mockS3.mockImplementationOnce(() => mockS3Instance2);
  
    const client1 = getS3Client('https://endpoint1.com');
    const client2 = getS3Client('https://endpoint2.com');
  
    expect(client1).not.toBe(client2); // Different instances
    expect(mockS3).toHaveBeenCalledTimes(2); // Called twice
    expect(mockS3).toHaveBeenCalledWith({ endpoint: 'https://endpoint1.com' });
    expect(mockS3).toHaveBeenCalledWith({ endpoint: 'https://endpoint2.com' });
  });
});
  