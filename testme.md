# 🚀 Testing SeatFlow API with Postman

This guide provides a step-by-step walkthrough to test the **SeatFlow** API using Postman.

---

## ⚙️ 1. Postman Environment Setup

To make testing easier, configure a Postman Environment:

1. Click on **Environments** on the left sidebar in Postman.
2. Click the **+** (Create Environment) button and name it `SeatFlow-Local`.
3. Add the following variable:
   - **Variable:** `baseUrl`
   - **Initial Value:** `http://localhost:3000/api`
   - **Current Value:** `http://localhost:3000/api`
4. Click **Save** (top right) and select `SeatFlow-Local` from the environment dropdown in the top-right corner of Postman.

---

## 📡 2. Endpoint Testing Walkthrough

All requests below assume you have headers:
- `Content-Type: application/json`

---

### 📅 A. Get All Events
Retrieve the list of upcoming events with their remaining seats.

- **Method:** `GET`
- **URL:** `{{baseUrl}}/events`
- **Description:** Returns all events chronologically. Use this to copy an `id` of an event (e.g., the NestJS Masterclass) for booking testing.

#### 📤 Sample Request
No request body is required.

#### 📥 Expected Response (200 OK)
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
      "remainingSeats": 100,
      "price": 1200
    }
  ],
  "timestamp": "2026-07-08T02:08:00.000Z"
}
```

---

### 🎟️ B. Create a Booking (New Request)
Submit a booking request. The request is processed asynchronously.

- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings`
- **Body (JSON):** Choose `raw` -> `JSON` in Postman.

> [!TIP]
> Use Postman's dynamic variable `{{$randomUUID}}` for `requestId`. This automatically generates a new UUID v4 for each click, simulating a fresh booking request.

#### 📤 Sample Request Body
```json
{
  "requestId": "{{$randomUUID}}",
  "eventId": "d3b07384-d113-4bf5-a5d9-43c3d5e2a201",
  "customerName": "John Doe",
  "customerEmail": "john@example.com",
  "seats": 2
}
```

#### 📥 Expected Response (202 Accepted)
```json
{
  "success": true,
  "statusCode": 202,
  "message": "Booking request accepted.",
  "data": {
    "bookingReference": "BK-20260708-0001",
    "status": "PENDING"
  },
  "timestamp": "2026-07-08T02:09:00.000Z"
}
```

---

### 🔄 C. Test Idempotency (Duplicate Request)
Test if sending the exact same request again returns the same booking reference without creating a duplicate.

1. Send the `POST` request from Step B **once** using a hardcoded `requestId` (instead of the `{{$randomUUID}}` variable).
   *Example Request Body:*
   ```json
   {
     "requestId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
     "eventId": "d3b07384-d113-4bf5-a5d9-43c3d5e2a201",
     "customerName": "John Doe",
     "customerEmail": "john@example.com",
     "seats": 2
   }
   ```
2. Note the generated `bookingReference`.
3. Click **Send** in Postman a second time.
4. Verify the response.

#### 📥 Expected Response (202 Accepted - Duplicate)
Notice the added `"message"` property alerting that a duplicate was caught and the existing booking was returned.
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
  "timestamp": "2026-07-08T02:09:05.000Z"
}
```

---

### 📜 D. List Bookings (Verify Confirmation)
Retrieve all bookings or filter them to verify your asynchronous booking status.

- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings`
- **Parameters (optional):** Click the **Params** tab in Postman to filter the results:
  - `page`: `1`
  - `limit`: `10`
  - `status`: `CONFIRMED` (or `FAILED`, `PENDING`)
  - `customerEmail`: `john@example.com`

#### 📤 Sample Request
```http
GET {{baseUrl}}/bookings?customerEmail=john@example.com
```

#### 📥 Expected Response (200 OK)
Check the `status` field. Since queue processing is fast, it should show `CONFIRMED` (or `FAILED` if seats are sold out).
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Bookings retrieved successfully.",
  "data": {
    "data": [
      {
        "bookingReference": "BK-20260708-0001",
        "event": {
          "id": "d3b07384-d113-4bf5-a5d9-43c3d5e2a201",
          "name": "NestJS Masterclass"
        },
        "customerName": "John Doe",
        "customerEmail": "john@example.com",
        "seats": 2,
        "status": "CONFIRMED",
        "createdAt": "2026-07-08T02:09:00.000Z"
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
  "timestamp": "2026-07-08T02:10:00.000Z"
}
```

---

## 🩺 3. Health & Monitoring Checks

Test system availability and connection status of services (Database, Redis, BullMQ).

### 📊 A. Detailed Diagnostics
- **Method:** `GET`
- **URL:** `{{baseUrl}}/health`
- **Expected Response (200 OK):**
```json
{
  "status": "UP",
  "timestamp": "2026-07-08T02:11:00.000Z",
  "uptime": 2345,
  "version": "1.0.0",
  "environment": "development",
  "nodeVersion": "v22.10.7",
  "nestjsVersion": "11.0.1",
  "timezone": "UTC",
  "metrics": {
    "memory": {
      "heapUsed": "48.24 MB",
      "heapTotal": "71.02 MB",
      "rss": "120.45 MB"
    },
    "cpu": {
      "user": 1845210,
      "system": 284501
    }
  },
  "services": {
    "database": {
      "status": "UP",
      "latency": "24ms"
    },
    "redis": {
      "status": "UP",
      "latency": "4ms"
    },
    "queue": {
      "status": "UP",
      "waiting": 0,
      "active": 0,
      "failed": 0
    }
  }
}
```

### ⚡ B. Readiness Check (Kubernetes)
Checks dependency connections.
- **Method:** `GET`
- **URL:** `{{baseUrl}}/health/ready`
- **Expected Response:** `200 OK` with plain-text body:
  ```text
  READY
  ```

### 🧬 C. Liveness Check (Kubernetes)
Checks if the application process is running.
- **Method:** `GET`
- **URL:** `{{baseUrl}}/health/live`
- **Expected Response:** `200 OK` with plain-text body:
  ```text
  LIVENESS_UP
  ```

---

## 🛡️ 4. Advanced Testing Scenarios

### 🚫 Rate Limiting (HTTP 429)
The API has a built-in rate limit of **100 requests per minute** per IP.
- To test this, write a quick test runner or click **Send** repeatedly in Postman.
- **Expected Response (429 Too Many Requests):**
```json
{
  "success": false,
  "statusCode": 429,
  "message": "Too many requests. Please try again later.",
  "timestamp": "2026-07-08T02:12:00.000Z",
  "path": "/api/bookings"
}
```

### 📉 Overbooking / Out-of-Seats Verification (SOLD_OUT)
1. Find an event (`GET /events`) and look at `remainingSeats`. Let's assume it has 5 seats left.
2. Send a `POST /bookings` for `6` seats.
3. Retrieve the bookings list (`GET /bookings?customerEmail=...`).
4. **Expected Result:** The booking status will be `FAILED` and `failureReason` will be `SOLD_OUT`.
