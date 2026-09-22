# Implementation Tasks

## 1. Rolling Door Open/Close Interlock Logic
- [x] Backend: Add rolling door motion interlock in `server/src/routes/devices.js`
- [x] Frontend: Simplify `RollingDoorCard` to Open/Close only with motion lock UI

## 2. Instant Initial Data Sync & Real-Time Status
- [x] Backend: Send `init-state` on WebSocket connection in `server/src/websocket.js`
- [x] Frontend: Handle `init-state` event and `visibilitychange` re-sync in `DashboardPage.jsx`

## 3. Fix Double Notification Alerts
- [x] Fix WebSocket reconnect race in `client/src/App.jsx`
- [x] Add notification deduplication in `DashboardPage.jsx`

## 4. Admin User Control ("Uncontrollable" Mode)
- [x] Database: Add `can_control` column to `users` table
- [x] Backend: Include `can_control` in auth/login/JWT
- [x] Backend: Add `PUT /api/users/:id/control` route
- [x] Backend: Enforce `can_control` check in device routes
- [x] Frontend: Add control toggle in `AdminPanel.jsx`
- [x] Frontend: Lock controls for uncontrollable users in `DeviceCard.jsx`

## 5. Problem & Bug Reporting System
- [x] Database: Create `reports` table
- [x] Backend: Create `server/src/routes/reports.js`
- [x] Backend: Register reports route in `server.js`
- [x] Frontend: Create `ReportModal.jsx`
- [x] Frontend: Add reports API functions in `api.js`
- [x] Frontend: Add Reports section in `AdminPanel.jsx`

## 6. Light & Dark Theme Switcher
- [x] Create `ThemeContext.jsx`
- [x] Wire ThemeProvider into `App.jsx`
- [x] Add theme toggle button in `Navbar.jsx`

## 7. System Rebranding to "Floor Management"
- [x] Update `client/index.html` title
- [x] Update `Navbar.jsx` brand text
- [x] Update `LoginPage.jsx` heading
- [x] Update `DashboardPage.jsx` browser notifications
- [x] Update `package.json` names

## ✅ Build Verification
- [x] `npm run build` — 0 errors, 1502 modules transformed, built in 844ms
