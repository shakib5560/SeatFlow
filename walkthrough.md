# Walkthrough - Room-Based Booking System & Manual Admin Approval

We have successfully migrated the application from an event-based booking system (with automatic confirmations) to a room-based booking system (with manual admin approvals and calendar scheduling). All components, repositories, services, controllers, DTOs, and unit/integration tests have been refactored to align with these new requirements.

## Key Changes Made

### 1. Database Model Migration
- Migrated schema from `events` and `bookings` to `rooms` and `room_bookings`.
- Defined a set of 10 rooms (A1 to A10) and seeded them into the database.
- Swapped references to `seats` and event ids for `roomId`, `bookingType` (DAILY, WEEKLY, MONTHLY), `startDate`, and `endDate` ranges.

### 2. Manual Admin Approval Process
- Disabled automatic booking confirmation. Bookings are registered as `PENDING` by default.
- Refactored `AdminBookingsService` and `AdminBookingsRepository` to support manual approval (`PATCH /admin/bookings/:id/approve` transitions status to `CONFIRMED`) and rejection (`PATCH /admin/bookings/:id/reject` transitions status to `FAILED` with `ADMIN_REJECTED` failure reason).
- Added an idempotency/concurrency safeguard to prevent double-approval or overlapping conflicts.

### 3. Date Overlap Prevention
- Implemented overlap validation in `BookingsService.create()` using the `RoomsRepository.checkAvailability` helper.
- Prevents double-booking same-room schedules: if room A1 is booked for dates that overlap with a new booking request, it returns a `409 Conflict` with:
  `"This room is not available for the selected dates. Next available date: YYYY-MM-DD"`

### 4. Admin Booking Retrieval Endpoints
- **Pending Bookings only**: `GET /api/admin/bookings/pending` returns a paginated list of bookings matching status `PENDING`.
- **All Bookings**: `GET /api/admin/bookings` returns a paginated list of all bookings (PENDING, CONFIRMED, FAILED).
- Supports filtering by customerEmail, customerName, roomId, and bookingReference, as well as sorting by `startDate`, `createdAt`, `customerName`, and `status`.

### 5. Worker Optimization
- Restructured `BookingWorker` and `BookingProcessingService` to operate as manual-approval stubs. They no longer automatically confirm bookings or decrement seat counts.

### 6. Legacy Events Module Integration
- Retained a thin compatibilty layer in the `/events` endpoint by wrapping the new `Room` model to return room names and details mapped to the old `EventResponseDto` structure, ensuring zero compilation errors in rest of the codebase.

---

## Verification & Testing

### 1. Automated Tests
- Updated all unit, integration, and E2E validation tests to reflect the new DTO interfaces and Room models.
- All **62 tests** in the test suite run and pass successfully:
  ```bash
  npm run test
  # PASS test/integration/concurrency-idempotency.spec.ts
  # PASS src/modules/bookings/services/bookings.service.spec.ts
  # PASS src/modules/workers/booking.worker.spec.ts
  # ...
  # Test Suites: 17 passed, 17 total
  # Tests:       62 passed, 62 total
  ```

### 2. Manual Smoke Tests
- Tested endpoint responses via curl commands:
  - `POST /api/bookings` enqueues a new pending booking.
  - `GET /api/admin/bookings/pending` lists only PENDING room requests.
  - `GET /api/admin/bookings` returns all records.
  - Double booking a date range yields:
    `"This room is not available for the selected dates. Next available date: 2026-08-08"`
