const express = require('express');
const { getDb } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { broadcastToAll } = require('../websocket');
const { validateHardwarePin, findPinConflict } = require('../utils/pinValidator');

const router = express.Router();
router.use(authenticateToken);

function computeStats(slots) {
  const total = slots.length;
  const occupied = slots.filter(s => s.occupied === 1 || s.occupied === true).length;
  const available = Math.max(0, total - occupied);
  return {
    total,
    occupied,
    available,
    isFull: total > 0 && available === 0
  };
}

// GET /api/parking/slots - Get all slots with live stats
router.get('/slots', (req, res) => {
  try {
    const db = getDb();
    const slots = db.prepare(`
      SELECT p.*, c.name as controller_name 
      FROM parking_slots p 
      LEFT JOIN controllers c ON p.controller_id = c.id 
      ORDER BY p.id ASC
    `).all();
    const parsedSlots = slots.map(s => ({ ...s, occupied: s.occupied === 1 }));
    const stats = computeStats(parsedSlots);
    res.json({ slots: parsedSlots, stats });
  } catch (err) {
    console.error('Get parking slots error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/parking/slots - Add a new parking slot (Admin only)
router.post('/slots', requireAdmin, (req, res) => {
  try {
    const { name, sensor_pin, sensor_type, controller_id } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Slot name is required' });
    }

    const db = getDb();
    const pinVal = sensor_pin ? sensor_pin.trim() : '';
    const controllerVal = controller_id ? controller_id.trim() : '';

    const pinCheck = validateHardwarePin(pinVal, { allowInputOnly: true });
    if (!pinCheck.valid) {
      return res.status(pinCheck.status).json({ message: pinCheck.message });
    }
    const conflict = findPinConflict(db, { pin: pinVal, controllerId: controllerVal });
    if (conflict) {
      return res.status(409).json({ message: conflict.message });
    }

    // Generate clean slot ID
    const count = db.prepare('SELECT COUNT(*) as count FROM parking_slots').get().count;
    const generatedId = `slot-${Date.now().toString(36)}-${count + 1}`;

    db.prepare(`
      INSERT INTO parking_slots (id, name, sensor_pin, sensor_type, controller_id, occupied)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(generatedId, name.trim(), pinVal, sensor_type || 'ultrasonic', controllerVal);

    const newSlot = db.prepare(`
      SELECT p.*, c.name as controller_name 
      FROM parking_slots p 
      LEFT JOIN controllers c ON p.controller_id = c.id 
      WHERE p.id = ?
    `).get(generatedId);
    newSlot.occupied = newSlot.occupied === 1;

    // Log action
    db.prepare('INSERT INTO logs (user_id, username, action, details) VALUES (?, ?, ?, ?)')
      .run(req.user.id, req.user.username, 'create-slot', `Admin created parking slot "${name}" (${generatedId}) on controller "${controllerVal || 'all'}"`);

    const allSlots = db.prepare('SELECT * FROM parking_slots').all();
    const stats = computeStats(allSlots);

    // Broadcast change to all clients
    broadcastToAll({
      type: 'slots-changed',
      action: 'create',
      slot: newSlot,
      stats,
      timestamp: Date.now()
    });

    res.status(201).json({ slot: newSlot, stats });
  } catch (err) {
    console.error('Create parking slot error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/parking/slots/:id - Update parking slot details (Admin only)
router.put('/slots/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { name, sensor_pin, sensor_type, controller_id } = req.body;

    const db = getDb();
    const existing = db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ message: 'Parking slot not found' });
    }

    const updatedName = (name !== undefined && name.trim()) ? name.trim() : existing.name;
    const updatedPin = sensor_pin !== undefined ? sensor_pin.trim() : (existing.sensor_pin || '');
    const updatedType = sensor_type !== undefined ? sensor_type.trim() : existing.sensor_type;
    const updatedController = controller_id !== undefined ? (controller_id || '').trim() : (existing.controller_id || '');

    const pinCheck = validateHardwarePin(updatedPin, { allowInputOnly: true });
    if (!pinCheck.valid) {
      return res.status(pinCheck.status).json({ message: pinCheck.message });
    }
    const conflict = findPinConflict(db, { pin: updatedPin, controllerId: updatedController, excludeSlotId: id });
    if (conflict) {
      return res.status(409).json({ message: conflict.message });
    }

    db.prepare(`
      UPDATE parking_slots 
      SET name = ?, sensor_pin = ?, sensor_type = ?, controller_id = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(updatedName, updatedPin, updatedType, updatedController, id);

    const updatedSlot = db.prepare(`
      SELECT p.*, c.name as controller_name 
      FROM parking_slots p 
      LEFT JOIN controllers c ON p.controller_id = c.id 
      WHERE p.id = ?
    `).get(id);
    updatedSlot.occupied = updatedSlot.occupied === 1;

    // Log action
    db.prepare('INSERT INTO logs (user_id, username, action, details) VALUES (?, ?, ?, ?)')
      .run(req.user.id, req.user.username, 'update-slot', `Admin updated parking slot "${updatedName}" (${id})`);

    const allSlots = db.prepare('SELECT * FROM parking_slots').all();
    const stats = computeStats(allSlots);

    // Broadcast update to all clients
    broadcastToAll({
      type: 'slots-changed',
      action: 'update',
      slot: updatedSlot,
      stats,
      timestamp: Date.now()
    });

    res.json({ slot: updatedSlot, stats });
  } catch (err) {
    console.error('Update parking slot error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/parking/slots/:id - Remove a parking slot (Admin only)
router.delete('/slots/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ message: 'Parking slot not found' });
    }

    db.prepare('DELETE FROM parking_slots WHERE id = ?').run(id);

    // Log action
    db.prepare('INSERT INTO logs (user_id, username, action, details) VALUES (?, ?, ?, ?)')
      .run(req.user.id, req.user.username, 'delete-slot', `Admin deleted parking slot "${existing.name}" (${id})`);

    const allSlots = db.prepare('SELECT * FROM parking_slots').all();
    const stats = computeStats(allSlots);

    // Broadcast deletion
    broadcastToAll({
      type: 'slots-changed',
      action: 'delete',
      slotId: id,
      stats,
      timestamp: Date.now()
    });

    res.json({ message: 'Parking slot deleted successfully', stats });
  } catch (err) {
    console.error('Delete parking slot error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/parking/slots/:id/status - Update slot occupancy (0 or 1)
router.put('/slots/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { occupied } = req.body;

    if (occupied === undefined) {
      return res.status(400).json({ message: 'Occupied boolean state required' });
    }

    const occupiedVal = occupied ? 1 : 0;
    const db = getDb();

    const slot = db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(id);
    if (!slot) {
      return res.status(404).json({ message: 'Parking slot not found' });
    }

    db.prepare('UPDATE parking_slots SET occupied = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(occupiedVal, id);

    const updatedSlot = db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(id);
    updatedSlot.occupied = updatedSlot.occupied === 1;

    const allSlots = db.prepare('SELECT * FROM parking_slots').all();
    const stats = computeStats(allSlots);

    // Broadcast slot update
    broadcastToAll({
      type: 'slot-update',
      slotId: id,
      occupied: updatedSlot.occupied,
      stats,
      controllerId: updatedSlot.controller_id || '',
      triggeredBy: req.user.username,
      timestamp: Date.now()
    });

    res.json({ slot: updatedSlot, stats });
  } catch (err) {
    console.error('Update slot status error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = { router, computeStats };
