const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All routes require admin
router.use(authenticateToken, requireAdmin);

// GET /api/users - List all users
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC').all();
    res.json(users);
  } catch (err) {
    console.error('List users error:', err);
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
