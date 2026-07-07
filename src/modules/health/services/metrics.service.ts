import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  /**
   * Returns Node.js memory utilization metrics.
   */
  getMemoryUsage() {
    const memory = process.memoryUsage();
    return {
      rss: `${Math.round(memory.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(memory.external / 1024 / 1024)}MB`,
    };
  }

  /**
   * Returns Node.js process CPU usage statistics.
   */
  getCpuUsage() {
    const usage = process.cpuUsage();
    return {
      user: `${Math.round(usage.user / 1000)}ms`,
      system: `${Math.round(usage.system / 1000)}ms`,
    };
  }
}
