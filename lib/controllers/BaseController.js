const { getS3Client, getProperty } = require('../helpers');

class BaseController {
  constructor(config, context) {
    this.config = config;
    this.context = context;

    if (!this.config.endpoints || Object.keys(this.config.endpoints).length === 0) {
      throw new Error('BaseController requires a valid endpoints configuration.');
    }
  }

  getS3Client(region) {
    const endpoint = this.config.endpoints[region];

    if (!endpoint) {
      throw new Error(`No endpoint configured for region: ${region}`);
    }

    return getS3Client(endpoint);
  }

  stringArg(request, paramPath, defaultValue = null) {
    const value = getProperty(request.input.args, paramPath) || defaultValue;

    if (!value) {
      throw new this.context.errors.BadRequestError(`Missing argument: "${paramPath}"`);
    }
    if (typeof value !== 'string') {
      throw new this.context.errors.BadRequestError(`Invalid value for "${paramPath}"`);
    }

    return value;
  }
}

module.exports = BaseController;
