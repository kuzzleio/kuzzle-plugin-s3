const S3Plugin = require('../../lib/S3Plugin');
const BucketController = require('../../lib/controllers/BucketController');
const FileController = require('../../lib/controllers/FileController');
const UploadController = require('../../lib/controllers/UploadController');

jest.mock('../../lib/controllers/BucketController');
jest.mock('../../lib/controllers/FileController');
jest.mock('../../lib/controllers/UploadController');

describe('S3Plugin - init', () => {
  let plugin;
  let mockContext;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    plugin = new S3Plugin();
    plugin.config.endpoints = {
      'eu-west-1': {
        endpoint: 'https://s3.eu-west-1.amazonaws.com',
        accessKeyIdPath: 'aws.s3.eu-west-1.accessKeyId',
        secretAccessKeyPath: 'aws.s3.eu-west-1.secretAccessKey',
        forcePathStyle: false,
      },
      'us-east-1': {
        endpoint: 'https://s3.us-east-1.amazonaws.com',
        accessKeyIdPath: 'aws.s3.us-east-1.accessKeyId',
        secretAccessKeyPath: 'aws.s3.us-east-1.secretAccessKey',
        forcePathStyle: false,
      },
    };
    mockContext = {
      log: {
        info: jest.fn(),
      },
    };
  });

  test('should merge custom configuration with defaults', () => {
    const customConfig = {
      signedUrlTTL: '10min',
      endpoints: {
        'eu-central-1': {
          endpoint: 'https://s3.eu-central-1.amazonaws.com',
          accessKeyIdPath: 'aws.s3.eu-central-1.accessKeyId',
          secretAccessKeyPath: 'aws.s3.eu-central-1.secretAccessKey',
        },
      },
    };

    plugin.init(customConfig, mockContext);

    // Verify that custom config is merged with default
    expect(plugin.config.signedUrlTTL).toBe('10min');
    expect(plugin.config.endpoints['eu-central-1']).toEqual(customConfig.endpoints['eu-central-1']);
    expect(plugin.config.endpoints['eu-west-1']).toEqual(plugin.defaultConfig.endpoints['eu-west-1']); // Default remains

    // Verify controllers are initialized with merged config
    expect(BucketController).toHaveBeenCalledWith(plugin.config, mockContext);
    expect(FileController).toHaveBeenCalledWith(plugin.config, mockContext);
    expect(UploadController).toHaveBeenCalledWith(plugin.config, mockContext);
  });

  test('should throw error if no endpoints are configured', () => {
    const customConfig = {
      endpoints: {}, 
    };
  
    expect(() => plugin.init(customConfig, mockContext)).toThrow('BaseController requires a valid endpoints configuration.');
  });
  

  test('should correctly define API routes', () => {
    plugin.init({
      endpoints: {
        'eu-west-1': {
          endpoint: 'https://s3.eu-west-1.amazonaws.com',
          accessKeyIdPath: 'aws.s3.eu-west-1.accessKeyId',
          secretAccessKeyPath: 'aws.s3.eu-west-1.secretAccessKey',
          forcePathStyle: false,
        },
        'us-east-1': {
          endpoint: 'https://s3.us-east-1.amazonaws.com',
          accessKeyIdPath: 'aws.s3.us-east-1.accessKeyId',
          secretAccessKeyPath: 'aws.s3.us-east-1.secretAccessKey',
          forcePathStyle: false,
        },
      }
    }, mockContext);

    const expectedApi = {
      bucket: expect.objectContaining({
        actions: expect.objectContaining({
          create: expect.objectContaining({
            handler: expect.any(Function),
            http: [{ verb: 'post', path: '/_bucket/create/:bucketRegion/:bucketName' }],
          }),
          delete: expect.objectContaining({
            handler: expect.any(Function),
            http: [{ verb: 'delete', path: '/_bucket/delete/:bucketRegion/:bucketName' }],
          }),
        }),
      }),
      file: expect.objectContaining({
        actions: expect.objectContaining({
          fileGetUrl: expect.objectContaining({
            handler: expect.any(Function),
            http: [{ verb: 'get', path: '/_file/get-url/:bucketRegion/:bucketName/:fileKey' }],
          }),
        }),
      }),
      upload: expect.objectContaining({
        actions: expect.objectContaining({
          getUploadUrl: expect.objectContaining({
            handler: expect.any(Function),
            http: [{ verb: 'post', path: '/_upload/get-url/:bucketRegion/:bucketName/:filename' }],
          }),
        }),
      }),
    };

    expect(plugin.api).toMatchObject(expectedApi);
  });
});
