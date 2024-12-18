/*
 * Kuzzle, a backend software, self-hostable and ready to use
 * to power modern apps
 *
 * Copyright 2015-2024 Kuzzle
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

const BucketController = require('./controllers/BucketController');
const FileController = require('./controllers/FileController');
const UploadController = require('./controllers/UploadController');
const { _ } = require('lodash');

class S3Plugin {
  constructor() {
    this.defaultConfig = {
      endpoints: {},
      signedUrlTTL: '20min',
    };
    this.config = {};
  }

  /**
   * Plugin initialization.
   */
  init(customConfig, context) {
    this.config = _.merge({}, this.defaultConfig, customConfig);

    if (!this.config.endpoints || Object.keys(this.config.endpoints).length === 0) {
      throw new Error('BaseController requires a valid endpoints configuration.');
    }
  
    this.context = context;
  
    // Initialize controllers
    const bucketController = new BucketController(this.config, this.context);
    const fileController = new FileController(this.config, this.context);
    const uploadController = new UploadController(this.config, this.context);
  
    // Define controller actions and routes
    this.api = {
      's3/bucket': {
        actions: {
          create: {
            handler: bucketController.create.bind(bucketController),
            http: [{ verb: 'post', path: '/bucket/create/:bucketRegion/:bucketName' }],
          },
          delete: {
            handler: bucketController.delete.bind(bucketController),
            http: [{ verb: 'delete', path: '/bucket/delete/:bucketRegion/:bucketName' }],
          },
          exists: {
            handler: bucketController.exists.bind(bucketController),
            http: [{ verb: 'get', path: '/bucket/exists/:bucketRegion/:bucketName' }],
          },
          setPolicy: {
            handler: bucketController.setPolicy.bind(bucketController),
            http: [{ verb: 'post', path: '/bucket/set-policy/:bucketRegion/:bucketName' }],
          },
          enablePublicAccess: {
            handler: bucketController.enablePublicAccess.bind(bucketController),
            http: [{ verb: 'post', path: '/bucket/public-access/:bucketRegion/:bucketName' }],
          },
        },
      },
      's3/file': {
        actions: {
          fileGetUrl: {
            handler: fileController.fileGetUrl.bind(fileController),
            http: [{ verb: 'get', path: '/file/get-url/:bucketRegion/:bucketName' }],
          },
          fileDelete: {
            handler: fileController.fileDelete.bind(fileController),
            http: [{ verb: 'delete', path: '/file/delete/:bucketRegion/:bucketName' }],
          },
          getFilesKeys: {
            handler: fileController.getFilesKeys.bind(fileController),
            http: [{ verb: 'get', path: '/file/list-keys/:bucketRegion/:bucketName' }],
          },
        },
      },
      's3/upload': {
        actions: {
          getUploadUrl: {
            handler: uploadController.getUploadUrl.bind(uploadController),
            http: [{ verb: 'post', path: '/upload/get-url/:bucketRegion/:bucketName/:filename' }],
          },
        },
      },
    };
  
    context.log.info('S3 Plugin initialized successfully.');
  }
  
}

module.exports = S3Plugin;
