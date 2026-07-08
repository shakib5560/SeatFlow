import { plainToInstance } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_HOST!: string;

  @IsNumber()
  @Min(0)
  @Max(65535)
  REDIS_PORT!: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(15)
  REDIS_DB?: number;

  @IsNumber()
  @Min(0)
  @Max(65535)
  PORT!: number;

  @IsOptional()
  @IsString()
  JWT_SECRET?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  REQUEST_TIMEOUT?: number;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(
    EnvironmentVariables,
    {
      ...config,
      PORT: config.PORT !== undefined ? Number(config.PORT) : undefined,
      REDIS_PORT:
        config.REDIS_PORT !== undefined ? Number(config.REDIS_PORT) : undefined,
      REDIS_DB: config.REDIS_DB !== undefined ? Number(config.REDIS_DB) : 0,
      REQUEST_TIMEOUT:
        config.REQUEST_TIMEOUT !== undefined
          ? Number(config.REQUEST_TIMEOUT)
          : undefined,
    },
    { enableImplicitConversion: true },
  );

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Config validation failed. Please check your .env file. Errors: \n${errors
        .map(
          (err) =>
            `${err.property}: ${Object.values(err.constraints || {}).join(', ')}`,
        )
        .join('\n')}`,
    );
  }
  return validatedConfig;
}
