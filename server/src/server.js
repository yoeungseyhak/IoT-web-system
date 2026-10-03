require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');

const { initDatabase } = require('./database');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const devicesRoutes = require('./routes/devices');
const reportsRoutes = require('./routes/reports');
const { router: emergencyRoutes, initEmergencyState } = require('./routes/emergency');
const { router: parkingRoutes } = require('./routes/parking');
const { setupWebSocket } = require('./websocket');
const { initAutomations } = require('./automation');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/parking', parkingRoutes);

// Logs route: supports pagination, search, action filtering for large volumes of data
const { authenticateToken } = require('./middleware/auth');
const { getDb: getDatabase } = require('./database');

function queryLogs(db, queryParams) {
    const page = parseInt(queryParams.page, 10);
    const limit = parseInt(queryParams.limit, 10) || 50;
    const search = queryParams.search ? String(queryParams.search).trim() : '';
    const action = queryParams.action ? String(queryParams.action).trim() : '';

    let whereClause = ' WHERE 1=1';
    const params = [];

    if (search) {
        whereClause += ' AND (username LIKE ? OR action LIKE ? OR device_name LIKE ? OR details LIKE ?)';
        const s = `%${search}%`;
        params.push(s, s, s, s);
    }

    if (action && action !== 'all') {
        whereClause += ' AND action = ?';
        params.push(action);
    }

    const countRow = db.prepare(`SELECT COUNT(*) as count FROM logs${whereClause}`).get(...params);
    const total = countRow ? countRow.count : 0;

    let sql = `SELECT * FROM logs${whereClause} ORDER BY created_at DESC, id DESC`;

    if (!isNaN(page) && page > 0) {
        const safeLimit = Math.min(Math.max(1, limit), 200);
        const offset = (page - 1) * safeLimit;
        sql += ' LIMIT ? OFFSET ?';
        const pageParams = [...params, safeLimit, offset];
        const logs = db.prepare(sql).all(...pageParams);
        return {
            logs,
            total,
            page,
            limit: safeLimit,
            totalPages: Math.ceil(total / safeLimit) || 1
        };
    }

    // Default unpaginated query (safe limit)
    sql += ' LIMIT ?';
    const logs = db.prepare(sql).all(...params, Math.min(Math.max(1, limit), 200));
    return logs;
}

app.get('/api/logs', authenticateToken, (req, res) => {
    try {
        const db = getDatabase();
        const result = queryLogs(db, req.query);
        res.json(result);
    } catch (err) {
        console.error('Logs query error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

const clientDistPath = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(clientDistPath, 'index.html'));
    });
}

const server = http.createServer(app);
setupWebSocket(server);
initDatabase();
initEmergencyState();
initAutomations();

// Recovery: fix rolling doors stuck in transitional states from previous session
try {
    const { getDb: getDatabase2 } = require('./database');
    const db2 = getDatabase2();
    const stuckDoors = db2.prepare("SELECT id, state FROM devices WHERE type = 'rolling-door'").all();
    for (const door of stuckDoors) {
        const st = JSON.parse(door.state || '{}');
        if (st.status === 'opening') {
            st.status = 'opened';
            db2.prepare('UPDATE devices SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(st), door.id);
            console.log(`Recovered rolling door "${door.id}" from stuck "opening" → "opened"`);
        } else if (st.status === 'closing') {
            st.status = 'closed';
            db2.prepare('UPDATE devices SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(st), door.id);
            console.log(`Recovered rolling door "${door.id}" from stuck "closing" → "closed"`);
        }
    }
} catch (e) {
    console.error('Rolling door recovery error:', e);
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Floor Management Server running on port ${PORT}`);
});
