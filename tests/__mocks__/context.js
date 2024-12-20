const context = jest.fn(() => ({
  accessors: {
    sdk: {
    },
  },
  errors: {
    BadRequestError: class BadRequestError extends Error {},
    NotFoundError: class NotFoundError extends Error {},
    InternalError: class InternalError extends Error {},
  },
  log: {
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  },
}));

module.exports = context;