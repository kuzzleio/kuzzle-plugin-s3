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
const unavailableMessage = 'S3 service unavailable. \
You must either set this.config.vault.accessKeyIdPath and \
this.config.vault.secretAccessKeyPath in the Vault \
or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.';

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
      vault: {
        accessKeyIdPath: 'aws.s3.accessKeyId',
        secretAccessKeyPath: 'aws.s3.secretAccessKey'
      }
    };

    this.controllers = {
      upload: {
        getUrl: req => this.uploadGetUrl(req)
      },
      file: {
        delete: req => this.fileDelete(req),
        getUrl: req => this.fileGetUrl(req)
      },
      bucket: {
        create: req => this.bucketCreate(req),
        exists: req => this.bucketExists(req),
        updateCORS: req => this.bucketUpdateCORS(req),
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
      // Bucket controller
      {
        verb: 'post',
        url: '/bucket',
        controller: 'bucket',
        action: 'create'
      },
      {
        verb: 'get',
        url: '/bucket/:bucketName',
        controller: 'bucket',
        action: 'exists'
      },
      {
        verb: 'put',
        url: '/bucket/:bucketName/cors',
        controller: 'bucket',
        action: 'updateCORS'
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
      || getProperty(this.context.secrets, this.config.vault.accessKeyIdPath);
    this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
      || getProperty(this.context.secrets, this.config.vault.secretAccessKeyPath);
    if (!this.accessKeyId || !this.secretAccessKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new this.context.errors.InternalError(unavailableMessage);
      }
    }
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
      bucketRegion = this.stringArg(request, 'bucketRegion', this.config.bucketRegion),
      fileKey = `${uploadDir}${filename}`;

    AWS.config.update({
      region: bucketRegion
    });

    const s3 = new AWS.S3({
      signatureVersion: 'v4',
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey
      }
    });

    const uploadUrl = s3.getSignedUrl('putObject', {
      Bucket: bucketName,
      Key: fileKey,
      Expires: this.config.signedUrlTTL / 1000
    });

    return {
      fileKey,
      uploadUrl,
      ttl: this.config.signedUrlTTL / 1000
    };
  }

  /**
   * Returns the file url based on the key
   * 
   * @controller            file
   * @action                getUrl
   * 
   * @param {KuzzleRequest} request
   */
  async fileGetUrl(request) {
    const 
      fileKey = this.stringArg(request, 'fileKey'),
      bucketName = this.stringArg(request, 'bucketName', this.config.bucketName),
      bucketRegion = this.stringArg(request, 'bucketRegion', this.config.bucketRegion),
      urlTTL = this.stringArg(request, 'ttl', this.config.signedUrlTTL / 1000);

    AWS.config.update({ region: bucketRegion });

    const s3 = new AWS.S3({
      signatureVersion: 'v4',
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey
      }
    });

    const url = s3.getSignedUrl(
      'getObject',
      {
        Bucket: bucketName,
        Key: fileKey,
        Expires: urlTTL
      }
    );

    return {
      fileKey,
      fileUrl: url
    };
  }

  /**
   * Deletes a file from S3.
   * 
   * @controller            file
   * @action                delete
   * 
   * @param {KuzzleRequest} request
   */
  async fileDelete(request) {
    const 
      fileKey = this.stringArg(request, 'fileKey'),
      bucketName = this.stringArg(request, 'bucketName', this.config.bucketName),
      bucketRegion = this.stringArg(request, 'bucketRegion', this.config.bucketRegion);

    AWS.config.update({ region: bucketRegion });

    const s3 = new AWS.S3({
      signatureVersion: 'v4',
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey
      }
    });

    try {
      await s3.deleteObject({
        Bucket: bucketName,
        Key: fileKey
      }).promise();
      return true;
    } catch (err) {
      throw err.code === 'Not Found' ?
        new this.context.errors.BadRequestError(`File ${fileKey} not found in bucket ${bucketName} in ${bucketRegion}`) :
        new this.context.errors.InternalError(err.message);
    }
  }

  /**
   * Creates a new S3 bucket.
   * 
   * @controller            bucket
   * @action                create
   * 
   * @param {KuzzleRequest} request
   */
  async bucketCreate(request) {
    const 
      bucketName = this.stringArg(request, 'bucketName', this.config.bucketName),
      bucketRegion = this.stringArg(request, 'bucketRegion', this.config.bucketRegion),
      bucketOptions = request.input.body || { ACL: 'public-read' };

    AWS.config.update({ region: bucketRegion });

    const s3 = new AWS.S3({
      signatureVersion: 'v4',
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey
      }
    });

    const params = { Bucket: bucketName };
    await s3.createBucket({ ...params, ...bucketOptions }).promise();

    return true;
  }

  /**
   * Check if a S3 bucket exists.
   * 
   * @controller            bucket
   * @action                exists
   * 
   * @param {KuzzleRequest} request
   */
  async bucketExists(request) {
    const 
      bucketName = this.stringArg(request, 'bucketName', this.config.bucketName),
      bucketRegion = this.stringArg(request, 'bucketRegion', this.config.bucketRegion);

    AWS.config.update({ region: bucketRegion });

    const s3 = new AWS.S3({
      signatureVersion: 'v4',
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey
      }
    });

    try {
      await s3.headBucket({Bucket: bucketName}).promise();
      return true;
    } catch (err) {
      if (err.statusCode === 404) {
        return false;
      } else {
        throw new this.context.errors.InternalError(err.message);
      }
    }
  }

  /**
   * Update CORS of a S3 bucket.
   * 
   * @controller            bucket
   * @action                updateCors
   * 
   * @param {KuzzleRequest} request
   */
  async bucketUpdateCORS(request) {
    const 
      bucketName = this.stringArg(request, 'bucketName', this.config.bucketName),
      bucketRegion = this.stringArg(request, 'bucketRegion', this.config.bucketRegion),
      CORSConfiguration = request.input.body || {
        CORSRules: [{
          AllowedHeaders: ["*"],
          AllowedMethods: ["GET", "POST", "PUT"],
          AllowedOrigins: ["*"],
        }]
      };

    AWS.config.update({ region: bucketRegion });

    const s3 = new AWS.S3({
      signatureVersion: 'v4',
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey
      }
    });

    await s3.putBucketCors({ Bucket: bucketName, CORSConfiguration }).promise();
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

    if (!stringParam && stringParam !== '') {
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
