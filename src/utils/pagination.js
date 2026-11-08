/**
 * Standard pagination helper to safely parse and clamp pagination parameters.
 * Ensures page, limit, skip, and take are ALWAYS returned as pure JavaScript Numbers.
 * Prevents Prisma P2022 / type errors when Express passes string query params.
 *
 * @param {object} [query={}] Express req.query object
 * @param {object} [defaults={}] Default and max bounds
 * @param {number} [defaults.defaultLimit=20] Default limit if not provided or invalid
 * @param {number} [defaults.maxLimit=100] Max upper bound for limit
 * @returns {{ page: number, limit: number, skip: number, take: number }}
 */
export const getPagination = (query = {}, defaults = {}) => {
  const defaultLimit = typeof defaults.defaultLimit === 'number' ? defaults.defaultLimit : 20;
  const maxLimit = typeof defaults.maxLimit === 'number' ? defaults.maxLimit : 100;

  const rawPage = query?.page;
  const rawLimit = query?.limit;

  const parsedPage = parseInt(rawPage, 10);
  const parsedLimit = parseInt(rawLimit, 10);

  const page = Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  let limit = Number.isInteger(parsedLimit) && parsedLimit >= 1 ? parsedLimit : defaultLimit;

  if (limit > maxLimit) {
    limit = maxLimit;
  }

  const skip = (page - 1) * limit;
  const take = limit;

  return {
    page,
    limit,
    skip,
    take,
  };
};

export default getPagination;

