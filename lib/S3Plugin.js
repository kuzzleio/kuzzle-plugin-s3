/*
 * Kuzzle, a backend software, self-hostable and ready to use
 * to power modern apps
 */

const BucketController = require('./controllers/BucketController');
const FileController = require('./controllers/FileController');
const UploadController = require('./controllers/UploadController');
const { _ } = require('lodash');

class S3Plugin {
  constructor() {
    this.defaultConfig = {
      bucketName: 'default-bucket',
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      endpoints: {},
      s3ClientOptions: {
        region: 'us-east-1',
      },
      isMinio: false,
      signedUrlTTL: '20min',
      redisPrefix: 's3Plugin/uploads',
      vault: {
        accessKeyIdPath: 'aws.s3.accessKeyId',
        secretAccessKeyPath: 'aws.s3.secretAccessKey',
      },
    };
  }

  /**
   * Plugin initialization.
   */
  init(customConfig, context) {
    this.config = _.merge({}, this.defaultConfig, customConfig);

    // Backward compatibility for legacy `endpoint` field
    if (this.config.endpoint && Object.keys(this.config.endpoints).length === 0) {
      this.config.endpoints = {
        [this.config.s3ClientOptions.region]: this.config.endpoint,
      };

      context.log.warn(
        'Deprecation Notice: The "endpoint" configuration field is deprecated. ' +
        'Please use the "endpoints" configuration field with a region mapping instead.'
      );
    }

    this.defaultRegion = this.config.s3ClientOptions.region;
    this.context = context;

    // Initialize controllers
    const bucketController = new BucketController(this.config, this.context);
    const fileController = new FileController(this.config, this.context);
    const uploadController = new UploadController(this.config, this.context);

    // Define controller actions and routes
    this.api = {
      bucket: {
        actions: {
          create: {
            handler: bucketController.create.bind(bucketController),
            http: [{ verb: 'post', path: '/_bucket/create/:bucketRegion' }],
          },
          delete: {
            handler: bucketController.delete.bind(bucketController),
            http: [{ verb: 'delete', path: '/_bucket/delete/:bucketRegion/:bucketName' }],
          },
          exists: {
            handler: bucketController.exists.bind(bucketController),
            http: [{ verb: 'get', path: '/_bucket/exists/:bucketRegion/:bucketName' }],
          },
          setPolicy: {
            handler: bucketController.setPolicy.bind(bucketController),
            http: [{ verb: 'post', path: '/_bucket/set-policy/:bucketRegion/:bucketName' }],
          },
          enablePublicAccess: {
            handler: bucketController.enablePublicAccess.bind(bucketController),
            http: [{ verb: 'post', path: '/_bucket/public-access/:bucketRegion/:bucketName' }],
          },
        },
      },
      file: {
        actions: {
          fileGetUrl: {
            handler: fileController.fileGetUrl.bind(fileController),
            http: [{ verb: 'get', path: '/_file/get-url/:bucketRegion/:fileKey' }],
          },
          fileDelete: {
            handler: fileController.fileDelete.bind(fileController),
            http: [{ verb: 'delete', path: '/_file/delete/:bucketRegion/:fileKey' }],
          },
          getFilesKeys: {
            handler: fileController.getFilesKeys.bind(fileController),
            http: [{ verb: 'get', path: '/_file/list-keys/:bucketRegion/:bucketName' }],
          },
        },
      },
      upload: {
        actions: {
          getUploadUrl: {
            handler: uploadController.getUploadUrl.bind(uploadController),
            http: [{ verb: 'get', path: '/_upload/get-upload-url/:bucketRegion' }],
          },
          validate: {
            handler: uploadController.validate.bind(uploadController),
            http: [{ verb: 'post', path: '/_upload/validate/:bucketRegion' }],
          },
        },
      },
    };

    context.log.info('S3 Plugin initialized successfully.');
  }
}

module.exports = S3Plugin;
