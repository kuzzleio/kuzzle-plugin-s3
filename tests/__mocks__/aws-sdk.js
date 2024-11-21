class S3Mock {
  constructor() {
    this.getSignedUrl = jest.fn();
    this.deleteObject = jest.fn();
    this.headObject = jest.fn();
    this.listObjectsV2 = jest.fn();
  }
}

module.exports = {
  S3: S3Mock,
};
