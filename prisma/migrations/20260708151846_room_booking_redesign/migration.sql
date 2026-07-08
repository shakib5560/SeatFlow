/*
  Warnings:

  - You are about to drop the `bookings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `events` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_eventId_fkey";

-- DropTable
DROP TABLE "bookings";

-- DropTable
DROP TABLE "events";

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_bookings" (
    "id" TEXT NOT NULL,
    "bookingReference" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "bookingType" "BookingType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_name_key" ON "rooms"("name");

-- CreateIndex
CREATE INDEX "rooms_name_idx" ON "rooms"("name");

-- CreateIndex
CREATE UNIQUE INDEX "room_bookings_bookingReference_key" ON "room_bookings"("bookingReference");

-- CreateIndex
CREATE UNIQUE INDEX "room_bookings_requestId_key" ON "room_bookings"("requestId");

-- CreateIndex
CREATE INDEX "room_bookings_roomId_idx" ON "room_bookings"("roomId");

-- CreateIndex
CREATE INDEX "room_bookings_status_idx" ON "room_bookings"("status");

-- CreateIndex
CREATE INDEX "room_bookings_startDate_idx" ON "room_bookings"("startDate");

-- CreateIndex
CREATE INDEX "room_bookings_endDate_idx" ON "room_bookings"("endDate");

-- CreateIndex
CREATE INDEX "room_bookings_customerEmail_idx" ON "room_bookings"("customerEmail");

-- CreateIndex
CREATE INDEX "room_bookings_createdAt_idx" ON "room_bookings"("createdAt");

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
