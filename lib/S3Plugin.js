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
  { v4: uuid } = require('uuid'),
  defaultCORS = {
    CORSRules: [
      {
        AllowedHeaders: ['*'],
        AllowedMethods: ['GET', 'POST', 'PUT'],
        AllowedOrigins: ['*'],
      }
    ]
  };

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
        s3ForcePathStyle: false,
        region: 'eu-west-3'
      },
      isMinio: false,
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
      },
      bucket: {
        create: req => this.bucketCreate(req),
        enablePublicAccess: req => this.deletePublicAccessBlock(req),
        exists: req => this.bucketExists(req),
        delete: req => this.bucketDelete(req)
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
      },
      // Bucket controller
      {
        verb: 'post',
        url: '/bucket/:bucketName/:bucketRegion',
        controller: 'bucket',
        action: 'create'
      },
      {
        verb: 'put',
        url: '/bucket/:bucketName/:bucketRegion',
        controller: 'bucket',
        action: 'enablePublicAccess'
      },
      {
        verb: 'get',
        url: '/bucket/:bucketName/:bucketRegion',
        controller: 'bucket',
        action: 'exists'
      },
      {
        verb: 'delete',
        url: '/bucket/:bucketName/:bucketRegion',
        controller: 'bucket',
        action: 'delete'
      }
    ];
  }

  init(customConfig, context) {
    this.config = { ...this.defaultConfig, ...customConfig };

    if (typeof this.config.signedUrlTTL !== 'number') {
      this.config.signedUrlTTL = ms(this.config.signedUrlTTL);
    }

    AWS.config.update({ region: this.config.region });

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
      bucketName = this._stringArg(request, 'bucketName', this.config.bucketName),
      fileKey = `${uploadDir}/${uuid()}-${filename}`;

    const uploadUrl = this.s3.getSignedUrl('putObject', {
      Bucket: bucketName,
      Key: fileKey,
      Expires: this.config.signedUrlTTL / 1000
    });

    this._expireFile(bucketName, fileKey);

    return {
      fileKey,
      uploadUrl,
      fileUrl: this._getUrl(bucketName, fileKey),
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

    const fileKey = this._stringArg(request, 'fileKey'),
      bucketName = this._stringArg(request, 'bucketName', this.config.bucketName),
      redisKey = `${this.config.redisPrefix}/${fileKey}`;

    await this.context.accessors.sdk.ms.del([redisKey]);

    return {
      fileKey,
      fileUrl: this._getUrl(bucketName, fileKey)
    };
  }

  /**
   * Returns the file url
   *
   * @controller            file
   * @action                getUrl
   *
   * @param {KuzzleRequest} request
   * @param {Boolean} signedUrl
   */
  async fileGetUrl(request) {
    this._assertCredentials();

    const
      fileKey = this._stringArg(request, 'fileKey'),
      bucketName = this._stringArg(request, 'bucketName', this.config.bucketName),
      bucketRegion = this._stringArg(request, 'bucketRegion', this.config.s3ClientOptions.region),
      signedUrl = request.input.args.signedUrl;

    if (!signedUrl) {
      return {
        fileUrl: this._getUrl(bucketName, fileKey)
      };
    }

    AWS.config.update({ region: bucketRegion });

    const url = this.s3.getSignedUrl(
      'getObject',
      {
        Bucket: bucketName,
        Key: fileKey,
        Expires: this.config.signedUrlTTL / 1000
      }
    );

    return {
      fileKey,
      fileUrl: url
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

    const fileKey = this._stringArg(request, 'fileKey'),
      bucketName = this._stringArg(request, 'bucketName', this.config.bucketName);

    if (!(await this._fileExists(bucketName, fileKey))) {
      throw new this.context.errors.NotFoundError(
        `Unabled to find file "${fileKey}".`
      );
    }

    await this._deleteFile(bucketName, fileKey);

    return true;
  }
  /**
   * Controller: file
   * Action: getFilesKeys

   * Get list of files keys from S3 bucket.
   */
  async getFilesKeys(request) {
    this._assertCredentials();

    const bucketName = this._stringArg(request, 'bucketName', this.config.bucketName);

    const s3KeyList = await listAllObjects(this.s3, {
      Bucket: bucketName
    });
    const filesKeys = s3KeyList.map(k => ({
      ...k,
      Key: this._getUrl(bucketName, k.Key)
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
  _expireFile(bucketName, fileKey) {
    const redisKey = `${this.config.redisPrefix}/${fileKey}`;

    this.context.accessors.sdk.ms.set(redisKey, 'temporary', {
      ex: this.config.signedUrlTTL / 1000 + 60
    });

    setTimeout(async () => {
      if (!(await this.context.accessors.sdk.ms.get(redisKey))) {
        return;
      }

      this.context.log.debug(`Delete unused file ${fileKey}`);

      await this._deleteFile(bucketName, fileKey);
      await this.context.accessors.sdk.ms.del([redisKey]);
    }, this.config.signedUrlTTL);
  }

  /**
   * Deletes a file from S3
   *
   * @param {string} fileKey
   */
  _deleteFile(bucketName, fileKey) {
    return this.s3
      .deleteObject({
        Bucket: bucketName,
        Key: fileKey
      })
      .promise();
  }

  /**
   * Returns a boolean indicating whether the file exists or not
   *
   * @param {Promise<boolean>} fileKey
   */
  async _fileExists(bucketName, fileKey) {
    try {
      await this.s3
        .headObject({
          Bucket: bucketName,
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
  _getUrl(bucketName, fileKey) {
    return `${this.config.endpoint}/${bucketName}/${fileKey}`;
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

  /**
   * validate given string to match
   * AWS S3 bucket name format prerequisites
   */
  _validateBucketName(bucketName, disableDotsInName = false) {
    const bucketNameRegex = disableDotsInName ?
      // avoiding dots is needed for S3 Transfer Acceleration
      /(?!(^xn--|.+-s3alias$))^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/
      : /(?!(^((2(5[0-5]|[0-4][0-9])|[01]?[0-9]{1,2})\.){3}(2(5[0-5]|[0-4][0-9])|[01]?[0-9]{1,2})$|^xn--|.+-s3alias$))^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

    const sanitizedName = bucketNameRegex.test(bucketName);

    if (!sanitizedName) {
      throw new this.context.errors.BadRequestError(`Invalid bucket name format: ${bucketName}`);
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
    this._assertCredentials();

    const
      bucketName = this._stringArg(request, 'bucketName', this.config.bucketName),
      bucketRegion = this._stringArg(request, 'bucketRegion', this.config.s3ClientOptions.region),
      disableDotsInName = request.input.body.disableDotsInName,
      bucketPolicy = request.input.body.bucketPolicy,

      bucketCORS = request.input.body.cors || defaultCORS;

    let bucketOptions = request.input.body.options;

    if (!bucketPolicy && !bucketOptions) {
      bucketOptions = { ACL: 'public-read' };
    }

    if (await this.bucketExists(request)) {
      // TODO: add 409 conflict error template to kuzzle ?
      throw new this.context.errors.BadRequestError('Bucket name already exist');
    }

    this._validateBucketName(bucketName, disableDotsInName);

    AWS.config.update({ region: bucketRegion });

    const params = { Bucket: bucketName };

    try {
      await this.s3.createBucket({ ...params, ...bucketOptions }).promise();
    } catch (bucketCreateError) {
      this.context.log.error(`[S3Plugin.bucketCreate.createBucket][${bucketName}] error creating bucket in S3: ${bucketCreateError}`);
      throw bucketCreateError;
    }

    if (bucketCORS && !this.config.isMinio) {
      try {
        await this.s3.putBucketCors({ Bucket: bucketName, CORSConfiguration: bucketCORS }).promise();
      } catch (bucketCorsError) {
        this.context.log.error(`[S3Plugin.bucketCreate.putBucketCors][${bucketName}] error setting bucket CORS: ${bucketCorsError}`);
        throw bucketCorsError;
      }
    }

    if (bucketPolicy && !this.config.isMinio) {
      try {
        await this.s3.putBucketPolicy({ ...params, Policy: JSON.stringify(bucketPolicy) }).promise();
      } catch (bucketPolicyError) {
        this.context.log.error(`[S3Plugin.bucketCreate.putBucketPolicy][${bucketName}] error setting bucket policy: ${bucketPolicyError}`);
        throw bucketPolicyError;
      }
    }

    return { name: bucketName, region: bucketRegion, options: bucketOptions, CORS: bucketCORS, Policy: bucketPolicy };
  }

  /**
   * Delete BlockPublicAccess restriction on target bucket
   *
   * @controller            bucket
   * @action                enablePublicAccess
   *
   * @param {KuzzleRequest} request
   */
  async deletePublicAccessBlock(request) {
    this._assertCredentials();

    const bucketName = this._stringArg(
        request,
        'bucketName',
        this.config.bucketName
      ),
      bucketRegion = this._stringArg(
        request,
        'bucketRegion',
        this.config.s3ClientOptions.region
      );

    AWS.config.update({ region: bucketRegion });

    await this.s3.deletePublicAccessBlock({ Bucket: bucketName }).promise();

    return { result: 'ok' };
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
    this._assertCredentials();

    const
      bucketName = this._stringArg(request, 'bucketName', this.config.bucketName),
      bucketRegion = this._stringArg(request, 'bucketRegion', this.config.s3ClientOptions.region);

    AWS.config.update({ region: bucketRegion });

    try {
      await this.s3.headBucket({ Bucket: bucketName }).promise();
      return true;
    }
    catch (err) {
      if (err.code === 'NotFound') {
        return false;
      }
      throw new this.context.errors.ExternalServiceError(err.message);
    }
  }

  /**
   * Deletes an existing empty S3 bucket.
   *
   * @controller            bucket
   * @action                delete
   *
   * @param {KuzzleRequest} request
   */
  async bucketDelete(request) {
    this._assertCredentials();

    const bucketName = this._stringArg(request, 'bucketName');
    const bucketRegion = this._stringArg(request, 'bucketRegion', this.config.s3ClientOptions.region);

    AWS.config.update({ region: bucketRegion });

    const params = { Bucket: bucketName };

    await this.s3.deleteBucket(params).promise();

    return { result: 'ok' };
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
