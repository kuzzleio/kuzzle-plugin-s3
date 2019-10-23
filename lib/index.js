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
  ms = require('ms'),
  AWS = require('aws-sdk');

// Global info message about misconfigured credentials
const unavailableMessage = `S3 service unavailable. \
You must either set ${this.config.vault.accessKeyIdPath} and \
${this.config.vault.secretAccessKeyPath} in the Vault \
or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.`;


/**
 * @class S3Plugin
 *
 * @property {PluginContext}  context           Kuzzle plugin context
 * @property {Routes}         routes            Kuzzle plugin routes
 * @property {Controllers}    controllers       Kuzzle plugin controllers
 * @property {JSON}           defaultConfig     Plugin default configuration
 * @property {JSON}           config            Plugin configuration made by defaultConfig and 
 *                                              custom config passed to the `init` method 
 * @property {String}         accessKeyId       AWS access key ID used by the plugin
 * @property {String}         secretAccessKey   AWS secret access key used by the plugin
 *
 * @externs
 */
class S3Plugin {
  constructor() {
    this.context = null;

    this.defaultConfig = {
      signedUrlTTL: '20min',
      redisPrefix: 's3Plugin/uploads',
      vault: {
        accessKeyIdPath: 'aws.s3.accessKeyId',
        secretAccessKeyPath: 'aws.s3.secretAccessKey'
      }
    };

    this.controllers = {
      upload: {
        getUrl: req => this.uploadGetUrl(req),
        validate: req => this.uploadValidate(req)
      },
      files: {
        delete: req => this.fileDelete(req),
        getUrl: req => this.fileGetUrl(req)
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
      }
    ];
  }

  /**
   * Plugin initilisation
   * 
   * @param {JSON}            config Custom configuration loaded from kuzzlerc file
   * @param {PluginContext}   context
   */
  init(config, context) {
    this.config = { ...this.defaultConfig, ...config };
    if (typeof this.config.signedUrlTTL !== 'number') {
      this.config.signedUrlTTL = ms(this.config.signedUrlTTL);
    }
    this.context = context;

    this.accessKeyId = process.env.AWS_ACCESS_KEY_ID
      || this.context.secrets[this.config.vault.accessKeyIdPath];
    this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
      || this.context.secrets[this.config.vault.secretAccessKeyPath];
    if (!this.accessKeyId || !this.secretAccessKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new this.context.errors.InternalError(unavailableMessage);
      }
    }

    this.s3 = new AWS.S3({
      signatureVersion: 'v4',
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey
      }
    });
  }

  /**
   * Get a presigned URL to upload directly to S3.
   *
   * Any file uploaded to this URL must be validated using
   * the "uploadValidate" route within the configured TTL
   * otherwise it will be deleted.
   *
   * @controller            upload
   * @action                getUrl
   * 
   * @param {KuzzleRequest} request
   */
  async uploadGetUrl(request) {
    const
      filename = this.stringArg(request, 'filename'),
      uploadDir = this.stringArg(request, 'uploadDir', ''),
      bucketName = this.stringArg(request, 'bucketName', this.config.bucketName),
      fileKey = `${uploadDir}${filename}`;

    AWS.config.update({ region: this.stringArg(request, 'bucketRegion', this.config.bucketRegion) });

    const uploadUrl = this.s3.getSignedUrl('putObject', {
      Bucket: bucketName,
      Key: fileKey,
      Expires: this.config.signedUrlTTL / 1000
    });

    const redisKey = `${this.config.redisPrefix}/${fileKey}`;

    await this.context.accessors.sdk.ms.set(redisKey, 'temporary', {
      ex: this.config.signedUrlTTL / 1000 + 60
    });

    return {
      fileKey,
      uploadUrl,
      fileUrl: this.getUrl(fileKey),
      ttl: this.config.signedUrlTTL
    };
  }

  /**
   * Validate a previously uploaded file.
   * 
   * @controller            upload
   * @action                validate
   *
   * @param {KuzzleRequest} request
   */
  async uploadValidate(request) {
    const
      fileKey = this.stringArg(request, 'fileKey'),
      redisKey = `${this.config.redisPrefix}/${fileKey}`;

    await this.context.accessors.sdk.ms.del([redisKey]);

    return {
      fileKey,
      fileUrl: this.getFileUrl(request)
    };
  }

  /**
   * Returns the file url based on the key
   * 
   * @controller            files
   * @action                getUrl
   * 
   * @param {KuzzleRequest} request
   */
  async fileGetUrl(request) {
    return {
      fileUrl: this.getFileUrl(request)
    };
  }

  /**
   * Deletes a file from S3.
   * 
   * @controller            files
   * @action                delete
   * 
   * @param {KuzzleRequest} request
   */
  async fileDelete(request) {
    const fileKey = this.stringArg(request, 'fileKey'),
      bucketName = this.stringArg(request, 'bucketName', this.config.bucketName),
      bucketRegion = this.stringArg(request, 'bucketRegion', this.config.bucketRegion);

    AWS.config.update({ region: bucketRegion });

    try {
      await this.s3.deleteObject({
        Bucket: bucketName,
        Key: fileKey
      }).promise();
      return true;
    } catch (err) {
      throw err.code === 'Not Found' ?
        new this.context.errors.BadRequestError(`File ${fileKey} not found in bucket ${bucketName} localized in ${bucketRegion}`) :
        new this.context.errors.InternalError(err.message);
    }
  }

  /**
   * Extracts a string parameter from the request input args
   *
   * @param   {KuzzleRequest}  request
   * @param   {String}         paramPath - Path of the parameter to extract (eg: 'foo' or 'foo.bar' for nested params)
   * @param   {?String}        defaultValue
   * @returns {String}
   * 
   * @throws  {BadRequestError} If given param was not found and no default value was given
   * @throws  {BadRequestError} If given param was found but it is not a String
   */
  stringArg(request, paramPath, defaultValue = null) {
    const stringParam = getProperty(request.input.args, paramPath)
      || defaultValue;

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

  /**
   * Returns a well formed S3 URL
   * 
   * @param    {KuzzleRequest} request 
   * @returns  {String}
   */
  getFileUrl(request) {
    const fileKey = this.stringArg(request, 'fileKey'),
      bucketRegion = this.stringArg(request, 'bucketRegion', this.config.bucketRegion),
      bucketName = this.stringArg(request, 'bucketName', this.config.bucketName);

    return `https://s3.${bucketRegion}.amazonaws.com/${bucketName}/${fileKey}`;
  }
}

/**
 * Get deep value in Object using path as a String
 * 
 * @param {JSON}    document JSON where to search deep value
 * @param {String}  path     Path as a String   
 */
const getProperty = (document, path) => {
  const fields = path.split('.');
  if (fields.length === 1) {
    return document[fields[0]];
  }
  return getProperty(document[fields[0]], fields.slice(1).join('.'));
};

module.exports = S3Plugin;
