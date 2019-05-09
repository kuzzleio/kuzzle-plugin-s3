const
  KuzzleErrors = require('kuzzle-common-objects').errors,
  mockrequire = require('mock-require'),
  sinon = require('sinon'),
  { 
    BadRequestError,
    NotFoundError,
    InternalError: KuzzleInternalError 
  } = require('kuzzle-common-objects').errors,
  should = require('should');

class S3Mock {
  constructor (config) {
    this.config = config;
  }
}

function s3Resolve (resolveArg) {
  return { promise: () => Promise.resolve(resolveArg) };
}

function s3Reject (rejectArg) {
  return { promise: () => Promise.reject(rejectArg) };
}

describe('S3Plugin', () => {
  let
    uuidCount,
    uuidMock,
    context,
    config,
    deleteObjectMock,
    headObjectMock,
    getSignedUrlStub,
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

    S3Mock.prototype.getSignedUrl = getSignedUrlStub;
    S3Mock.prototype.deleteObject = deleteObjectMock;
    S3Mock.prototype.headObject = headObjectMock;

    awsSdkMock = {
      S3: S3Mock
    };

    config = {
      bucketName: 'half-life',
      uploadDir: 'xen',
      region: 'eu-west-3',
      signedUrlTTL: 3600 * 1000,
      redisPrefix: 's3Plugin/fileController'
    };

    uuidCount = 0;
    uuidMock = () => `${uuidCount++}`;

    mockrequire('aws-sdk', awsSdkMock);
    mockrequire('uuid', uuidMock);

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
    }

    S3Plugin = mockrequire.reRequire('../lib/S3Plugin');
    s3Plugin = new S3Plugin();
    s3Plugin.init(config, context);
  });

  afterEach(() => {
    mockrequire.stopAll();
  });

  describe('#getUploadUrl', () => {
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
      s3Plugin._deleteExpiredFile = sinon.stub();

      const response = await s3Plugin.getUploadUrl(request);

      should(getSignedUrlStub)
        .be.calledOnce()
        .be.calledWith('putObject', {
          Bucket: 'half-life',
          Key: 'xen/0/headcrab.png',
          Expires: 3600
        });
      should(s3Plugin._deleteExpiredFile).be.calledOnce();
      should(response).be.eql({
        uploadUrl: 'http://url.s3',
        fileUrl: 'https://s3.eu-west-3.amazonaws.com/half-life/xen/0/headcrab.png',
        fileKey: 'xen/0/headcrab.png',
        ttl: 3600000
      });
    });

    it('set a timeout to delete the file after expiration', done => {
      s3Plugin.config.signedUrlTTL = 50;
      s3Plugin.context.accessors.sdk.ms.get.resolves(true);

      s3Plugin.getUploadUrl(request)
        .then(() => {
          should(s3Plugin.context.accessors.sdk.ms.set)
            .be.calledOnce()
            .be.calledWith('s3Plugin/fileController/xen/0/headcrab.png', 'temporary', { ex: 60.05 });

          setTimeout(() => {
            should(s3Plugin.context.accessors.sdk.ms.get).be.calledOnce();
            should(deleteObjectMock)
              .be.calledOnce()
              .be.calledWith({ Bucket: 'half-life', Key: 'xen/0/headcrab.png' });            
            should(s3Plugin.context.accessors.sdk.ms.del)
              .be.calledOnce()
              .be.calledWith(['s3Plugin/fileController/xen/0/headcrab.png']);

            done();
          }, 100);
        })
        .catch(error => done(error));
    }),

    it('throws an error if "filename" param is not present', () => {
      delete request.input.args.filename;

      return should(
        s3Plugin.getUploadUrl(request)
      ).be.rejectedWith(BadRequestError);
    });

    it('throws an error if AWS environment variables are not set', () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      s3Plugin = new S3Plugin();
      s3Plugin.init(config, context);

      return should(
        s3Plugin.getUploadUrl(request)
      ).be.rejectedWith(KuzzleInternalError);          
    });
  });

  describe('#deleteFile', () => {
    beforeEach(() => {
      request = {
        input: {
          args: {
            fileKey: 'xen/0/headcrab.png'
          }
        }
      };  
    });

    it('delete the file using aws sdk', async () => {
      await s3Plugin.deleteFile(request);

      should(headObjectMock)
        .be.calledOnce()
        .be.calledWith({ Bucket: 'half-life', Key: 'xen/0/headcrab.png'});

      should(deleteObjectMock)
        .be.calledOnce()
        .be.calledWith({ Bucket: 'half-life', Key: 'xen/0/headcrab.png'});
    });

    it('throws an error if the file is not found', async () => {
      headObjectMock.returns(s3Reject({ code: 'NotFound' }));

      return should(
        s3Plugin.deleteFile(request)
      ).be.rejectedWith(NotFoundError);
    });

    it('throws an error if "fileKey" param is not present', async () => {
      delete request.input.args.fileKey;

      return should(
        s3Plugin.deleteFile(request)
      ).be.rejectedWith(BadRequestError);
    });

    it('throws an error if AWS environment variables are not set', async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      s3Plugin = new S3Plugin();
      s3Plugin.init(config, context);

      return should(
        s3Plugin.deleteFile(request)
      ).be.rejectedWith(KuzzleInternalError);          
    });
  });

  describe('#getUrl', () => {
    beforeEach(() => {
      request = {
        input: {
          args: {
            fileKey: 'xen/0/headcrab.png'
          }
        }
      };  
    });

    it('returns the file url', async () => {
      const response = await s3Plugin.getUrl(request);
      
      should(response).be.eql({
        fileUrl: 'https://s3.eu-west-3.amazonaws.com/half-life/xen/0/headcrab.png'
      });
    });

    it('throws an error if "fileKey" param is not present', async () => {
      delete request.input.args.fileKey;

      return should(
        s3Plugin.deleteFile(request)
      ).be.rejectedWith(BadRequestError);
    });
  });
});
