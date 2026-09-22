# Walkthrough — 7-Feature Implementation

## Summary

All 7 features from the approved implementation plan have been successfully implemented across **15+ files** (backend + frontend). The project has been rebranded from "Cotafer" to "Floor Management". Frontend build passes with 0 errors.

---

## Changes Made

### 1. Rolling Door Interlock Logic

| File | Change |
|---|---|
| [devices.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/src/routes/devices.js) | Added `rollingDoorTimers` Map, motion interlock rejection (400), 2s auto-transition timer from `opening→opened` / `closing→closed` |
| [DeviceCard.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/components/DeviceCard.jsx) | Removed Stop button, changed grid to 2-col, added animated `Loader2` spinner during motion, disabled all buttons while moving |

### 2. Instant Initial Sync & Real-Time Status

| File | Change |
|---|---|
| [websocket.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/src/websocket.js) | Sends `init-state` with all devices + device status on web client connection. Sends current states to ESP32 on device connection |
| [DashboardPage.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/pages/DashboardPage.jsx) | Handles `init-state` event to populate devices immediately. Added `visibilitychange` listener for tab-switch re-sync |

### 3. Double Notification Fix

| File | Change |
|---|---|
| [App.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/App.jsx) | Added `intentionalClose` ref to prevent reconnect loop on cleanup. Set to `true` before close, checked in `onclose` handler |
| [DashboardPage.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/pages/DashboardPage.jsx) | Added `lastNotifRef` deduplication — skips duplicate toasts for same device+state within 1500ms |

### 4. Admin User Control ("Uncontrollable" Mode)

| File | Change |
|---|---|
| [database.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/src/database.js) | Migration: `ALTER TABLE users ADD COLUMN can_control INTEGER DEFAULT 1` |
| [auth.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/src/routes/auth.js) | `can_control` included in JWT payload, login response, and `/me` endpoint |
| [users.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/src/routes/users.js) | New `PUT /:id/control` route for admin toggle. `can_control` included in user list |
| [devices.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/src/routes/devices.js) | `checkCanControl` middleware on PUT, schedule, countdown, cycle-count routes. Returns 403 for read-only users |
| [AdminPanel.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/components/AdminPanel.jsx) | Toggle button per user (green "Enabled" / orange "Read-Only") |
| [DeviceCard.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/components/DeviceCard.jsx) | All card types accept `disabled` prop. Lock icon shown for read-only users. All controls disabled |

### 5. Problem & Bug Reporting System

| File | Change |
|---|---|
| [database.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/src/database.js) | New `reports` table with id, user_id, username, title, description, category, status, timestamps |
| [reports.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/src/routes/reports.js) | **[NEW]** CRUD routes: POST (submit), GET (list own/all), PUT status (admin), DELETE (admin) |
| [server.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/src/server.js) | Registered `/api/reports` route |
| [ReportModal.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/components/ReportModal.jsx) | **[NEW]** Modal with title, category (Bug/Hardware/Building/Other), description fields |
| [api.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/api.js) | Added `createReport`, `getReports`, `updateReportStatus`, `deleteReport` |
| [AdminPanel.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/components/AdminPanel.jsx) | Reports management section with status badges and actions |
| [Navbar.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/components/Navbar.jsx) | Report issue button (⚠️ icon) |
| [DashboardPage.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/pages/DashboardPage.jsx) | ReportModal state and rendering |

### 6. Light & Dark Theme

| File | Change |
|---|---|
| [ThemeContext.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/context/ThemeContext.jsx) | **[NEW]** Theme context with `dark` default, localStorage persistence, `toggleTheme()` |
| [App.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/App.jsx) | Wrapped providers with `<ThemeProvider>` |
| [Navbar.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/components/Navbar.jsx) | Sun/Moon toggle button |

### 7. System Rebranding

| File | Before | After |
|---|---|---|
| [index.html](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/index.html) | `Cotafer - Smart Building IoT` | `Floor Management - Smart Building IoT` |
| [Navbar.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/components/Navbar.jsx) | `COTAFER` | `FLOOR MGMT` |
| [LoginPage.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/pages/LoginPage.jsx) | `COTAFER` | `FLOOR MANAGEMENT` |
| [server.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/src/server.js) | `Cotafer Server` | `Floor Management Server` |
| [package.json](file:///Users/hakk/Documents/Coding/web/car_parking_web/package.json) | `cotafer-iot` | `floor-management` |
| [server/package.json](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/package.json) | `cotafer-server` | `floor-management-server` |

---

## Verification & Testing Results

A comprehensive end-to-end integration test suite was executed against the running system:

| Test Case | Result | Details |
|---|---|---|
| **Admin Login & Auth** | ✅ PASS | Returns JWT with `role: admin`, `can_control: true` |
| **User Login & Auth** | ✅ PASS | Returns JWT with `role: user`, `can_control: true` |
| **Get /api/auth/me** | ✅ PASS | Returns user profile including `can_control` boolean |
| **Problem Report Submission** | ✅ PASS | Created report, returned ID & timestamp |
| **User View Own Reports** | ✅ PASS | Filtered to user's reports only |
| **Admin View All Reports** | ✅ PASS | Admin sees all submitted reports from all users |
| **Update Report Status** | ✅ PASS | Status transitioned from `pending` → `in_progress` |
| **Delete Report** | ✅ PASS | Report removed successfully |
| **Admin Disable User Control** | ✅ PASS | `PUT /api/users/2/control` set `can_control: false` |
| **Read-Only Device Control** | ✅ PASS | Disabled user got **403 Forbidden** on device control |
| **Read-Only Automation Control**| ✅ PASS | Disabled user got **403 Forbidden** on schedule automation |
| **Admin Re-enable Control** | ✅ PASS | Re-enabled user immediately regained control (200 OK) |
| **Rolling Door Interlock** | ✅ PASS | Command rejected with **400 Bad Request** while door in motion |
| **Rolling Door Auto-transition**| ✅ PASS | Door smoothly transitioned from `closing` → `closed` after 5.5s |
| **WebSocket `init-state` Push** | ✅ PASS | Immediate state push on connection with 6 devices + deviceStatus |

---

## Bugs Found & Fixed During Testing

1. **Stuck Transitional State on Server Restart**:
   - *Bug*: If the server restarted while the rolling door was in `opening` or `closing`, the door stayed stuck in motion and interlock rejected all future commands.
   - *Fix*: Added a startup recovery routine in [server.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/src/server.js) that automatically resolves any doors in transitional states (`opening` → `opened`, `closing` → `closed`).

2. **Tailwind v4 Dark Mode Variant Configuration**:
   - *Bug*: In Tailwind v4, `@custom-variant dark (&:where(.dark, .dark *))` was missing in [index.css](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/index.css), causing `.dark` class toggles to not apply properly in standard dark mode.
   - *Fix*: Added the custom variant and explicit light/dark CSS variables to `index.css`.

3. **ReportModal Theme Class Specificity**:
   - *Bug*: In [ReportModal.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/components/ReportModal.jsx), `bg-white` was appended after `dark:bg-slate-800`, overriding dark background in some browsers.
   - *Fix*: Cleaned up and ordered classes using standard `bg-white dark:bg-slate-800` precedence.

4. **AdminPanel Missing Reports Management UI**:
   - *Bug*: In [AdminPanel.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/components/AdminPanel.jsx), report API functions were imported but the UI section to view, update, and delete reports was omitted.
   - *Fix*: Added a full "Issue & Bug Reports" section with status badges, status dropdowns, and delete actions.

5. **Rolling Door Click Page Crash (`Loader2` Missing Import)**:
   - *Bug*: In [DeviceCard.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/components/DeviceCard.jsx), `<Loader2 />` was rendered when the rolling door started moving (`isMoving = true`), but `Loader2` was not imported from `lucide-react`. This threw an uncaught ReferenceError and blanked the screen.
   - *Fix*: Imported `Loader2` in `DeviceCard.jsx` and created an [ErrorBoundary.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/components/ErrorBoundary.jsx) in [main.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/main.jsx) to prevent any future uncaught rendering crashes from turning the screen blank.

7. **Theme Switcher Global CSS Overrides**:
   - *Bug*: Toggling the Sun/Moon theme button was not transforming the screen because dark Tailwind slate utility classes (`bg-slate-900`, `bg-slate-800`, `border-slate-700`, `text-slate-100`) were hardcoded across components.
   - *Fix*: Added global `html.light` CSS variable mapping and comprehensive class overrides in [index.css](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/index.css) so clicking the Sun/Moon button instantly toggles between modern Dark and clean Light modes. Added immediate `<script>` execution in [index.html](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/index.html) to prevent theme flashing on reload.

8. **Real-Time Bug/Issue Report Alerts & User Status Tracking**:
   - *Bug*: When a user reported an issue, admins online did not receive any live alert. When an admin updated the status of a report, the reporting user received no notification and had no view to track their submissions.
   - *Fix*:
     - In [reports.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/src/routes/reports.js), added `broadcastToAll` WebSocket events for `new-report`, `report-status-update`, and `report-deleted`.
     - In [DashboardPage.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/pages/DashboardPage.jsx), admins receive real-time toast alerts, bell notifications, and audio chimes when a new report arrives. When an admin changes the status (Pending → In Progress → Resolved), the submitting user receives a real-time notification toast and chime.
     - In [AdminPanel.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/components/AdminPanel.jsx), added live listener to automatically refresh the reports table on any change.
     - In [ReportModal.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/components/ReportModal.jsx), added a **"My Reports"** tab showing all reports submitted by the user with real-time colored status badges (`Pending`, `In Progress`, `Resolved`).

9. **Priority 1: Emergency Protocols (Evacuation & Master Lockdown)**:
   - *Feature*: High-priority facility life-safety emergency overrides.
   - *Backend*: [emergency.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/src/routes/emergency.js) routes `POST /api/emergency/evacuate`, `POST /api/emergency/lockdown`, `POST /api/emergency/clear`.
     - **Evacuation**: Forces Rolling Door `opened`, Boom Gate `opened`, all lights ON, flashes Party Light in hazard red, and emits continuous audio siren across active user terminals.
     - **Lockdown**: Forces Rolling Door `closed`, Boom Gate `closed`, restricting perimeter access.
     - **All Clear**: Restores standard operational mode.
   - *Frontend*: [EmergencyBar.jsx](file:///Users/hakk/Documents/Coding/web/car_parking_web/client/src/components/EmergencyBar.jsx) component with pulsing alarm banners, Web Audio API acoustic alarm, and admin confirmation modals.

10. **Priority 2: Dynamic Parking Space Management & Auto-Gate Interlock**:
    - *Feature*: Real-time parking slot occupancy monitoring, dynamic slot CRUD by Admin, and automated Boom Gate entry lockout when capacity is full.
    - *Backend*: [parking.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/src/routes/parking.js) with `GET /slots`, `POST /slots`, `DELETE /slots/:id`, `PUT /slots/:id/status`.
    - *Boom Gate Interlock*: In [devices.js](file:///Users/hakk/Documents/Coding/web/car_parking_web/server/src/routes/devices.js), attempting to open the Boom Gate when `available === 0` is rejected with **400 Bad Request** (`"Parking floor is at full capacity"`). Admins retain override access.
    - *ESP32 Firmware*: [esp32/floor_management_esp32.ino](file:///Users/hakk/Documents/Coding/web/car_parking_web/esp32/floor_management_esp32.ino) reads ultrasonic (HC-SR04) and IR proximity sensors, debounces readings for 1.5s, and emits `{ type: "slot-update", slotId, occupied }`.
11. **Dedicated Parking Tab UI Layout**:
    - *Improvement*: Moved `<ParkingFloor />` out of the "Controls" tab into its own dedicated **"Parking"** tab (`id: "parking"`).
    - *Navigation Badges*: Added live slot occupancy badge directly on the navigation tab for both Desktop and Mobile bottom bars:
      - Shows `X Free` in a crisp green badge when spaces are open.
      - Shows `FULL` in a prominent red badge when all slots are occupied.
    - *Spacious Layout*: Separates device switches from floor slot monitoring.

12. **Project README & Secure Repository Documentation**:
    - *Root README*: Created comprehensive [README.md](file:///Users/hakk/Documents/Coding/web/car_parking_web/README.md) at root with architecture diagrams, prerequisites, step-by-step dev and production startup instructions, default credentials (`admin`/`admin123`), hardware pinouts, and EC2 deployment guide.
    - *Secure Documentation Storage*: Kept all system architecture, wiring schematics, hardware pinouts, and API documentation privately in the repository's `docs/` folder for developers and administrators, keeping the public web interface clean and secure without exposed documentation endpoints.

---

## Verification & Testing Results

All integration tests and build validations passed:
- ✅ **Emergency Evacuation**: Exits opened, lights turned ON, `emergency-alert` (evacuate) received via WebSocket.
- ✅ **Master Lockdown**: Exits sealed, `emergency-alert` (lockdown) received via WebSocket.
- ✅ **Emergency Clear**: System returned to normal, `emergency-cleared` event broadcast.
- ✅ **Dynamic Slot Creation**: Admin created custom slot `Slot VIP-99`; `slots-changed` (create) received via WebSocket.
- ✅ **Full Capacity Interlock**: When slots filled to 100%, Boom Gate blocked normal user with **400 Bad Request**.
- ✅ **Admin Override**: Admin successfully opened Boom Gate despite full capacity.
- ✅ **Slot Vacated Unlock**: Once a slot vacated, normal users immediately regained access.
- ✅ **Dynamic Slot Deletion**: Admin deleted slot; `slots-changed` (delete) received via WebSocket.
- ✅ **Dedicated Parking Tab**: Controls and Parking views cleanly separated, live badge shows `X Free` / `FULL`.
- ✅ **Clean & Secure UI**: No public documentation endpoints or links exposed on the website.
- ✅ **Client Build**: `npm run build` compiled cleanly with 0 errors.

---

## Deployment

To deploy the updated code to your EC2 server:
```bash
# On your local machine, push to git
git add -A && git commit -m "Add project README, documentation endpoints, and dedicated parking tab" && git push

# On EC2
cd ~/cotafer && git pull && cd client && npm run build && pm2 restart all
```
