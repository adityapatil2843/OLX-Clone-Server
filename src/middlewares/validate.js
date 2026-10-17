import { ValidationError } from '../utils/errors.js';

/**
 * Express middleware generator for validating request data with Zod schemas.
 *
 * @param {object} schemas
 * @param {import('zod').ZodTypeAny} [schemas.body]
 * @param {import('zod').ZodTypeAny} [schemas.query]
 * @param {import('zod').ZodTypeAny} [schemas.params]
 */
export const validate = (schemas) => {
  return (req, _res, next) => {
    try {
      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          throw new ValidationError('Invalid route parameters', result.error.flatten());
        }
        Object.assign(req.params, result.data);
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          throw new ValidationError('Invalid query parameters', result.error.flatten());
        }
        for (const key of Object.keys(req.query)) {
          delete req.query[key];
        }
        Object.assign(req.query, result.data);
      }

      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          throw new ValidationError('Validation failed', result.error.flatten());
        }
        req.body = result.data;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

export default validate;
