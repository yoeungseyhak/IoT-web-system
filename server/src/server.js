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
const { setupWebSocket } = require('./websocket');
const { initAutomations } = require('./automation');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/reports', reportsRoutes);

// Logs route reuses devices router (GET /api/devices/logs)
// Also add a top-level /api/logs alias
const { authenticateToken } = require('./middleware/auth');
const { getDb: getDatabase } = require('./database');
app.get('/api/logs', authenticateToken, (req, res) => {
    try {
        const db = getDatabase();
        const logs = db.prepare('SELECT * FROM logs ORDER BY created_at DESC LIMIT 200').all();
        res.json(logs);
    } catch (err) {
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
