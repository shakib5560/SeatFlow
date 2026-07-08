import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { ApplicationLogger } from './common/logger/logger.service';

async function bootstrap() {
  // Buffer logs during startup to ensure custom logger is hooked up first
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Retrieve custom ApplicationLogger from Nest DI container
  const logger = app.get(ApplicationLogger);
  app.useLogger(logger);

  // Enable graceful shutdown hooks for SIGINT/SIGTERM
  app.enableShutdownHooks();

  // 1. Configure Helmet for security headers
  app.use(helmet());

  // 2. Configure Compression middleware
  app.use(compression());

  // 3. Configure CORS
  app.enableCors({
    origin: '*', // Adjust to specific domains in a production environment
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // 4. Configure ValidationPipe globally with strict parameters
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: true, // Stop processing validations on the first failure
    }),
  );

  // 5. Configure global route prefix
  app.setGlobalPrefix('api');

  // Custom middleware to redirect root path to Swagger docs and handle favicon
  app.use((req: any, res: any, next: any) => {
    if (req.path === '/' || req.path === '') {
      return res.redirect('/api-docs');
    }
    if (req.path === '/favicon.ico') {
      return res.status(204).end();
    }
    next();
  });

  // 6. Configure Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Event Booking System API')
    .setDescription(
      'Production-ready Event Booking System API. Responses are wrapped in a standard JSON envelope ' +
        'and logs are correlated via request correlation IDs.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document);

  // 7. Get port from ConfigService
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 3000;

  await app.listen(port, '0.0.0.0');
  logger.log(`Application is running on: http://localhost:${port}/api`);
  logger.log(
    `Swagger documentation is available at: http://localhost:${port}/api-docs`,
  );
}
bootstrap().catch((err: unknown) => {
  console.error('Application failed to start:', err);
  process.exit(1);
});
