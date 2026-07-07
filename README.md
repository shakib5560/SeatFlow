<div align="center">

# 🎟️ SeatFlow

### Production-Ready Event Booking System

[![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E?style=flat-square&logo=nestjs)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-7.x-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-8.x-DC382D?style=flat-square&logo=redis)](https://redis.io)
[![BullMQ](https://img.shields.io/badge/BullMQ-5.x-FF6B6B?style=flat-square)](https://docs.bullmq.io)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker)](https://www.docker.com)
[![Jest](https://img.shields.io/badge/Tests-63%20passing-4CAF50?style=flat-square&logo=jest)](https://jestjs.io)

**A backend service for managing event bookings with asynchronous queue processing, row-level locking for concurrency safety, and two-layer idempotency guarantees.**

</div>

---

## 🛡️ Concurrency & Overbooking Prevention Guarantee (Q&A)

> **Q: How is overbooking absolutely prevented? If many concurrent requests arrive at the same time, how do you guarantee that the total number of confirmed seats will never exceed the available seats?**
> 
> **A: We guarantee that overbooking is structurally impossible through PostgreSQL Exclusive Row-Level Locking (`SELECT ... FOR UPDATE`) combined with Atomic Database Transactions.**
>
> Under high concurrency (e.g., thousands of simultaneous requests for the last 5 seats), a naive "read-then-write" approach suffers from the **Lost Update** race condition where multiple threads read the same stale capacity and check out successfully.
> 
> SeatFlow prevents this at the database level:
> 1. **Exclusive Row-Level Lock (`SELECT FOR UPDATE`):** When the async worker processes a booking, it enters a transaction and executes:
>    ```sql
>    SELECT "remainingSeats" FROM "events" WHERE "id" = $eventId FOR UPDATE;
>    ```
>    This locks the target event row exclusively. Any other concurrent transaction attempting to read/update this specific event row is **blocked at the database level** and queued by PostgreSQL.
> 2. **Serialised execution:** Worker B cannot read the remaining seats until Worker A finishes checking, updates the seats, and commits its transaction. Once committed, Worker B reads the *fresh, updated* seat count.
> 3. **Atomic check & write:** If seats are available, the worker decrements the count and confirms the booking. If seats are sold out, the booking is marked `FAILED` with `FailureReason.SOLD_OUT`. This entire sequence is run inside a single Prisma `$transaction`. If any step fails, PostgreSQL performs an automatic rollback, ensuring no partial state is written.
>
> This design ensures that **total confirmed seats will never exceed available seats**, regardless of request volume.

---

## Table of Contents

- [🛡️ Concurrency & Overbooking Prevention Guarantee (Q&A)](#️-concurrency--overbooking-prevention-guarantee-qa)
- [Project Overview](#-project-overview)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Folder Structure](#-folder-structure)
- [Features](#-features)
- [Database Schema](#-database-schema)
- [API Endpoints](#-api-endpoints)
- [Environment Variables](#-environment-variables)
- [Installation & Setup](#-installation--setup)
- [Running the Worker](#-running-the-worker)
- [Swagger Documentation](#-swagger-documentation)
- [Testing](#-testing)
- [Concurrency Protection](#-concurrency-protection)
- [Idempotency](#-idempotency)
- [Logging](#-logging)
- [Health Monitoring](#-health-monitoring)
- [Deployment](#-deployment)
- [Future Improvements](#-future-improvements)
- [Assumptions](#-assumptions)
- [License](#-license)

---

## 📋 Project Overview

SeatFlow is a backend API for managing event seat bookings at scale. It is designed to handle high-concurrency scenarios where many clients may attempt to book the last available seats simultaneously. The system guarantees correctness through PostgreSQL row-level locking and BullMQ-backed asynchronous processing.

### Purpose

The core challenge this system solves is the **seat overbooking problem**: when multiple clients race to claim limited seats, a naive implementation would allow more bookings than there are seats. SeatFlow eliminates this risk entirely at the database level.

### Key Features

- **Asynchronous booking processing** — `POST /bookings` returns `202 Accepted` immediately; actual seat confirmation happens in the background via BullMQ
- **Overbooking prevention** — PostgreSQL `SELECT FOR UPDATE` row-level locking inside a serialized transaction ensures seats are never double-allocated
- **Two-layer idempotency** — duplicate `requestId`s are detected before and after DB insert; clients always get a safe, deterministic response
- **Graceful degradation** — Redis rate limiting and health checks fail open, ensuring availability is prioritised over strict enforcement
- **Structured correlation logging** — every HTTP request and worker job carries a correlated `requestId` through the entire call chain

### Asynchronous Processing Flow

When a client creates a booking:

1. The API validates the request and checks for duplicate `requestId`s (idempotency).
2. A `PENDING` booking record is written to PostgreSQL.
3. A BullMQ job is enqueued with the `bookingId` as payload.
4. The API responds immediately with `202 Accepted` and a `bookingReference`.
5. In the background, the BullMQ worker picks up the job, acquires a `SELECT FOR UPDATE` lock on the event row, checks seat availability, and atomically confirms or fails the booking.
6. Clients poll `GET /bookings` to observe the final `CONFIRMED` or `FAILED` status.

---

## 🛠 Tech Stack

| Technology | Version | Role |
|---|---|---|
| **NestJS** | 11.x | Application framework — modules, DI, lifecycle |
| **TypeScript** | 5.7 | Language — strict typing throughout |
| **Prisma** | 7.x | ORM and migration tool |
| **PostgreSQL** | 17 | Primary data store (via Neon cloud or local) |
| **Redis** | 8.x | BullMQ job queue backend + application cache |
| **BullMQ** | 5.x | Distributed job queue for async booking processing |
| **Docker** | 27.x | Containerisation for app and Redis |
| **Swagger (OpenAPI)** | 11.x | Auto-generated interactive API documentation |
| **Jest** | 30.x | Unit, integration, and E2E test runner |
| **Helmet** | 8.x | HTTP security headers middleware |
| **compression** | 1.x | HTTP response compression |
| **ioredis** | 5.x | Redis client with connection pooling |

---

## 🏗️ Architecture

### HTTP Request Flow

```
Client
  │
  ▼
[ Rate Limit Middleware ]  ← Redis-backed IP throttling (100 req/min)
  │
  ▼
[ Request ID Middleware ]  ← Attaches X-Request-ID correlation header
  │
  ▼
[ Controller ]             ← Input validation via class-validator DTOs
  │
  ▼
[ Service ]                ← Business logic, idempotency, cache management
  │
  ▼
[ Repository ]             ← Prisma queries, encapsulates all DB access
  │
  ▼
[ Prisma / pg Pool ]       ← Connection pool to PostgreSQL
  │
  ▼
[ PostgreSQL ]             ← Source of truth; enforces constraints & locks
```

### Asynchronous Booking Pipeline

```
Client
  │
  │  POST /api/bookings
  ▼
[ BookingsController ]
  │
  ▼
[ BookingsService ]
  │  1. Idempotency pre-check (Layer 1)
  │  2. Create PENDING booking
  │  3. Enqueue BullMQ job
  │
  ▼
[ BookingProducer ] ──────────────────► [ Redis / BullMQ Queue ]
  │                                              │
  │  202 Accepted (immediate)                   │  async
  ▼                                              ▼
Client receives bookingReference       [ BookingWorker.process() ]
                                                 │
                                         [ BookingProcessingService ]
                                                 │
                                                 ▼
                                       [ BookingsRepository ]
                                       .processBookingWithLock()
                                                 │
                                         ┌───────┴──────────┐
                                         │  PostgreSQL Tx    │
                                         │  SELECT FOR UPDATE│  ← Lock event row
                                         │  Check seats      │
                                         │  Decrement seats  │  ← Atomic write
                                         │  UPDATE booking   │  ← CONFIRMED/FAILED
                                         └───────────────────┘
```

### Module Dependency Graph

```
AppModule
├── ConfigModule        — env vars & validation
├── LoggingModule       — ApplicationLogger with correlation IDs
├── PrismaModule        — Prisma client & connection pool
├── RedisModule         — ioredis client, RedisService (cache + rate limit)
├── QueueModule         — BullMQ registration, BookingProducer
├── EventsModule        — GET /events
├── BookingsModule      — POST /bookings, GET /bookings
├── WorkersModule       — BookingWorker, BookingProcessingService
├── HealthModule        — GET /health, /health/live, /health/ready
└── AdminModule         — GET /admin/bookings/pending, PATCH /approve, PATCH /reject
```

---

## 📁 Folder Structure

```
seatflow/
├── prisma/
│   ├── schema.prisma           # Data models, indexes, constraints
│   ├── seed.ts                 # Seed script — 3 sample events
│   └── migrations/             # Auto-generated migration SQL files
│
├── src/
│   ├── main.ts                 # Bootstrap: Helmet, CORS, Swagger, ValidationPipe
│   ├── app.module.ts           # Root module, middleware wiring
│   │
│   ├── common/
│   │   ├── constants/          # Shared constant values
│   │   ├── decorators/         # @ResponseMessage — uniform response envelope
│   │   ├── dto/                # Shared DTO types (pagination, envelope)
│   │   ├── enums/              # Shared enum types
│   │   ├── exceptions/         # Custom exception types
│   │   ├── filters/            # Global exception filter → standardised errors
│   │   ├── interceptors/       # TransformInterceptor → wraps responses in {success, data}
│   │   ├── interfaces/         # Shared TypeScript interfaces (JobPayload, etc.)
│   │   ├── logger/
│   │   │   ├── logger.service.ts       # Correlation-ID-aware ConsoleLogger
│   │   │   └── correlation.store.ts    # AsyncLocalStorage correlation context
│   │   ├── middlewares/
│   │   │   ├── rate-limit.middleware.ts  # Redis-backed IP rate limiting
│   │   │   └── request-id.middleware.ts  # X-Request-ID injection
│   │   ├── types/              # TypeScript utility types
│   │   └── utils/              # Pure utility functions
│   │
│   ├── config/
│   │   ├── configuration.ts    # Config factory (maps env vars to typed config)
│   │   └── env.validation.ts   # Joi/class-validator env schema
│   │
│   ├── infrastructure/
│   │   └── redis/
│   │       ├── redis.module.ts         # RedisModule with ioredis factory
│   │       ├── redis.provider.ts       # ioredis client setup & event listeners
│   │       ├── redis.service.ts        # remember(), invalidate(), increment(), expire()
│   │       └── redis.constants.ts      # TTL constants (SHORT, MEDIUM, DAY)
│   │
│   └── modules/
│       ├── prisma/
│       │   ├── prisma.module.ts        # Global PrismaModule
│       │   └── prisma.service.ts       # PrismaClient with lifecycle hooks
│       │
│       ├── events/
│       │   ├── controllers/            # GET /api/events
│       │   ├── dto/                    # QueryEventsDto
│       │   ├── repositories/           # EventsRepository → Prisma queries
│       │   ├── responses/              # EventResponseDto
│       │   └── services/               # EventsService
│       │
│       ├── bookings/
│       │   ├── controllers/            # POST /api/bookings, GET /api/bookings
│       │   ├── dto/                    # CreateBookingDto, BookingQueryDto
│       │   ├── repositories/           # BookingsRepository — all DB access incl. locking
│       │   ├── responses/              # BookingResponseDto, PaginatedBookingsDto
│       │   └── services/
│       │       ├── bookings.service.ts           # Core booking creation + idempotency
│       │       └── booking-reference.service.ts  # Unique reference generator
│       │
│       ├── queue/
│       │   ├── queue.module.ts         # BullMQ registration with ConfigService
│       │   ├── queue.constants.ts      # BOOKING_QUEUE_NAME, BOOKING_JOB_NAME
│       │   ├── queue.service.ts        # Queue introspection utilities
│       │   └── producers/
│       │       └── booking.producer.ts # enqueueBooking() — 3 attempts, exponential backoff
│       │
│       ├── workers/
│       │   ├── booking.worker.ts       # @Processor — thin shell, delegates to service
│       │   ├── workers.module.ts
│       │   ├── constants/
│       │   │   └── failure-reason.constants.ts  # SOLD_OUT, EVENT_NOT_FOUND, UNKNOWN_ERROR
│       │   └── services/
│       │       └── booking-processing.service.ts # Core processing pipeline
│       │
│       └── health/
│           ├── controllers/            # GET /api/health, /live, /ready
│           ├── responses/              # HealthResponseDto
│           └── services/
│               ├── health.service.ts           # Aggregates all health checks
│               ├── database-health.service.ts  # DB ping latency
│               ├── redis-health.service.ts     # Redis PING latency
│               ├── queue-health.service.ts     # BullMQ queue depth
│               └── metrics.service.ts          # Memory and CPU metrics
│
├── test/
│   ├── e2e/                    # End-to-end tests (supertest against live app)
│   ├── integration/            # Concurrency & idempotency integration tests
│   └── mocks/                  # Shared test mocks (Redis, etc.)
│
├── Dockerfile                  # Multi-stage production Docker build
├── Dockerfile.dev              # Development Docker build (watch mode)
├── docker-compose.yml          # Production stack (Redis + App)
├── docker-compose.dev.yml      # Development stack
└── .env.example                # Environment variable template
```

---

## ✨ Features

### Event Management
Query upcoming events with remaining seat counts. Events are ordered chronologically. Backed by an index on `eventDate` for efficient sorted queries.

### Booking API
- **Create booking** (`POST /bookings`) — validates input, checks idempotency, creates a `PENDING` booking, and enqueues a processing job in one synchronous flow. Returns `202 Accepted` immediately.
- **List bookings** (`GET /bookings`) — paginated, filterable by `status`, `eventId`, `customerEmail`, and `bookingReference`. Sortable by `createdAt`, `eventDate`, `customerName`, or `status`.

### Queue Processing (BullMQ)
Jobs are enqueued with:
- **3 retry attempts** with **exponential backoff** (1s → 2s → 4s) for transient failures
- **removeOnComplete: true** — completed jobs are purged to keep Redis memory clean
- **removeOnFail: { count: 100 }** — last 100 failed jobs retained for debugging

### Redis Caching
`RedisService.remember()` implements a cache-aside pattern: fetch from cache first; on miss, call the factory function and populate the cache with a TTL. Cache is **invalidated** immediately on booking creation to prevent stale reads.

### Concurrency Protection
PostgreSQL `SELECT FOR UPDATE` inside an explicit transaction prevents race conditions. See [Concurrency Protection](#-concurrency-protection) for the full technical breakdown.

### Idempotency
Two-layer idempotency using `requestId` (UUID v4) as a unique key. See [Idempotency](#-idempotency) for the full technical breakdown.

### Health Checks
Three endpoints for Kubernetes integration: detailed diagnostics (`/health`), readiness probe (`/health/ready`), and liveness probe (`/health/live`).

### Swagger / OpenAPI
Full interactive documentation available at `/api-docs` with request/response schemas and all error codes documented.

### Validation
Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, and `transform: true`. All unknown fields are stripped; type coercion is applied automatically.

### Logging
Structured correlation-ID logging using Node's `AsyncLocalStorage`. Every log line emitted during a request or worker job is tagged with the originating `requestId`, enabling distributed tracing without an external APM.

### Rate Limiting
Redis-backed IP rate limiting middleware: **100 requests per minute** per IP. Gracefully degrades if Redis is unreachable — the middleware calls `next()` rather than blocking the request.

---

## 🗄️ Database Schema

### Entity: `Event`

| Column | Type | Description |
|---|---|---|
| `id` | `UUID` | Primary key, auto-generated |
| `name` | `String` | Event display name |
| `description` | `String?` | Optional event description |
| `eventDate` | `DateTime` | Scheduled date and time |
| `totalSeats` | `Int` | Immutable capacity set at creation |
| `remainingSeats` | `Int` | Current available seats — decremented atomically on confirmation |
| `price` | `Float` | Ticket price |
| `createdAt` | `DateTime` | Record creation timestamp |
| `updatedAt` | `DateTime` | Auto-updated on any write |

**Index:** `@@index([eventDate])` — supports efficient date-ordered queries.

---

### Entity: `Booking`

| Column | Type | Description |
|---|---|---|
| `id` | `UUID` | Primary key, auto-generated |
| `bookingReference` | `String` | Human-readable unique reference (`@@unique`) |
| `requestId` | `String` | Client idempotency key (`@@unique`) — UUID v4 |
| `customerName` | `String` | Full name of the customer |
| `customerEmail` | `String` | Customer email address |
| `seats` | `Int` | Number of seats requested (min: 1) |
| `status` | `BookingStatus` | `PENDING` → `CONFIRMED` or `FAILED` |
| `failureReason` | `String?` | Populated when status is `FAILED` |
| `eventId` | `String` | Foreign key → `events.id` (cascade delete) |
| `createdAt` | `DateTime` | Record creation timestamp |
| `updatedAt` | `DateTime` | Auto-updated on any write |

**Indexes:**
- `@@index([status])` — filter bookings by status efficiently
- `@@index([eventId])` — fetch all bookings for an event efficiently
- `@@index([createdAt])` — support time-ordered sorting

**Unique Constraints:**
- `bookingReference` — prevents duplicate references
- `requestId` — database-enforced idempotency (Layer 2 safety net)

---

### Relationships

```
Event  1 ──────────────── * Booking
       (one event has many bookings)
       (deleting an event cascades to delete its bookings)
```

### Booking Status Lifecycle

```
         POST /bookings
              │
              ▼
          [ PENDING ]
              │
    ┌─────────┴──────────┐
    │ Worker processes   │
    ▼                    ▼
[ CONFIRMED ]       [ FAILED ]
  seats deducted    failureReason set
                    (SOLD_OUT | EVENT_NOT_FOUND | UNKNOWN_ERROR)
```

---

## 🔌 API Endpoints

All routes are prefixed with `/api`. Responses follow a standard JSON envelope:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Human-readable message",
  "data": { },
  "timestamp": "2026-07-08T00:00:00.000Z"
}
```

---

### `GET /api/events`

Retrieve all upcoming events, sorted chronologically.

**Request**
```http
GET /api/events HTTP/1.1
Host: localhost:3000
```

**Response `200 OK`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Events retrieved successfully.",
  "data": [
    {
      "id": "d3b07384-d113-4bf5-a5d9-43c3d5e2a201",
      "name": "NestJS Masterclass",
      "description": "Advanced NestJS Workshop",
      "eventDate": "2026-08-07T00:00:00.000Z",
      "totalSeats": 100,
      "remainingSeats": 97,
      "price": 1200.00
    }
  ],
  "timestamp": "2026-07-08T01:30:00.000Z"
}
```

---

### `POST /api/bookings`

Create a booking request. Returns `202 Accepted` immediately. Processing is asynchronous.

**Request**
```http
POST /api/bookings HTTP/1.1
Content-Type: application/json

{
  "requestId": "d3b07384-d113-4bf5-a5d9-43c3d5e2a301",
  "eventId": "d3b07384-d113-4bf5-a5d9-43c3d5e2a201",
  "customerName": "Jane Smith",
  "customerEmail": "jane@example.com",
  "seats": 2
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `requestId` | UUID v4 | ✅ | Idempotency key — generate once per booking attempt |
| `eventId` | UUID v4 | ✅ | Target event ID |
| `customerName` | string (2–100) | ✅ | Full name of the customer |
| `customerEmail` | email | ✅ | Contact email |
| `seats` | integer (≥1) | ✅ | Number of seats to book |

**Response `202 Accepted` — New booking**
```json
{
  "success": true,
  "statusCode": 202,
  "message": "Booking request accepted.",
  "data": {
    "bookingReference": "BK-20260708-0001",
    "status": "PENDING"
  },
  "timestamp": "2026-07-08T01:30:00.000Z"
}
```

**Response `202 Accepted` — Duplicate request (idempotent)**
```json
{
  "success": true,
  "statusCode": 202,
  "message": "Booking request accepted.",
  "data": {
    "bookingReference": "BK-20260708-0001",
    "status": "PENDING",
    "message": "Duplicate request. Returning existing booking."
  },
  "timestamp": "2026-07-08T01:30:01.000Z"
}
```

**Error Responses**

| Status | Scenario |
|---|---|
| `400 Bad Request` | Invalid input (missing fields, wrong types, invalid UUID) |
| `404 Not Found` | Event ID does not exist |
| `429 Too Many Requests` | Rate limit exceeded (100 req/min per IP) |
| `503 Service Unavailable` | BullMQ queue is unreachable |

---

### `GET /api/bookings`

Paginated, filterable list of bookings.

**Request**
```http
GET /api/bookings?page=1&limit=10&status=CONFIRMED&sortBy=createdAt&order=DESC HTTP/1.1
```

**Query Parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | Page number |
| `limit` | integer | `10` | Items per page |
| `status` | `PENDING\|CONFIRMED\|FAILED` | — | Filter by booking status |
| `eventId` | UUID | — | Filter by event |
| `customerEmail` | string | — | Partial, case-insensitive email filter |
| `bookingReference` | string | — | Partial, case-insensitive reference filter |
| `sortBy` | `createdAt\|eventDate\|customerName\|status` | `createdAt` | Sort field |
| `order` | `ASC\|DESC` | `DESC` | Sort direction |

**Response `200 OK`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Bookings retrieved successfully.",
  "data": {
    "data": [
      {
        "bookingReference": "BK-20260708-0001",
        "event": { "id": "d3b07384-...", "name": "NestJS Masterclass" },
        "customerName": "Jane Smith",
        "customerEmail": "jane@example.com",
        "seats": 2,
        "status": "CONFIRMED",
        "createdAt": "2026-07-08T01:30:00.000Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 10,
      "totalItems": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  },
  "timestamp": "2026-07-08T01:35:00.000Z"
}
```

---

### Admin API Endpoints

Admins can list pending bookings, retrieve details, approve, or reject pending booking requests.

#### `GET /api/admin/bookings/pending`

Retrieve a paginated, filterable, sortable list of all bookings in `PENDING` status.

**Request**
```http
GET /api/admin/bookings/pending?page=1&limit=10 HTTP/1.1
Host: localhost:3000
```

**Response `200 OK`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Pending bookings retrieved successfully.",
  "data": {
    "data": [
      {
        "bookingId": "d3b07384-d113-4bf5-a5d9-43c3d5e2a499",
        "bookingReference": "BK-20260708-000015",
        "customerName": "John Doe",
        "customerEmail": "john@example.com",
        "event": {
          "id": "d3b07384-d113-4bf5-a5d9-43c3d5e2a201",
          "name": "NestJS Masterclass"
        },
        "requestedSeats": 2,
        "status": "PENDING",
        "createdAt": "2026-07-08T00:00:00.000Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 10,
      "totalItems": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  },
  "timestamp": "2026-07-08T01:30:00.000Z"
}
```

---

#### `GET /api/admin/bookings/:bookingId`

Retrieve full details for any specific booking.

**Request**
```http
GET /api/admin/bookings/d3b07384-d113-4bf5-a5d9-43c3d5e2a499 HTTP/1.1
Host: localhost:3000
```

**Response `200 OK`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking details retrieved successfully.",
  "data": {
    "bookingId": "d3b07384-d113-4bf5-a5d9-43c3d5e2a499",
    "bookingReference": "BK-20260708-000015",
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "event": {
      "id": "d3b07384-d113-4bf5-a5d9-43c3d5e2a201",
      "name": "NestJS Masterclass"
    },
    "requestedSeats": 2,
    "status": "PENDING",
    "failureReason": null,
    "createdAt": "2026-07-08T00:00:00.000Z",
    "updatedAt": "2026-07-08T00:00:00.000Z"
  },
  "timestamp": "2026-07-08T01:30:00.000Z"
}
```

---

#### `PATCH /api/admin/bookings/:bookingId/approve`

Approve a pending booking request. Executes a concurrency-safe PostgreSQL transaction with raw row locking on the `Event` row to deduct seats atomically.

**Request**
```http
PATCH /api/admin/bookings/d3b07384-d113-4bf5-a5d9-43c3d5e2a499/approve HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "reason": "Verified and approved.",
  "notes": "VIP Client."
}
```

**Response `200 OK` — Success**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking approved successfully.",
  "data": {
    "bookingReference": "BK-20260708-000015",
    "status": "CONFIRMED",
    "failureReason": null,
    "updatedAt": "2026-07-08T01:30:00.000Z"
  },
  "timestamp": "2026-07-08T01:30:00.000Z"
}
```

**Error Responses**
* `409 Conflict`: If the booking is already processed (status is `CONFIRMED` or `FAILED`), or if event capacity is exhausted (`SOLD_OUT`).
* `404 Not Found`: Booking ID does not exist.

---

#### `PATCH /api/admin/bookings/:bookingId/reject`

Reject a pending booking request. Updates the booking status to `FAILED` with `ADMIN_REJECTED` reason without modifying event seats.

**Request**
```http
PATCH /api/admin/bookings/d3b07384-d113-4bf5-a5d9-43c3d5e2a499/reject HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "reason": "Invalid email formatting."
}
```

**Response `200 OK` — Success**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking rejected successfully.",
  "data": {
    "bookingReference": "BK-20260708-000015",
    "status": "FAILED",
    "failureReason": "ADMIN_REJECTED",
    "updatedAt": "2026-07-08T01:30:00.000Z"
  },
  "timestamp": "2026-07-08T01:30:00.000Z"
}
```

**Error Responses**
* `409 Conflict`: If the booking is already processed (status is `CONFIRMED` or `FAILED`).
* `404 Not Found`: Booking ID does not exist.

---

### `GET /api/health`

Detailed system health diagnostics including latency metrics for all dependencies.

**Response `200 OK`**
```json
{
  "status": "UP",
  "timestamp": "2026-07-08T01:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production",
  "nodeVersion": "v22.x.x",
  "metrics": {
    "memory": { "heapUsed": "45 MB", "heapTotal": "68 MB", "rss": "92 MB" },
    "cpu": { "user": 12345, "system": 6789 }
  },
  "services": {
    "database": { "status": "UP", "latency": "3ms" },
    "redis":    { "status": "UP", "latency": "1ms" },
    "queue":    { "status": "UP", "waiting": 0, "active": 0, "failed": 0 }
  }
}
```

---

### `GET /api/health/live`

Kubernetes **liveness probe**. Checks only that the Node.js process is running. No dependency checks — responds immediately.

```
HTTP 200 OK
LIVENESS_UP
```

---

### `GET /api/health/ready`

Kubernetes **readiness probe**. Verifies that PostgreSQL, Redis, and BullMQ are all reachable before admitting traffic.

```
HTTP 200 OK       → READY      (all dependencies healthy)
HTTP 503          → NOT_READY  (one or more dependencies are down)
```

---

## 🔐 Environment Variables

Copy `.env.example` to `.env` and populate the values:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string. Format: `postgresql://user:pass@host:5432/dbname?sslmode=require` |
| `REDIS_HOST` | ✅ | `localhost` | Redis server hostname |
| `REDIS_PORT` | ✅ | `6379` | Redis server port |
| `REDIS_PASSWORD` | — | — | Redis `requirepass` value (leave empty for local dev) |
| `REDIS_DB` | — | `0` | Redis logical database index |
| `REDIS_KEY_PREFIX` | — | `seatflow:` | Namespace prefix for all Redis keys |
| `PORT` | — | `3000` | HTTP server listening port |

> **Production Note:** Never commit your `.env` file. It is listed in `.dockerignore` and `.gitignore`.

---

## 🚀 Installation & Setup

### Prerequisites

- Node.js ≥ 22.x
- npm ≥ 10.x
- Docker & Docker Compose (for containerised setup)
- A running PostgreSQL instance (or [Neon](https://neon.tech) cloud database)
- A running Redis instance

---

### 1. Install Dependencies

```bash
npm install
```

---

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL, REDIS_HOST, REDIS_PORT, etc.
```

---

### 3. Run Prisma Migration

Apply the schema to your database:

```bash
npx prisma migrate deploy
```

For local development with migration history:

```bash
npx prisma migrate dev --name init
```

---

### 4. Generate Prisma Client

```bash
npm run prisma:generate
```

---

### 5. Seed the Database

Populate the database with 3 sample events (NestJS Masterclass, React Summit, AI Conference):

```bash
npx prisma db seed
```

---

### 6. Start Redis

**Option A — Docker (recommended)**
```bash
docker run -d \
  --name seatflow_redis \
  -p 6379:6379 \
  redis:8-alpine \
  redis-server --appendonly yes
```

**Option B — Local Redis**
```bash
redis-server
```

---

### 7. Run the Application

**Development (watch mode)**
```bash
npm run start:dev
```

**Production (compiled)**
```bash
npm run build
npm run start:prod
```

The API is available at `http://localhost:3000/api`.

---

### 8. Docker Full Stack

Start the entire production stack (Redis + App):

```bash
docker compose up -d
```

Check logs:

```bash
docker compose logs -f app
```

Stop and clean up:

```bash
docker compose down          # Stop services
docker compose down -v       # Stop and remove Redis data volume
```

> **Note:** The production `docker-compose.yml` assumes `DATABASE_URL` is provided via `.env` pointing to an external PostgreSQL instance (e.g. Neon). The compose file only manages Redis locally.

---

## ⚙️ Running the Worker

The BullMQ worker is **co-located** within the same NestJS application. When the application starts, `WorkersModule` registers `BookingWorker` as a `@Processor(BOOKING_QUEUE_NAME)`, and NestJS automatically starts the worker alongside the HTTP server in the same process.

There is no separate worker process to start manually. A single `npm run start:dev` (or `npm run start:prod`) runs both the API server and the queue consumer concurrently.

**Worker behaviour:**
- Listens on the `booking-processing` BullMQ queue
- Each job receives a `bookingId` and optional `requestId` correlation token
- Delegates to `BookingProcessingService.processBooking()` for all business logic
- On validation failures (SOLD_OUT, not-found): marks the booking FAILED, returns cleanly — **no BullMQ retry**
- On transient errors (DB connectivity, network): re-throws — BullMQ retries up to 3 times with exponential backoff
- Graceful shutdown: closes the BullMQ worker connection on `SIGTERM` before the process exits

---

## 📖 Swagger Documentation

Interactive API documentation is available at:

```
http://localhost:3000/api-docs
```

The Swagger UI provides:
- Full request/response schemas for all endpoints
- Try-it-out functionality to test the API directly from the browser
- All possible error responses documented per endpoint
- Bearer auth header support (for future authentication integration)

---

## 🧪 Testing

### Test Suite Overview

| Suite | File Pattern | Count | Description |
|---|---|---|---|
| **Unit** | `src/**/*.spec.ts` | 51 tests | Isolated unit tests with mocked dependencies |
| **Integration** | `test/integration/*.spec.ts` | 8 tests | Concurrency & idempotency with mocked infra |
| **E2E** | `test/e2e/*.spec.ts` | 4 tests | Supertest against live NestJS application |

**Total: 63 tests across 17 test suites — all passing.**

---

### Commands

| Command | Description |
|---|---|
| `npm run test` | Run all unit + integration tests |
| `npm run test:watch` | Watch mode — re-runs on file change |
| `npm run test:cov` | Run tests and generate coverage report |
| `npm run test:e2e` | Run E2E tests |
| `npm run test:debug` | Debug mode with Node inspector |

---

### Coverage Report (latest run)

| Module | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `booking-processing.service.ts` | 100% | 91.7% | 100% | 100% |
| `bookings.controller.ts` | 100% | 78.1% | 100% | 100% |
| `bookings.service.ts` | 84.1% | 78.6% | 33.3% | 84.7% |
| `bookings.repository.ts` | 53.1% | 53.8% | 33.3% | 53.3% |
| `events.controller.ts` | 100% | 83.3% | 100% | 100% |
| `events.repository.ts` | 100% | 75% | 100% | 100% |
| `health.controller.ts` | 100% | 83.3% | 100% | 100% |
| `booking.producer.ts` | 100% | 80% | 100% | 100% |
| `booking.worker.ts` | 81.3% | 44.4% | 75% | 80% |

---

### What is Tested

**Unit tests** cover:
- Service-layer business logic with fully mocked repositories and producers
- Repository methods with mocked Prisma client
- DTO validation edge cases
- Worker job routing and error handling

**Integration tests** verify:
- Duplicate `requestId` returns existing booking without creating a new one
- Race-condition idempotency: P2002 constraint violation triggers recovery path
- 10 concurrent requests with unique `requestId`s each produce exactly one booking and one enqueued job

**E2E tests** verify:
- `GET /api/events` returns the correct response structure
- `GET /api/health/live` returns `LIVENESS_UP`
- `GET /api/health/ready` returns `READY`

---

## 🔒 Concurrency Protection

This is the most critical correctness guarantee in the system. The following explains precisely how overbooking is made structurally impossible.

### The Problem

In a naive system, two workers could both read `remainingSeats = 1`, both decide "seats are available", and both confirm a booking for 1 seat — resulting in `remainingSeats = -1`. This is the classic **lost update** race condition.

### The Solution: `SELECT FOR UPDATE`

The `BookingsRepository.processBookingWithLock()` method is the single point of seat allocation. It executes the following steps inside **one PostgreSQL transaction**:

```sql
-- Step 1: Acquire an exclusive row-level lock on the event
SELECT "remainingSeats"
FROM   "events"
WHERE  "id" = $eventId
FOR UPDATE;

-- Step 2: Check availability using the locked, guaranteed-fresh value
-- If remainingSeats < seats:
--   UPDATE bookings SET status='FAILED', failureReason='SOLD_OUT' WHERE id=$bookingId
-- If remainingSeats >= seats: proceed to step 3

-- Step 3: Deduct seats and confirm atomically
UPDATE "events"
SET    "remainingSeats" = "remainingSeats" - $seats
WHERE  "id" = $eventId;

UPDATE "bookings"
SET    "status" = 'CONFIRMED'
WHERE  "id" = $bookingId;

-- Step 4: COMMIT — lock is released; next waiting worker proceeds
```

### Why This Prevents Overbooking

| Mechanism | Effect |
|---|---|
| **Exclusive row lock** | `FOR UPDATE` blocks any other transaction attempting `FOR UPDATE` on the same event row until the first transaction commits or rolls back |
| **Serialised seat reads** | The second worker reads `remainingSeats` only after the first worker's commit — it sees the post-deduction value, never a stale pre-deduction snapshot |
| **Atomic confirmation** | Seat decrement and booking status update happen in one transaction — there is no observable intermediate state |
| **Automatic rollback** | If the transaction throws for any reason, PostgreSQL rolls back entirely — no partial writes are ever committed |

### Result

It is architecturally impossible for two workers processing bookings for the same event to simultaneously confirm more seats than are available. The database enforces serialisation through its locking mechanism; the application layer only needs to use it correctly — which it does.

---

## 🔑 Idempotency

The system implements **two independent layers** of idempotency to handle all scenarios, including high-concurrency race conditions.

### Layer 1 — Pre-check (Optimistic Fast Path)

Before attempting any write, `BookingsService.create()` queries for the `requestId`:

```typescript
const existingBooking = await this.bookingsRepository.findByRequestId(data.requestId);
if (existingBooking) {
  return {
    bookingReference: existingBooking.bookingReference,
    status: existingBooking.status,
    message: 'Duplicate request. Returning existing booking.',
  };
}
```

This handles the vast majority of duplicate requests with **zero DB writes**. The client receives `202` with the original booking data.

### Layer 2 — Unique Constraint + P2002 Recovery (Race-Condition Safety Net)

In a high-concurrency scenario, two simultaneous requests carrying the same `requestId` may both pass the Layer 1 pre-check (both read null from the DB before either has written). When both attempt to INSERT:

- **One INSERT wins** — PostgreSQL's `@@unique` constraint on `requestId` ensures only one succeeds.
- **One INSERT loses** — the loser receives a `PrismaClientKnownRequestError` with code `P2002`.
- The service **catches the P2002**, fetches the winning booking by `requestId`, and returns it.
- **Both clients receive `202`** with the same `bookingReference`. No error is ever surfaced.

### Worker-Level Idempotency

`BookingProcessingService` checks the booking's current status before entering the locked transaction:

```typescript
if (booking.status === BookingStatus.CONFIRMED || booking.status === BookingStatus.FAILED) {
  this.logger.warn('Booking already in terminal state. Skipping.');
  return; // no-op
}
```

If a BullMQ job is retried after a transient failure that had already successfully confirmed the booking, the worker detects the terminal state and exits cleanly — no double-processing.

### Why `requestId` Must Be UUID v4

The client generates a UUID v4 `requestId` **once per booking attempt** and reuses it for all retries of that same attempt. This ensures the server returns the same response regardless of how many times the request is submitted, making the API safe to use with any retry logic.

---

## 📝 Logging

### Correlation ID Propagation

Every log line produced during a request or worker job includes the originating `requestId`. This is implemented using Node.js `AsyncLocalStorage`, which threads a value through an asynchronous call chain without requiring it to be passed as a function argument:

```
[ RequestIdMiddleware ]
  └─► correlationStorage.run(requestId, handler)
          │
          ├─► BookingsController.create()
          │       └─► BookingsService.create()
          │               └─► BookingsRepository.createPendingBooking()
          │                       └─► BookingProducer.enqueueBooking()
          │
          └─► [All log lines within this chain include [Req: <requestId>]]
```

Workers carry the `requestId` embedded in the job payload, maintaining end-to-end traceability from the original HTTP request through to async processing.

### Log Levels

| Level | Usage |
|---|---|
| `log` | Normal request lifecycle events — received, processing, completed |
| `warn` | Non-fatal conditions — duplicate requests, sold-out bookings, readiness probe failures |
| `error` | Unexpected errors — failed queue enqueue, unhandled exceptions, failed DB updates |
| `debug` | Verbose development-only output |

### Application Log Samples

```
[BookingsController] [Req: d3b07384-...] Incoming request: POST /bookings | requestId=d3b07384-..., eventId=d3b07384-...
[BookingsService]    [Req: d3b07384-...] Pending booking created: reference=BK-20260708-0001
[BookingProducer]    [Req: d3b07384-...] Successfully enqueued job. jobId=42, bookingId=bk-uuid-...
[BookingWorker]      [Req: d3b07384-...] Job received: name=process-booking, jobId=42, attempt=1
[BookingProcessing]  [Req: d3b07384-...] Transaction committed — Booking CONFIRMED: reference=BK-20260708-0001, seats=2
```

### Error Logs

Errors include the full stack trace for debuggability:

```
[BookingWorker] ERROR Unexpected error processing job jobId=42. Attempt 1.
Error: connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:...)
```

---

## 🏥 Health Monitoring

### `GET /api/health` — Detailed Diagnostics

Returns a comprehensive payload aggregating status and latency from all dependencies. Intended for monitoring dashboards (Grafana, Datadog, etc.).

```json
{
  "status": "UP",
  "timestamp": "2026-07-08T01:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "nodeVersion": "v22.x.x",
  "metrics": { "memory": {}, "cpu": {} },
  "services": {
    "database": { "status": "UP", "latency": "3ms" },
    "redis":    { "status": "UP", "latency": "1ms" },
    "queue":    { "status": "UP", "waiting": 0, "active": 0, "failed": 2 }
  }
}
```

The top-level `status` is `UP` only if **all three** services (database, redis, queue) are `UP`.

### `GET /api/health/live` — Liveness Probe

Returns `200 LIVENESS_UP` immediately with no dependency checks. Kubernetes uses this to detect a dead process (OOM kill, infinite loop, deadlock). If this endpoint stops responding, Kubernetes restarts the pod.

### `GET /api/health/ready` — Readiness Probe

Verifies PostgreSQL, Redis, and BullMQ are all reachable before returning `200 READY`. If any dependency is unavailable, returns `503 NOT_READY`. Kubernetes uses this to stop routing traffic to a pod until it is fully initialised and connected.

### Kubernetes Probe Configuration Example

```yaml
livenessProbe:
  httpGet:
    path: /api/health/live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /api/health/ready
    port: 3000
  initialDelaySeconds: 15
  periodSeconds: 10
  failureThreshold: 3
```

---

## 🐳 Deployment

### Production with Docker Compose

**1. Clone the repository**
```bash
git clone <repo-url>
cd seatflow
```

**2. Configure environment**
```bash
cp .env.example .env
# Set DATABASE_URL to your production PostgreSQL (Neon, RDS, etc.)
# REDIS_HOST and REDIS_PORT are overridden inside docker-compose.yml
```

**3. Run database migrations**
```bash
npx prisma migrate deploy
```

**4. Start the stack**
```bash
docker compose up -d --build
```

**5. Verify health**
```bash
curl http://localhost:3000/api/health/ready
# Expected: READY
```

**6. View logs**
```bash
docker compose logs -f app
```

---

### Production Dockerfile

The `Dockerfile` uses a **multi-stage build** to produce a minimal production image:

| Stage | Purpose |
|---|---|
| `base` | Install production dependencies only |
| `build` | Compile TypeScript to `dist/` |
| `production` | Copy only `dist/` and `node_modules` — no source files, no dev tools |

The resulting image contains only what is needed to run the compiled application, reducing the attack surface and image size.

---

### Scaling the Worker

The BullMQ worker runs inside the same container as the HTTP server. For independent scaling of the API and worker:

1. Extract `WorkersModule` into a separate NestJS application entry point.
2. Use the same Docker image with a different startup `CMD`.
3. Deploy the worker as a separate Kubernetes `Deployment` with `replicas > 1`.

BullMQ's distributed locking and the PostgreSQL `SELECT FOR UPDATE` guarantee that multiple worker replicas processing the same queue do not produce duplicate or incorrect results.

---

## 🔮 Future Improvements

| Improvement | Description |
|---|---|
| **Authentication** | JWT-based auth with `@nestjs/passport`. Each booking associated with an authenticated user. |
| **Authorization** | Role-based access control (RBAC) — admin can view all bookings; users see only their own. |
| **Response Caching** | Cache `GET /events` and `GET /bookings` responses in Redis with short TTLs for read-heavy workloads. |
| **Email Notifications** | Send confirmation/failure emails via SendGrid or AWS SES on booking status change. |
| **Payment Gateway** | Integrate Stripe checkout before confirming seat allocation. Implement payment hold and capture flow. |
| **Rate Limiting Improvements** | Redis sliding window algorithm instead of a fixed counter for smoother throttling. Per-user rate limits using auth tokens. |
| **Prometheus Metrics** | Expose `/metrics` endpoint with request duration histograms, queue depth gauges, booking confirmation rates. |
| **Grafana Dashboards** | Visualise booking throughput, queue depth, error rates, and p99 latency. |
| **Kubernetes HPA** | Horizontal Pod Autoscaler on CPU/queue-depth metrics to auto-scale workers under load. |
| **Horizontal Scaling** | Stateless app containers behind a load balancer. Redis-backed rate limiting and caching already support this. |
| **Booking Cancellation** | `DELETE /bookings/:id` — atomically restore `remainingSeats` and mark the booking cancelled within a transaction. |
| **Webhook Support** | Push booking status updates to client-configured webhook URLs when jobs complete. |
| **Admin API** | Internal admin endpoints for managing events, viewing all bookings, and manually reprocessing failed jobs. |

---

## 📌 Assumptions

1. **PostgreSQL is cloud-managed.** The production `docker-compose.yml` targets an external PostgreSQL instance (Neon or similar). A local PostgreSQL container is not included because managed databases provide automatic backups, connection pooling, and high availability.

2. **Single-process deployment for now.** The HTTP server and BullMQ worker run in the same Node.js process. This simplifies deployment. A production system at scale would run them separately.

3. **`remainingSeats` is the source of truth.** The system does not recalculate remaining seats by summing confirmed bookings. `remainingSeats` is decremented atomically at confirmation time and is treated as authoritative.

4. **No authentication in scope.** The booking API is public. `requestId` serves as the client identity for idempotency, not as a security credential. Authentication is listed as a future improvement.

5. **Seats are not held before confirmation.** There is no time-limited seat reservation before payment. A booking moves from `PENDING` to `CONFIRMED`/`FAILED` as quickly as the worker processes the job.

6. **`bookingReference` format is date-prefixed.** References are generated as `BK-YYYYMMDD-NNNN` — human-readable and suitable for customer communication.

7. **BullMQ retry policy is intentionally asymmetric.** Transient failures retry 3 times with exponential backoff. Business logic failures (sold out, event not found) do not retry — they fail fast and log the structured reason.

8. **Rate limiting is per source IP.** In a deployment behind a load balancer, `X-Forwarded-For` is read to extract the real client IP rather than the proxy's address.

---

## 📄 License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2026 SeatFlow

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">

Built with ❤️ using NestJS · Prisma · PostgreSQL · Redis · BullMQ

</div>
