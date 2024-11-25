const { getS3Client } = require('../../lib/helpers');
const S3Plugin = require('../../lib/S3Plugin');
const { S3 } = require('../__mocks__/aws-sdk');
const createContext = require('../__mocks__/context');
describe('S3Plugin', () => {
  let pluginInstance, context, mockS3Client;

  beforeEach(() => {
    jest.useFakeTimers();
    // Create a mock S3 client
    mockS3Client = new S3();
    getS3Client.mockReturnValue(mockS3Client);

    // Mock the Kuzzle context
    context = createContext();

    // Initialize the plugin with the mock context
    pluginInstance = new S3Plugin();
    pluginInstance.init(
      {
        bucketName: 'test-bucket',
        signedUrlTTL: 3600000,
        redisPrefix: 's3Plugin/uploads',
        endpoints: { 'us-east-1': 'https://mock-endpoint.com' },
      },
      context
    );
  });

  afterEach(() => {
    jest.clearAllTimers(); // Clear any pending timers after each test
    jest.restoreAllMocks(); // Restore all mocks to their original implementation
  });
  describe('Upload Controller', () => {
    let request;

    beforeEach(() => {
      request = {
        input: {
          args: {
            filename: 'test-file.png',
            uploadDir: 'test-dir',
            bucketRegion: 'us-east-1',
            bucketName: 'test-bucket'
          },
        },
      };
    });

    test('#getUploadUrl returns a presigned URL from AWS S3', async () => {
      const response = await pluginInstance.api.upload.actions.getUploadUrl.handler(request);

      expect(getS3Client).toHaveBeenCalledWith('https://mock-endpoint.com');
      expect(response).toEqual({
        fileKey: 'test-dir/mock-uuid-test-file.png',
        uploadUrl: 'http://url.s3',
        fileUrl: 'https://mock-endpoint.com/test-bucket/test-dir/mock-uuid-test-file.png',
        ttl: 3600000,
      });

      jest.runAllTimers();
    });

    test('#getUploadUrl constructs fileUrl using the correct region endpoint', async () => {
      request.input.args.bucketRegion = 'us-west-2';
      pluginInstance.config.endpoints = {
        'us-east-1': 'https://east-endpoint.com',
        'us-west-2': 'https://west-endpoint.com',
      };

      const response = await pluginInstance.api.upload.actions.getUploadUrl.handler(request);

      expect(response.fileUrl).toBe('https://west-endpoint.com/test-bucket/test-dir/mock-uuid-test-file.png');
      jest.runAllTimers();
    });

    test('#getUploadUrl throws an error if filename is not provided', async () => {
      delete request.input.args.filename;

      await expect(pluginInstance.api.upload.actions.getUploadUrl.handler(request)).rejects.toThrow(
        context.errors.BadRequestError
      );
    });

    test('expireFile deletes file after TTL if not validated', async () => {
      const fileKey = 'mock-uuid-test-file.png';
      const redisKey = `s3Plugin/uploads/${request.input.args.uploadDir}/${fileKey}`;
      jest.useFakeTimers();
    
      context.accessors.sdk.ms.get.mockResolvedValueOnce('temporary');
    
      pluginInstance.api.upload.actions.getUploadUrl.handler(request);
    
      jest.advanceTimersByTime(pluginInstance.config.signedUrlTTL);

      // let event loop proceed setTimeout 
      jest.useRealTimers();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(context.accessors.sdk.ms.get).toHaveBeenCalledWith(redisKey);
      expect(context.accessors.sdk.ms.del).toHaveBeenCalledWith([redisKey]);
    });

    test('#getUploadUrl throws an error if uploadDir is not provided', async () => {
      delete request.input.args.uploadDir;

      await expect(pluginInstance.api.upload.actions.getUploadUrl.handler(request)).rejects.toThrow(
        context.errors.BadRequestError
      );
    });

    test('#getUploadUrl throws an error if bucketRegion is not provided', async () => {
      delete request.input.args.bucketRegion;
    
      await expect(pluginInstance.api.upload.actions.getUploadUrl.handler(request)).rejects.toThrow(
        context.errors.BadRequestError
      );
    });
  });

  describe('File Controller', () => {
    let request;

    beforeEach(() => {
      request = {
        input: {
          args: {
            fileKey: 'test-dir/mock-uuid-test-file.png',
            bucketRegion: 'us-east-1',
          },
        },
      };
    });

    test('#getUrl returns the file URL', async () => {
      const response = await pluginInstance.api.file.actions.fileGetUrl.handler(request);

      expect(response).toEqual({
        fileUrl: 'https://mock-endpoint.com/test-bucket/test-dir/mock-uuid-test-file.png',
      });
    });

    test('#delete throws an error if file does not exist', async () => {
      mockS3Client.headObject.mockImplementation(() => ({
        promise: jest.fn().mockRejectedValue({ code: 'NotFound' }),
      }));

      await expect(pluginInstance.api.file.actions.fileDelete.handler(request)).rejects.toThrow(
        context.errors.NotFoundError
      );
    });

    test('#fileGetUrl throws an error if fileKey is invalid', async () => {
      delete request.input.args.fileKey;
    
      await expect(pluginInstance.api.file.actions.fileGetUrl.handler(request)).rejects.toThrow(
        context.errors.BadRequestError
      );
    });
    
    test('#fileDelete handles S3 deletion errors gracefully', async () => {
      // Mock `headObject` to simulate that the file exists
      mockS3Client.headObject.mockImplementation(() => ({
        promise: jest.fn().mockResolvedValue({}),
      }));
    
      // Mock `deleteObject` to throw an error
      mockS3Client.deleteObject.mockImplementation(() => ({
        promise: jest.fn().mockRejectedValue(new Error('S3 deletion error')),
      }));
    
      // Expect the file deletion to throw the mocked error
      await expect(pluginInstance.api.file.actions.fileDelete.handler(request)).rejects.toThrow(
        'S3 deletion error'
      );
    
      // Ensure both `headObject` and `deleteObject` were called
      expect(mockS3Client.headObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'test-dir/mock-uuid-test-file.png',
      });
      expect(mockS3Client.deleteObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'test-dir/mock-uuid-test-file.png',
      });
    });    
    
  });

  describe('Bucket Controller', () => {
    let request;
  
    beforeEach(() => {
      request = {
        input: {
          args: {
            bucketName: 'test-bucket',
            bucketRegion: 'us-east-1',
          },
        },
        body: {
          options: {}
        }
      };
  
      mockS3Client = new S3();
      getS3Client.mockReturnValue(mockS3Client);
    });
  
    test('#exists verifies the bucket exists', async () => {
      const response = await pluginInstance.api.bucket.actions.exists.handler(request);
  
      expect(response).toEqual({ exists: true });
      expect(mockS3Client.headBucket).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
      });
    });
  
    test('#exists throws an error if the bucket does not exist', async () => {
      
      mockS3Client.headBucket.mockImplementationOnce(() => ({
        promise: jest.fn().mockRejectedValue(new context.errors.NotFoundError),
      }));
    
      await expect(pluginInstance.api.bucket.actions.exists.handler(request))
        .rejects
        .toThrow(context.errors.NotFoundError);
    
      expect(mockS3Client.headBucket).toHaveBeenCalledWith({ Bucket: 'test-bucket' });
    });

    test('#create throws an error if bucket already exists', async () => {
      jest.spyOn(pluginInstance.api.bucket.actions.exists, 'handler').mockResolvedValue(true);
    
      await expect(pluginInstance.api.bucket.actions.create.handler(request)).rejects.toThrow(
        context.errors.BadRequestError
      );
    
    });
    
    test('#delete throws an error if S3 fails during bucket deletion', async () => {
      mockS3Client.deleteBucket.mockImplementationOnce(() => ({
        promise: jest.fn().mockRejectedValue(new Error('S3 bucket deletion error')),
      }));
    
      await expect(pluginInstance.api.bucket.actions.delete.handler(request)).rejects.toThrow(
        'S3 bucket deletion error'
      );
    });
    
    test('#setPolicy throws an error if policy is missing', async () => {
      request.input.body = {}; // No policy
    
      await expect(pluginInstance.api.bucket.actions.setPolicy.handler(request)).rejects.toThrow(
        context.errors.BadRequestError
      );
    });
    
    test('#enablePublicAccess handles S3 errors gracefully', async () => {
      mockS3Client.deletePublicAccessBlock.mockImplementationOnce(() => ({
        promise: jest.fn().mockRejectedValue(new Error('Public access error')),
      }));
    
      await expect(pluginInstance.api.bucket.actions.enablePublicAccess.handler(request)).rejects.toThrow(
        'Public access error'
      );
    });
    
  });
});
