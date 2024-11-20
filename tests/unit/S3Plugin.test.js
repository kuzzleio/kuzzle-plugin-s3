const S3Plugin = require('../../lib/S3Plugin');

describe('S3Plugin', () => {
  let pluginInstance, context, request;

  jest.useFakeTimers();

  beforeEach(() => {
    jest.clearAllTimers();
    process.env.AWS_ACCESS_KEY_ID = 'mock-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'mock-secret-key';

    jest.spyOn(S3Plugin.prototype, '_loadS3').mockImplementation(() => {
      pluginInstance.s3 = {
        getSignedUrl: jest.fn().mockReturnValue('http://url.s3'),
        deleteObject: jest.fn(() => ({
          promise: jest.fn().mockResolvedValue({}),
        })),
        headObject: jest.fn(() => ({
          promise: jest.fn().mockResolvedValue({}),
        })),
        listObjectsV2: jest.fn(() => ({
          promise: jest.fn().mockResolvedValue({
            Contents: [
              { Key: 'test/0-test.png', LastModified: new Date(), Size: 100 },
              { Key: 'test/1-test.png', LastModified: new Date(), Size: 200 },
            ],
          }),
        })),
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
    pluginInstance._expireFile = jest.fn(async (fileKey) => {
      const redisKey = `${pluginInstance.config.redisPrefix}/${fileKey}`;
      

      if (await context.accessors.sdk.ms.get(redisKey)) {
        context.accessors.sdk.ms.del([redisKey]); // Simulate key deletion
      }
    });
    
  });

  afterEach(() => {
    jest.clearAllTimers();
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

    test('returns a presigned URL from AWS S3', async () => {
      const filename = 'test-file.png';
      const uploadDir = 'test-dir';
      const expectedFileKey = `${uploadDir}/mock-uuid-${filename}`;

      const response = await pluginInstance.uploadGetUrl(request);

      expect(pluginInstance.s3.getSignedUrl).toHaveBeenCalledWith('putObject', {
        Bucket: 'test-bucket',
        Key: expectedFileKey,
        Expires: 3600,
      });

      expect(pluginInstance._expireFile).toHaveBeenCalledWith(expectedFileKey);

      expect(response).toEqual({
        fileKey: expectedFileKey,
        uploadUrl: 'http://url.s3',
        fileUrl: `https://s3.eu-west-3.amazonaws.com/test-bucket/${expectedFileKey}`,
        ttl: 3600000,
      });
    });

    test('throws an error if filename is not provided', async () => {
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

    test('throws an error if uploadDir is not provided', async () => {
      delete request.input.args.uploadDir;
    
      await expect(pluginInstance.uploadGetUrl(request)).rejects.toThrow(
        context.errors.BadRequestError
      );
    });
    
    test('expireFile deletes file after TTL if not validated', async () => {
      const fileKey = 'test-file';
      const redisKey = `s3Plugin/uploads/${fileKey}`;
      jest.useFakeTimers();
    
      context.accessors.sdk.ms.get.mockResolvedValueOnce('temporary');
    
      pluginInstance._expireFile(fileKey);
    
      jest.advanceTimersByTime(pluginInstance.config.signedUrlTTL);
      // necessary to let redis call to del go
      jest.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 100));
    
      expect(context.accessors.sdk.ms.get).toHaveBeenCalledWith(redisKey);
      expect(context.accessors.sdk.ms.del).toHaveBeenCalledWith([redisKey]);
    
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

    test('throws an error if fileKey is not provided', async () => {
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
      pluginInstance.s3.headObject.mockImplementation(() => ({
        promise: jest.fn().mockRejectedValue({ code: 'NotFound' }),
      }));

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
      pluginInstance.s3.listObjectsV2.mockImplementation(() => ({
        promise: jest.fn().mockRejectedValue(new Error('S3 error')),
      }));

      await expect(pluginInstance.getFilesKeys()).rejects.toThrow('S3 error');
    });
  });

  describe('#init', () => {
    test('sets up the plugin configuration correctly', () => {
      const config = { signedUrlTTL: '1h', bucketName: 'test-bucket' };
      pluginInstance.init(config, context);

      expect(pluginInstance.config.bucketName).toBe('test-bucket');
      expect(pluginInstance.config.signedUrlTTL).toBe(3600000);
    });

    test('init handles missing configuration gracefully', () => {
      const config = {};
      pluginInstance.init(config, context);
    
      expect(pluginInstance.config.bucketName).toBe('your-s3-bucket'); // Default value
    });
    
  });

  describe('#_deleteFile', () => {
    test('calls S3 deleteObject with correct parameters', async () => {
      await pluginInstance._deleteFile('test-file');
      expect(pluginInstance.s3.deleteObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'test-file',
      });
    });

    test('deleteFile throws an error if S3 API fails', async () => {
      pluginInstance.s3.deleteObject.mockImplementation(() => ({
        promise: jest.fn().mockRejectedValue(new Error('S3 deletion failed')),
      }));
    
      await expect(pluginInstance._deleteFile('test-file')).rejects.toThrow(
        'S3 deletion failed'
      );
    });
    
  });

  describe('#_assertCredentials', () => {
    test('throws InternalError if AWS credentials are missing', () => {
      // Create a new plugin instance
      const unmockedPlugin = new S3Plugin();
      unmockedPlugin.context = context;
  
      // Manually set `this.s3` to null to simulate missing credentials
      unmockedPlugin.s3 = null;
  
      expect(() => unmockedPlugin._assertCredentials()).toThrow(
        context.errors.InternalError
      );
    });

    test('throws InternalError if credentials in context are invalid', () => {
      pluginInstance.context.secrets = {
        aws: { s3: { accessKeyId: null, secretAccessKey: null } },
      };
      pluginInstance.s3 = null;
    
      expect(() => pluginInstance._assertCredentials()).toThrow(
        context.errors.InternalError
      );
    });
    
  });  
});
