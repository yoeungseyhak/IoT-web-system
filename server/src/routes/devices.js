const express = require('express');
const { getDb } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { broadcastDeviceUpdate, broadcastToAll, getDeviceStatus, setDeviceStatus, getEsp32Status, setEsp32Status, isControllerOnlineForDevice } = require('../websocket');
const {
  getAutomation,
  setSchedule,
  setCountdown,
  setCycleCount,
  cancelAutomation
} = require('../automation');

const router = express.Router();

const rollingDoorTimers = new Map();

router.use(authenticateToken);

// Middleware to check can_control (Super Admin is always allowed; Admins and Users require can_control !== 0)
function checkCanControl(req, res, next) {
  if (req.user.role === 'superadmin') return next();
  try {
    const db = getDb();
    const user = db.prepare('SELECT can_control FROM users WHERE id = ?').get(req.user.id);
    if (user && user.can_control === 0) {
      return res.status(403).json({ message: 'Control disabled. Your account is in read-only mode.' });
    }
    next();
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// Middleware to verify physical ESP32 device is connected
function requireDeviceOnline(req, res, next) {
  if (process.env.ALLOW_OFFLINE_CONTROL === 'true') {
    return next();
  }
  const deviceId = req.params.id;
  if (deviceId && typeof isControllerOnlineForDevice === 'function') {
    if (!isControllerOnlineForDevice(deviceId)) {
      return res.status(503).json({
        message: 'Assigned ESP32 controller is offline or not responding. Controls are disabled until it reconnects.'
      });
    }
    return next();
  }
  const status = getDeviceStatus();
  if (!status || !status.online) {
    return res.status(503).json({
      message: 'ESP32 device is offline or not responding. Controls are disabled until the device reconnects.'
    });
  }
  next();
}

// Middleware to verify device is not disabled
function requireDeviceEnabled(req, res, next) {
  try {
    const db = getDb();
    const device = db.prepare('SELECT name, disabled FROM devices WHERE id = ?').get(req.params.id);
    if (device && device.disabled === 1) {
      return res.status(423).json({
        message: `"${device.name}" is currently disabled. Controls are locked until re-enabled.`
      });
    }
    next();
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// GET /api/devices - Get all devices + Device status + automations
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const devices = db.prepare(`
      SELECT d.*, c.name as controller_name 
      FROM devices d 
      LEFT JOIN controllers c ON d.controller_id = c.id 
      ORDER BY d.id
    `).all();

    // Parse state JSON and attach automation info for each device
    const parsed = devices.map(d => ({
      ...d,
      disabled: Boolean(d.disabled),
      state: JSON.parse(d.state || '{}'),
      automation: getAutomation(d.id)
    }));

    const deviceStatus = (getDeviceStatus || getEsp32Status)();

    res.json({
      devices: parsed,
      deviceStatus,
      esp32Status: deviceStatus
    });
  } catch (err) {
    console.error('Get devices error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/devices/:id - Update device state
router.put('/:id', checkCanControl, requireDeviceEnabled, requireDeviceOnline, (req, res) => {
  try {
    const { id } = req.params;
    const { state } = req.body;

    if (!state || typeof state !== 'object') {
      return res.status(400).json({ message: 'State object required' });
    }

    const db = getDb();
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    const existingState = JSON.parse(device.state || '{}');
    
    // Rolling door interlock check
    if (device.type === 'rolling-door' && state.status) {
      if (existingState.status === 'opening' || existingState.status === 'closing') {
        return res.status(400).json({ message: 'Rolling door is in motion. Please wait until operation completes.' });
      }
    }

    // Boom gate full capacity interlock check
    if (device.type === 'boom-gate' && (state.status === 'opened' || state.status === 'open')) {
      let slots = [];
      if (device.controller_id && device.controller_id !== 'all') {
        slots = db.prepare('SELECT occupied FROM parking_slots WHERE controller_id = ?').all(device.controller_id);
      }
      if (slots.length === 0) {
        slots = db.prepare('SELECT occupied FROM parking_slots').all();
      }
      if (slots.length > 0) {
        const occupied = slots.filter(s => s.occupied === 1 || s.occupied === true).length;
        const available = Math.max(0, slots.length - occupied);
        if (available === 0 && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
          return res.status(400).json({
            message: 'Cannot open boom gate: Parking floor is at full capacity (0 slots available).'
          });
        }
      }
    }

    // Check if the requested state actually changes anything
    const stateKeys = Object.keys(state);
    const hasChanged = stateKeys.length === 0 || stateKeys.some(k => existingState[k] !== state[k]);
    if (!hasChanged) {
      return res.json({
        ...device,
        disabled: Boolean(device.disabled),
        state: existingState,
        updated_at: device.updated_at
      });
    }

    // Merge existing state with new state (partial update)
    const newState = { ...existingState, ...state };

    db.prepare('UPDATE devices SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(JSON.stringify(newState), id);

    // Rolling door auto transition timer
    if (device.type === 'rolling-door' && (state.status === 'opening' || state.status === 'closing')) {
      if (rollingDoorTimers.has(id)) {
        clearTimeout(rollingDoorTimers.get(id));
      }
      const timer = setTimeout(() => {
        try {
          const targetStatus = state.status === 'opening' ? 'opened' : 'closed';
          const finalState = { ...newState, status: targetStatus };
          db.prepare('UPDATE devices SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(JSON.stringify(finalState), id);
          broadcastDeviceUpdate(id, finalState, 'system-timer');
        } catch (e) {
          console.error('Rolling door timer error:', e);
        }
        rollingDoorTimers.delete(id);
      }, 2000);
      rollingDoorTimers.set(id, timer);
    }

    // Create log entry
    const stateDesc = Object.entries(state).map(([k, v]) => `${k}: ${v}`).join(', ');
    db.prepare('INSERT INTO logs (user_id, username, action, device_id, device_name, details) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.id, req.user.username, 'device-update', id, device.name, stateDesc);

    // Broadcast to all connected clients via WebSocket
    broadcastDeviceUpdate(id, newState, req.user.username);

    res.json({
      ...device,
      disabled: Boolean(device.disabled),
      state: newState,
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Update device error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/devices/heartbeat - Device heartbeat ping
router.post('/heartbeat', (req, res) => {
  (setDeviceStatus || setEsp32Status)(true);
  res.json({ ok: true });
});

// POST /api/devices/device/heartbeat - Device heartbeat ping
router.post('/device/heartbeat', (req, res) => {
  (setDeviceStatus || setEsp32Status)(true);
  res.json({ ok: true });
});

// POST /api/devices/esp32/heartbeat - Device heartbeat ping (backwards compatible alias)
router.post('/esp32/heartbeat', (req, res) => {
  (setDeviceStatus || setEsp32Status)(true);
  res.json({ ok: true });
});


// GET /api/devices/:id/automation - Get device automation
router.get('/:id/automation', (req, res) => {
  try {
    const { id } = req.params;
    const automation = getAutomation(id);
    res.json(automation);
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/devices/:id/schedule - Set time schedule
router.post('/:id/schedule', checkCanControl, requireDeviceEnabled, requireDeviceOnline, (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, on_time, off_time, days, timezone, tz_offset } = req.body;
    const hasOn = typeof on_time === 'string' && on_time.trim().length > 0;
    const hasOff = typeof off_time === 'string' && off_time.trim().length > 0;
    if (!hasOn && !hasOff) {
      return res.status(400).json({ message: 'Please specify at least one Turn ON or Turn OFF time' });
    }
    const updated = setSchedule(id, { enabled, on_time, off_time, days, timezone, tz_offset }, req.user.username);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/devices/:id/countdown - Set countdown timer (auto on/off)
router.post('/:id/countdown', checkCanControl, requireDeviceEnabled, requireDeviceOnline, (req, res) => {
  try {
    const { id } = req.params;
    const { action, duration_seconds } = req.body;
    if (!action || !duration_seconds) {
      return res.status(400).json({ message: 'action and duration_seconds are required' });
    }
    const updated = setCountdown(id, { action, duration_seconds }, req.user.username);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/devices/:id/cycle-count - Set count to turn on/off
router.post('/:id/cycle-count', checkCanControl, requireDeviceEnabled, requireDeviceOnline, (req, res) => {
  try {
    const { id } = req.params;
    const { total_count, interval_on_sec, interval_off_sec } = req.body;
    if (!total_count || !interval_on_sec || !interval_off_sec) {
      return res.status(400).json({ message: 'total_count, interval_on_sec, and interval_off_sec are required' });
    }
    const updated = setCycleCount(id, { total_count, interval_on_sec, interval_off_sec }, req.user.username);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/devices/:id/automation/:type - Cancel automation
router.delete('/:id/automation/:type', (req, res) => {
  try {
    const { id, type } = req.params;
    const updated = cancelAutomation(id, type, req.user.username);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/devices - Add new component (Admin only)
router.post('/', requireAdmin, (req, res) => {
  try {
    const { name, type, pin, controller_id } = req.body;
    if (!name || !type) {
      return res.status(400).json({ message: 'Name and type are required' });
    }

    const validTypes = ['light', 'rolling-door', 'boom-gate', 'party-light'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    }

    const id = `${type}-${Date.now().toString(36)}`;
    let defaultState = {};
    if (type === 'light') defaultState = { on: false };
    else if (type === 'rolling-door') defaultState = { status: 'closed' };
    else if (type === 'boom-gate') defaultState = { status: 'closed' };
    else if (type === 'party-light') defaultState = { on: false, brightness: 100, color: '#ff00ff', mode: 'static' };

    const pinVal = pin ? pin.trim() : '';
    const controllerVal = controller_id ? controller_id.trim() : '';

    const db = getDb();
    db.prepare('INSERT INTO devices (id, name, type, pin, controller_id, state) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, name.trim(), type, pinVal, controllerVal, JSON.stringify(defaultState));

    let controllerName = '';
    if (controllerVal) {
      const cRow = db.prepare('SELECT name FROM controllers WHERE id = ?').get(controllerVal);
      if (cRow) controllerName = cRow.name;
    }

    db.prepare('INSERT INTO logs (user_id, username, action, device_id, device_name, details) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.id, req.user.username, 'create-component', id, name, `Added ${type} with pin "${pinVal}" (controller: ${controllerVal || 'all'})`);

    const newDevice = {
      id,
      name: name.trim(),
      type,
      pin: pinVal,
      controller_id: controllerVal,
      controller_name: controllerName,
      disabled: false,
      state: defaultState,
      automation: getAutomation(id),
      updated_at: new Date().toISOString()
    };

    broadcastToAll({
      type: 'devices-changed',
      action: 'create',
      device: newDevice,
      timestamp: Date.now()
    });

    res.status(201).json(newDevice);
  } catch (err) {
    console.error('Create device error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/devices/:id/details - Update component name, pin, controller, or disabled state (Admin only)
router.put('/:id/details', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { name, pin, controller_id, disabled } = req.body;

    const db = getDb();
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    const newName = name !== undefined && name !== null ? name.trim() : device.name;
    const newPin = pin !== undefined && pin !== null ? pin.trim() : (device.pin || '');
    const newController = controller_id !== undefined ? (controller_id || '').trim() : (device.controller_id || '');
    const newDisabled = disabled !== undefined ? (disabled ? 1 : 0) : (device.disabled || 0);

    db.prepare('UPDATE devices SET name = ?, pin = ?, controller_id = ?, disabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newName, newPin, newController, newDisabled, id);

    let controllerName = '';
    if (newController) {
      const cRow = db.prepare('SELECT name FROM controllers WHERE id = ?').get(newController);
      if (cRow) controllerName = cRow.name;
    }

    const disabledChanged = disabled !== undefined && (Boolean(device.disabled) !== Boolean(newDisabled));
    const logDetail = disabledChanged
      ? `${newDisabled ? 'Disabled component' : 'Re-enabled component'} (name: "${newName}", pin: "${newPin}")`
      : `Updated name to "${newName}", pin to "${newPin}", controller to "${newController || 'all'}"`;

    db.prepare('INSERT INTO logs (user_id, username, action, device_id, device_name, details) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.id, req.user.username, 'update-component', id, newName, logDetail);

    const updatedDevice = {
      ...device,
      name: newName,
      pin: newPin,
      controller_id: newController,
      controller_name: controllerName,
      disabled: Boolean(newDisabled),
      state: JSON.parse(device.state || '{}'),
      automation: getAutomation(id),
      updated_at: new Date().toISOString()
    };

    broadcastToAll({
      type: 'devices-changed',
      action: 'update',
      device: updatedDevice,
      timestamp: Date.now()
    });

    res.json(updatedDevice);
  } catch (err) {
    console.error('Update device details error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/devices/:id - Remove component (Admin only)
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    db.prepare('DELETE FROM devices WHERE id = ?').run(id);
    try {
      db.prepare('DELETE FROM automations WHERE device_id = ?').run(id);
    } catch (e) {}

    db.prepare('INSERT INTO logs (user_id, username, action, device_id, device_name, details) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.id, req.user.username, 'delete-component', id, device.name, `Deleted component "${device.name}" (${device.type})`);

    broadcastToAll({
      type: 'devices-changed',
      action: 'delete',
      deviceId: id,
      timestamp: Date.now()
    });

    res.json({ message: `Device "${device.name}" deleted successfully` });
  } catch (err) {
    console.error('Delete device error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
