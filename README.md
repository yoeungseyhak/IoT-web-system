# Floor Management — Smart Building & Car Parking IoT System

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18.3-cyan.svg)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5.4-purple.svg)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-blue.svg)](https://tailwindcss.com)
[![WebSocket](https://img.shields.io/badge/WebSocket-Realtime-orange.svg)](https://github.com/websockets/ws)
[![ESP32](https://img.shields.io/badge/Hardware-ESP32-red.svg)](https://espressif.com)

A modern, full-stack IoT floor and car parking management platform. Built for facility administrators and occupants to manage building entry, parking bays, lighting automations, emergency life-safety protocols, and maintenance problem reporting in real time.

---

## 🌟 Key Features

1. **🚨 Life-Safety Emergency Protocols (Priority 1)**:
   - **Emergency Evacuation**: One-click facility evacuation triggering audible Web Audio alarms, opening all rolling doors and boom gates, activating maximum lighting, and pulsing the party light in hazard red.
   - **Master Lockdown**: One-click perimeter lockdown sealing all entrances and exits.
   - **All Clear**: Instantly resets alarms and restores standard operation.

2. **🚗 Smart Parking Space Management (Priority 2)**:
   - **Dedicated Parking Tab**: Real-time floor plan visualization with live occupancy counters (`X Free` / `FULL` badges).
   - **Dynamic Bay Management**: Facility admins can dynamically add, configure, or remove parking slots.
   - **Automated Boom Gate Interlock**: Prevents entry barrier from opening when the lot is at 100% capacity (with emergency/admin override).
   - **ESP32 Sensor Integration**: Ultrasonic (HC-SR04) and IR proximity sensor debounce logic for automated slot tracking.

3. **🚪 Rolling Door & Boom Gate Interlocks**:
   - 2-second safe motion transit with automatic state progression (`opening` → `opened`, `closing` → `closed`).
   - Anti-jamming and concurrent motion rejection.

4. **💡 Multi-Device Automation**:
   - Countdown off-timers, weekly recurrence scheduling, and cycle counter tracking.

5. **👥 Role-Based Access & User Control**:
   - **Admin Panel**: User creation, password resets, and audit logs.
   - **"Read-Only" Toggle**: Admins can lock individual users into view-only mode to prevent unauthorized device operations.

6. **📝 Problem & Issue Reporting System**:
   - In-app reporting for hardware faults, bugs, and building repairs.
   - Live WebSocket alerts to administrators and real-time status tracking for users (`Pending` → `In Progress` → `Resolved`).

7. **🌓 Modern Dual Theme**:
   - Sleek dark theme by default, with instant high-contrast light mode toggle.

---

## 🏗️ System Architecture

```
                                  +-----------------------------+
                                  |     Web Browser Client      |
                                  |   (React 18 + Vite + CSS)   |
                                  +--------------+--------------+
                                                 |
                               HTTP REST API /   |   Real-Time WebSockets
                               JWT Bearer Auth   |   (ws://...:5050)
                                                 v
                                  +-----------------------------+
                                  |     Node.js Express Server  |
                                  |   (Port 5050 / WebSocket)   |
                                  +-------+--------------+------+
                                          |              |
                    SQL Queries / Storage |              | WebSocket Telemetry
                                          v              v
                           +----------------+    +-----------------------+
                           | SQLite Database|    |  ESP32 Microcontroller|
                           | (database.db)  |    |  (Sensors & Relays)   |
                           +----------------+    +-----------------------+
```

---

## 📋 Prerequisites

Before running the project, make sure you have installed:
- **Node.js**: v18.0.0 or higher ([Download Node.js](https://nodejs.org/))
- **npm**: v9.0.0 or higher (comes with Node.js)
- **Git**: For version control
- *(Optional for Hardware)*: **Arduino IDE 2.x** or PlatformIO for flashing the ESP32 microcontroller

---

## 🚀 How to Run the Project

### 1. Clone the Repository & Install Dependencies

From the project root directory:

```bash
# Clone the repository (if not already cloned)
git clone <your-repo-url>
cd car_parking_web

# Install dependencies for both server and client with one command:
npm run install:all
```

*(Alternatively, install them manually)*:
```bash
cd server && npm install
cd ../client && npm install
cd ..
```

---

### 2. Environment Variables Configuration

Create a `.env` file in the `server/` directory (or use defaults):

```bash
cat << 'EOF' > server/.env
PORT=5050
JWT_SECRET=floor_management_jwt_secret_key_2026_super_secure
ALLOW_OFFLINE_CONTROL=true
EOF
```

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `5050` | Port for the backend API, WebSockets, and static client hosting |
| `JWT_SECRET` | *(auto-generated)* | Secret key used to sign and verify authentication tokens |
| `ALLOW_OFFLINE_CONTROL` | `false` | When set to `true`, enables web UI testing even when physical ESP32 is offline |

---

### 3. Running in Development Mode

To run both the server and client dev servers side-by-side with hot reload:

#### **Terminal 1 (Backend Server)**:
```bash
# From project root:
npm run server

# Or run with auto-reload:
npm run dev
```
> Server starts at **`http://localhost:5050`**

#### **Terminal 2 (Frontend Client)**:
```bash
# From project root:
npm run client
```
> Vite dev server starts at **`http://localhost:5173`** (proxies API & WebSockets to port 5050)

---

### 4. Running in Production / All-In-One Mode (Recommended)

In production mode, the Express server serves both the REST API, WebSockets, and the compiled React single-page application on a single port (**5050**):

```bash
# 1. Build the frontend
npm run build

# 2. Start the unified production server
npm start
```

Now open your browser and visit:
👉 **`http://localhost:5050`**

---

## 🔑 Default User Accounts

When the server first boots, it seeds the SQLite database (`server/database.sqlite`) with default accounts:

| Username | Password | Role | Permissions |
| :--- | :--- | :--- | :--- |
| **`admin`** | **`admin123`** | `admin` | Full control: Device switching, Emergency protocols, Parking slot CRUD, User management, Issue status updates |
| **`user1`** | **`user123`** | `user` | Standard control: Device switching (if enabled), Problem reporting, Personal profile |

---

## 📖 Repository Documentation

To maintain security and prevent exposing system specifications publicly on the web, all architectural manuals, wiring guides, and API references are kept securely within the repository in the [`docs/`](docs/) directory:

- [`docs/api_documentation.md`](docs/api_documentation.md) — REST API endpoints & WebSocket protocol reference.
- [`docs/aws_ec2_deploy_guide.md`](docs/aws_ec2_deploy_guide.md) — Production deployment guide for AWS EC2 with PM2 and Nginx.
- [`docs/esp32_hardware_wiring_guide.md`](docs/esp32_hardware_wiring_guide.md) — Microcontroller pin assignments and sensor wiring tables.
- [`docs/physical_system_wiring_diagram.md`](docs/physical_system_wiring_diagram.md) — Full electrical schematic and power rail distribution.
- [`docs/system_architecture_diagram.md`](docs/system_architecture_diagram.md) — System architecture diagram and data flows.
- [`docs/walkthrough.md`](docs/walkthrough.md) — System feature changelog and test verification.

---

## ⚡ ESP32 Hardware Firmware Setup

1. Open [`esp32/floor_management_esp32.ino`](esp32/floor_management_esp32.ino) in **Arduino IDE 2.x**.
2. Install required Arduino libraries via Library Manager:
   - `WebSocketsClient` by Markus Sattler
   - `ArduinoJson` (v6 or v7) by Benoit Blanchon
   - `ESP32Servo` by Kevin Harrington
3. Configure your WiFi credentials and Server IP in the sketch:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   const char* ws_host = "192.168.1.100"; // IP address of your Node.js server
   const int ws_port = 5050;
   ```
4. Connect your ESP32 via USB and click **Upload**.

### Hardware Pin Reference:
| Component | ESP32 GPIO | Description |
| :--- | :--- | :--- |
| **Rolling Door Motor (IN1)** | `GPIO 18` | L9110S Motor Driver Forward |
| **Rolling Door Motor (IN2)** | `GPIO 19` | L9110S Motor Driver Reverse |
| **Boom Gate Servo** | `GPIO 4` | SG90 9g Micro Servo (0° Closed, 90° Open) |
| **Zone A Lighting** | `GPIO 21` | Relay Channel 1 / LED |
| **Zone B Lighting** | `GPIO 22` | Relay Channel 2 / LED |
| **Emergency Party Siren** | `GPIO 23` | High-visibility emergency beacon / LED |
| **Parking Slot 1 Sensor** | `GPIO 5` (Echo), `GPIO 2` (Trig) | HC-SR04 Ultrasonic Distance Sensor |
| **Parking Slot 2 Sensor** | `GPIO 15` | Digital IR Obstacle Sensor (Active LOW) |

---

## ☁️ Production Deployment (AWS EC2)

For complete instructions with Nginx and SSL, refer to [`docs/aws_ec2_deploy_guide.md`](docs/aws_ec2_deploy_guide.md).

### Quick Deployment Steps:

```bash
# 1. SSH into your EC2 Ubuntu instance
ssh -i your-key.pem ubuntu@<EC2-PUBLIC-IP>

# 2. Navigate to project and pull latest changes
cd ~/cotafer
git pull origin main

# 3. Build the frontend
cd client && npm run build
cd ..

# 4. Restart services with PM2
pm2 restart all || pm2 start server/src/server.js --name "floor-management" --env PORT=5050
```

---

## 📁 Repository Structure

```
car_parking_web/
├── client/                     # Frontend React SPA
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   │   ├── EmergencyBar.jsx    # Emergency protocol banner & sound alarm
│   │   │   ├── ParkingFloor.jsx    # Real-time parking slot visual floor plan
│   │   │   ├── AddSlotModal.jsx    # Admin dynamic parking slot creator
│   │   │   ├── DeviceCard.jsx      # Device controls (Door, Gate, Lights)
│   │   │   ├── Navbar.jsx          # Top navigation with /docs link & theme
│   │   │   ├── AdminPanel.jsx      # User control & bug report management
│   │   │   └── ReportModal.jsx     # Problem reporting modal
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx   # Tabbed view (Controls, Parking, Admin, Logs)
│   │   │   └── LoginPage.jsx       # Auth login screen
│   │   └── api.js              # REST API client
│   └── package.json
├── server/                     # Backend Node.js / Express API & WebSocket
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js         # Login, JWT issuing, user verification
│   │   │   ├── devices.js      # Device controls & boom gate capacity check
│   │   │   ├── emergency.js    # Evacuation & lockdown state machine
│   │   │   ├── parking.js      # Dynamic slot CRUD & status updates
│   │   │   ├── reports.js      # Issue reporting CRUD & WebSocket broadcasts
│   │   │   ├── docs.js         # Documentation REST API & HTML viewer
│   │   │   └── users.js        # User management & "read-only" toggles
│   │   ├── database.js         # SQLite schema, migrations & seed records
│   │   ├── websocket.js        # ESP32 and browser WebSocket server
│   │   └── server.js           # Server entry point & startup recovery
│   └── package.json
├── esp32/                      # Microcontroller C++ firmware
│   └── floor_management_esp32.ino # Sensor debouncing, servo & motor controls
├── docs/                       # Complete manuals and architecture documentation
│   ├── api_documentation.md
│   ├── aws_ec2_deploy_guide.md
│   ├── esp32_hardware_wiring_guide.md
│   ├── physical_system_wiring_diagram.md
│   ├── system_architecture_diagram.md
│   ├── walkthrough.md
│   └── README.md
├── package.json                # Root automation scripts (npm run server/client/build)
└── README.md                   # This project manual
```

---

## 📄 License

This project is licensed under the MIT License — free for educational, personal, and commercial usage.
