const BaseController = require('./BaseController');
const { v4: uuid } = require('uuid');

class UploadController extends BaseController {
  /**
   * Generate a pre-signed URL for uploading a file to S3.
   */
  async getUploadUrl(request) {
    const filename = this.stringArg(request, 'filename');
    const uploadDir = this.stringArg(request, 'uploadDir', '');
    const bucketName = this.stringArg(request, 'bucketName', this.config.bucketName);
    const bucketRegion = this.stringArg(request, 'bucketRegion', this.defaultRegion);

    const fileKey = `${uploadDir}/${uuid()}-${filename}`;
    const s3 = this.getS3Client(bucketRegion);

    try {
      const uploadUrl = s3.getSignedUrl('putObject', {
        Bucket: bucketName,
        Key: fileKey,
        Expires: this.config.signedUrlTTL / 1000, // TTL in seconds
      });

      // Schedule expiration if needed
      this._expireFile(bucketRegion, bucketName, fileKey);

      return {
        fileKey,
        uploadUrl,
        fileUrl: this._getUrl(bucketName, fileKey, bucketRegion),
        ttl: this.config.signedUrlTTL,
      };
    } catch (error) {
      this.context.log.error(`Error generating upload URL: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate a previously uploaded file and clear its temporary metadata.
   */
  async validate(request) {
    const fileKey = this.stringArg(request, 'fileKey');
    const bucketName = this.stringArg(request, 'bucketName', this.config.bucketName);
    const redisKey = `${this.config.redisPrefix}/${fileKey}`;
    const bucketRegion = this.stringArg(request, 'bucketRegion', this.defaultRegion);

    try {
      await this.context.accessors.sdk.ms.del([redisKey]);
    } catch (error) {
      this.context.log.error(`Error validating file "${fileKey}": ${error.message}`);
      throw error;
    }

    return {
      fileKey,
      fileUrl: this._getUrl(bucketName, fileKey, bucketRegion),
    };
  }

  /**
   * Schedule file expiration if not validated.
   * @param {string} bucketRegion
   * @param {string} bucketName
   * @param {string} fileKey
   */
  _expireFile(bucketRegion, bucketName, fileKey) {
    const redisKey = `${this.config.redisPrefix}/${fileKey}`;

    // Store temporary metadata in Redis
    this.context.accessors.sdk.ms.set(redisKey, 'temporary', {
      ex: this.config.signedUrlTTL / 1000 + 60, // TTL in seconds
    });

    // Schedule deletion after TTL
    setTimeout(async () => {
      try {
        const exists = await this.context.accessors.sdk.ms.get(redisKey);
        if (!exists) {
          return;
        }

        this.context.log.debug(`Deleting unused file "${fileKey}".`);
        const s3 = this.getS3Client(bucketRegion);
        await s3.deleteObject({ Bucket: bucketName, Key: fileKey }).promise();
        await this.context.accessors.sdk.ms.del([redisKey]);
      } catch (error) {
        this.context.log.error(`Error expiring file "${fileKey}": ${error.message}`);
      }
    }, this.config.signedUrlTTL);
  }

  /**
 * Construct the file's public or base URL.
 * @param {string} bucketName
 * @param {string} fileKey
 * @param {string} region
 * @returns {string}
 */
  _getUrl(bucketName, fileKey, region) {
    const targetRegion = region;
    const endpoint = this.config.endpoints[targetRegion];

    if (!endpoint) {
      throw new Error(`No endpoint configured for region: ${targetRegion}`);
    }

    return `${endpoint}/${bucketName}/${fileKey}`;
  }

}

module.exports = UploadController;
