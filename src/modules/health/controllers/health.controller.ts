import { Controller, Get, HttpCode, HttpStatus, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService } from '../services/health.service';
import { HealthResponseDto } from '../responses/health.response.dto';

@ApiTags('Health & Monitoring')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly healthService: HealthService) {}

  /**
   * GET /health
   * Detailed health and diagnostics statistics.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detailed system health diagnostics',
    description: 'Returns connection status and latency metrics for Database, Redis, and BullMQ queues.',
  })
  @ApiOkResponse({
    description: 'Diagnostics compiled successfully.',
    type: HealthResponseDto,
  })
  async getHealth() {
    this.logger.log('Detailed health diagnostics requested');
    return this.healthService.getHealthDetails();
  }

  /**
   * GET /health/ready
   * Kubernetes readiness probe. Returns 200 READY or 503 NOT_READY.
   */
  @Get('ready')
  @ApiOperation({
    summary: 'Kubernetes readiness probe',
    description: 'Verifies database, redis, and queue connections are active. Returns HTTP 503 if any fail.',
  })
  @ApiOkResponse({ description: 'All systems operational.', type: String })
  @ApiServiceUnavailableResponse({ description: 'One or more dependencies are DOWN.', type: String })
  async checkReadiness(@Res() res: Response) {
    this.logger.log('Readiness verification requested');
    const isReady = await this.healthService.isReady();
    if (isReady) {
      return res.status(HttpStatus.OK).send('READY');
    }
    return res.status(HttpStatus.SERVICE_UNAVAILABLE).send('NOT_READY');
  }

  /**
   * GET /health/live
   * Kubernetes liveness probe. Returns 200 immediately.
   */
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kubernetes liveness probe',
    description: 'Checks if the Node.js process is active. Responds immediately with no dependency checks.',
  })
  @ApiOkResponse({ description: 'Process is alive.', type: String })
  async checkLiveness(@Res() res: Response) {
    this.logger.log('Liveness check requested');
    return res.status(HttpStatus.OK).send('LIVENESS_UP');
  }
}
