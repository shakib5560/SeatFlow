import { Module } from '@nestjs/common';
import { BookingsController } from './controllers/bookings.controller';
import { BookingsService } from './services/bookings.service';
import { BookingsRepository } from './repositories/bookings.repository';
import { BookingReferenceService } from './services/booking-reference.service';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [PrismaModule, QueueModule, RoomsModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsRepository, BookingReferenceService],
  exports: [BookingsService, BookingsRepository, BookingReferenceService],
})
export class BookingsModule {}
