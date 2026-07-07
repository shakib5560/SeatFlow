import { Module } from '@nestjs/common';
import { AdminBookingsController } from './controllers/admin-bookings.controller';
import { AdminBookingsService } from './services/admin-bookings.service';
import { AdminBookingsRepository } from './repositories/admin-bookings.repository';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * AdminModule — admin booking approval workflow module.
 *
 * Wires:
 *   Controller → Service → Repository → PrismaService
 *
 * PrismaModule is imported to make PrismaService available via DI.
 * RedisModule is NOT imported here — the admin workflow does NOT use Redis caching
 * to ensure admins always see live data from the database.
 *
 * Future: add AuthModule import and attach AdminAuthGuard when RBAC is implemented.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AdminBookingsController],
  providers: [AdminBookingsService, AdminBookingsRepository],
  exports: [AdminBookingsService],
})
export class AdminModule {}
