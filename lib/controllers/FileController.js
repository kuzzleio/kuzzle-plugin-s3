const BaseController = require('./BaseController');
const { listAllObjects } = require('../helpers');

class FileController extends BaseController {
  /**
   * Get the list of file keys from the S3 bucket.
   */
  async getFilesKeys(request) {
    const bucketName = this.stringArg(request, 'bucketName');
    const region = this.stringArg(request, 'bucketRegion');
    const s3 = this.getS3Client(region);

    const files = await listAllObjects(s3, { Bucket: bucketName });
    return {
      files: files.map((file) => ({
        Key: file.Key,
        LastModified: file.LastModified,
        Size: file.Size,
      })),
    };
  }

  /**
   * Delete a file from the S3 bucket.
   */
  async fileDelete(request) {
    const fileKey = this.stringArg(request, 'fileKey');
    const bucketName = this.stringArg(request, 'bucketName');
    const region = this.stringArg(request, 'bucketRegion');
    const s3 = this.getS3Client(region);

    const fileExists = await this._fileExists(s3, bucketName, fileKey);

    if (!fileExists) {
      throw new this.context.errors.NotFoundError(`File "${fileKey}" does not exist.`);
    }

    await s3.deleteObject({ Bucket: bucketName, Key: fileKey });
    return { message: `File "${fileKey}" deleted.` };
  }

  /**
   * Get the URL of a specific file from the S3 bucket.
   */
  fileGetUrl(request) {
    const region = this.stringArg(request, 'bucketRegion');
    const bucketName = this.stringArg(request, 'bucketName');
    const fileKey = request.getBodyString('fileKey');

    return {
      fileUrl: this._getUrl(bucketName, fileKey, region),
    };
  }

  /**
   * Check if a file exists in the S3 bucket.
   */
  async _fileExists(s3, bucketName, fileKey) {
    try {
      await s3.headObject({ Bucket: bucketName, Key: fileKey });
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error; // Rethrow other errors
    }
  }
}

module.exports = FileController;
