const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All routes require admin
router.use(authenticateToken, requireAdmin);

// GET /api/users - List users (supports pagination & search for large datasets)
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page, 10);
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = req.query.search ? String(req.query.search).trim() : '';
    const role = req.query.role ? String(req.query.role).trim() : '';

    let whereClause = ' WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND username LIKE ?';
      params.push(`%${search}%`);
    }

    if (role && role !== 'all') {
      whereClause += ' AND role = ?';
      params.push(role);
    }

    const countRow = db.prepare(`SELECT COUNT(*) as count FROM users${whereClause}`).get(...params);
    const total = countRow ? countRow.count : 0;

    let sql = `SELECT id, username, role, can_control, created_at FROM users${whereClause} ORDER BY created_at DESC, id DESC`;

    if (!isNaN(page) && page > 0) {
      const safeLimit = Math.min(Math.max(1, limit), 100);
      const offset = (page - 1) * safeLimit;
      sql += ' LIMIT ? OFFSET ?';
      const pageParams = [...params, safeLimit, offset];
      const users = db.prepare(sql).all(...pageParams);
      const parsedUsers = users.map(u => ({ ...u, can_control: u.can_control !== 0 }));
      return res.json({
        users: parsedUsers,
        total,
        page,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || 1
      });
    }

    // Default unpaginated query (safe limit 500)
    sql += ' LIMIT 500';
    const users = db.prepare(sql).all(...params);
    const parsedUsers = users.map(u => ({ ...u, can_control: u.can_control !== 0 }));
    res.json(parsedUsers);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/users/:id/control - Update user control permission
router.put('/:id/control', (req, res) => {
  try {
    const { id } = req.params;
    const { can_control } = req.body;

    if (can_control === undefined) {
      return res.status(400).json({ message: 'can_control is required' });
    }

    const controlValue = can_control ? 1 : 0;
    const db = getDb();
    
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    db.prepare('UPDATE users SET can_control = ? WHERE id = ?').run(controlValue, id);

    // Log the action
    db.prepare('INSERT INTO logs (user_id, username, action, details) VALUES (?, ?, ?, ?)')
      .run(req.user.id, req.user.username, 'update-control', `Admin ${controlValue ? 'enabled' : 'disabled'} control for user "${user.username}"`);

    const updatedUser = db.prepare('SELECT id, username, role, can_control, created_at FROM users WHERE id = ?').get(id);
    updatedUser.can_control = updatedUser.can_control !== 0;
    
    res.json(updatedUser);
  } catch (err) {
    console.error('Update user control error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/users - Create new user
router.post('/', (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const validRole = role === 'admin' ? 'admin' : 'user';

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, validRole);

    // Log user creation
    db.prepare('INSERT INTO logs (user_id, username, action, details) VALUES (?, ?, ?, ?)')
      .run(req.user.id, req.user.username, 'create-user', `Created user "${username}" with role "${validRole}"`);

    const newUser = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newUser);
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/users/:id/password - Admin change user password
router.put('/:id/password', (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ message: 'New password required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const db = getDb();
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);

    // Log password change
    db.prepare('INSERT INTO logs (user_id, username, action, details) VALUES (?, ?, ?, ?)')
      .run(req.user.id, req.user.username, 'admin-password-change', `Admin changed password for user "${user.username}"`);

    res.json({ message: `Password for "${user.username}" changed successfully` });
  } catch (err) {
    console.error('Change user password error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/users/:id - Delete a user
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);

    if (userId === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const db = getDb();
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deleting the last admin
    if (user.role === 'admin') {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Cannot delete the last admin account' });
      }
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    // Log deletion
    db.prepare('INSERT INTO logs (user_id, username, action, details) VALUES (?, ?, ?, ?)')
      .run(req.user.id, req.user.username, 'delete-user', `Deleted user "${user.username}"`);

    res.json({ message: `User "${user.username}" deleted successfully` });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
