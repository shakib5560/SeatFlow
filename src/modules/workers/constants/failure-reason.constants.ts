/**
 * FailureReason — all possible reasons a booking can be marked FAILED.
 *
 * Using a const enum avoids magic strings in the codebase and ensures
 * consistent values are persisted in the `failureReason` database column.
 */
export const FailureReason = {
  EVENT_NOT_FOUND: 'EVENT_NOT_FOUND',
  SOLD_OUT: 'SOLD_OUT',
  INVALID_BOOKING: 'INVALID_BOOKING',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type FailureReason = (typeof FailureReason)[keyof typeof FailureReason];
