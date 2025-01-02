const UploadController = require('../../lib/controllers/UploadController');

// Mock dependencies
jest.mock('../../lib/helpers', () => ({
  getS3Client: jest.fn(),
  getProperty: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: jest.fn().mockImplementation((params) => params),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

const { getS3Client, getProperty } = require('../../lib/helpers');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuid } = require('uuid');

describe('UploadController', () => {
  let uploadController;
  let mockContext;
  let mockConfig;
  let mockS3;

  beforeEach(() => {
    // Reset mocks
    getS3Client.mockReset();
    getProperty.mockReset();
    getSignedUrl.mockReset();
    PutObjectCommand.mockClear();
    uuid.mockReset();

    mockContext = {
      errors: {
        BadRequestError: class BadRequestError extends Error {},
        InternalError: class InternalError extends Error {},
        NotFoundError: class NotFoundError extends Error {},
      },
      log: {
        error: jest.fn(),
        info: jest.fn(),
      },
      secrets: {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey'
      },
    };

    mockConfig = {
      isMinio: false,
      forcePathStyle: true,
      signedUrlTTL: 60000,
      endpoints: {
        'us-east-1': {
          endpoint: 'http://localhost:9000',
          forcePathStyle: true,
          accessKeyIdPath: 'accessKeyId',
          secretAccessKeyPath: 'secretAccessKey',
        },
        'eu-west-1': {
          endpoint: 'https://my-endpoint.com',
          forcePathStyle: false,
          accessKeyIdPath: 'accessKeyId',
          secretAccessKeyPath: 'secretAccessKey',
        },
      },
    };

    mockS3 = {};

    getS3Client.mockReturnValue(mockS3);
    uuid.mockReturnValue('fixed-uuid');

    uploadController = new UploadController(mockConfig, mockContext);

    getProperty.mockImplementation((obj, path) => (obj ? obj[path] : undefined));
  });

  describe('getUploadUrl', () => {
    test('returns path-style public url if requested', async () => {
      const request = {
        input: {
          args: {
            filename: 'test-file.txt',
            bucketName: 'my-bucket',
            bucketRegion: 'us-east-1',
            uploadDir: 'my-uploads',
            publicUrl: true,
          },
          body: {},
        },
        getBodyString: jest.fn().mockImplementation((key, defaultValue) => {
          return request.input.body[key] || defaultValue;
        }),
        getBoolean: jest.fn().mockImplementation((key) => {
          return request.input.args[key] || false;
        }),
      };

      getSignedUrl.mockResolvedValueOnce('http://presigned.upload.url');

      const result = await uploadController.getUploadUrl(request);

      expect(result).toEqual({
        fileKey: 'my-uploads/fixed-uuid-test-file.txt',
        uploadUrl: 'http://presigned.upload.url',
        publicUrl: 'http://localhost:9000/my-bucket/my-uploads/fixed-uuid-test-file.txt',
        ttl: mockConfig.signedUrlTTL,
      });
    });
    test('returns virtual host public url if requested', async () => {
      const request = {
        input: {
          args: {
            filename: 'test-file.txt',
            bucketName: 'my-bucket',
            bucketRegion: 'eu-west-1',
            uploadDir: 'my-uploads',
            publicUrl: true,
          },
          body: {},
        },
        getBodyString: jest.fn().mockImplementation((key, defaultValue) => {
          return request.input.body[key] || defaultValue;
        }),
        getBoolean: jest.fn().mockImplementation((key) => {
          return request.input.args[key] || false;
        }),
      };

      getSignedUrl.mockResolvedValueOnce('http://presigned.upload.url');

      const result = await uploadController.getUploadUrl(request);

      expect(result).toEqual({
        fileKey: 'my-uploads/fixed-uuid-test-file.txt',
        uploadUrl: 'http://presigned.upload.url',
        publicUrl: 'https://my-endpoint.com/my-bucket/my-uploads/fixed-uuid-test-file.txt',
        ttl: mockConfig.signedUrlTTL,
      });
    });

    test('returns upload info on success', async () => {
      const request = {
        input: {
          args: {
            filename: 'test-file.txt',
            bucketName: 'my-bucket',
            bucketRegion: 'us-east-1',
            uploadDir: 'my-uploads',
          },
          body: {},
        },
        getBodyString: jest.fn().mockImplementation((key, defaultValue) => {
          return request.input.body[key] || defaultValue;
        }),
        getBoolean: jest.fn().mockImplementation((key) => {
          return request.input.args[key] || false;
        }),
      };

      // Mock getSignedUrl to return a test URL
      getSignedUrl.mockResolvedValueOnce('http://presigned.upload.url');

      const result = await uploadController.getUploadUrl(request);

      // Validate PutObjectCommand parameters
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        Key: 'my-uploads/fixed-uuid-test-file.txt',
      });

      expect(getSignedUrl).toHaveBeenCalledWith(
        mockS3,
        expect.objectContaining({
          Bucket: 'my-bucket',
          Key: 'my-uploads/fixed-uuid-test-file.txt',
        }),
        { expiresIn: mockConfig.signedUrlTTL / 1000 }
      );

      // Validate the returned result
      expect(result).toEqual({
        fileKey: 'my-uploads/fixed-uuid-test-file.txt',
        uploadUrl: 'http://presigned.upload.url',
        ttl: mockConfig.signedUrlTTL,
      });
    });

    test('works with no uploadDir specified', async () => {
      const request = {
        input: {
          args: {
            filename: 'test-file.txt',
            bucketName: 'my-bucket',
            bucketRegion: 'us-east-1',
          },
          body: {}, // no uploadDir
        },
        getBodyString: jest.fn().mockImplementation((key, defaultValue) => {
          return request.input.body[key] || defaultValue;
        }),
        getBoolean: jest.fn().mockImplementation((key) => {
          return request.input.args[key] || false;
        }),
      };

      getSignedUrl.mockResolvedValueOnce('http://presigned.upload.url');

      const result = await uploadController.getUploadUrl(request);

      expect(result.fileKey).toBe('fixed-uuid-test-file.txt');
    });

    test('throws error if getSignedUrl fails', async () => {
      const request = {
        input: {
          args: {
            filename: 'test-file.txt',
            bucketName: 'my-bucket',
            bucketRegion: 'us-east-1',
          },
          body: {},
        },
        getBodyString: jest.fn().mockImplementation((key, defaultValue) => {
          return request.input.body[key] || defaultValue;
        }),
        getBoolean: jest.fn().mockImplementation((key) => {
          return request.input.args[key] || false;
        }),
      };

      getSignedUrl.mockRejectedValueOnce(new Error('AWS error'));

      await expect(uploadController.getUploadUrl(request)).rejects.toThrow('AWS error');
      expect(mockContext.log.error).toHaveBeenCalledWith('Error generating upload URL: AWS error');
    });

    test('throws BadRequestError if required args are missing', async () => {
      const request = {
        input: {
          args: {
            filename: 'test-file.txt',
            // Missing bucketRegion and bucketName
          },
          body: {},
        },
        getBodyString: jest.fn().mockImplementation((key, defaultValue) => defaultValue),
        getBoolean: jest.fn().mockImplementation((key) => {
          return request.input.args[key] || false;
        }),
      };

      await expect(uploadController.getUploadUrl(request)).rejects.toThrow(mockContext.errors.BadRequestError);
    });
  });
});
