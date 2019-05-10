/*
 * Kuzzle, a backend software, self-hostable and ready to use
 * to power modern apps
 *
 * Copyright 2015-2019 Kuzzle
 * mailto: support AT kuzzle.io
 * website: http://kuzzle.io
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const 
  AWS = require('aws-sdk'),
  uuid = require('uuid/v4');

function getProperty(document, path) {
  if (!document) {
    return document;
  }

  const names = path.split('.');

  if (names.length === 1) {
    return document[names[0]];
  }

  return getProperty(document[names[0]], names.slice(1).join('.'));
}
  
class S3Plugin {
  constructor () {
    this.context = null;

    this.defaultConfig = {
      bucketName: 'your-s3-bucket',
      region: 'eu-west-3',
      signedUrlTTL: 20 * 60 * 1000,
      redisPrefix: 's3Plugin/fileController'
    };

    this.hooks = {};

    this.pipes = {};

    this.controllers = {
      file: {
        getUploadUrl: 'getUploadUrl',
        deleteFile: 'deleteFile',
        getUrl: 'getUrl',
        validateUpload: 'validateUpload'
      }
    };

    this.routes = [
      { verb: 'get', url: '/getUploadUrl', controller: 'file', action: 'getUploadUrl' },
      { verb: 'get', url: '/files/:fileKey', controller: 'file', action: 'getUrl' },
      { verb: 'put', url: '/files/:fileKey/validate', controller: 'file', action: 'validateUpload' },
      { verb: 'delete', url: '/files/:fileKey', controller: 'file', action: 'deleteFile' }
    ];
  }

  init (customConfig, context) {
    this.config = { ...this.defaultConfig, ...customConfig };

    this.context = context;

    this.s3 = null;

    this.baseFileUrl = `https://s3.${this.config.region}.amazonaws.com/${this.config.bucketName}`;

    this.unavailableMessage = 'File upload unavailable.';

    const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, NODE_ENV } = process.env;

    if (NODE_ENV !== 'production') {
      this.unavailableMessage = `${this.unavailableMessage} AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are not set.`;
    }

    if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
      this.s3 = new AWS.S3({
        signatureVersion: 'v4',
        region: this.config.region,
        credentials: {
          accessKeyId: AWS_ACCESS_KEY_ID,
          secretAccessKey: AWS_SECRET_ACCESS_KEY
        }
      });  
    } else {
      this.context.log.warn(this.unavailableMessage);
    }
  }

  /**
   * Get a presigned URL to upload directly to S3.
   * 
   * Any file uploaded to this URL must be validated using 
   * the "validateUpload" route within the configured TTL 
   * otherwise it will be deleted.
   * 
   * @param {Request} request 
   */
  async getUploadUrl (request) {
    this._assertCredentials();

    const 
      filename = this._stringArg(request, 'filename'),
      uploadDir = this._stringArg(request, 'uploadDir'),
      fileKey = `${uploadDir}/${uuid()}/${filename}`;

    const uploadUrl = this.s3.getSignedUrl('putObject', {
      Bucket: this.config.bucketName,
      Key: fileKey,
      Expires: this.config.signedUrlTTL / 1000
    });

    this._deleteExpiredFile(fileKey);
    
    return {
      fileKey,
      uploadUrl,
      fileUrl: this._getUrl(fileKey),
      ttl: this.config.signedUrlTTL
    };
  }

  /**
   * Validate a previously uploaded file.
   * 
   * @param {Request} request 
   */
  async validateUpload (request) {
    this._assertCredentials();

    const 
      fileKey = this._stringArg(request, 'fileKey'),
      redisKey = `${this.config.redisPrefix}/${fileKey}`;

    await this.context.accessors.sdk.ms.del([redisKey]);

    return {
      fileKey,
      fileUrl: this._getUrl(fileKey)
    };
  }

  /**
   * Returns the file url based on the key
   * 
   * @param {Request} request 
   */
  async getUrl (request) {
    this._assertCredentials();

    const fileKey = this._stringArg(request, 'fileKey');

    return {
      fileUrl: this._getUrl(fileKey)
    };
  }

  /**
   * Deletes a file from S3.
   * 
   * @param {string} request 
   */
  async deleteFile (request) {
    this._assertCredentials();

    const fileKey = this._stringArg(request, 'fileKey');

    if (!await this._fileExists(fileKey)) {
      throw new this.context.errors.NotFoundError(`Unabled to find file "${fileKey}".`);
    }

    await this._deleteFile(fileKey);

    return true;
  }

  /**
   * Delete uploaded file after x seconds if the file was not validated
   * 
   * @param {string} fileKey 
   */
  _deleteExpiredFile (fileKey) {
    const redisKey = `${this.config.redisPrefix}/${fileKey}`;

    this.context.accessors.sdk.ms.set(redisKey, 'temporary', { ex: this.config.signedUrlTTL / 1000 + 60 });

    setTimeout(async () => {
      if (!await this.context.accessors.sdk.ms.get(redisKey)) {
        return;
      }

      this.context.log.debug(`Delete unused file ${fileKey}`);

      await this._deleteFile(fileKey);
      await this.context.accessors.sdk.ms.del([redisKey]);
    }, this.config.signedUrlTTL);
  }

  /**
   * Deletes a file from S3
   * 
   * @param {string} fileKey 
   */
  _deleteFile (fileKey) {
    return this.s3.deleteObject({ Bucket: this.config.bucketName, Key: fileKey }).promise();
  }

  /**
   * Returns a boolean indicating whether the file exists or not
   * 
   * @param {Promise<boolean>} fileKey 
   */
  async _fileExists (fileKey) {
    try {
      await this.s3.headObject({ Bucket: this.config.bucketName, Key: fileKey }).promise();

      return true;
    } catch (error) {
      if (error.code === 'NotFound') {
        return false;
      }

      throw error;
    }
  }

  /**
   * Compute the file url based on the key
   * 
   * @param {string} fileKey 
   */
  _getUrl (fileKey) {
    return `${this.baseFileUrl}/${fileKey}`;
  } 

  /**
   * Extracts a string parameter from the request input args
   *
   * @param {KuzzleRequest} request
   * @param {string} paramPath - Path of the parameter to extract (eg: 'foo' or 'foo.bar' for nested params)
   * @param {?string} defaultValue
   * @returns {string}
   */
  _stringArg(request, paramPath, defaultValue = null) {
    const stringParam = getProperty(request.input.args, paramPath) || defaultValue;

    if (!stringParam) {
      throw new this.context.errors.BadRequestError(`Missing arg "${paramPath}"`);
    }

    if (typeof stringParam !== 'string') {
      throw new this.context.errors.BadRequestError(`Invalid string arg "${paramPath}" value "${stringParam}"`);
    }

    return stringParam;
  }

  _assertCredentials () {
    if (!this.s3) {
      throw new this.context.errors.InternalError(this.unavailableMessage); 
    }
  }
}

module.exports = S3Plugin;
