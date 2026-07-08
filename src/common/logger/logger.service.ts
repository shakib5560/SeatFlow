import { ConsoleLogger, Injectable } from '@nestjs/common';
import { correlationStorage } from './correlation.store';

@Injectable()
export class ApplicationLogger extends ConsoleLogger {
  log(message: unknown, context?: string) {
    super.log(this.prependCorrelationId(message), context);
  }

  error(message: unknown, stack?: string, context?: string) {
    super.error(this.prependCorrelationId(message), stack, context);
  }

  warn(message: unknown, context?: string) {
    super.warn(this.prependCorrelationId(message), context);
  }

  debug(message: unknown, context?: string) {
    super.debug(this.prependCorrelationId(message), context);
  }

  verbose(message: unknown, context?: string) {
    super.verbose(this.prependCorrelationId(message), context);
  }

  private prependCorrelationId(message: unknown): string {
    const requestId = correlationStorage.getStore();
    if (requestId) {
      return `[Req: ${requestId}] ${String(message)}`;
    }
    return String(message);
  }
}
