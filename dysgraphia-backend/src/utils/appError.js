class AppError extends Error {
  constructor(statusCode, errorCode, message, options = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = options.details;
    this.meta = options.meta;
    this.cause = options.cause;
  }
}

module.exports = {
  AppError,
};