const BaseController = require('./BaseController');

class BucketController extends BaseController {
  /**
   * Validate the given bucket name to match S3's naming rules.
   * @param {string} bucketName - The name of the bucket to validate.
   * @param {boolean} disableDotsInName - If true, disallow dots in the bucket name.
   */
  _validateBucketName(bucketName, disableDotsInName = false) {
    const bucketNameRegex = disableDotsInName
      ? /(?!(^xn--|.+-s3alias$))^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/
      : /(?!(^((2(5[0-5]|[0-4][0-9])|[01]?[0-9]{1,2})\.){3}(2(5[0-5]|[0-4][0-9])|[01]?[0-9]{1,2})$|^xn--|.+-s3alias$))^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

    if (!bucketNameRegex.test(bucketName)) {
      throw new this.context.errors.BadRequestError(`Invalid bucket name format: "${bucketName}"`);
    }
  }

  async _bucketExists(bucketName, bucketRegion) {
    const s3 = this.getS3Client(bucketRegion);
    try {
      await s3.headBucket({ Bucket: bucketName });
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      this.context.log.error(`Error checking bucket existence "${bucketName}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new bucket with optional configurations.
   */
  async create(request) {
    const bucketName = this.stringArg(request, 'bucketName');
    const bucketRegion = this.stringArg(request, 'bucketRegion');
    const bucketOptions = request.input.body?.options || { ACL: 'public-read' };
    const bucketCORS = request.input.body?.cors || {
      CORSRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'POST', 'PUT'],
          AllowedOrigins: ['*'],
        },
      ],
    };

    const s3 = this.getS3Client(bucketRegion);

    // Check if bucket already exists
    if (await this._bucketExists(bucketName, bucketRegion)) {
      throw new this.context.errors.BadRequestError(`Bucket "${bucketName}" already exists.`);
    }

    // Validate bucket name
    this._validateBucketName(bucketName);

    try {
      // Create the bucket
      await s3.createBucket({ Bucket: bucketName, ...bucketOptions });

      // Set CORS configuration if not using Minio
      if (!this.config.isMinio) {
        await s3.putBucketCors({
          Bucket: bucketName,
          CORSConfiguration: bucketCORS,
        });
      }
    } catch (error) {
      this.context.log.error(`Error creating bucket "${bucketName}": ${error.message}`);
      throw error;
    }

    return { name: bucketName, region: bucketRegion };
  }

  /**
   * Delete an empty bucket.
   */
  async delete(request) {
    const bucketName = this.stringArg(request, 'bucketName');
    const bucketRegion = this.stringArg(request, 'bucketRegion');
    const s3 = this.getS3Client(bucketRegion);

    try {
      await s3.deleteBucket({ Bucket: bucketName });
    } catch (error) {
      this.context.log.error(`Error deleting bucket "${bucketName}": ${error.message}`);
      throw error;
    }

    return { message: `Bucket "${bucketName}" deleted.` };
  }

  /**
   * Check if a bucket exists.
   */
  async exists(request) {
    const bucketName = this.stringArg(request, 'bucketName');
    const bucketRegion = this.stringArg(request, 'bucketRegion');

    const exists = await this._bucketExists(bucketName, bucketRegion);
    return { exists };
  }

  /**
   * Set a policy on a bucket.
   */
  async setPolicy(request) {
    const bucketName = this.stringArg(request, 'bucketName');
    const bucketRegion = this.stringArg(request, 'bucketRegion');
    const policy = request.getBodyObject('policy');

    const s3 = this.getS3Client(bucketRegion);

    try {
      await s3.putBucketPolicy({
        Bucket: bucketName,
        Policy: JSON.stringify(policy),
      });
    } catch (error) {
      this.context.log.error(`Error setting policy on bucket "${bucketName}": ${error.message}`);
      throw error;
    }

    return { message: `Policy applied to bucket "${bucketName}".` };
  }

  /**
   * Enable public access by removing BlockPublicAccess restrictions.
   */
  async enablePublicAccess(request) {
    const bucketName = this.stringArg(request, 'bucketName');
    const bucketRegion = this.stringArg(request, 'bucketRegion');
    const s3 = this.getS3Client(bucketRegion);

    if (!this.config.isMinio) {
      try {
        await s3.deletePublicAccessBlock({ Bucket: bucketName });
      } catch (error) {
        this.context.log.error(`Error enabling public access on bucket "${bucketName}": ${error.message}`);
        throw error;
      }
    }

    return { message: `Public access enabled for bucket "${bucketName}".` };
  }
}

module.exports = BucketController;