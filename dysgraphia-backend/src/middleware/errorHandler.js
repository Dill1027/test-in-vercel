const { ZodError } = require("zod");
const { AppError } = require("../utils/appError");

function notFound(req, res, next) {
  next(new AppError(404, "ROUTE_NOT_FOUND", `Route not found: ${req.originalUrl}`));
}

function normalizeError(error) {
  if (error instanceof ZodError) {
    return new AppError(400, "VALIDATION_ERROR", "The request payload is invalid.", {
      details: error.flatten(),
    });
  }

  if (error instanceof AppError) {
    return error;
  }

  const fallback = new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
  fallback.cause = error;
  return fallback;
}

function errorHandler(err, req, res, next) {
  const normalizedError = normalizeError(err);

  if (req.log) {
    req.log.error(
      {
        error: normalizedError,
        cause: normalizedError.cause,
      },
      normalizedError.message
    );
  }

  const payload = {
    error: {
      code: normalizedError.errorCode,
      message: normalizedError.message,
    },
  };

  if (normalizedError.details) {
    payload.error.details = normalizedError.details;
  }

  if (normalizedError.meta && typeof normalizedError.meta === "object") {
    Object.assign(payload, normalizedError.meta);
  }

  res.status(normalizedError.statusCode).json(payload);
}

module.exports = {
  errorHandler,
  notFound,
};
