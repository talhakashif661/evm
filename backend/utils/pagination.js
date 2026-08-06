// Shared by every paginated list endpoint so page/limit parsing and the
// response `pagination` shape stay identical across controllers instead of
// each one reimplementing the same page/limit math slightly differently.
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export const parsePagination = (query, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) => {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit) || defaultLimit, 1), maxLimit);
  return { page, limit, skip: (page - 1) * limit };
};

export const paginationMeta = (total, page, limit) => ({
  page,
  limit,
  total,
  pages: Math.max(Math.ceil(total / limit), 1),
});
