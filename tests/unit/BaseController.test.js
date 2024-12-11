/* eslint-disable no-new */
const BaseController = require('../../lib/controllers/BaseController');

// Mock the helpers used by BaseController
jest.mock('../../lib/helpers', () => ({
  getS3Client: jest.fn(),
  getProperty: jest.fn(),
}));

const { getS3Client, getProperty } = require('../../lib/helpers');

describe('BaseController', () => {
  let baseController;
  let mockContext;
  let mockConfig;

  beforeEach(() => {
    getS3Client.mockReset();
    getProperty.mockReset();

    mockContext = {
      errors: {
        BadRequestError: class BadRequestError extends Error {},
        InternalError: class InternalError extends Error {},
      },
      secrets: {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
      },
      log: {
        error: jest.fn(),
      },
    };

    mockConfig = {
      forcePathStyle: false,
      endpoints: {
        'us-east-1': {
          endpoint: 'https://s3.us-east-1.amazonaws.com',
          forcePathStyle: false,
          accessKeyIdPath: 'accessKeyId',
          secretAccessKeyPath: 'secretAccessKey',
        },
      },
    };
    getProperty.mockImplementation((obj, path) =>{
      return obj ? obj[path] : undefined;
    });
    baseController = new BaseController(mockConfig, mockContext);
  });

  describe('constructor', () => {
    test('throws if no endpoints are provided', () => {
      
      expect(() => {
        new BaseController({}, mockContext);
      }).toThrow('No endpoints configuration found. Unable to init plugin');
    });

    test('constructs successfully with endpoints', () => {
      expect(() => {
        new BaseController(mockConfig, mockContext);
      }).not.toThrow();
    });
  });

  describe('getS3Client', () => {
    test('returns a client if endpoint is configured', () => {

      const mockClient = {};
      getS3Client.mockReturnValue(mockClient);

      const client = baseController.getS3Client('us-east-1');

      expect(getS3Client).toHaveBeenCalledWith(
        {
          endpoint: 'https://s3.us-east-1.amazonaws.com',
          region: 'us-east-1',
          forcePathStyle: false,
        },
        { accessKeyId: 'accessKeyId', secretAccessKey: 'secretAccessKey' }
      );
      expect(client).toBe(mockClient);
    });

    test('throws if no endpoint for the region', () => {
      expect(() => {
        baseController.getS3Client('non-existing-region');
      }).toThrow('No endpoint configured for region: non-existing-region');
    });
  });

  describe('_getCredentials', () => {
    test('retrieves credentials from context.secrets', () => {
      getProperty.mockImplementation((obj, path) => obj[path]);

      const creds = baseController._getCredentials('us-east-1');
      expect(creds).toEqual({
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
      });
    });

    test('throws if region not configured', () => {
      expect(() => {
        baseController._getCredentials('non-existing-region');
      }).toThrow('No configuration found for region: non-existing-region');
    });

    test('throws if credentials missing', () => {
      getProperty.mockReturnValue(undefined); // simulate no credentials

      expect(() => {
        baseController._getCredentials('us-east-1');
      }).toThrow('S3 credentials are missing for region: us-east-1. Ensure they are set in the vault.');
    });
  });

  describe('stringArg', () => {
    test('returns the argument if present and a string', () => {
      const request = {
        input: {
          args: {
            fileKey: 'myFile.txt',
          },
        },
      };

      getProperty.mockImplementation((obj, path) => obj[path]);

      const arg = baseController.stringArg(request, 'fileKey');
      expect(arg).toBe('myFile.txt');
    });

    test('throws if argument missing', () => {
      const request = {
        input: {
          args: {},
        },
      };
      getProperty.mockImplementation(() => undefined);

      expect(() => {
        baseController.stringArg(request, 'fileKey');
      }).toThrow('Missing argument: "fileKey"');
    });

    test('throws if argument is not a string', () => {
      const request = {
        input: {
          args: {
            fileKey: 123,
          },
        },
      };
      getProperty.mockImplementation((obj, path) => obj[path]);

      expect(() => {
        baseController.stringArg(request, 'fileKey');
      }).toThrow('Invalid value for "fileKey"');
    });
  });

  describe('_getUrl', () => {
    test('constructs path-style URL when forcePathStyle = true', () => {
      // Override config to force path style
      baseController.config.endpoints['us-east-1'].forcePathStyle = true;

      const url = baseController._getUrl('my-bucket', 'path/to/file.jpg', 'us-east-1');
      expect(url).toBe('https://s3.us-east-1.amazonaws.com/my-bucket/path/to/file.jpg');
    });

    test('constructs virtual-hosted style URL when forcePathStyle = false', () => {
      const url = baseController._getUrl('my-bucket', 'path/to/file.jpg', 'us-east-1');
      expect(url).toBe('https://my-bucket.s3.us-east-1.amazonaws.com/path/to/file.jpg');
    });

    test('throws if no endpoint for region', () => {
      expect(() => {
        baseController._getUrl('my-bucket', 'file.txt', 'non-existing-region');
      }).toThrow('No endpoint configured for region: non-existing-region');
    });
  });
});
