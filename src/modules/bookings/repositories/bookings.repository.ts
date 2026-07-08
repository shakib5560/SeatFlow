import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RoomBooking, Room, BookingStatus, Prisma, BookingType } from '@prisma/client';
import { BookingQueryDto, BookingSortBy, SortOrder } from '../dto/booking-query.dto';

@Injectable()
export class BookingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search for booking by requestId (idempotency key).
   */
  async findByRequestId(requestId: string): Promise<RoomBooking | null> {
    return this.prisma.roomBooking.findUnique({
      where: { requestId },
      include: { room: true },
    });
  }

  /**
   * Find booking by its unique reference code.
   */
  async findByBookingReference(bookingReference: string): Promise<RoomBooking | null> {
    return this.prisma.roomBooking.findUnique({
      where: { bookingReference },
      include: { room: true },
    });
  }

  /**
   * Find booking by unique ID.
   */
  async findById(id: string): Promise<RoomBooking | null> {
    return this.prisma.roomBooking.findUnique({
      where: { id },
      include: { room: true },
    });
  }

  /**
   * Create a new booking in PENDING state.
   * Assumes dates are already normalized to UTC midnight.
   */
  async createPendingBooking(data: {
    roomId: string;
    bookingReference: string;
    requestId: string;
    customerName: string;
    customerEmail: string;
    bookingType: BookingType;
    startDate: Date;
    endDate: Date;
  }): Promise<RoomBooking> {
    return this.prisma.roomBooking.create({
      data: {
        ...data,
        status: BookingStatus.PENDING,
      },
      include: { room: true },
    });
  }

  /**
   * Check for overlapping PENDING/CONFIRMED bookings for a room.
   * Overlap definition: existing.startDate <= requested.endDate AND existing.endDate >= requested.startDate
   * Run inside a lock in the service layer if needed, or using transactional SELECT FOR UPDATE.
   */
  async findOverlapping(
    roomId: string,
    startDate: Date,
    endDate: Date,
    excludeBookingId?: string,
  ): Promise<RoomBooking[]> {
    const where: Prisma.RoomBookingWhereInput = {
      roomId,
      status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    };

    if (excludeBookingId) {
      where.NOT = { id: excludeBookingId };
    }

    return this.prisma.roomBooking.findMany({
      where,
      orderBy: { startDate: 'asc' },
    });
  }

  /**
   * Paginated queries with dynamic filtering, searching, and sorting.
   * Runs findMany + count in a single transaction for efficiency.
   */
  async findAllPaginated(query: BookingQueryDto): Promise<{
    data: (RoomBooking & { room: { id: string; name: string } })[];
    totalItems: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sortBy = query.sortBy ?? BookingSortBy.CREATED_AT;
    const order = (query.order ?? SortOrder.DESC).toLowerCase() as Prisma.SortOrder;

    // ── Build WHERE clause ────────────────────────────────────────────────────
    const where: Prisma.RoomBookingWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.roomId) where.roomId = query.roomId;

    if (query.customerEmail) {
      where.customerEmail = { contains: query.customerEmail, mode: 'insensitive' };
    }
    if (query.bookingReference) {
      where.bookingReference = { contains: query.bookingReference, mode: 'insensitive' };
    }

    // ── Build ORDER BY clause ─────────────────────────────────────────────────
    let orderBy: Prisma.RoomBookingOrderByWithRelationInput;
    if (sortBy === BookingSortBy.START_DATE) {
      orderBy = { startDate: order };
    } else {
      orderBy = { [sortBy]: order };
    }

    const skip = (page - 1) * limit;

    // ── Run findMany + count atomically ───────────────────────────────────────
    const [data, totalItems] = await this.prisma.$transaction([
      this.prisma.roomBooking.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          bookingReference: true,
          customerName: true,
          customerEmail: true,
          bookingType: true,
          startDate: true,
          endDate: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          room: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.roomBooking.count({ where }),
    ]);

    return {
      data: data as (RoomBooking & { room: { id: string; name: string } })[],
      totalItems,
    };
  }

  /**
   * Retrieve all bookings with room details.
   */
  async findAll(): Promise<RoomBooking[]> {
    return this.prisma.roomBooking.findMany({
      include: { room: true },
    });
  }

  /**
   * Find bookings associated with a specific room.
   */
  async findByRoomId(roomId: string): Promise<RoomBooking[]> {
    return this.prisma.roomBooking.findMany({
      where: { roomId },
      include: { room: true },
    });
  }

  /**
   * Find bookings associated with a specific customer email.
   */
  async findByCustomerEmail(customerEmail: string): Promise<RoomBooking[]> {
    return this.prisma.roomBooking.findMany({
      where: { customerEmail },
      include: { room: true },
    });
  }

  /**
   * Delete a booking by ID.
   */
  async delete(id: string): Promise<RoomBooking> {
    return this.prisma.roomBooking.delete({
      where: { id },
    });
  }
}
