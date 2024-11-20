const S3Plugin = require('../../lib/S3Plugin');

describe('S3Plugin', () => {
  let pluginInstance, context, request;

  jest.useFakeTimers();

  beforeEach(() => {
    jest.clearAllTimers(); // Clear any existing timers
    // Mock environment variables for AWS credentials
    process.env.AWS_ACCESS_KEY_ID = 'mock-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'mock-secret-key';

    // Mock _assertCredentials to skip validation
    jest
      .spyOn(S3Plugin.prototype, '_assertCredentials')
      .mockImplementation(() => {});

    // Mock _loadS3 to initialize a fake S3 client
    jest.spyOn(S3Plugin.prototype, '_loadS3').mockImplementation(() => {
      pluginInstance.s3 = {
        getSignedUrl: jest.fn().mockReturnValue('http://url.s3'),
        deleteObject: jest.fn(() => ({
          promise: jest.fn().mockResolvedValue({}), // Mocking the promise return
        })),
        headObject: jest.fn(() => ({
          promise: jest.fn().mockResolvedValue({}), // Mocking the promise return
        })),
        listObjectsV2: jest.fn(() => ({
          promise: jest.fn().mockResolvedValue({
            Contents: [
              { Key: 'test/0-test.png', LastModified: new Date(), Size: 100 },
              { Key: 'test/1-test.png', LastModified: new Date(), Size: 200 },
            ],
          })})),
      };
    });

    context = {
      accessors: {
        sdk: {
          ms: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(),
            del: jest.fn().mockResolvedValue(),
          },
        },
      },
      errors: {
        BadRequestError: class BadRequestError extends Error {},
        NotFoundError: class NotFoundError extends Error {},
        InternalError: class InternalError extends Error {},
      },
      log: {
        warn: jest.fn(),
        debug: jest.fn(),
      },
    };

    pluginInstance = new S3Plugin();
    pluginInstance.init(
      {
        bucketName: 'test-bucket',
        signedUrlTTL: 3600000,
        redisPrefix: 's3Plugin/uploads',
      },
      context
    );
    pluginInstance._expireFile = jest.fn(); // Mock _expireFile to avoid timeout creation
  });

  afterEach(() => {
    jest.runOnlyPendingTimers(); // Complete pending timers
    jest.clearAllTimers(); // Clean up timers to avoid leaks
  });

  describe('#uploadGetUrl', () => {
    beforeEach(() => {
      request = {
        input: {
          args: {
            filename: 'test-file.png',
            uploadDir: 'test-dir',
          },
        },
      };
    });
    beforeEach(() => {
      pluginInstance._expireFile = jest.fn(); // Mock _expireFile to avoid creating timeouts
    });
    test('returns a presigned URL from AWS S3', async () => {
      pluginInstance._expireFile = jest.fn(); // Ensure no timeout is created
      console.log(pluginInstance._expireFile);
      const filename = 'test-file.png';
      const uploadDir = 'test-dir';
      const expectedFileKey = `${uploadDir}/mock-uuid-${filename}`; // Mocked UUID

      const response = await pluginInstance.uploadGetUrl(request);

      expect(pluginInstance.s3.getSignedUrl).toHaveBeenCalledWith('putObject', {
        Bucket: 'test-bucket',
        Key: expectedFileKey,
        Expires: 3600, // TTL in seconds
      });

      expect(pluginInstance._expireFile).toHaveBeenCalledWith(expectedFileKey);

      expect(response).toEqual({
        fileKey: expectedFileKey,
        uploadUrl: 'http://url.s3',
        fileUrl: `https://s3.eu-west-3.amazonaws.com/test-bucket/${expectedFileKey}`,
        ttl: 3600000, // TTL in milliseconds
      });
    });

    test('throws an error if \'filename\' is not provided', async () => {
      delete request.input.args.filename;

      try {
        await pluginInstance.uploadGetUrl(request);
      } catch (err) {
        expect(err).toBeInstanceOf(context.errors.BadRequestError);
      }
    });

    test('throws an error if AWS credentials are missing', async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;

      pluginInstance = new S3Plugin();
      pluginInstance.init({}, context);

      try {
        await pluginInstance.uploadGetUrl(request);
      } catch (err) {
        expect(err).toBeInstanceOf(context.errors.InternalError);
      }
    });
  });

  describe('#uploadValidate', () => {
    beforeEach(() => {
      request = {
        input: {
          args: {
            fileKey: 'test-dir/mock-uuid-test-file.png',
          },
        },
      };
    });
  
    test('deletes the associated key in Redis and clears the timeout', async () => {
  
      await pluginInstance.uploadValidate(request);
  
      expect(context.accessors.sdk.ms.del).toHaveBeenCalledWith([
        's3Plugin/uploads/test-dir/mock-uuid-test-file.png',
      ]);

    });
  
    test('throws an error if "fileKey" is not provided', async () => {
      delete request.input.args.fileKey;
  
      await expect(pluginInstance.uploadValidate(request)).rejects.toThrow(
        context.errors.BadRequestError
      );
    });
  });
  
  describe('#fileGetUrl', () => {
    beforeEach(() => {
      request = {
        input: {
          args: {
            fileKey: 'test-dir/mock-uuid-test-file.png',
          },
        },
      };
    });
  
    test('returns the file URL', async () => {
      const response = await pluginInstance.fileGetUrl(request);
  
      expect(response).toEqual({
        fileUrl: 'https://s3.eu-west-3.amazonaws.com/test-bucket/test-dir/mock-uuid-test-file.png',
      });
    });
  
    test('throws an error if "fileKey" is not provided', async () => {
      delete request.input.args.fileKey;
  
      await expect(pluginInstance.fileGetUrl(request)).rejects.toThrow(
        context.errors.BadRequestError
      );
    });
  });
  
  describe('#fileDelete', () => {
    beforeEach(() => {
      request = {
        input: {
          args: {
            fileKey: 'test-dir/mock-uuid-test-file.png',
          },
        },
      };
    });
  
    test('deletes the file from S3', async () => {
      await pluginInstance.fileDelete(request);
  
      expect(pluginInstance.s3.headObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'test-dir/mock-uuid-test-file.png',
      });
    
      expect(pluginInstance.s3.deleteObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'test-dir/mock-uuid-test-file.png',
      });
    });
   
    test('throws a NotFoundError if the file does not exist', async () => {
      jest.spyOn(pluginInstance, '_fileExists').mockResolvedValue(false);
      await expect(pluginInstance.fileDelete(request)).rejects.toThrow(
        context.errors.NotFoundError
      );
    });

    test('throws an error if "fileKey" is not provided', async () => {
      delete request.input.args.fileKey;
  
      await expect(pluginInstance.fileDelete(request)).rejects.toThrow(
        context.errors.BadRequestError
      );
    });
  });
  describe('#getFilesKeys', () => {
    test('returns the list of file keys from the bucket', async () => {
      const response = await pluginInstance.getFilesKeys();
  
      expect(pluginInstance.s3.listObjectsV2).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
      });
  
      expect(response).toEqual({
        filesKeys: [
          {
            Key: 'https://s3.eu-west-3.amazonaws.com/test-bucket/test/0-test.png',
            LastModified: expect.any(Date),
            Size: 100,
          },
          {
            Key: 'https://s3.eu-west-3.amazonaws.com/test-bucket/test/1-test.png',
            LastModified: expect.any(Date),
            Size: 200,
          },
        ],
      });
    });
  
    test('throws an error if S3 API fails', async () => {
      // Mock listObjectsV2 to simulate an error
      pluginInstance.s3.listObjectsV2.mockImplementation(() => ({
        promise: jest.fn().mockRejectedValue(new Error('S3 error')),
      }));
    
      // Expect getFilesKeys to throw the mocked error
      await expect(pluginInstance.getFilesKeys()).rejects.toThrow('S3 error');
    });
    
  });
  
});
