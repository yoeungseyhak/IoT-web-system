# Cotafer IoT — API Documentation

**Base URL:** `http://your-server:5050`

All REST and WebSocket endpoints are served from a **single server**. Both the web dashboard and IoT Devices connect to the same server.

---

## Authentication

All protected endpoints require a JWT Bearer token in the `Authorization` header.

```
Authorization: Bearer <token>
```

Tokens are obtained via the `/api/auth/login` endpoint and expire after **24 hours**.

---

## REST API Endpoints

---

### 1. Auth — Login

| | |
|---|---|
| **Endpoint** | `POST /api/auth/login` |
| **Auth** | ❌ Not required |
| **Description** | Authenticate a user and receive a JWT token. Used by both web clients and Devices. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Content-Type` | `application/json` | ✅ |

**Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | ✅ | User's username |
| `password` | string | ✅ | User's password |

**Request Example:**
```json
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "Admin@12345"
}
```

**Response `200 OK`:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

**Response `401 Unauthorized`:**
```json
{
  "message": "Invalid username or password"
}
```

---

### 2. Auth — Get Current User

| | |
|---|---|
| **Endpoint** | `GET /api/auth/me` |
| **Auth** | ✅ Bearer Token |
| **Description** | Validate token and return the current authenticated user's profile. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |

**Response `200 OK`:**
```json
{
  "id": 1,
  "username": "admin",
  "role": "admin",
  "created_at": "2024-01-15 10:30:00"
}
```

---

### 3. Auth — Change Own Password

| | |
|---|---|
| **Endpoint** | `PUT /api/auth/change-password` |
| **Auth** | ✅ Bearer Token |
| **Description** | Change the currently authenticated user's own password. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |
| `Content-Type` | `application/json` | ✅ |

**Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `currentPassword` | string | ✅ | Current password for verification |
| `newPassword` | string | ✅ | New password (min 6 characters) |

**Request Example:**
```json
PUT /api/auth/change-password
Authorization: Bearer eyJhbGci...
Content-Type: application/json

{
  "currentPassword": "Admin@12345",
  "newPassword": "NewSecurePass@1"
}
```

**Response `200 OK`:**
```json
{
  "message": "Password changed successfully"
}
```

**Response `401`:**
```json
{
  "message": "Current password is incorrect"
}
```

---

### 4. Devices — Get All Devices + Device Status

| | |
|---|---|
| **Endpoint** | `GET /api/devices` |
| **Auth** | ✅ Bearer Token |
| **Description** | Get the current state of all controllable devices and the Device online status. Used by both web dashboard and Device on startup. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |

**Response `200 OK`:**
```json
{
  "devices": [
    {
      "id": "light-1",
      "name": "Light 1",
      "type": "light",
      "state": { "on": false },
      "updated_at": "2024-01-15 12:00:00"
    },
    {
      "id": "light-2",
      "name": "Light 2",
      "type": "light",
      "state": { "on": true },
      "updated_at": "2024-01-15 12:05:00"
    },
    {
      "id": "light-3",
      "name": "Light 3",
      "type": "light",
      "state": { "on": false },
      "updated_at": "2024-01-15 12:00:00"
    },
    {
      "id": "rolling-door",
      "name": "Rolling Door",
      "type": "rolling-door",
      "state": { "status": "closed" },
      "updated_at": "2024-01-15 12:00:00"
    },
    {
      "id": "boom-gate",
      "name": "Boom Gate",
      "type": "boom-gate",
      "state": { "status": "closed" },
      "updated_at": "2024-01-15 12:00:00"
    },
    {
      "id": "party-light",
      "name": "Party Light",
      "type": "party-light",
      "state": {
        "on": false,
        "brightness": 100,
        "color": "#ff00ff",
        "mode": "static"
      },
      "updated_at": "2024-01-15 12:00:00"
    }
  ],
  "deviceStatus": {
    "online": true,
    "lastSeen": 1705312800000
  }
}
```

---

### 5. Devices — Add Component (Admin Only)

| | |
|---|---|
| **Endpoint** | `POST /api/devices` |
| **Auth** | ✅ Bearer Token (Admin role) |
| **Description** | Add a new controllable component with its name, type, and assigned ESP32 PIN. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |
| `Content-Type` | `application/json` | ✅ |

**Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | ✅ | Component name (e.g. `"Garden Floodlight"`) |
| `type` | string | ✅ | `"light"`, `"rolling-door"`, `"boom-gate"`, or `"party-light"` |
| `pin` | string | ✅ | Assigned ESP32 GPIO pin (e.g. `"GPIO 13"`, `"GPIO 25, 26"`) |

**Request Example:**
```json
POST /api/devices
Authorization: Bearer eyJhbGci...
Content-Type: application/json

{
  "name": "Garden Floodlight",
  "type": "light",
  "pin": "GPIO 13"
}
```

**Response `201 Created`:**
```json
{
  "id": "light-m0abc123",
  "name": "Garden Floodlight",
  "type": "light",
  "pin": "GPIO 13",
  "state": { "on": false },
  "updated_at": "2024-01-15T12:00:00.000Z"
}
```

---

### 6. Devices — Update Component Name & ESP32 PIN (Admin Only)

| | |
|---|---|
| **Endpoint** | `PUT /api/devices/:id/details` |
| **Auth** | ✅ Bearer Token (Admin role) |
| **Description** | Change any component's display name and/or its assigned ESP32 GPIO pin. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |
| `Content-Type` | `application/json` | ✅ |

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | Device ID (e.g. `"light-1"`, `"rolling-door"`) |

**Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | ❌ | New component name (e.g. `"Living Room Light"`) |
| `pin` | string | ❌ | New ESP32 GPIO pin (e.g. `"GPIO 14"`) |

**Request Example:**
```json
PUT /api/devices/light-1/details
Authorization: Bearer eyJhbGci...
Content-Type: application/json

{
  "name": "Living Room Light",
  "pin": "GPIO 14"
}
```

**Response `200 OK`:**
```json
{
  "id": "light-1",
  "name": "Living Room Light",
  "type": "light",
  "pin": "GPIO 14",
  "state": { "on": false },
  "updated_at": "2024-01-15T12:10:00.000Z"
}
```

---

### 7. Devices — Remove Component (Admin Only)

| | |
|---|---|
| **Endpoint** | `DELETE /api/devices/:id` |
| **Auth** | ✅ Bearer Token (Admin role) |
| **Description** | Delete a component and its associated automations. Broadcasts removal to all connected clients. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | Device ID to delete |

**Response `200 OK`:**
```json
{
  "message": "Device \"Garden Floodlight\" deleted successfully"
}
```

---

### 8. Devices — Update Device State

| | |
|---|---|
| **Endpoint** | `PUT /api/devices/:id` |
| **Auth** | ✅ Bearer Token |
| **Description** | Update a device's state. Triggers a WebSocket broadcast to ALL connected clients (web + Device). This is the main control endpoint used by both the web UI and Device. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |
| `Content-Type` | `application/json` | ✅ |

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | Device ID (see table below) |

**Available Device IDs:**

| Device ID | Type | Valid State Fields |
|-----------|------|-------------------|
| `light-1` | light | `on` (boolean) |
| `light-2` | light | `on` (boolean) |
| `light-3` | light | `on` (boolean) |
| `rolling-door` | rolling-door | `status` (`"opening"`, `"closing"`, `"stopped"`, `"opened"`, `"closed"`) |
| `boom-gate` | boom-gate | `status` (`"open"`, `"closed"`) |
| `party-light` | party-light | `on` (boolean), `brightness` (0-100), `color` (hex string), `mode` (`"static"`, `"rainbow"`, `"pulse"`, `"strobe"`, `"disco"`) |

**Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | object | ✅ | Partial state object — only include fields you want to change (merges with existing state) |

**Request Examples:**

```json
// Turn on Light 1
PUT /api/devices/light-1
Authorization: Bearer eyJhbGci...
Content-Type: application/json

{ "state": { "on": true } }
```

```json
// Open Rolling Door
PUT /api/devices/rolling-door
Authorization: Bearer eyJhbGci...
Content-Type: application/json

{ "state": { "status": "opening" } }
```

```json
// Open Boom Gate
PUT /api/devices/boom-gate
Authorization: Bearer eyJhbGci...
Content-Type: application/json

{ "state": { "status": "open" } }
```

```json
// Set Party Light to rainbow mode at 80% brightness
PUT /api/devices/party-light
Authorization: Bearer eyJhbGci...
Content-Type: application/json

{ "state": { "on": true, "brightness": 80, "color": "#ff00ff", "mode": "rainbow" } }
```

**Response `200 OK`:**
```json
{
  "id": "light-1",
  "name": "Light 1",
  "type": "light",
  "state": { "on": true },
  "updated_at": "2024-01-15T12:30:00.000Z"
}
```

---

### 6. Devices — Device Heartbeat

| | |
|---|---|
| **Endpoint** | `POST /api/devices/heartbeat` (also supports `/api/devices/device/heartbeat`) |
| **Auth** | ✅ Bearer Token |
| **Description** | Device sends this periodically (every 5-10 seconds) to maintain its online status. If no heartbeat is received within 15 seconds, the Device is marked offline. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |

**Request Body:** None required.

**Response `200 OK`:**
```json
{
  "ok": true
}
```

---

### 7. Automations — Set Time Schedule (Auto ON/OFF)

| | |
|---|---|
| **Endpoint** | `POST /api/devices/:id/schedule` |
| **Auth** | ✅ Bearer Token |
| **Description** | Configure a time schedule for a light or device to automatically turn ON and OFF. Supports daily recurring schedules or specific date/time with **no maximum date or time limit**. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |
| `Content-Type` | `application/json` | ✅ |

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | Device ID (e.g. `light-1`, `light-2`, `light-3`, `party-light`) |

**Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `enabled` | boolean | ❌ | Enable or disable schedule (default `true`) |
| `on_time` | string | ❌ | Turn ON time (`"HH:mm"` for daily or `"YYYY-MM-DDTHH:mm"` for future date) |
| `off_time` | string | ❌ | Turn OFF time (`"HH:mm"` for daily or `"YYYY-MM-DDTHH:mm"` for future date) |
| `days` | array of int | ❌ | Repeat days `[0,1,2,3,4,5,6]` (0=Sun, 6=Sat). Null for date-specific. |

**Request Example:**
```json
POST /api/devices/light-1/schedule
Authorization: Bearer eyJhbGci...
Content-Type: application/json

{
  "enabled": true,
  "on_time": "18:00",
  "off_time": "06:00",
  "days": [1, 2, 3, 4, 5]
}
```

**Response `200 OK`:**
```json
{
  "schedule": {
    "enabled": true,
    "on_time": "18:00",
    "off_time": "06:00",
    "days": [1, 2, 3, 4, 5],
    "last_on_triggered": null,
    "last_off_triggered": null
  },
  "countdown": null,
  "cycle_count": null
}
```

---

### 8. Automations — Set Countdown Timer (Auto Turn ON/OFF)

| | |
|---|---|
| **Endpoint** | `POST /api/devices/:id/countdown` |
| **Auth** | ✅ Bearer Token |
| **Description** | Start a countdown timer that will automatically turn the light ON or OFF after a specified duration. Supports **any duration without upper limit** (seconds, hours, days). |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |
| `Content-Type` | `application/json` | ✅ |

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | Device ID (`light-1`, `light-2`, `light-3`, `party-light`) |

**Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"turn_on"` or `"turn_off"` |
| `duration_seconds` | integer | ✅ | Duration in seconds (e.g. `1800` for 30 minutes, `86400` for 24h, no max limit) |

**Request Example:**
```json
POST /api/devices/light-2/countdown
Authorization: Bearer eyJhbGci...
Content-Type: application/json

{
  "action": "turn_off",
  "duration_seconds": 1800
}
```

**Response `200 OK`:**
```json
{
  "schedule": null,
  "countdown": {
    "active": true,
    "action": "turn_off",
    "target_time": 1705314600000,
    "duration_seconds": 1800,
    "started_at": 1705312800000
  },
  "cycle_count": null
}
```

---

### 9. Automations — Set Count to Turn ON/OFF (Cycle Count)

| | |
|---|---|
| **Endpoint** | `POST /api/devices/:id/cycle-count` |
| **Auth** | ✅ Bearer Token |
| **Description** | Automatically turn the light ON and OFF repeatedly for an exact number of counts. Light turns ON for `interval_on_sec`, then OFF for `interval_off_sec`, repeating until `total_count` is reached. Has **no maximum count or time limit**. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |
| `Content-Type` | `application/json` | ✅ |

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | Device ID (`light-1`, `light-2`, `light-3`, `party-light`) |

**Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `total_count` | integer | ✅ | Total number of ON/OFF cycles to perform (e.g. `10`, `100`, no upper limit) |
| `interval_on_sec` | integer | ✅ | Duration in seconds for ON state (e.g. `3`) |
| `interval_off_sec` | integer | ✅ | Duration in seconds for OFF state (e.g. `3`) |

**Request Example:**
```json
POST /api/devices/light-3/cycle-count
Authorization: Bearer eyJhbGci...
Content-Type: application/json

{
  "total_count": 10,
  "interval_on_sec": 5,
  "interval_off_sec": 5
}
```

**Response `200 OK`:**
```json
{
  "schedule": null,
  "countdown": null,
  "cycle_count": {
    "active": true,
    "total_count": 10,
    "current_count": 0,
    "interval_on_sec": 5,
    "interval_off_sec": 5,
    "phase": "on",
    "next_toggle_time": 1705312805000
  }
}
```

---

### 10. Automations — Cancel Automation

| | |
|---|---|
| **Endpoint** | `DELETE /api/devices/:id/automation/:type` |
| **Auth** | ✅ Bearer Token |
| **Description** | Cancel an active schedule, countdown timer, or cycle count. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | Device ID |
| `type` | string | ✅ | `"schedule"`, `"countdown"`, `"cycle_count"`, or `"all"` |

**Request Example:**
```json
DELETE /api/devices/light-1/automation/countdown
Authorization: Bearer eyJhbGci...
```

**Response `200 OK`:**
```json
{
  "schedule": null,
  "countdown": null,
  "cycle_count": null
}
```

---

### 11. Activity Logs — Get All Logs

| | |
|---|---|
| **Endpoint** | `GET /api/logs` |
| **Auth** | ✅ Bearer Token |
| **Description** | Get the most recent 200 activity log entries. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |

**Response `200 OK`:**
```json
[
  {
    "id": 42,
    "user_id": 1,
    "username": "admin",
    "action": "device-update",
    "device_id": "light-1",
    "device_name": "Light 1",
    "details": "on: true",
    "created_at": "2024-01-15 12:30:00"
  },
  {
    "id": 41,
    "user_id": 2,
    "username": "user1",
    "action": "login",
    "device_id": null,
    "device_name": null,
    "details": "user1 logged in",
    "created_at": "2024-01-15 12:00:00"
  }
]
```

---

### 12. Users — List All Users (Admin Only)

| | |
|---|---|
| **Endpoint** | `GET /api/users` |
| **Auth** | ✅ Bearer Token (Admin role) |
| **Description** | List all registered user accounts. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |

**Response `200 OK`:**
```json
[
  {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "created_at": "2024-01-15 10:00:00"
  },
  {
    "id": 2,
    "username": "user1",
    "role": "user",
    "created_at": "2024-01-15 10:00:00"
  }
]
```

---

### 13. Users — Create New User (Admin Only)

| | |
|---|---|
| **Endpoint** | `POST /api/users` |
| **Auth** | ✅ Bearer Token (Admin role) |
| **Description** | Create a new user account. Only admins can create users. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |
| `Content-Type` | `application/json` | ✅ |

**Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | ✅ | Unique username |
| `password` | string | ✅ | Password (min 6 characters) |
| `role` | string | ❌ | `"admin"` or `"user"` (default: `"user"`) |

**Request Example:**
```json
POST /api/users
Authorization: Bearer eyJhbGci...
Content-Type: application/json

{
  "username": "alice",
  "password": "Alice@123",
  "role": "user"
}
```

**Response `201 Created`:**
```json
{
  "id": 3,
  "username": "alice",
  "role": "user",
  "created_at": "2024-01-15 14:00:00"
}
```

---

### 14. Users — Change User Password (Admin Only)

| | |
|---|---|
| **Endpoint** | `PUT /api/users/:id/password` |
| **Auth** | ✅ Bearer Token (Admin role) |
| **Description** | Admin changes any user's password (does not require current password). |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |
| `Content-Type` | `application/json` | ✅ |

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | integer | ✅ | Target user ID |

**Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `newPassword` | string | ✅ | New password (min 6 characters) |

**Request Example:**
```json
PUT /api/users/2/password
Authorization: Bearer eyJhbGci...
Content-Type: application/json

{
  "newPassword": "NewPass@456"
}
```

**Response `200 OK`:**
```json
{
  "message": "Password for \"user1\" changed successfully"
}
```

---

### 15. Users — Delete User (Admin Only)

| | |
|---|---|
| **Endpoint** | `DELETE /api/users/:id` |
| **Auth** | ✅ Bearer Token (Admin role) |
| **Description** | Delete a user account. Cannot delete yourself or the last admin. |

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | integer | ✅ | User ID to delete |

**Response `200 OK`:**
```json
{
  "message": "User \"alice\" deleted successfully"
}
```

---

## WebSocket Endpoints

---

### Web Client Connection

| | |
|---|---|
| **URL** | `ws://your-server:5050/ws?token=<JWT_TOKEN>` |
| **Auth** | ✅ JWT token as query parameter |
| **Description** | Web dashboard connects here for real-time device state updates and notifications. |

**Connection Example (JavaScript):**
```javascript
const ws = new WebSocket('ws://your-server:5050/ws?token=eyJhbGci...');
```

---

### Hardware Device Connection

| | |
|---|---|
| **URL** | `ws://your-server:5050/ws/device` |
| **Auth** | ❌ No auth required (device endpoint) |
| **Description** | Hardware Device (microcontroller) connects here. No JWT needed — identified by the `/device` path. |

**Connection Example:**
```cpp
webSocket.begin("your-server", 5050, "/ws/device");
```

---

### WebSocket Messages — Server → Client

These messages are broadcast by the server to all connected clients (web + Device):

#### `device-update`

Sent when any device state changes (from web UI, API, or Device).

```json
{
  "type": "device-update",
  "deviceId": "light-1",
  "state": { "on": true },
  "triggeredBy": "admin",
  "timestamp": 1705312800000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Always `"device-update"` |
| `deviceId` | string | The device that changed |
| `state` | object | The new/updated state fields |
| `triggeredBy` | string | Username who triggered the change |
| `timestamp` | number | Unix timestamp in milliseconds |

#### `device-status` (also sent as `esp32-status`)

Sent when the Device connects or disconnects.

```json
{
  "type": "device-status",
  "online": true,
  "lastSeen": 1705312800000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"device-status"` (or `"esp32-status"`) |
| `online` | boolean | `true` if Device is connected |
| `lastSeen` | number | Last heartbeat timestamp |

---

### WebSocket Messages — Client → Server

#### From Web Client: `device-update`

Web clients can also send device updates directly via WebSocket (alternative to REST API):

```json
{
  "type": "device-update",
  "deviceId": "light-1",
  "state": { "on": true }
}
```

#### From Device: `heartbeat`

Device sends this every 5 seconds to maintain online status:

```json
{
  "type": "heartbeat",
  "uptime": 3600,
  "freeHeap": 180000,
  "rssi": -45
}
```

#### From Device: `state-report`

Device reports its current physical state (e.g., on boot or when a physical button is pressed):

```json
{
  "type": "state-report",
  "deviceId": "light-1",
  "state": { "on": true }
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "message": "Error description here"
}
```

| HTTP Code | Meaning |
|-----------|---------|
| `400` | Bad Request — missing or invalid parameters |
| `401` | Unauthorized — invalid credentials or token |
| `403` | Forbidden — valid token but insufficient role (non-admin) |
| `404` | Not Found — user or device not found |
| `409` | Conflict — username already exists |
| `500` | Internal Server Error |

---

## Hardware Device Integration Quick Guide

The Device can interact with Cotafer in **two ways**:

### Method 1: WebSocket (Recommended — Real-time)
```
1. Connect to ws://server:5050/ws/device
2. Receive "device-update" messages → apply to GPIO/relays
3. Send "heartbeat" every 5s → keeps online status green
4. Send "state-report" → when physical button pressed
```

### Method 2: REST API (Simple — Polling)
```
1. POST /api/auth/login → get token
2. GET /api/devices → get all states on boot
3. PUT /api/devices/:id → update state when physical switch changes
4. POST /api/devices/heartbeat → every 5-10s to stay online
```

> [!TIP]
> **WebSocket** is preferred because it gives the Device instant updates without polling, uses less bandwidth, and keeps a persistent connection. Use REST as a fallback if WebSocket is not feasible.
