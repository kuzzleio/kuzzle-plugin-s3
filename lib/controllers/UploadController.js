const BaseController = require('./BaseController');
const { v4: uuid } = require('uuid');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { PutObjectCommand } = require('@aws-sdk/client-s3');

class UploadController extends BaseController {
  /**
   * Generate a pre-signed URL for uploading a file to S3.
   */
  async getUploadUrl(request) {
    const filename = this.stringArg(request, 'filename');
    const uploadDir = this.stringArg(request, 'uploadDir', '');
    const bucketName = this.stringArg(request, 'bucketName');
    const bucketRegion = this.stringArg(request, 'bucketRegion');
    const publicUrl = request.getBoolean('publicUrl');

    const fileKey = `${uploadDir.length ? uploadDir + '/' : ''}${uuid()}-${filename}`;
    const s3 = this.getS3Client(bucketRegion);

    try {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
      });

      const uploadUrl = await getSignedUrl(s3, command, {
        expiresIn: this.config.signedUrlTTL / 1000 });

      const result = {
        fileKey,
        uploadUrl,
        ttl: this.config.signedUrlTTL,
      };

      if(publicUrl) {
        result.publicUrl = this._getPublicUrl(bucketName, fileKey, bucketRegion);
      }

      return result;
    } catch (error) {
      this.context.log.error(`Error generating upload URL: ${error.message}`);
      throw error;
    }
  }
}

module.exports = UploadController;
