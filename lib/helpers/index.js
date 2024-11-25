const { getS3Client, listRegions, listAllObjects, clients } = require('./s3ClientManager');
const { getProperty } = require('./getProperty');

module.exports = {
  getS3Client,
  clients,
  listRegions,
  listAllObjects,
  getProperty,
};