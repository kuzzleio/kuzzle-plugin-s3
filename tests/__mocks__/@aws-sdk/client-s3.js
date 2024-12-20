class S3 {
  constructor() {
    this.headBucket = jest.fn();
    this.createBucket = jest.fn();
    this.putBucketCors = jest.fn();
    this.deleteBucket = jest.fn();
    this.listObjectsV2 = jest.fn();
  }
}

module.exports = { S3 };
