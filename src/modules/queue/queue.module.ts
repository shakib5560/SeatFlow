import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BOOKING_QUEUE_NAME } from './queue.constants';

/**
 * QueueModule registers the BullMQ queue with Redis configuration sourced
 * from ConfigService. It exports BullModule so worker and health modules can
 * inject the queue using @InjectQueue(BOOKING_QUEUE_NAME).
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password'),
          db: configService.get<number>('redis.db'),
          maxRetriesPerRequest: null, // BullMQ requires this to be null
        },
      }),
    }),
    BullModule.registerQueue({
      name: BOOKING_QUEUE_NAME,
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
