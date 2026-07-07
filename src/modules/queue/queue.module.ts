import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BOOKING_QUEUE_NAME } from './queue.constants';
import { BookingProducer } from './producers/booking.producer';
import { QueueService } from './queue.service';

/**
 * QueueModule registers the BullMQ queue with Redis configuration sourced
 * from ConfigService. It exports the queue so producer services in other
 * modules can inject it using @InjectQueue(BOOKING_QUEUE_NAME).
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
  providers: [BookingProducer, QueueService],
  exports: [BullModule, BookingProducer, QueueService],
})
export class QueueModule {}
