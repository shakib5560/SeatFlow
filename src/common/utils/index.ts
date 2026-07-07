/**
 * Formats a Date object to an ISO 8601 string.
 */
export function formatDate(date: Date): string {
  return date.toISOString();
}

/**
 * Calculates paginated offset from page and limit values.
 */
export function getPaginationOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Builds a paginated meta object.
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): { total: number; page: number; limit: number; totalPages: number } {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
