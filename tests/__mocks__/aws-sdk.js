const S3Mock = jest.fn(() => ({
  getSignedUrl: jest.fn().mockReturnValue('http://url.s3'),
  deleteObject: jest.fn(() => ({
    promise: jest.fn().mockResolvedValue({}),
  })),
  headObject: jest.fn(() => ({
    promise: jest.fn().mockResolvedValue({}),
  })),
  headBucket: jest.fn(() => ({
    promise: jest.fn().mockResolvedValue({}),
  })),
  deleteBucket: jest.fn(() => ({
    promise: jest.fn().mockResolvedValue({}),
  })),
  deletePublicAccessBlock: jest.fn(() => ({
    promise: jest.fn().mockResolvedValue({}),
  })),
  listObjectsV2: jest.fn(() => ({
    promise: jest.fn().mockResolvedValue({
      Contents: [
        { Key: 'test/0-test.png', LastModified: new Date(), Size: 100 },
        { Key: 'test/1-test.png', LastModified: new Date(), Size: 200 },
      ],
    }),
  })),
}));

const clients = {};

const getS3Client = jest.fn((endpoint) => {
  if (!clients[endpoint]) {
    clients[endpoint] = new S3Mock(); 
  }
  console.log(`getS3Client called endpoint=${endpoint}`);
  return clients[endpoint];
});

module.exports = {
  S3: S3Mock,
  getS3Client,
  clients,
};
