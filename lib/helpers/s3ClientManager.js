const AWS = require('aws-sdk');

const clients = {};

/**
 * Get or create an S3 client for a specific region and endpoint.
 * @param {string} region - AWS region.
 * @param {string} endpoint - Custom endpoint for the region.
 * @throws {Error} If endpoint is not provided.
 */
/**
 * Get or create an S3 client for a specific endpoint.
 * @param {string} endpoint - Custom endpoint for the S3 client.
 * @throws {Error} If endpoint is not provided.
 */
function getS3Client(endpoint) {
  if (!endpoint) {
    throw new Error('Endpoint is required to initialize the S3 client.');
  }

  if (!clients[endpoint]) {
    console.log(`Creating new S3 client for endpoint: ${endpoint}`);
    clients[endpoint] = new AWS.S3({ endpoint });
  } else {
    console.log(`Reusing existing S3 client for endpoint: ${endpoint}`);
  }

  return clients[endpoint];
}

/**
 * List all configured regions.
 * @param {Object} config - Plugin configuration.
 */
function listRegions(config) {
  return Object.keys(config.endpoints);
}

/**
 * Helper function to retrieve all files keys from the bucket, no only
 *  the first 1000.
 * This code is extracted from  https://stackoverflow.com/a/54341763/3744415
 * @param {*} s3 aws jdk instance
 * @param {*} params for listObjectsV2 aws s3 api call. refer to https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#listObjectsV2-property 
 */
async function listAllObjects(s3, params) {
  const response = await s3.listObjectsV2(params).promise();
  const objects = response.Contents || [];
  if (response.IsTruncated) {
    params.ContinuationToken = response.NextContinuationToken;
    const nextObjects = await listAllObjects(s3, params);
    return objects.concat(nextObjects);
  }
  return objects;
}
  
module.exports = {
  clients,
  getS3Client,
  listRegions,
  listAllObjects
};
