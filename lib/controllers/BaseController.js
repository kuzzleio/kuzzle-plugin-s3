const { isNil } = require('lodash');
const { getS3Client, getProperty } = require('../helpers');

class BaseController {
  constructor(config, context) {
    this.config = config;
    this.context = context;

    if (
      !this.config.endpoints ||
      Object.keys(this.config.endpoints).length === 0
    ) {
      throw new Error(
        'No endpoints configuration found. Unable to init plugin'
      );
    }
  }

  /**
   * Get or create an S3 client for the given region.
   * @param {string} region - The region for which to get the S3 client.
   * @returns {S3Client} - The initialized S3 client for the region.
   * @throws {Error} If no endpoint is configured for the region.
   */
  getS3Client(region) {
    const endpointConfig = this.config.endpoints[region];

    if (isNil(endpointConfig) || isNil(endpointConfig.endpoint)) {
      throw new Error(`No endpoint configured for region: ${region}`);
    }

    const client = getS3Client(
      {
        endpoint: endpointConfig.endpoint,
        region,
        forcePathStyle:
          endpointConfig.forcePathStyle || endpointConfig.isMinio || false,
      },
      this._getCredentials(region)
    );

    return client;
  }

  /**
   * Retrieve credentials for a specific region from the vault or environment variables.
   * @param {string} targetRegion - The region for which to retrieve credentials.
   * @returns {Object} - AWS credentials (accessKeyId, secretAccessKey).
   * @throws {Error} If credentials cannot be retrieved.
   */
  _getCredentials(targetRegion) {
    const endpointConfig = this.config.endpoints[targetRegion];

    if (!endpointConfig) {
      throw new Error(`No configuration found for region: ${targetRegion}`);
    }

    const accessKeyId = getProperty(
      this.context.secrets,
      endpointConfig.accessKeyIdPath
    );
    const secretAccessKey = getProperty(
      this.context.secrets,
      endpointConfig.secretAccessKeyPath
    );

    if (!accessKeyId || !secretAccessKey) {
      throw new this.context.errors.InternalError(
        `S3 credentials are missing for region: ${targetRegion}. Ensure they are set in the vault.`
      );
    }

    return { accessKeyId, secretAccessKey };
  }

  /**
   * Retrieve a string argument from the request input args.
   * @param {Object} request - The request object.
   * @param {string} paramPath - Path to the argument in the input args.
   * @param {?string} defaultValue - The default value if the argument is missing.
   * @returns {string} - The extracted string argument.
   * @throws {Error} If the argument is missing or not a string.
   */
  stringArg(request, paramPath, defaultValue = null) {
    const value = getProperty(request.input.args, paramPath) || defaultValue;

    if (isNil(value)) {
      throw new this.context.errors.BadRequestError(
        `Missing argument: "${paramPath}"`
      );
    }
    if (typeof value !== 'string') {
      throw new this.context.errors.BadRequestError(
        `Invalid value for "${paramPath}"`
      );
    }

    return value;
  }
  /**
   * Construct the file's public or base URL.
   * Supports both path-style and virtual-hosted style URLs.
   * @param {string} bucketName - Name of the S3 bucket.
   * @param {string} fileKey - Key of the file in the bucket.
   * @param {string} region - Region of the bucket.
   * @returns {string} - Constructed URL.
   * @throws {Error} - If the region or endpoint is not configured.
   */
  _getPublicUrl(bucketName, fileKey, region) {
    const endpointConfig = this.config.endpoints[region];
    if (!endpointConfig || !endpointConfig.endpoint) {
      throw new this.context.errors.BadRequestError(
        `No endpoint configured for region: ${region}`
      );
    }

    const forcePathStyle =
    endpointConfig.forcePathStyle || this.config.forcePathStyle || false;

    if (forcePathStyle) {
    // Path-style URL format: https://<endpoint>/<bucketName>/<fileKey>
      return `${endpointConfig.endpoint}/${bucketName}/${fileKey}`;
    }

    // Virtual-hosted style URL format: https://<bucketName>.<endpoint>/<fileKey>
    const url = new URL(endpointConfig.endpoint);
    url.hostname = `${bucketName}.${url.hostname}`;
    url.pathname = `/${fileKey}`;
    return url.toString();
  }

}

module.exports = BaseController;
