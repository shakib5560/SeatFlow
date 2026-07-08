import { Module } from '@nestjs/common';
import { RoomsController } from './controllers/rooms.controller';
import { RoomsService } from './services/rooms.service';
import { RoomsRepository } from './repositories/rooms.repository';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomsRepository],
  exports: [RoomsService, RoomsRepository],
})
export class RoomsModule {}
