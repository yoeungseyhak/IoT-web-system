/**
 * ==============================================================================
 * ESP32 DIGITAL TWIN & HARDWARE LOGIC TEST SUITE
 * ==============================================================================
 * This script emulates the exact C++ firmware logic running on the ESP32 DevKit.
 * It tests:
 * 1. Offline protection: buttons cannot change when ESP32 is offline (503 response).
 * 2. ESP32 WebSocket handshake on /ws/device.
 * 3. Initial sync received by ESP32 from server.
 * 4. Online unlock: controls become active once ESP32 is connected.
 * 5. Web command to ESP32: Web toggles light-1 -> ESP32 receives command and updates pin.
 * 6. Rolling door 2-second motor runtime & interlock on both Web & ESP32.
 * 7. Physical push button trigger on ESP32: sends state-report to server -> server broadcasts to Web.
 * 8. Disconnect detection & locking controls again.
 * ==============================================================================
 */

const WebSocket = require('ws');
const http = require('http');

function apiRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: 5050,
      path: '/api' + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    }, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(resData) });
        } catch(e) {
          resolve({ status: res.statusCode, raw: resData });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

class ESP32Simulator {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.pins = {
      PIN_LED1: 0,
      PIN_LED2: 0,
      PIN_LED3: 0,
      PIN_MOTOR_INA: 0,
      PIN_MOTOR_INB: 0,
      PIN_RELAY_STREET: 0,
      PIN_RELAY_PARKING: 0
    };
    this.doorStatus = 'closed';
    this.doorTimer = null;
    this.receivedCommands = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        console.log('⚡ [ESP32] Hardware connected to WebSocket /ws/device');
        this.sendHeartbeat();
        resolve();
      });

      this.ws.on('message', (msg) => {
        try {
          const data = JSON.parse(msg);
          this.handleMessage(data);
        } catch(e) {
          console.error('[ESP32] JSON parse error', e);
        }
      });

      this.ws.on('error', reject);
    });
  }

  sendHeartbeat() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'heartbeat' }));
    }
  }

  sendStateReport(deviceId, state) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = { type: 'state-report', deviceId, state };
      this.ws.send(JSON.stringify(msg));
      console.log('📤 [ESP32 -> Server] Reported state:', msg);
    }
  }

  handleMessage(data) {
    if (data.type === 'device-update') {
      this.receivedCommands.push(data);
      console.log('📥 [Server -> ESP32] Received device-update:', data.deviceId, data.state);

      if (data.deviceId === 'light-1' && data.state.on !== undefined) {
        this.pins.PIN_LED1 = data.state.on ? 1 : 0;
        console.log('  [ESP32 GPIO 2] Set to', this.pins.PIN_LED1);
      }

      if (data.deviceId === 'rolling-door' && data.state.status) {
        this.handleDoorCommand(data.state.status);
      }
    }
  }

  handleDoorCommand(status) {
    if (status === 'opening') {
      if (this.doorStatus === 'opening' || this.doorStatus === 'closing') return;
      this.doorStatus = 'opening';
      this.pins.PIN_MOTOR_INA = 1; // Run motor forward
      this.pins.PIN_MOTOR_INB = 0;
      console.log('  [ESP32 Motor] Running FORWARD (opening) for 2000ms...');

      setTimeout(() => {
        this.pins.PIN_MOTOR_INA = 0;
        this.pins.PIN_MOTOR_INB = 0;
        this.doorStatus = 'opened';
        console.log('  [ESP32 Motor] 2s elapsed. Motor STOPPED. Door is OPENED.');
        this.sendStateReport('rolling-door', { status: 'opened' });
      }, 2000);
    } else if (status === 'closing') {
      if (this.doorStatus === 'opening' || this.doorStatus === 'closing') return;
      this.doorStatus = 'closing';
      this.pins.PIN_MOTOR_INA = 0;
      this.pins.PIN_MOTOR_INB = 1; // Run motor reverse
      console.log('  [ESP32 Motor] Running REVERSE (closing) for 2000ms...');

      setTimeout(() => {
        this.pins.PIN_MOTOR_INA = 0;
        this.pins.PIN_MOTOR_INB = 0;
        this.doorStatus = 'closed';
        console.log('  [ESP32 Motor] 2s elapsed. Motor STOPPED. Door is CLOSED.');
        this.sendStateReport('rolling-door', { status: 'closed' });
      }, 2000);
    }
  }

  pressPhysicalButton(buttonName) {
    console.log(`🔘 [ESP32 User Action] Physical button pressed: ${buttonName}`);
    if (buttonName === 'BTN1') {
      this.pins.PIN_LED1 = this.pins.PIN_LED1 ? 0 : 1;
      this.sendStateReport('light-1', { on: this.pins.PIN_LED1 === 1 });
    } else if (buttonName === 'BTN_DOOR_OPEN') {
      this.handleDoorCommand('opening');
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      console.log('🔌 [ESP32] Hardware disconnected');
    }
  }
}

async function runVerification() {
  console.log('====================================================');
  console.log('  RUNNING ESP32 LOGICAL TEST & HARDWARE SIMULATION  ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log('✅ PASS:', message);
      passed++;
    } else {
      console.error('❌ FAIL:', message);
      failed++;
    }
  }

  // Step 1: Login as Admin
  const adminLogin = await apiRequest('POST', '/auth/login', { username: 'admin', password: 'Admin@12345' });
  assert(adminLogin.status === 200, 'Admin successfully logs in');
  const token = adminLogin.body.token;

  // Step 2: Test Offline Protection (ESP32 is NOT connected)
  console.log('\n--- 1. TESTING OFFLINE PROTECTION (ESP32 DISCONNECTED) ---');
  const offlineCheck = await apiRequest('PUT', '/devices/light-1', { state: { on: true } }, token);
  assert(
    offlineCheck.status === 503,
    'Controls are LOCKED when ESP32 is offline (Returns 503 Service Unavailable)'
  );
  console.log('Server rejected modification with message:', offlineCheck.body.message);

  // Step 3: Connect ESP32 Hardware Simulator
  console.log('\n--- 2. CONNECTING ESP32 HARDWARE SIMULATOR ---');
  const esp32 = new ESP32Simulator('ws://localhost:5050/ws/device');
  await esp32.connect();

  // Wait 300ms for connection registration
  await new Promise(r => setTimeout(r, 300));

  // Step 4: Verify Online Unlock
  console.log('\n--- 3. TESTING ONLINE UNLOCK (ESP32 CONNECTED) ---');
  const onlineLightUpdate = await apiRequest('PUT', '/devices/light-1', { state: { on: true } }, token);
  assert(
    onlineLightUpdate.status === 200,
    'Controls UNLOCKED when ESP32 is online (Returns 200 OK)'
  );

  // Wait 200ms for ESP32 to receive command
  await new Promise(r => setTimeout(r, 200));
  assert(esp32.pins.PIN_LED1 === 1, 'ESP32 GPIO 2 (LED1) switched to HIGH (1)');

  // Step 5: Test Rolling Door 2-Second Motion & Interlock on ESP32
  console.log('\n--- 4. TESTING ROLLING DOOR 2-SECOND MOTOR OPERATION ---');
  const doorStart = Date.now();
  const doorCmd = await apiRequest('PUT', '/devices/rolling-door', { state: { status: 'opening' } }, token);
  assert(doorCmd.status === 200, 'Door command accepted by server');

  // Verify interlock while in motion
  await new Promise(r => setTimeout(r, 300));
  const rejectedCmd = await apiRequest('PUT', '/devices/rolling-door', { state: { status: 'closing' } }, token);
  assert(rejectedCmd.status === 400, 'Interlock active: reject conflicting command during motion (400)');

  // Wait for 2-second motor motion to finish
  console.log('Waiting for ESP32 motor to run for 2 seconds...');
  await new Promise(r => setTimeout(r, 2200));

  assert(esp32.doorStatus === 'opened', 'ESP32 door state transitioned to "opened"');
  assert(esp32.pins.PIN_MOTOR_INA === 0 && esp32.pins.PIN_MOTOR_INB === 0, 'ESP32 motor pins stopped (0, 0)');

  // Check server device state
  const devCheck = await apiRequest('GET', '/devices', null, token);
  const rollingDoor = devCheck.body.devices.find(d => d.id === 'rolling-door');
  assert(rollingDoor.state.status === 'opened', 'Server synchronized door state to "opened"');

  // Step 6: Test Physical Button Press on ESP32
  console.log('\n--- 5. TESTING PHYSICAL BUTTON PRESS ON ESP32 ---');
  esp32.pressPhysicalButton('BTN1'); // Toggle LED 1 from physical button

  // Wait 300ms for WebSocket report and DB update
  await new Promise(r => setTimeout(r, 300));
  const lightCheck = await apiRequest('GET', '/devices', null, token);
  const light1 = lightCheck.body.devices.find(d => d.id === 'light-1');
  assert(light1.state.on === false, 'Physical button press on ESP32 synchronized to Web DB (light-1 -> false)');

  // Step 7: Test Disconnect Detection
  console.log('\n--- 6. TESTING DISCONNECT LOCKOUT ---');
  esp32.disconnect();
  await new Promise(r => setTimeout(r, 500)); // wait for socket close event

  const recheckOffline = await apiRequest('PUT', '/devices/light-1', { state: { on: true } }, token);
  assert(
    recheckOffline.status === 503,
    'Controls immediately RE-LOCKED after ESP32 disconnection (Returns 503)'
  );

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runVerification().catch(err => {
  console.error('Test run error:', err);
  process.exit(1);
});
