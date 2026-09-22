const express = require('express');
const { getDb } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { broadcastToAll, broadcastDeviceUpdate } = require('../websocket');

const router = express.Router();
router.use(authenticateToken);

let emergencyState = {
  mode: 'normal', // 'normal' | 'evacuate' | 'lockdown'
  triggeredBy: null,
  timestamp: null
};

// Initialize from database if available
function initEmergencyState() {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value, updated_at FROM system_settings WHERE key = 'emergency_mode'").get();
    if (row) {
      emergencyState.mode = row.value || 'normal';
      emergencyState.timestamp = row.updated_at ? new Date(row.updated_at).getTime() : null;
    }
  } catch (e) {
    console.error('Error initializing emergency state:', e);
  }
}

// GET /api/emergency/status
router.get('/status', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value, updated_at FROM system_settings WHERE key = 'emergency_mode'").get();
    const mode = row ? row.value : emergencyState.mode;
    res.json({
      mode,
      triggeredBy: emergencyState.triggeredBy,
      timestamp: emergencyState.timestamp
    });
  } catch (err) {
    console.error('Get emergency status error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/emergency/evacuate
// Trigger Emergency Evacuation (Opens all exits, turns lights on, sounds alarm)
router.post('/evacuate', (req, res) => {
  try {
    const db = getDb();
    emergencyState = {
      mode: 'evacuate',
      triggeredBy: req.user.username,
      timestamp: Date.now()
    };

    // Update settings in database
    db.prepare("UPDATE system_settings SET value = 'evacuate', updated_at = CURRENT_TIMESTAMP WHERE key = 'emergency_mode'").run();

    // 1. Force Rolling Door OPEN
    db.prepare("UPDATE devices SET state = '{\"status\":\"opened\"}', updated_at = CURRENT_TIMESTAMP WHERE id = 'rolling-door'").run();
    broadcastDeviceUpdate('rolling-door', { status: 'opened' }, 'EMERGENCY_EVACUATE');

    // 2. Force Boom Gate OPEN
    db.prepare("UPDATE devices SET state = '{\"status\":\"opened\"}', updated_at = CURRENT_TIMESTAMP WHERE id = 'boom-gate'").run();
    broadcastDeviceUpdate('boom-gate', { status: 'opened' }, 'EMERGENCY_EVACUATE');

    // 3. Turn all lights ON for safe evacuation
    const lights = ['light-1', 'light-2', 'light-3'];
    lights.forEach(lightId => {
      db.prepare("UPDATE devices SET state = '{\"on\":true}', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(lightId);
      broadcastDeviceUpdate(lightId, { on: true }, 'EMERGENCY_EVACUATE');
    });

    // 4. Set Party Light to alert mode (solid white / maximum brightness)
    db.prepare("UPDATE devices SET state = '{\"on\":true,\"brightness\":100,\"color\":\"#ff0000\",\"mode\":\"flash\"}', updated_at = CURRENT_TIMESTAMP WHERE id = 'party-light'").run();
    broadcastDeviceUpdate('party-light', { on: true, brightness: 100, color: '#ff0000', mode: 'flash' }, 'EMERGENCY_EVACUATE');

    // 5. Log action
    db.prepare('INSERT INTO logs (user_id, username, action, details) VALUES (?, ?, ?, ?)')
      .run(req.user.id, req.user.username, 'emergency-evacuate', `🚨 Emergency Evacuation triggered by ${req.user.username}. Exits opened and lights enabled.`);

    // 6. Broadcast emergency alert to all clients and ESP32
    broadcastToAll({
      type: 'emergency-alert',
      mode: 'evacuate',
      triggeredBy: req.user.username,
      timestamp: emergencyState.timestamp
    });

    res.json({
      message: 'Emergency evacuation protocol initiated. All exit gates and doors opened.',
      state: emergencyState
    });
  } catch (err) {
    console.error('Evacuate error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/emergency/lockdown (Admin only)
// Trigger Master Lockdown (Closes doors and gates)
router.post('/lockdown', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    emergencyState = {
      mode: 'lockdown',
      triggeredBy: req.user.username,
      timestamp: Date.now()
    };

    db.prepare("UPDATE system_settings SET value = 'lockdown', updated_at = CURRENT_TIMESTAMP WHERE key = 'emergency_mode'").run();

    // 1. Force Rolling Door CLOSED
    db.prepare("UPDATE devices SET state = '{\"status\":\"closed\"}', updated_at = CURRENT_TIMESTAMP WHERE id = 'rolling-door'").run();
    broadcastDeviceUpdate('rolling-door', { status: 'closed' }, 'EMERGENCY_LOCKDOWN');

    // 2. Force Boom Gate CLOSED
    db.prepare("UPDATE devices SET state = '{\"status\":\"closed\"}', updated_at = CURRENT_TIMESTAMP WHERE id = 'boom-gate'").run();
    broadcastDeviceUpdate('boom-gate', { status: 'closed' }, 'EMERGENCY_LOCKDOWN');

    // 3. Log action
    db.prepare('INSERT INTO logs (user_id, username, action, details) VALUES (?, ?, ?, ?)')
      .run(req.user.id, req.user.username, 'emergency-lockdown', `🔒 Master Lockdown triggered by ${req.user.username}. All perimeter entries sealed.`);

    // 4. Broadcast lockdown alert
    broadcastToAll({
      type: 'emergency-alert',
      mode: 'lockdown',
      triggeredBy: req.user.username,
      timestamp: emergencyState.timestamp
    });

    res.json({
      message: 'Lockdown protocol activated. All entries and perimeter doors sealed.',
      state: emergencyState
    });
  } catch (err) {
    console.error('Lockdown error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/emergency/clear (Admin only)
// Reset emergency state back to normal
router.post('/clear', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    emergencyState = {
      mode: 'normal',
      triggeredBy: null,
      timestamp: Date.now()
    };

    db.prepare("UPDATE system_settings SET value = 'normal', updated_at = CURRENT_TIMESTAMP WHERE key = 'emergency_mode'").run();

    // Log action
    db.prepare('INSERT INTO logs (user_id, username, action, details) VALUES (?, ?, ?, ?)')
      .run(req.user.id, req.user.username, 'emergency-cleared', `✅ Emergency state cleared by ${req.user.username}. Normal operation resumed.`);

    // Broadcast clear event
    broadcastToAll({
      type: 'emergency-cleared',
      mode: 'normal',
      clearedBy: req.user.username,
      timestamp: emergencyState.timestamp
    });

    res.json({
      message: 'Emergency state cleared. Normal operation restored.',
      state: emergencyState
    });
  } catch (err) {
    console.error('Clear emergency error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = { router, initEmergencyState, getEmergencyState: () => emergencyState };
