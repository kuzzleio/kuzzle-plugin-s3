const KuzzleErrors = require('kuzzle-common-objects').errors,
  mockrequire = require('mock-require'),
  sinon = require('sinon'),
  {
    BadRequestError,
    NotFoundError,
    InternalError: KuzzleInternalError
  } = require('kuzzle-common-objects').errors,
  should = require('should');

class S3Mock {
  constructor(config) {
    this.config = config;
  }
}

function s3Resolve(resolveArg) {
  return { promise: () => Promise.resolve(resolveArg) };
}

function s3Reject(rejectArg) {
  return { promise: () => Promise.reject(rejectArg) };
}

describe('S3Plugin', () => {
  let uuidCount,
    uuidMock,
    context,
    config,
    createBucket,
    deleteBucket,
    headBucket,
    configUpdate,
    putBucketCors,
    deleteObjectMock,
    headObjectMock,
    getSignedUrlStub,
    listObjectsV2Mock,
    awsSdkMock,
    S3Plugin,
    s3Plugin,
    request;

  beforeEach(() => {
    process.env.AWS_ACCESS_KEY_ID = 'aws access key id';
    process.env.AWS_SECRET_ACCESS_KEY = 'aws access secret key';

    getSignedUrlStub = sinon.stub().returns('http://url.s3');    
    deleteObjectMock = sinon.stub().returns(s3Resolve());
    headObjectMock = sinon.stub().returns(s3Resolve());
    listObjectsV2Mock = sinon.stub().returns(s3Resolve());
    createBucket = sinon.stub().returns(s3Resolve());
    putBucketCors = sinon.stub().returns(s3Resolve());
    putBucketPolicies = sinon.stub().returns(s3Resolve());
    headBucket = sinon.stub().returns(s3Reject({code: 'NotFound' }));
    listObjectsV2Mock = sinon.stub().returns(s3Resolve());
    configUpdate = sinon.stub().returns(s3Resolve());

    S3Mock.prototype.getSignedUrl = getSignedUrlStub;
    S3Mock.prototype.deleteObject = deleteObjectMock;
    S3Mock.prototype.headObject = headObjectMock;
    S3Mock.prototype.listObjectsV2 = listObjectsV2Mock;
    S3Mock.prototype.headBucket = headBucket;
    S3Mock.prototype.createBucket = createBucket;
    S3Mock.prototype.deleteBucket = deleteBucket;
    S3Mock.prototype.putBucketCors = putBucketCors;
    S3Mock.prototype.putBucketPolicies = putBucketPolicies;
    S3Mock.prototype.update = configUpdate;

    awsSdkMock = {
      config: {
        update : () => configUpdate
      },
      S3: S3Mock
    };

    config = {
      bucketName: 'half-life',
      uploadDir: 'xen',
      region: 'eu-west-3',
      signedUrlTTL: '60min',
      redisPrefix: 's3Plugin/uploads'
    };

    uuidCount = 0;
    uuidMock = () => `${uuidCount++}`;

    mockrequire('aws-sdk', awsSdkMock);
    mockrequire('uuid/v4', uuidMock);

    context = {
      accessors: {
        sdk: {
          ms: {
            get: sinon.stub().resolves(),
            set: sinon.stub().resolves(),
            del: sinon.stub().resolves()
          }
        }
      },
      errors: KuzzleErrors,
      log: {
        warn: sinon.stub().resolves(),
        debug: sinon.stub().resolves()
      }
    };

    S3Plugin = mockrequire.reRequire('../lib/S3Plugin');
    s3Plugin = new S3Plugin();
    s3Plugin.init(config, context);
  });

  afterEach(() => {
    mockrequire.stopAll();
  });

  describe('#uploadGetUrl', () => {
    beforeEach(() => {
      request = {
        input: {
          args: {
            uploadDir: 'xen',
            filename: 'headcrab.png'
          }
        }
      };
    });

    it('returns a presigned url from aws s3', async () => {
      s3Plugin._expireFile = sinon.stub();

      const response = await s3Plugin.uploadGetUrl(request);

      should(getSignedUrlStub)
        .be.calledOnce()
        .be.calledWith('putObject', {
          Bucket: 'half-life',
          Key: 'xen/0-headcrab.png',
          Expires: 3600
        });
      should(s3Plugin._expireFile).be.calledOnce();
      should(response).be.eql({
        uploadUrl: 'http://url.s3',
        fileUrl:
          'https://s3.eu-west-3.amazonaws.com/half-life/xen/0-headcrab.png',
        fileKey: 'xen/0-headcrab.png',
        ttl: 3600000
      });
    });

    it('set a timeout to delete the file after expiration', done => {
      s3Plugin.config.signedUrlTTL = 50;
      s3Plugin.context.accessors.sdk.ms.get.resolves(true);

      s3Plugin
        .uploadGetUrl(request)
        .then(() => {
          should(s3Plugin.context.accessors.sdk.ms.set)
            .be.calledOnce()
            .be.calledWith('s3Plugin/uploads/xen/0-headcrab.png', 'temporary', {
              ex: 60.05
            });

          setTimeout(() => {
            should(s3Plugin.context.accessors.sdk.ms.get).be.calledOnce();
            should(deleteObjectMock)
              .be.calledOnce()
              .be.calledWith({
                Bucket: 'half-life',
                Key: 'xen/0-headcrab.png'
              });
            should(s3Plugin.context.accessors.sdk.ms.del)
              .be.calledOnce()
              .be.calledWith(['s3Plugin/uploads/xen/0-headcrab.png']);

            done();
          }, 100);
        })
        .catch(error => done(error));
    }),
    it('throws an error if "filename" param is not present', () => {
      delete request.input.args.filename;

      return should(s3Plugin.uploadGetUrl(request)).be.rejectedWith(
        BadRequestError
      );
    });

    it('throws an error if AWS environment variables are not set', () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      s3Plugin = new S3Plugin();
      s3Plugin.init(config, context);

      return should(s3Plugin.uploadGetUrl(request)).be.rejectedWith(
        KuzzleInternalError
      );
    });

    it('override bucket name if bucketName is set in request args', async () => {
      request.input.args.bucketName = 'full-life'
      s3Plugin._expireFile = sinon.stub();

      const response = await s3Plugin.uploadGetUrl(request);

      should(getSignedUrlStub)
        .be.calledOnce()
        .be.calledWith('putObject', {
          Bucket: 'full-life',
          Key: 'xen/0-headcrab.png',
          Expires: 3600
        });
      should(s3Plugin._expireFile).be.calledOnce();
      should(response).be.eql({
        uploadUrl: 'http://url.s3',
        fileUrl:
          'https://s3.eu-west-3.amazonaws.com/full-life/xen/0-headcrab.png',
        fileKey: 'xen/0-headcrab.png',
        ttl: 3600000
      });
    })
  });

  describe('#uploadValidate', () => {
    beforeEach(() => {
      request = {
        input: {
          args: {
            fileKey: 'xen/0-headcrab.png'
          }
        }
      };
    });

    it('deletes the associated key in Redis', async () => {
      const response = await s3Plugin.uploadValidate(request);

      should(s3Plugin.context.accessors.sdk.ms.del)
        .be.calledOnce()
        .be.calledWith(['s3Plugin/uploads/xen/0-headcrab.png']);

      should(response).be.eql({
        fileKey: 'xen/0-headcrab.png',
        fileUrl:
          'https://s3.eu-west-3.amazonaws.com/half-life/xen/0-headcrab.png'
      });
    });

    it('throws an error if "fileKey" param is not present', async () => {
      delete request.input.args.fileKey;

      return should(s3Plugin.uploadValidate(request)).be.rejectedWith(
        BadRequestError
      );
    });
  });

  describe('#fileDelete', () => {
    beforeEach(() => {
      request = {
        input: {
          args: {
            fileKey: 'xen/0-headcrab.png'
          }
        }
      };
    });

    it('delete the file using aws sdk', async () => {
      await s3Plugin.fileDelete(request);

      should(headObjectMock)
        .be.calledOnce()
        .be.calledWith({ Bucket: 'half-life', Key: 'xen/0-headcrab.png' });

      should(deleteObjectMock)
        .be.calledOnce()
        .be.calledWith({ Bucket: 'half-life', Key: 'xen/0-headcrab.png' });
    });

    it('override bucket name if bucketName is set in request args', async () => {
      request.input.args.bucketName = 'full-life'

      await s3Plugin.fileDelete(request);

      should(headObjectMock)
        .be.calledOnce()
        .be.calledWith({ Bucket: 'full-life', Key: 'xen/0-headcrab.png' });

      should(deleteObjectMock)
        .be.calledOnce()
        .be.calledWith({ Bucket: 'full-life', Key: 'xen/0-headcrab.png' });
    })

    it('throws an error if the file is not found', async () => {
      headObjectMock.returns(s3Reject({ code: 'NotFound' }));

      return should(s3Plugin.fileDelete(request)).be.rejectedWith(
        NotFoundError
      );
    });

    it('throws an error if "fileKey" param is not present', async () => {
      delete request.input.args.fileKey;

      return should(s3Plugin.fileDelete(request)).be.rejectedWith(
        BadRequestError
      );
    });

    it('throws an error if AWS environment variables are not set', async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      s3Plugin = new S3Plugin();
      s3Plugin.init(config, context);

      return should(s3Plugin.fileDelete(request)).be.rejectedWith(
        KuzzleInternalError
      );
    });
  });

  describe('#fileGetUrl', () => {
    beforeEach(() => {
      request = {
        input: {
          args: {
            fileKey: 'xen/0-headcrab.png'
          }
        }
      };
    });

    it('returns the file url', async () => {
      const response = await s3Plugin.fileGetUrl(request);

      should(response).be.eql({
        fileUrl:
          'https://s3.eu-west-3.amazonaws.com/half-life/xen/0-headcrab.png'
      });
    });
    
    it('override bucket name if bucketName is set in request args', async () => {
      request.input.args.bucketName = 'full-life'
      const response = await s3Plugin.fileGetUrl(request);

      should(response).be.eql({
        fileUrl:
          'https://s3.eu-west-3.amazonaws.com/full-life/xen/0-headcrab.png'
      });
    })

    it('throws an error if "fileKey" param is not present', async () => {
      delete request.input.args.fileKey;

      return should(s3Plugin.fileDelete(request)).be.rejectedWith(
        BadRequestError
      );
    });

  });

  describe('#getFilesKeys', () => {
    beforeEach(() => {
      request = {
        input: {
          args: {}
        }
      };
    });

    it('returns the list of files keys of the bucket from config', async () => {
      listObjectsV2Mock.returns(s3Resolve(
        {
          Contents: [
            {
              Key: 'xen/0-headcrab.png',
              LastModified: '2019-12-13T23:18:10.593Z',
              ETag: '"911c0908dfc8fb66068bd8bb3fd6a142-1"',
              Size: 9163,
              StorageClass: 'STANDARD',
              Owner: {
                DisplayName: '',
                ID: ''
              }
            },
            {
              Key: 'xen/0-Nihilanth.png',
              LastModified: '2019-12-17T14:06:02.532Z',
              ETag: '"911c0908dfc8fb66068bd8bb3fd6a142-1"',
              Size: 20913,
              StorageClass: 'STANDARD',
              Owner: {
                DisplayName: '',
                ID: ''
              }
            }],
          IsTruncated: false, 
          KeyCount: 2, 
          MaxKeys: 2, 
          Name: 'half-life',  
          Prefix: ''
        }
      ));


      const response =  await s3Plugin.getFilesKeys(request);

      should(listObjectsV2Mock)
        .be.calledOnce()
        .be.calledWith({
          Bucket: 'half-life'
        });
      should(response).be.eql(        
        {
          filesKeys: [
            {
              Key: 'https://s3.eu-west-3.amazonaws.com/half-life/xen/0-headcrab.png',
              LastModified: '2019-12-13T23:18:10.593Z',
              ETag: '"911c0908dfc8fb66068bd8bb3fd6a142-1"',
              Size: 9163,
              StorageClass: 'STANDARD',
              Owner: {
                DisplayName: '',
                ID: ''
              }
            },
            {
              Key: 'https://s3.eu-west-3.amazonaws.com/half-life/xen/0-Nihilanth.png',
              LastModified: '2019-12-17T14:06:02.532Z',
              ETag: '"911c0908dfc8fb66068bd8bb3fd6a142-1"',
              Size: 20913,
              StorageClass: 'STANDARD',
              Owner: {
                DisplayName: '',
                ID: ''
              }
            }]
        }
      );
    });

    it('returns the list of files keys of the selected bucket', async () => {
      request.input.args.bucketName = 'full-life'
      listObjectsV2Mock.returns(s3Resolve(
        {
          Contents: [
            {
              Key: 'xen/0-headcrab.png',
              LastModified: '2019-12-13T23:18:10.593Z',
              ETag: '"911c0908dfc8fb66068bd8bb3fd6a142-1"',
              Size: 9163,
              StorageClass: 'STANDARD',
              Owner: {
                DisplayName: '',
                ID: ''
              }
            },
            {
              Key: 'xen/0-Nihilanth.png',
              LastModified: '2019-12-17T14:06:02.532Z',
              ETag: '"911c0908dfc8fb66068bd8bb3fd6a142-1"',
              Size: 20913,
              StorageClass: 'STANDARD',
              Owner: {
                DisplayName: '',
                ID: ''
              }
            }],
          IsTruncated: false, 
          KeyCount: 2, 
          MaxKeys: 2, 
          Name: 'full-life',  
          Prefix: ''
        }
      ));


      const response =  await s3Plugin.getFilesKeys(request);
      
      should(listObjectsV2Mock)
        .be.calledOnce()
        .be.calledWith({
          Bucket: 'full-life'
        });
      should(response).be.eql(        
        {
          filesKeys: [
            {
              Key: 'https://s3.eu-west-3.amazonaws.com/full-life/xen/0-headcrab.png',
              LastModified: '2019-12-13T23:18:10.593Z',
              ETag: '"911c0908dfc8fb66068bd8bb3fd6a142-1"',
              Size: 9163,
              StorageClass: 'STANDARD',
              Owner: {
                DisplayName: '',
                ID: ''
              }
            },
            {
              Key: 'https://s3.eu-west-3.amazonaws.com/full-life/xen/0-Nihilanth.png',
              LastModified: '2019-12-17T14:06:02.532Z',
              ETag: '"911c0908dfc8fb66068bd8bb3fd6a142-1"',
              Size: 20913,
              StorageClass: 'STANDARD',
              Owner: {
                DisplayName: '',
                ID: ''
              }
            }]
        }
      );
    });

  });

  describe('#createBucket', async () => {

    beforeEach(() => {
      request = {
        input: {
          args: {
            bucketName : 'full-life',
          },
          body : {}
        }
      };
    });

    it('create a bucket', async () => {
      const response = await s3Plugin.bucketCreate(request)
      should(response).be.eql({ 
        name: 'full-life', 
        region: 'eu-west-3', 
        options: {
          ACL: 'public-read'
        }, 
        CORS: {
          CORSRules : [ 
            {
              AllowedHeaders: ['*'],
              AllowedMethods: ['GET', 'POST', 'PUT'],
              AllowedOrigins: ['*'],
            }
          ]
        }, 
        Policy: undefined
      });
    });

    it('throws an error if bucket name contains invalid characters', () => {
      request.input.args.bucketName = 'full_life';

      return should(s3Plugin.bucketCreate(request)).be.rejectedWith(
        BadRequestError
      );
    });

    it('throws an error if bucket name contains dots and disableDotsInName', () => {
      request.input.args.bucketName = 'full.life';
      request.input.body.disableDotsInName = true;
  
      return should(s3Plugin.bucketCreate(request)).be.rejectedWith(
        BadRequestError
      );
    });
  });
});
