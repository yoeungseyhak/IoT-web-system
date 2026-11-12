const express = require('express');
const { getDb } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getControllersStatusList, broadcastDeviceStatus } = require('../websocket');

const router = express.Router();
router.use(authenticateToken);

// GET /api/controllers - List all controllers with live connection status & device counts
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const liveList = getControllersStatusList();

        // Attach device and slot details and counts
        const enhanced = liveList.map(ctrl => {
            const devices = db.prepare('SELECT id, name, type, pin, state, disabled FROM devices WHERE controller_id = ?').all(ctrl.id).map(d => ({
                ...d,
                disabled: Boolean(d.disabled),
                state: JSON.parse(d.state || '{}')
            }));
            const slots = db.prepare('SELECT id, name, sensor_pin, sensor_type, occupied FROM parking_slots WHERE controller_id = ?').all(ctrl.id).map(s => ({
                ...s,
                occupied: s.occupied === 1
            }));
            return {
                ...ctrl,
                device_count: devices.length,
                slot_count: slots.length,
                devices,
                slots,
                ws_path: `/ws/device?id=${encodeURIComponent(ctrl.id)}`
            };
        });

        res.json({
            controllers: enhanced,
            total: enhanced.length,
            online_count: enhanced.filter(c => c.online).length
        });
    } catch (err) {
        console.error('Get controllers error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// POST /api/controllers - Register a new ESP32 controller (Admin only)
router.post('/', requireAdmin, (req, res) => {
    try {
        const { id, name, description } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Controller name is required' });
        }

        const db = getDb();
        let targetId = id ? String(id).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') : '';
        if (!targetId) {
            const count = db.prepare('SELECT COUNT(*) as count FROM controllers').get()?.count || 0;
            targetId = `esp32-${count + 1}`;
        }

        const existing = db.prepare('SELECT id FROM controllers WHERE id = ?').get(targetId);
        if (existing) {
            return res.status(409).json({ message: `Controller with ID "${targetId}" already exists.` });
        }

        const desc = description ? description.trim() : '';
        db.prepare('INSERT INTO controllers (id, name, description) VALUES (?, ?, ?)')
          .run(targetId, name.trim(), desc);

        db.prepare('INSERT INTO logs (user_id, username, action, details) VALUES (?, ?, ?, ?)')
          .run(req.user.id, req.user.username, 'create-controller', `Created ESP32 controller "${name}" (${targetId})`);

        broadcastDeviceStatus();

        const created = db.prepare('SELECT * FROM controllers WHERE id = ?').get(targetId);
        res.status(201).json({
            ...created,
            online: false,
            device_count: 0,
            slot_count: 0,
            ws_path: `/ws/device?id=${encodeURIComponent(targetId)}`
        });
    } catch (err) {
        console.error('Create controller error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// PUT /api/controllers/:id - Update controller details (Admin only)
router.put('/:id', requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        const db = getDb();
        const existing = db.prepare('SELECT * FROM controllers WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ message: 'Controller not found' });
        }

        const newName = name !== undefined && name !== null ? name.trim() : existing.name;
        const newDesc = description !== undefined && description !== null ? description.trim() : existing.description;

        db.prepare('UPDATE controllers SET name = ?, description = ? WHERE id = ?')
          .run(newName, newDesc, id);

        db.prepare('INSERT INTO logs (user_id, username, action, details) VALUES (?, ?, ?, ?)')
          .run(req.user.id, req.user.username, 'update-controller', `Updated controller "${newName}" (${id})`);

        broadcastDeviceStatus();

        const updated = db.prepare('SELECT * FROM controllers WHERE id = ?').get(id);
        res.json(updated);
    } catch (err) {
        console.error('Update controller error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// DELETE /api/controllers/:id - Remove a controller (Admin only)
router.delete('/:id', requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const db = getDb();

        const existing = db.prepare('SELECT * FROM controllers WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ message: 'Controller not found' });
        }

        // Reset devices and parking slots bound to this controller to '' (Broadcast / Any)
        db.prepare("UPDATE devices SET controller_id = '' WHERE controller_id = ?").run(id);
        db.prepare("UPDATE parking_slots SET controller_id = '' WHERE controller_id = ?").run(id);

        db.prepare('DELETE FROM controllers WHERE id = ?').run(id);

        db.prepare('INSERT INTO logs (user_id, username, action, details) VALUES (?, ?, ?, ?)')
          .run(req.user.id, req.user.username, 'delete-controller', `Deleted ESP32 controller "${existing.name}" (${id})`);

        broadcastDeviceStatus();

        res.json({ message: `Controller "${existing.name}" removed successfully. Bound devices reassigned to broadcast.` });
    } catch (err) {
        console.error('Delete controller error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
