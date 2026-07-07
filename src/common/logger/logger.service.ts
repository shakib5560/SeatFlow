import { ConsoleLogger, Injectable } from '@nestjs/common';
import { correlationStorage } from './correlation.store';

@Injectable()
export class ApplicationLogger extends ConsoleLogger {
  log(message: any, context?: string) {
    super.log(this.prependCorrelationId(message), context);
  }

  error(message: any, stack?: string, context?: string) {
    super.error(this.prependCorrelationId(message), stack, context);
  }

  warn(message: any, context?: string) {
    super.warn(this.prependCorrelationId(message), context);
  }

  debug(message: any, context?: string) {
    super.debug(this.prependCorrelationId(message), context);
  }

  verbose(message: any, context?: string) {
    super.verbose(this.prependCorrelationId(message), context);
  }

  private prependCorrelationId(message: any): string {
    const requestId = correlationStorage.getStore();
    if (requestId) {
      return `[Req: ${requestId}] ${message}`;
    }
    return message;
  }
}
