/**
 * Standard API error hierarchy.
 * Controllers and services throw these; the central error handler formats them.
 */

export class ApiError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad Request', details = null) {
    super(message, 400, details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required', details = null) {
    super(message, 401, details);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Access forbidden', details = null) {
    super(message, 403, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', details = null) {
    super(message, 404, details);
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Resource conflict', details = null) {
    super(message, 409, details);
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 422, details);
  }
}

export class InternalServerError extends ApiError {
  constructor(message = 'Internal Server Error', details = null) {
    super(message, 500, details);
  }
}
