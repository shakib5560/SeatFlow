import { AsyncLocalStorage } from 'async_hooks';

/**
 * correlationStorage — Node's AsyncLocalStorage context manager
 * for capturing the current request ID.
 *
 * This allows LoggerService to read the request ID anywhere in the
 * call chain (controllers, services, repositories) without needing to
 * explicitly pass req/requestId parameters through every function.
 */
export const correlationStorage = new AsyncLocalStorage<string>();
