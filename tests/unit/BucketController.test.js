const BucketController = require('../../lib/controllers/BucketController');

jest.mock('../../lib/helpers', () => ({
  getS3Client: jest.fn(),
  getProperty: (obj, path) => {
    return obj ? obj[path] : undefined;
  },
}));

const mockHeadBucket = jest.fn();
const mockCreateBucket = jest.fn();
const mockPutBucketCors = jest.fn();
const mockDeleteBucket = jest.fn();
const mockPutBucketPolicy = jest.fn();
const mockDeletePublicAccessBlock = jest.fn();

const { getS3Client } = require('../../lib/helpers');

describe('BucketController', () => {
  let bucketController;
  let mockContext;
  let mockConfig;

  beforeEach(() => {
    // Reset mocks before each test
    mockHeadBucket.mockReset();
    mockCreateBucket.mockReset();
    mockPutBucketCors.mockReset();
    mockDeleteBucket.mockReset();
    mockPutBucketPolicy.mockReset();
    mockDeletePublicAccessBlock.mockReset();
    // Mock context and config
    mockContext = {
      errors: {
        BadRequestError: class BadRequestError extends Error {},
        InternalError: class InternalError extends Error {},
      },
      log: {
        error: jest.fn(),
        info: jest.fn(),
      },
      secrets: {
        // simplified for tests
        accessKeyId: 'accessKeyId',
        secretAccessKey:'secretAccessKey'
      },

    };

    mockConfig = {
      isMinio: false,
      forcePathStyle: false,
      endpoints: {
        'us-east-1': {
          endpoint: 'http://localhost:9000',
          forcePathStyle: true,
          accessKeyIdPath: 'accessKeyId',
          secretAccessKeyPath: 'secretAccessKey',
        },
      },
    };

    // Mock getS3Client to return a mock S3 object
    getS3Client.mockImplementation(() => {
      return {
        headBucket: mockHeadBucket,
        createBucket: mockCreateBucket,
        putBucketCors: mockPutBucketCors,
        deleteBucket: mockDeleteBucket,
        putBucketPolicy: mockPutBucketPolicy,
        deletePublicAccessBlock: mockDeletePublicAccessBlock,
      };
    });

    // Instantiate the controller
    bucketController = new BucketController(mockConfig, mockContext);
  });

  test('create bucket successfully when bucket does not exist', async () => {
    const request = {
      input: {
        args: {
          bucketName: 'my-valid-bucket',
          bucketRegion: 'us-east-1',
        },
        body: {
          options: { ACL: 'public-read' },
          cors: {
            CORSRules: [
              {
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET', 'POST', 'PUT'],
                AllowedOrigins: ['*'],
              },
            ],
          },
        },
      },
      getBodyObject: jest.fn().mockImplementation((key, defaultValue) => {
        return request.input.body[key] || defaultValue;
      }),
      getBodyBoolean: jest.fn().mockImplementation((key, defaultValue) => {
        return request.input.body[key] || defaultValue;
      }),
      
    };

    // Simulate that the bucket does not exist
    mockHeadBucket.mockRejectedValueOnce({ name: 'NotFound' });

    // simulate successful bucket creation and cors setting
    mockCreateBucket.mockResolvedValueOnce({});
    mockPutBucketCors.mockResolvedValueOnce({});

    const result = await bucketController.create(request);

    expect(mockHeadBucket).toHaveBeenCalledWith({ Bucket: 'my-valid-bucket' });
    expect(mockCreateBucket).toHaveBeenCalledWith({ Bucket: 'my-valid-bucket', ACL: 'public-read' });
    expect(mockPutBucketCors).toHaveBeenCalledWith({
      Bucket: 'my-valid-bucket',
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'POST', 'PUT'],
            AllowedOrigins: ['*'],
          },
        ],
      },
    });

    expect(result).toEqual({ name: 'my-valid-bucket', region: 'us-east-1' });
  });

  test('fail to create bucket when bucket already exists', async () => {
    const request = {
      input: {
        args: {
          bucketName: 'my-existing-bucket',
          bucketRegion: 'us-east-1',
        },
        body: {
          options: { ACL: 'public-read' },
        },
      },
      getBodyObject: jest.fn().mockImplementation((key, defaultValue) => {
        return request.input.body[key] || defaultValue;
      }),
      getBodyBoolean: jest.fn().mockImplementation((key, defaultValue) => {
        return request.input.body[key] || defaultValue;
      }),
    };

    // Simulate that the bucket already exists
    mockHeadBucket.mockResolvedValueOnce({});

    await expect(bucketController.create(request)).rejects.toThrow(mockContext.errors.BadRequestError);

    expect(mockHeadBucket).toHaveBeenCalledWith({ Bucket: 'my-existing-bucket' });
    // createBucket should not have been called since bucket exists
    expect(mockCreateBucket).not.toHaveBeenCalled();
    expect(mockPutBucketCors).not.toHaveBeenCalled();
  });

  test('fail to create bucket when bucket name is invalid', async () => {
    const request = {
      input: {
        args: {
          bucketName: 'INVALID_BUCKET_NAME!', // invalid name due to uppercase and exclamation
          bucketRegion: 'us-east-1',
        },
        body: {
          options: { ACL: 'public-read' },
        },
      },
      getBodyObject: jest.fn().mockImplementation((key, defaultValue) => {
        return request.input.body[key] || defaultValue;
      }),
      getBodyBoolean: jest.fn().mockImplementation((key, defaultValue) => {
        return request.input.body[key] || defaultValue;
      }),
    };

    // Simulate that the bucket does not exist
    mockHeadBucket.mockRejectedValueOnce({ name: 'NotFound' });

    await expect(bucketController.create(request)).rejects.toThrow(mockContext.errors.BadRequestError);

    expect(mockHeadBucket).toHaveBeenCalledWith({ Bucket: 'INVALID_BUCKET_NAME!' });
    expect(mockCreateBucket).not.toHaveBeenCalled();
    expect(mockPutBucketCors).not.toHaveBeenCalled();
  });
  describe('exists', () => {
    test('bucket exists', async () => {
      const request = {
        input: {
          args: {
            bucketName: 'existing-bucket',
            bucketRegion: 'us-east-1',
          },
        },
      };

      // headBucket resolves successfully (no error means bucket exists)
      mockHeadBucket.mockResolvedValueOnce({});

      const result = await bucketController.exists(request);

      expect(mockHeadBucket).toHaveBeenCalledWith({ Bucket: 'existing-bucket' });
      expect(result).toEqual({ exists: true });
    });

    test('bucket does not exist', async () => {
      const request = {
        input: {
          args: {
            bucketName: 'non-existing-bucket',
            bucketRegion: 'us-east-1',
          },
        },
      };

      // headBucket throws NotFound error
      mockHeadBucket.mockRejectedValueOnce({ name: 'NotFound' });

      const result = await bucketController.exists(request);

      expect(mockHeadBucket).toHaveBeenCalledWith({ Bucket: 'non-existing-bucket' });
      expect(result).toEqual({ exists: false });
    });
  });

  describe('setPolicy', () => {
    test('set policy successfully', async () => {
      const request = {
        input: {
          args: {
            bucketName: 'my-bucket',
            bucketRegion: 'us-east-1',
          },
          body: {
            policy: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: '*',
                  Action: 's3:GetObject',
                  Resource: 'arn:aws:s3:::my-bucket/*',
                },
              ],
            },
          },
        },
        getBodyObject: jest.fn().mockImplementation((key) => {
          return request.input.body[key];
        }),
      };
      
      mockPutBucketPolicy.mockResolvedValueOnce({});
      
      const result = await bucketController.setPolicy(request);
      
      expect(mockPutBucketPolicy).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        Policy: JSON.stringify(request.input.body.policy),
      });
      expect(result).toEqual({ message: 'Policy applied to bucket "my-bucket".' });
    });
      
    test('fail to set policy due to error', async () => {
      const request = {
        input: {
          args: {
            bucketName: 'my-bucket',
            bucketRegion: 'us-east-1',
          },
          body: {
            policy: {
              Version: '2012-10-17',
              Statement: [],
            },
          },
        },
        getBodyObject: jest.fn().mockImplementation((key) => {
          return request.input.body[key];
        }),
      };
      
      mockPutBucketPolicy.mockRejectedValueOnce(new Error('AWS Error'));
      
      await expect(bucketController.setPolicy(request)).rejects.toThrow('AWS Error');
      expect(mockPutBucketPolicy).toHaveBeenCalled();
    });
  });

  describe('enablePublicAccess', () => {
    test('successfully enable public access (not Minio)', async () => {
      const request = {
        input: {
          args: {
            bucketName: 'my-bucket',
            bucketRegion: 'us-east-1',
          },
        },
      };

      mockDeletePublicAccessBlock.mockResolvedValueOnce({});

      const result = await bucketController.enablePublicAccess(request);

      expect(mockDeletePublicAccessBlock).toHaveBeenCalledWith({ Bucket: 'my-bucket' });
      expect(result).toEqual({ message: 'Public access enabled for bucket "my-bucket".' });
    });

    test('skip enabling public access if Minio', async () => {
      // Change config to isMinio = true for this test
      bucketController.config.endpoints['us-east-1'].isMinio = true;

      const request = {
        input: {
          args: {
            bucketName: 'my-bucket',
            bucketRegion: 'us-east-1',
          },
        },
      };

      const result = await bucketController.enablePublicAccess(request);

      // When isMinio = true, it should NOT call deletePublicAccessBlock
      expect(mockDeletePublicAccessBlock).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Public access is managed differently for MinIO buckets. Ensure you configure bucket policies or access rules directly on your MinIO server for bucket "my-bucket".' });
    });

    test('fail to enable public access due to error', async () => {
      const request = {
        input: {
          args: {
            bucketName: 'my-bucket',
            bucketRegion: 'us-east-1',
          },
        },
      };

      mockDeletePublicAccessBlock.mockRejectedValueOnce(new Error('AWS Error'));

      await expect(bucketController.enablePublicAccess(request)).rejects.toThrow('AWS Error');
      expect(mockDeletePublicAccessBlock).toHaveBeenCalled();
    });
  });
});
