const express = require('express');
const { getDb } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { broadcastToAll } = require('../websocket');

const router = express.Router();

router.use(authenticateToken);

// POST /api/reports - Create a new report
router.post('/', (req, res) => {
  try {
    const { title, description, category } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const db = getDb();
    const result = db.prepare('INSERT INTO reports (user_id, username, title, description, category) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, req.user.username, title, description, category || 'bug');

    const newReport = db.prepare('SELECT * FROM reports WHERE id = ?').get(result.lastInsertRowid);

    // Broadcast live event to all connected clients (especially admins)
    broadcastToAll({
      type: 'new-report',
      report: newReport,
      timestamp: Date.now()
    });

    res.status(201).json(newReport);
  } catch (err) {
    console.error('Create report error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/reports - Get reports
router.get('/', (req, res) => {
  try {
    const db = getDb();
    let reports;
    
    if (req.user.role === 'admin') {
      reports = db.prepare('SELECT * FROM reports ORDER BY created_at DESC').all();
    } else {
      reports = db.prepare('SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    }
    
    res.json(reports);
  } catch (err) {
    console.error('Get reports error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/reports/:id/status - Update report status (admin only)
router.put('/:id/status', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    const db = getDb();
    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    db.prepare('UPDATE reports SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
    
    const updatedReport = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);

    // Broadcast status change to user and admins
    broadcastToAll({
      type: 'report-status-update',
      report: updatedReport,
      timestamp: Date.now()
    });

    res.json(updatedReport);
  } catch (err) {
    console.error('Update report status error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/reports/:id - Delete a report (admin only)
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    
    const db = getDb();
    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    db.prepare('DELETE FROM reports WHERE id = ?').run(id);

    // Broadcast deletion
    broadcastToAll({
      type: 'report-deleted',
      reportId: parseInt(id, 10),
      timestamp: Date.now()
    });

    res.json({ message: 'Report deleted successfully' });
  } catch (err) {
    console.error('Delete report error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
