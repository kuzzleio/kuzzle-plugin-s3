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

const ms = require('ms'),
  AWS = require('aws-sdk'),
  { v4: uuid } = require('uuid');

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


/**
 * Helper function to retrieve all files keys from the bucket, no only
 *  the first 1000.
 * This code is extracted from  https://stackoverflow.com/a/54341763/3744415
 * @param {*} s3 aws jdk instance
 * @param {*} params for listObjectsV2 aws s3 api call. refer to https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#listObjectsV2-property 
 */
const listAllObjects = (s3, params) => {
  return s3
    .listObjectsV2(params)
    .promise()
    .then(({ Contents, IsTruncated, NextContinuationToken }) => {
      return IsTruncated && NextContinuationToken
        ? listAllObjects(
          s3,
          Object.assign({}, params, {
            ContinuationToken: NextContinuationToken
          })
        ).then(x => Contents.concat(x))
        : Contents;
    });
};

class S3Plugin {
  constructor() {
    this.context = null;

    this.defaultConfig = {
      bucketName: 'your-s3-bucket',
      endpoint: 'https://s3.eu-west-3.amazonaws.com',
      s3ClientOptions: {
        s3ForcePathStyle: false
      },
      signedUrlTTL: '20min',
      redisPrefix: 's3Plugin/uploads',
      vault: {
        accessKeyIdPath: 'aws.s3.accessKeyId',
        secretAccessKeyPath: 'aws.s3.secretAccessKey'
      }
    };

    this.hooks = {};

    this.pipes = {};

    this.controllers = {
      upload: {
        getUrl: req => this.uploadGetUrl(req),
        validate: req => this.uploadValidate(req)
      },
      file: {
        delete: req => this.fileDelete(req),
        getUrl: req => this.fileGetUrl(req),
        getFilesKeys: () => this.getFilesKeys()
      }
    };

    this.routes = [
      // Upload controller
      {
        verb: 'get',
        url: '/upload',
        controller: 'upload',
        action: 'getUrl'
      },
      {
        verb: 'put',
        url: '/upload/:fileKey',
        controller: 'upload',
        action: 'validate'
      },
      // File controller
      {
        verb: 'get',
        url: '/files/:fileKey',
        controller: 'file',
        action: 'getUrl'
      },
      {
        verb: 'delete',
        url: '/files/:fileKey',
        controller: 'file',
        action: 'delete'
      },
      {
        verb: 'get',
        url: '/files',
        controller: 'file',
        action: 'getFilesKeys'
      }
    ];
  }

  init(customConfig, context) {
    this.config = { ...this.defaultConfig, ...customConfig };

    if (typeof this.config.signedUrlTTL !== 'number') {
      this.config.signedUrlTTL = ms(this.config.signedUrlTTL);
    }

    this.context = context;

    this.baseFileUrl = `${this.config.endpoint}/${this.config.bucketName}`;

    this._loadS3();
  }

  /**
   * Controller: upload
   * Action: getUrl
   *
   * Get a presigned URL to upload directly to S3.
   *
   * Any file uploaded to this URL must be validated using
   * the "uploadValidate" route within the configured TTL
   * otherwise it will be deleted.
   *
   * @param {Request} request
   */
  async uploadGetUrl(request) {
    this._assertCredentials();

    const filename = this._stringArg(request, 'filename'),
      uploadDir = this._stringArg(request, 'uploadDir'),
      fileKey = `${uploadDir}/${uuid()}-${filename}`;

    const uploadUrl = this.s3.getSignedUrl('putObject', {
      Bucket: this.config.bucketName,
      Key: fileKey,
      Expires: this.config.signedUrlTTL / 1000
    });

    this._expireFile(fileKey);

    return {
      fileKey,
      uploadUrl,
      fileUrl: this._getUrl(fileKey),
      ttl: this.config.signedUrlTTL
    };
  }

  /**
   * Controller: upload
   * Action: validate
   *
   * Validate a previously uploaded file.
   *
   * @param {Request} request
   */
  async uploadValidate(request) {
    this._assertCredentials();

    const fileKey = this._stringArg(request, 'fileKey');
    const redisKey = `${this.config.redisPrefix}/${fileKey}`;

    await this.context.accessors.sdk.ms.del([redisKey]);

    return {
      fileKey,
      fileUrl: this._getUrl(fileKey)
    };
  }

  /**
   * Controller: file
   * Action: getUrl
   *
   * Returns the file url based on the key
   *
   * @param {Request} request
   */
  async fileGetUrl(request) {
    this._assertCredentials();

    const fileKey = this._stringArg(request, 'fileKey');

    return {
      fileUrl: this._getUrl(fileKey)
    };
  }

  /**
   * Controller: file
   * Action: delete

   * Deletes a file from S3.
   *
   * @param {string} request
   */
  async fileDelete(request) {
    this._assertCredentials();

    const fileKey = this._stringArg(request, 'fileKey');

    if (!(await this._fileExists(fileKey))) {
      throw new this.context.errors.NotFoundError(
        `Unabled to find file "${fileKey}".`
      );
    }

    await this._deleteFile(fileKey);

    return true;
  }
  /**
   * Controller: file
   * Action: getFilesKeys

   * Get list of files keys from S3 bucket.
   */
  async getFilesKeys() {
    this._assertCredentials();
    const s3KeyList = await listAllObjects(this.s3, {
      Bucket: this.config.bucketName
    });
    const filesKeys = s3KeyList.map(k => ({
      ...k,
      Key: this._getUrl(k.Key)
    }));
    return {
      filesKeys
    };
  }

  /**
   * Delete uploaded file after x seconds if the file was not validated
   *
   * @param {string} fileKey
   */
  _expireFile(fileKey) {
    const redisKey = `${this.config.redisPrefix}/${fileKey}`;

    this.context.accessors.sdk.ms.set(redisKey, 'temporary', {
      ex: this.config.signedUrlTTL / 1000 + 60
    });

    setTimeout(async () => {
      if (!(await this.context.accessors.sdk.ms.get(redisKey))) {
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
  _deleteFile(fileKey) {
    return this.s3
      .deleteObject({
        Bucket: this.config.bucketName,
        Key: fileKey
      })
      .promise();
  }

  /**
   * Returns a boolean indicating whether the file exists or not
   *
   * @param {Promise<boolean>} fileKey
   */
  async _fileExists(fileKey) {
    try {
      await this.s3
        .headObject({
          Bucket: this.config.bucketName,
          Key: fileKey
        })
        .promise();

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
  _getUrl(fileKey) {
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
    const stringParam =
      getProperty(request.input.args, paramPath) || defaultValue;

    if (!stringParam) {
      throw new this.context.errors.BadRequestError(
        `Missing arg "${paramPath}"`
      );
    }

    if (typeof stringParam !== 'string') {
      throw new this.context.errors.BadRequestError(
        `Invalid string arg "${paramPath}" value "${stringParam}"`
      );
    }

    return stringParam;
  }

  _assertCredentials() {
    if (!this.s3) {
      throw new this.context.errors.InternalError(this.unavailableMessage);
    }
  }

  _loadS3() {
    const accessKeyId =
        process.env.AWS_ACCESS_KEY_ID ||
        getProperty(this.context.secrets, this.config.vault.accessKeyIdPath),
      secretAccessKey =
        process.env.AWS_SECRET_ACCESS_KEY ||
        getProperty(
          this.context.secrets,
          this.config.vault.secretAccessKeyPath
        ),
      nodeEnv = process.env.NODE_ENV;

    this.unavailableMessage = `S3 service unavailable. \
You must either set ${this.config.vault.accessKeyIdPath} and \
${this.config.vault.secretAccessKeyPath} in the Vault \
or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.`;

    this.s3 = null;

    if (!accessKeyId || !secretAccessKey) {
      // Don't start Kuzzle in production if credentials are missing
      if (nodeEnv === 'production') {
        throw new this.context.errors.InternalError(this.unavailableMessage);
      }
    } else {
      this.s3 = new AWS.S3({
        signatureVersion: 'v4',
        endpoint: this.config.endpoint,
        ...this.config.s3ClientOptions,
        credentials: {
          accessKeyId: accessKeyId,
          secretAccessKey: secretAccessKey
        }
      });
    }
  }
}

module.exports = S3Plugin;
