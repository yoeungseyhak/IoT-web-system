const jwt = require('jsonwebtoken');
const { getDb } = require('../database');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    try {
      const db = getDb();
      const liveUser = db.prepare('SELECT id, username, role, can_control FROM users WHERE id = ?').get(decoded.id);
      if (liveUser) {
        const isSuper = liveUser.role === 'superadmin' || liveUser.username === 'admin' || liveUser.username === 'superadmin';
        const effectiveRole = isSuper ? 'superadmin' : liveUser.role;
        req.user = {
          ...decoded,
          username: liveUser.username,
          role: effectiveRole,
          can_control: (effectiveRole === 'admin' || effectiveRole === 'superadmin') ? true : (liveUser.can_control !== 0)
        };
      } else {
        req.user = decoded;
      }
    } catch (dbErr) {
      req.user = decoded;
    }
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  const isSuper = req.user.role === 'superadmin' || req.user.username === 'admin' || req.user.username === 'superadmin';
  if (req.user.role !== 'admin' && !isSuper) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  const isSuper = req.user.role === 'superadmin' || req.user.username === 'admin' || req.user.username === 'superadmin';
  if (!isSuper) {
    return res.status(403).json({ message: 'Super Admin access required' });
  }
  next();
}

module.exports = { authenticateToken, requireAdmin, requireSuperAdmin };

