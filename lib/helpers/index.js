const { getS3Client, listAllObjects, clients } = require('./s3ClientManager');
const { getProperty } = require('./getProperty');

module.exports = {
  getS3Client,
  clients,
  listAllObjects,
  getProperty,
};