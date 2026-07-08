import { ApiProperty } from '@nestjs/swagger';

export class ServiceStatusDto {
  @ApiProperty({ example: 'UP', description: 'Uptime status (UP or DOWN)' })
  status: string;

  @ApiProperty({
    example: '5ms',
    required: false,
    description: 'Service check response duration',
  })
  latency?: string;
}

export class QueueStatusDto {
  @ApiProperty({ example: 'UP' })
  status: string;

  @ApiProperty({ example: 0 })
  waiting: number;

  @ApiProperty({ example: 0 })
  active: number;

  @ApiProperty({ example: 120 })
  completed: number;

  @ApiProperty({ example: 3 })
  failed: number;

  @ApiProperty({ example: 0 })
  delayed: number;

  @ApiProperty({ example: false })
  paused: boolean;
}

export class MemoryMetricsDto {
  @ApiProperty({ example: '120MB' })
  rss: string;

  @ApiProperty({ example: '80MB' })
  heapTotal: string;

  @ApiProperty({ example: '50MB' })
  heapUsed: string;

  @ApiProperty({ example: '4MB' })
  external: string;
}

export class CpuMetricsDto {
  @ApiProperty({ example: '1500ms' })
  user: string;

  @ApiProperty({ example: '400ms' })
  system: string;
}

export class SystemMetricsDto {
  @ApiProperty({ type: () => MemoryMetricsDto })
  memory: MemoryMetricsDto;

  @ApiProperty({ type: () => CpuMetricsDto })
  cpu: CpuMetricsDto;
}

export class ServiceRegistryDto {
  @ApiProperty({ type: () => ServiceStatusDto })
  database: ServiceStatusDto;

  @ApiProperty({ type: () => ServiceStatusDto })
  redis: ServiceStatusDto;

  @ApiProperty({ type: () => QueueStatusDto })
  queue: QueueStatusDto;
}

export class HealthResponseDto {
  @ApiProperty({ example: 'UP' })
  status: string;

  @ApiProperty({ example: '2026-07-08T12:30:00Z' })
  timestamp: string;

  @ApiProperty({ example: 123456 })
  uptime: number;

  @ApiProperty({ example: '1.0.0' })
  version: string;

  @ApiProperty({ example: 'development' })
  environment: string;

  @ApiProperty({ example: 'v18.16.0' })
  nodeVersion: string;

  @ApiProperty({ example: '11.0.1' })
  nestjsVersion: string;

  @ApiProperty({ example: 'UTC' })
  timezone: string;

  @ApiProperty({ type: () => SystemMetricsDto })
  metrics: SystemMetricsDto;

  @ApiProperty({ type: () => ServiceRegistryDto })
  services: ServiceRegistryDto;
}
