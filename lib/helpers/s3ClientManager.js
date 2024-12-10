const { S3 } = require('@aws-sdk/client-s3');

const clients = {};

/**
 * Get or create an S3 client for a specific region.
 * @param {Object} options - Configuration options.
 * @param {string} options.endpoint - Custom endpoint for the S3 client.
 * @param {string} options.region - AWS region for the S3 client.
 * @param {boolean} [options.forcePathStyle=false] - Use path-style addressing (required for MinIO).
 * @param {Function} getCredentials - Function to fetch credentials for the region.
 * @throws {Error} If endpoint or credentials are not provided.
 * @returns {Promise<S3Client>} - AWS SDK S3 client instance.
 */
function getS3Client({ endpoint, region, forcePathStyle = false }, getCredentials) {
  if (!endpoint) {
    throw new Error('Endpoint is required to initialize the S3 client.');
  }

  if (typeof getCredentials !== 'function') {
    throw new Error('A function to retrieve credentials is required.');
  }

  const clientKey = `${region}-${endpoint}`;

  if (!clients[clientKey]) {

    const credentials = getCredentials(region);

    if (!credentials || !credentials.accessKeyId || !credentials.secretAccessKey) {
      throw new Error('Valid credentials (accessKeyId and secretAccessKey) are required.');
    }

    clients[clientKey] = new S3({
      endpoint,
      region,
      credentials,
      forcePathStyle,
    });
  }

  return clients[clientKey];
}

/**
 * List all configured regions.
 * @param {Object} config - Plugin configuration.
 * @returns {Array<string>} - List of configured regions.
 */
function listRegions(config) {
  return Object.keys(config.endpoints);
}

/**
 * Helper function to retrieve all file keys from the bucket, not just the first 1000.
 * This code is extracted from https://stackoverflow.com/a/54341763/3744415
 * @param {Object} s3 - AWS SDK S3 client instance.
 * @param {Object} params - Parameters for listObjectsV2 AWS S3 API call.
 * @returns {Promise<Array<Object>>} - List of all objects in the bucket.
 */
async function listAllObjects(s3, params) {
  const response = await s3.listObjectsV2(params);
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
  listAllObjects,
};