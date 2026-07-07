export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface JobPayload {
  bookingId: string;
  requestId?: string;
}
