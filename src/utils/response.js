/**
 * Consistent API success response envelope.
 *
 * @param {import('express').Response} res
 * @param {any} data
 * @param {number} [statusCode=200]
 * @param {object} [meta=null] Optional pagination or additional metadata
 */
export const successResponse = (res, data, statusCode = 200, meta = null) => {
  const payload = {
    success: true,
    data,
  };

  if (meta && typeof meta === 'object') {
    payload.meta = meta;
  }

  return res.status(statusCode).json(payload);
};

/**
 * Consistent API error response envelope.
 *
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} [statusCode=500]
 * @param {any} [details=null]
 */
export const errorResponse = (res, message, statusCode = 500, details = null) => {
  const payload = {
    success: false,
    error: {
      message,
      ...(details && { details }),
    },
  };

  return res.status(statusCode).json(payload);
};
