# SeatFlow Frontend Integration Guide

Welcome to the **SeatFlow** Frontend Integration Guide. This document provides frontend developers with all the necessary details, patterns, and tips required to interface with the SeatFlow NestJS backend.

---

## 1. Project Overview
SeatFlow is an Event & Room Booking System that handles room scheduling, calendar availability checks, public/admin bookings, and manual admin reviews. 
* **Backend Architecture**: NestJS, Prisma (PostgreSQL), BullMQ, and Redis.
* **Key Concept**: Public users can view room availability, legacy event feeds, and request a booking. Admin users can review, approve, or reject pending bookings via a dashboard.

---

## 2. Requirements & Prerequisites
Before integrating the frontend, ensure you have:
* **Node.js** (v18 or higher recommended)
* **API Client** (such as Axios, Fetch API, or React Query)
* **Postman** (to load the provided collection)
* Access to the running backend service.

---

## 3. Installation & Run Instructions
To run the backend locally:
1. Clone the repository and navigate to the project directory.
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Set up the environment variables (see below).
4. Run database migrations and seed data:
   ```bash
   npx prisma migrate dev
   npx prisma db seed
   ```
5. Start the development server:
   ```bash
   pnpm run start:dev
   ```

The server will initialize and run by default at `http://localhost:3000/api`.

---

## 4. Environment Variables
The backend expects the following environment variables (defined in `.env` or system environment):
```ini
# Application configuration
PORT=3000
NODE_ENV=development
REQUEST_TIMEOUT=15000

# Database URL
DATABASE_URL="postgresql://user:password@localhost:5432/seatflow?schema=public"

# Redis Config (Used for Caching & BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Admin Authentication
ADMIN_TOKEN=your-admin-bearer-token-here
```

---

## 5. Authentication Flow
Authentication is simple and token-based:
* **Public Endpoints**: No authorization headers are needed for public bookings, room queries, or events listing.
* **Admin Endpoints**: Protected using a Bearer token verification.
  * In production, pass the header:
    ```http
    Authorization: Bearer your-admin-bearer-token-here
    ```
  * Failed or missing authentication returns `401 Unauthorized`.

---

## 6. API Base URL
All API requests must be directed to:
```
http://localhost:3000/api
```
*(If running on a staging or production server, replace `localhost:3000` with the appropriate domain).*

---

## 7. API Endpoints

### 7.1 Health & Diagnostics
* **GET `/health`**: Returns detailed latency and health indicators for Database, Redis, and Queue.
* **GET `/health/ready`**: Readiness probe (returns `200 READY` or `503 Service Unavailable`).
* **GET `/health/live`**: Liveness probe (returns `200 LIVENESS_UP`).

### 7.2 Rooms & Availability
* **GET `/rooms`**: Retrieve a list of all 10 available conference/meeting rooms.
* **GET `/rooms/:roomId/availability`**: 
  * *No Query Params*: Returns the complete booking calendar (all `PENDING` and `CONFIRMED` bookings).
  * *With `startDate` and `endDate`*: Verifies if the room is available for the given dates.
    * **Query Params**:
      * `startDate` (ISO 8601 string, e.g. `2026-07-10`)
      * `endDate` (ISO 8601 string, e.g. `2026-07-17`)

### 7.3 Legacy Events
* **GET `/events`**: Lists rooms formatted to legacy events for backward-compatible views.

### 7.4 Public Bookings
* **POST `/bookings`**: Request a booking.
  * **Headers**:
    * `x-request-id` (UUID - Idempotency Key)
  * **Payload**:
    ```json
    {
      "roomId": "d3b07384-d113-4bf5-a5d9-43c3d5e2a501",
      "requestId": "d3b07384-d113-4bf5-a5d9-43c3d5e2a301",
      "customerName": "John Doe",
      "customerEmail": "john@example.com",
      "bookingType": "DAILY",
      "startDate": "2026-07-10",
      "endDate": "2026-07-17"
    }
    ```
* **GET `/bookings`**: List bookings with pagination, filtering, and sorting.
  * **Query Params**: `page`, `limit`, `status`, `roomId`, `customerEmail`, `bookingReference`, `sortBy`, `order`.

### 7.5 Admin Bookings Dashboard
* **GET `/admin/bookings`**: List all bookings (across all statuses) for admin overview.
* **GET `/admin/bookings/pending`**: List pending bookings waiting for review.
* **GET `/admin/bookings/:bookingId`**: Get booking details.
* **PATCH `/admin/bookings/:bookingId/approve`**: Transition a booking status from `PENDING` to `CONFIRMED`.
  * **Body** (Optional):
    ```json
    {
      "reason": "Customer verified",
      "notes": "VIP booking"
    }
    ```
* **PATCH `/admin/bookings/:bookingId/reject`**: Transition a booking status from `PENDING` to `FAILED`.
  * **Body** (Optional): Same format as approval.

---

## 8. Public Booking Flow
When building a booking portal on the frontend, adhere to this sequence:
```mermaid
sequenceDiagram
    participant FE as Frontend (User)
    participant BE as Backend API
    participant RD as Cache/DB

    FE->>BE: GET /rooms
    BE->>FE: Return list of rooms (UUIDs, names)
    FE->>BE: GET /rooms/:roomId/availability?startDate=X&endDate=Y
    BE->>FE: Return availability status (true/false)
    Note over FE: If available, user fills form and frontend generates unique requestId UUID
    FE->>BE: POST /bookings (with x-request-id & body requestId)
    BE->>RD: Check for duplicate request id
    alt Duplicate request
        BE->>FE: Return existing booking details immediately (message: "Duplicate request...")
    else New request
        BE->>RD: Save booking as PENDING & queue job
        BE->>FE: Return 202 Accepted (booking reference code, status PENDING)
    end
```

---

## 9. Frontend Integration Guide
* **Client Implementation**: Use a library like Axios or Fetch. Set the `x-request-id` header to a unique UUID for every booking submission.
* **State Management**: Use React Query, SWR, or RTK Query to easily handle cache invalidation. Re-fetch `/rooms/:roomId/availability` when a booking is created or updated.
* **Date Handling**: Submit dates strictly in the standard ISO `YYYY-MM-DD` format to prevent timezone offset discrepancies.

---

## 10. File Uploads
Currently, SeatFlow **does not** accept binary file uploads or multipart form data. All payloads are exchangeable as standard JSON `application/json` structures.

---

## 11. Error Handling & Standard Envelopes
SeatFlow wraps all API responses (except `/health`) in a standard JSON envelope:

### Successful Response Envelope
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Rooms retrieved successfully.",
  "data": [...],
  "timestamp": "2026-07-09T01:00:00.000Z",
  "path": "/api/rooms"
}
```

### Error Response Envelope
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed.",
  "errors": [
    {
      "field": "customerEmail",
      "message": "customerEmail must be an email"
    }
  ],
  "timestamp": "2026-07-09T01:01:00.000Z",
  "path": "/api/bookings",
  "requestId": "unknown"
}
```

**Actions for Frontend**:
1. Check `success` property. If `false`, inspect `statusCode`.
2. Map `errors` array to display validation alerts directly under matching input elements.

---

## 12. Postman Collection
A pre-configured Postman Collection is available at:
`seatflow.postman_collection.json` (located in the root of this project).
Import this file into Postman to inspect headers, payload structures, path variables, and easily trigger development testing.

---

## 13. Common Mistakes to Avoid
1. **Re-generating `requestId` on retries**: If a network request times out, reuse the exact same `requestId` (and `x-request-id` header) in your retry logic to prevent duplicate bookings.
2. **Submitting Local Time**: Always convert user dates to UTC or midnight ISO dates (`YYYY-MM-DD`) before posting.
3. **Omitting Admin Bearer Prefix**: Always format the Authorization header as `Bearer <token>` for admin routes; do not pass the token raw.

---

## 14. Development Tips
* Run `pnpm run test` to verify your changes haven't broken the APIs.
* To clear all cache manually, run `redis-cli flushall` in your terminal.
* Inspect database records in real-time via Prisma Studio:
  ```bash
  npx prisma studio
  ```

---

## 15. Project Structure
The backend codebase follows NestJS modular architecture:
```
src/
├── app.module.ts              # Entry module
├── main.ts                    # Bootstrap script
├── common/                    # Shared filters, interceptors, logger, middlewares
├── infrastructure/            # Redis initialization
└── modules/
    ├── admin/                 # Admin controllers, services, repositories
    ├── bookings/              # Booking controllers, services, repositories
    ├── events/                # Legacy events wrapper module
    ├── health/                # Diagnostics controller and probes
    ├── prisma/                # Prisma module & service wrapper
    ├── queue/                 # BullMQ module registry
    ├── rooms/                 # Rooms controllers, services, repositories
    └── workers/               # Async queue consumers & workers
```

This clean separation ensures high maintainability and code clarity. Happy coding!
