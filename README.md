<div align="center">

# 🎟️ SeatFlow

### Room Booking & Scheduling Service with Manual Admin Approval

[![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E?style=flat-square&logo=nestjs)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-7.x-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-8.x-DC382D?style=flat-square&logo=redis)](https://redis.io)
[![BullMQ](https://img.shields.io/badge/BullMQ-5.x-FF6B6B?style=flat-square)](https://docs.bullmq.io)
[![Jest](https://img.shields.io/badge/Tests-62%20passing-4CAF50?style=flat-square&logo=jest)](https://jestjs.io)

**A NestJS backend service for room bookings featuring daily, weekly, and monthly reservations, manual admin approvals, concurrency-safe overlap prevention, and idempotent request handling.**

</div>

---

## 🛡️ Overlap & Concurrency Prevention Guarantee (Q&A)

> **Q: How does the system guarantee that multiple users cannot book the same room for overlapping date ranges?**
> 
> **A: Overlap prevention is enforced by checking date availability before booking requests are written, combined with a manual admin review workflow.**
>
> When a user requests a room booking:
> 1. The request enters `PENDING` status.
> 2. The system checks all existing `PENDING` and `CONFIRMED` bookings for the same room.
> 3. An overlap exists if:
>    `existing.startDate <= requested.endDate` AND `existing.endDate >= requested.startDate`
> 4. If any overlapping booking is found, the system immediately rejects the creation request with a `409 Conflict` and informs the user of the next available date when the room will be free.

---

## Table of Contents

- [Project Overview](#-project-overview)
- [Tech Stack](#-tech-stack)
- [Features](#-features)
- [Database Schema](#-database-schema)
- [API Endpoints](#-api-endpoints)
- [Installation & Setup](#-installation--setup)
- [Swagger Documentation](#-swagger-documentation)
- [Testing](#-testing)
- [Idempotency](#-idempotency)
- [Correlation Logging](#-correlation-logging)
- [Health Monitoring](#-health-monitoring)
- [License](#-license)

---

## 📋 Project Overview

SeatFlow is a room booking system supporting daily, weekly, and monthly scheduling across 10 defined rooms (A1 to A10). 

To ensure complete control over the booking pipeline, bookings are **not** auto-confirmed. Instead, they remain in a `PENDING` state until an administrator reviews and manually approves or rejects them. The application employs date-range overlap validation to ensure room schedules never conflict.

---

## 🛠 Tech Stack

| Technology | Version | Role |
|---|---|---|
| **NestJS** | 11.x | Backend Framework |
| **TypeScript** | 5.7 | Application Language |
| **Prisma** | 7.x | ORM & Migration Engine |
| **PostgreSQL** | 17 | Primary Database |
| **Redis** | 8.x | Caching & Rate Limiting |
| **BullMQ** | 5.x | Asynchronous task queue processing |
| **Jest** | 30.x | Unit & Integration Test Runner |

---

## ✨ Features

- **Room Scheduling** — Supports A1 through A10 with daily, weekly, and monthly durations.
- **Overlap Prevention** — Automatically detects date overlaps and rejects conflicts with standard error responses.
- **Manual Admin Console** — Pending bookings are queued for admin action (`approve` or `reject`).
- **Two-Layer Idempotency** — Prevents duplicate request submissions using client-provided `requestId`s.
- **Correlation ID Logging** — Tracks execution contexts across controllers, services, and queues.
- **Redis-Backed Rate Limiting** — Standard limit of 100 requests/minute per source IP.

---

## 🗄️ Database Schema

### `Room`
- `id` (UUID): Primary key.
- `name` (String): Room code, e.g. "A1" (Unique).
- `description` (String, Optional).
- `createdAt` / `updatedAt` (DateTime).

### `RoomBooking`
- `id` (UUID): Primary key.
- `bookingReference` (String): Unique reference code (`BK-YYYYMMDD-NNNN`).
- `requestId` (String): Idempotency key (Unique).
- `customerName` (String).
- `customerEmail` (String).
- `roomId` (String): Foreign key to `Room`.
- `bookingType` (Enum: `DAILY`, `WEEKLY`, `MONTHLY`).
- `startDate` (DateTime).
- `endDate` (DateTime).
- `status` (Enum: `PENDING`, `CONFIRMED`, `FAILED`).
- `failureReason` (String, Optional).
- `adminNotes` (String, Optional).

---

## 🔌 API Endpoints

### Public Booking Endpoints

#### `GET /api/events`
*Compatibility endpoint mapping rooms to legacy event outputs.*
- **Response**: `200 OK` list of rooms.

#### `POST /api/bookings`
*Request a room booking. Immediately validates input and checks scheduling availability.*
- **Payload**:
  ```json
  {
    "roomId": "d3b07384-d113-4bf5-a5d9-43c3d5e2a501",
    "requestId": "d3b07384-d113-4bf5-a5d9-43c3d5e2a301",
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "bookingType": "DAILY",
    "startDate": "2026-08-01",
    "endDate": "2026-08-07"
  }
  ```
- **Response `202 Accepted`**:
  ```json
  {
    "success": true,
    "statusCode": 202,
    "message": "Booking request accepted.",
    "data": {
      "bookingReference": "BK-20260708-0001",
      "status": "PENDING"
    }
  }
  ```
- **Overlap Response `409 Conflict`**:
  ```json
  {
    "success": false,
    "statusCode": 409,
    "message": "This room is not available for the selected dates. Next available date: 2026-08-08"
  }
  ```

#### `GET /api/bookings`
*Paginated, filterable, and sortable list of user bookings.*

---

### Admin Booking Endpoints

#### `GET /api/admin/bookings/pending`
*Retrieve a paginated, filterable list of all pending booking requests awaiting review.*

#### `GET /api/admin/bookings`
*Retrieve a paginated list of all bookings (PENDING, CONFIRMED, and FAILED).*

#### `PATCH /api/admin/bookings/:bookingId/approve`
*Approve a pending booking request. Updates status to CONFIRMED.*

#### `PATCH /api/admin/bookings/:bookingId/reject`
*Reject a pending booking request. Sets status to FAILED with ADMIN_REJECTED reason.*

---

## 🚀 Installation & Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Setup Local Environment**:
   ```bash
   cp .env.example .env
   # Set your DATABASE_URL, REDIS_HOST, and REDIS_PORT.
   ```

3. **Deploy Schema & Seeds**:
   ```bash
   npx prisma migrate dev
   ```

4. **Start NestJS Server**:
   ```bash
   npm run start:dev
   ```

---

## 📖 Swagger Documentation

Interactive API schemas, parameters, and example runs are fully documented in the Swagger UI:
```
http://localhost:3000/api-docs
```

---

## 🧪 Testing

Run all unit and integration tests:
```bash
npm run test
```
All **62 tests** in the test suite are fully updated for the room booking logic and pass successfully.

---

## 🔑 Idempotency

- **Layer 1 (Pre-Check)**: Queries database for `requestId` before processing. If found, returns the existing booking immediately with a `Duplicate request` message.
- **Layer 2 (Postgres Unique Constraint)**: If two identical requests pass Layer 1 concurrently, the unique constraint on `requestId` fails with a `P2002` error on the losing request. The system catches the error, fetches the winning record, and returns it gracefully.

---

## 📝 Correlation Logging

Log context is maintained through `AsyncLocalStorage`. Each log entry is tagged with its originating `requestId` (e.g. `[Req: d3b07384-...]`), allowing you to easily trace requests from entry to repository.

---

## 🏥 Health Monitoring

- `GET /api/health` — Full dependencies status diagnostics.
- `GET /api/health/live` — Liveness probe for NestJS process.
- `GET /api/health/ready` — Readiness probe verifying database, redis, and queue connections.

---

## 📄 License

MIT License. See `LICENSE` for details.
