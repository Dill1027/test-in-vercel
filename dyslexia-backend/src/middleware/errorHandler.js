import { HttpError } from '../utils/httpError.js';

export const errorHandler = (err, req, res, next) => {
  const statusCode = err instanceof HttpError
    ? err.statusCode
    : err.statusCode || 500;

  const payload = {
    success: false,
    message: err.message || 'Internal server error',
  };

  if (err.details) {
    payload.details = err.details;
  }

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json(payload);
};
