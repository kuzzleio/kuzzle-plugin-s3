const FileController = require('../../lib/controllers/FileController');

jest.mock('../../lib/helpers', () => ({
  getS3Client: jest.fn(),
  getProperty: jest.fn(),
  listAllObjects: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: jest.fn().mockImplementation((params) => params),
}));

const { getS3Client, listAllObjects, getProperty } = require('../../lib/helpers');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');

describe('FileController', () => {
  let fileController;
  let mockContext;
  let mockConfig;

  const mockHeadObject = jest.fn();
  const mockDeleteObject = jest.fn();

  beforeEach(() => {
    mockHeadObject.mockReset();
    mockDeleteObject.mockReset();
    GetObjectCommand.mockReset();
    listAllObjects.mockReset();

    mockContext = {
      errors: {
        BadRequestError: class extends Error {},
        InternalError: class extends Error {},
        NotFoundError: class extends Error {},
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
      forcePathStyle: false,
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

    getS3Client.mockImplementation(() => ({
      headObject: mockHeadObject,
      deleteObject: mockDeleteObject,
    }));
    getProperty.mockImplementation((obj, path) => obj ? obj[path] : undefined);
    fileController = new FileController(mockConfig, mockContext);
  });

  describe('getFilesKeys', () => {
    test('returns a list of file keys', async () => {
      const request = {
        input: {
          args: {
            bucketName: 'my-bucket',
            bucketRegion: 'us-east-1',
          },
        },
      };

      const mockFiles = [
        { Key: 'file1.txt', LastModified: new Date('2020-01-01'), Size: 123 },
        { Key: 'file2.jpg', LastModified: new Date('2020-01-02'), Size: 456 },
      ];

      listAllObjects.mockResolvedValueOnce(mockFiles);

      const result = await fileController.getFilesKeys(request);

      expect(listAllObjects).toHaveBeenCalledWith(expect.any(Object), { Bucket: 'my-bucket' });
      expect(result).toEqual({
        files: [
          { Key: 'file1.txt', LastModified: mockFiles[0].LastModified, Size: 123 },
          { Key: 'file2.jpg', LastModified: mockFiles[1].LastModified, Size: 456 },
        ],
      });
    });
  });

  describe('fileDelete', () => {
    test('deletes a file if it exists', async () => {
      const request = {
        input: {
          args: {
            fileKey: 'file1.txt',
            bucketName: 'my-bucket',
            bucketRegion: 'us-east-1',
          },
        },
      };

      mockHeadObject.mockResolvedValueOnce({});

      mockDeleteObject.mockResolvedValueOnce({});

      const result = await fileController.fileDelete(request);

      expect(mockHeadObject).toHaveBeenCalledWith({ Bucket: 'my-bucket', Key: 'file1.txt' });
      expect(mockDeleteObject).toHaveBeenCalledWith({ Bucket: 'my-bucket', Key: 'file1.txt' });
      expect(result).toEqual({ message: 'File "file1.txt" deleted.' });
    });

    test('throws NotFoundError if file does not exist', async () => {
      const request = {
        input: {
          args: {
            fileKey: 'missing-file.txt',
            bucketName: 'my-bucket',
            bucketRegion: 'us-east-1',
          },
        },
      };

      mockHeadObject.mockRejectedValueOnce({ name: 'NotFound' });

      await expect(fileController.fileDelete(request)).rejects.toThrow(mockContext.errors.NotFoundError);
      expect(mockDeleteObject).not.toHaveBeenCalled();
    });
  });

  describe('fileGetUrl', () => {
    test('returns a presigned file URL', async () => {
      getSignedUrl.mockResolvedValueOnce('http://presigned.download.url');

      const request = {
        input: {
          args: {
            fileKey: 'path/to/file.txt',
            bucketName: 'my-bucket',
            bucketRegion: 'us-east-1',
          },
        },
        getBodyString: jest.fn().mockImplementation((key, defaultValue) => {
          return request.input.body[key] || defaultValue;
        }),
        getBoolean: jest.fn().mockImplementation((key) => {
          return request.input.args[key] || false;
        }),
      };
          

      const result = await fileController.fileGetUrl(request);

      expect(result).toEqual({
        fileUrl: 'http://presigned.download.url',
      });
    });
    test('returns a path style public file URL', async () => {
      const request = {
        input: {
          args: {
            fileKey: 'path/to/file.txt',
            bucketName: 'my-bucket',
            bucketRegion: 'us-east-1',
            publicUrl: true,
          },
        },
        getBodyString: jest.fn().mockImplementation((key, defaultValue) => {
          return request.input.body[key] || defaultValue;
        }),
        getBoolean: jest.fn().mockImplementation((key) => {
          return request.input.args[key] || false;
        }),
      };
          

      const result = await fileController.fileGetUrl(request);

      expect(result).toEqual({
        fileUrl: 'http://localhost:9000/my-bucket/path/to/file.txt',
      });
    });
    test('returns a virtual host public file URL', async () => {
      const request = {
        input: {
          args: {
            fileKey: 'path/to/file.txt',
            bucketName: 'my-bucket',
            bucketRegion: 'eu-west-1',
            publicUrl: true,
          },
        },
        getBodyString: jest.fn().mockImplementation((key, defaultValue) => {
          return request.input.body[key] || defaultValue;
        }),
        getBoolean: jest.fn().mockImplementation((key) => {
          return request.input.args[key] || false;
        }),
      };
          

      const result = await fileController.fileGetUrl(request);

      expect(result).toEqual({
        fileUrl: 'https://my-bucket.my-endpoint.com/path/to/file.txt',
      });
    });
  });
});
