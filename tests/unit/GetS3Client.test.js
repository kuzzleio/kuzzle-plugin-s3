jest.mock('@aws-sdk/client-s3', () => {
  const mockS3Instance = {
    getSignedUrl: jest.fn(),
    deleteObject: jest.fn(),
    listObjectsV2: jest.fn(),
  };

  const S3 = jest.fn(() => mockS3Instance);

  return { S3 };
});

jest.mock('../../lib/helpers', () => jest.requireActual('../../lib/helpers'));

const { getS3Client, clients } = require('../../lib/helpers');

describe('getS3Client (AWS SDK v3)', () => {
  const mockGetCredentials = jest.fn(() => ({
    accessKeyId: 'mockAccessKeyId',
    secretAccessKey: 'mockSecretAccessKey',
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear cached clients
    Object.keys(clients).forEach(key => delete clients[key]);
  });

  test('creates a new S3 client for an endpoint', () => {
    const { S3 } = require('@aws-sdk/client-s3');
    const mockS3Instance = {};
    S3.mockImplementation(() => mockS3Instance);

    const client = getS3Client(
      {
        endpoint: 'https://custom-endpoint.com',
        region: 'us-west-1',
      },
      mockGetCredentials
    );

    expect(client).toBe(mockS3Instance);
    expect(S3).toHaveBeenCalledWith({
      endpoint: 'https://custom-endpoint.com',
      region: 'us-west-1',
      credentials: {
        accessKeyId: 'mockAccessKeyId',
        secretAccessKey: 'mockSecretAccessKey',
      },
      forcePathStyle: false,
    });
  });

  test('throws an error if endpoint is not provided', () => {
    expect(() => {
      getS3Client({}, mockGetCredentials);
    }).toThrow('Endpoint is required to initialize the S3 client.');
  });

  test('reuses an existing client for the same endpoint', () => {
    const { S3 } = require('@aws-sdk/client-s3');
    const mockS3Instance = {};
    S3.mockImplementation(() => mockS3Instance);

    const client1 = getS3Client(
      {
        endpoint: 'https://custom-endpoint.com',
        region: 'us-west-1',
      },
      mockGetCredentials
    );
    const client2 = getS3Client(
      {
        endpoint: 'https://custom-endpoint.com',
        region: 'us-west-1',
      },
      mockGetCredentials
    );

    expect(client1).toBe(client2); // Verify the same instance is reused
    expect(Object.keys(clients)).toHaveLength(1); // Ensure only one client exists in the cache
  });

  test('creates a new client for a different endpoint', () => {
    const { S3 } = require('@aws-sdk/client-s3');
    const mockS3Instance1 = {};
    const mockS3Instance2 = {};
    S3.mockImplementationOnce(() => mockS3Instance1);
    S3.mockImplementationOnce(() => mockS3Instance2);

    const client1 = getS3Client(
      {
        endpoint: 'https://endpoint1.com',
        region: 'us-west-1',
      },
      mockGetCredentials
    );
    const client2 = getS3Client(
      {
        endpoint: 'https://endpoint2.com',
        region: 'us-west-1',
      },
      mockGetCredentials
    );

    expect(client1).not.toBe(client2); // Different instances
    expect(S3).toHaveBeenCalledTimes(2); // Called twice
    expect(S3).toHaveBeenCalledWith({
      endpoint: 'https://endpoint1.com',
      region: 'us-west-1',
      credentials: {
        accessKeyId: 'mockAccessKeyId',
        secretAccessKey: 'mockSecretAccessKey',
      },
      forcePathStyle: false,
    });
    expect(S3).toHaveBeenCalledWith({
      endpoint: 'https://endpoint2.com',
      region: 'us-west-1',
      credentials: {
        accessKeyId: 'mockAccessKeyId',
        secretAccessKey: 'mockSecretAccessKey',
      },
      forcePathStyle: false,
    });
  });
});
