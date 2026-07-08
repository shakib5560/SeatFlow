/**
 * AdminFailureReason — reasons a booking can be rejected by an admin.
 *
 * These values are stored in the `failureReason` column when an admin
 * explicitly rejects a pending booking.
 */
export const AdminFailureReason = {
  ADMIN_REJECTED: 'ADMIN_REJECTED',
  SOLD_OUT: 'SOLD_OUT',
} as const;

export type AdminFailureReason =
  (typeof AdminFailureReason)[keyof typeof AdminFailureReason];
