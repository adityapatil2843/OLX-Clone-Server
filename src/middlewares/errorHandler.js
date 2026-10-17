import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let details = null;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err.name === 'SyntaxError' && err.status === 400 && 'body' in err) {
    // Malformed JSON payload
    statusCode = 400;
    message = 'Malformed JSON in request body';
  } else if (err.code === 'P2002') {
    // Prisma unique constraint violation
    statusCode = 409;
    const targets = err.meta?.target ? err.meta.target.join(', ') : 'field';
    message = `Unique constraint failed on: ${targets}`;
  } else if (err.code === 'P2025') {
    // Prisma record not found
    statusCode = 404;
    message = 'Resource not found';
  } else if (err.statusCode || err.status) {
    statusCode = err.statusCode || err.status;
    message = err.message || message;
    details = err.details || null;
  }

  // Structured logging
  const log = req.log || console;
  if (statusCode >= 500) {
    log.error({ err, reqId: req.id, path: req.originalUrl }, message);
  } else {
    log.warn({ err: { message: err.message, name: err.name }, reqId: req.id, path: req.originalUrl }, message);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(details && { details }),
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

export default errorHandler;
