const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { getDb } = require('./database');

const webClients = new Set();
let deviceClient = null;

let deviceState = {
    online: false,
    lastSeen: 0
};

function getDeviceStatus() {
    return deviceState;
}

function setDeviceStatus(online) {
    deviceState.online = online;
    deviceState.lastSeen = Date.now();
}

function broadcastToAll(message) {
    const msgStr = JSON.stringify(message);
    webClients.forEach(client => {
        if (client.readyState === 1) {
            client.send(msgStr);
        } else if (client.readyState !== 0) {
            webClients.delete(client);
        }
    });
}

function broadcastDeviceStatus(online) {
    // Broadcast both device-status and esp32-status for full client compatibility
    broadcastToAll({
        type: 'device-status',
        online,
        lastSeen: deviceState.lastSeen
    });
    broadcastToAll({
        type: 'esp32-status',
        online,
        lastSeen: deviceState.lastSeen
    });
}

function broadcastDeviceUpdate(deviceId, state, triggeredBy) {
    const msg = {
        type: 'device-update',
        deviceId,
        state,
        triggeredBy,
        timestamp: Date.now()
    };
    broadcastToAll(msg);
    if (deviceClient && deviceClient.readyState === 1) {
        deviceClient.send(JSON.stringify(msg));
    }
}

function setupWebSocket(server) {
    const wss = new WebSocketServer({ server });
    const HEARTBEAT_TIMEOUT = parseInt(process.env.DEVICE_HEARTBEAT_TIMEOUT || process.env.ESP32_HEARTBEAT_TIMEOUT || '15000', 10);

    wss.on('connection', (ws, req) => {
        if (req.url.startsWith('/ws/device')) {
            // Hardware Device Client
            deviceClient = ws;
            setDeviceStatus(true);
            broadcastDeviceStatus(true);

            // Sync states to ESP32 on connection
            const db = getDb();
            const allDevices = db.prepare('SELECT id, state FROM devices').all();
            allDevices.forEach(d => {
                ws.send(JSON.stringify({
                    type: 'device-update',
                    deviceId: d.id,
                    state: JSON.parse(d.state || '{}'),
                    triggeredBy: 'system-init',
                    timestamp: Date.now()
                }));
            });

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    if (data.type === 'heartbeat') {
                        setDeviceStatus(true);
                    } else if (data.type === 'state-report') {
                        const db = getDb();
                        db.prepare('UPDATE devices SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                          .run(JSON.stringify(data.state), data.deviceId);
                        
                        broadcastToAll({
                            type: 'device-update',
                            deviceId: data.deviceId,
                            state: data.state,
                            triggeredBy: 'device',
                            timestamp: Date.now()
                        });
                    } else if (data.type === 'slot-update' || data.type === 'parking-slot-report') {
                        const db = getDb();
                        const slotId = data.slotId || data.id;
                        const occupiedVal = data.occupied ? 1 : 0;
                        db.prepare('UPDATE parking_slots SET occupied = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                          .run(occupiedVal, slotId);
                        
                        const allSlots = db.prepare('SELECT * FROM parking_slots ORDER BY id ASC').all();
                        const total = allSlots.length;
                        const occupiedCount = allSlots.filter(s => s.occupied === 1).length;
                        const available = Math.max(0, total - occupiedCount);
                        const stats = { total, occupied: occupiedCount, available, isFull: total > 0 && available === 0 };

                        broadcastToAll({
                            type: 'slot-update',
                            slotId,
                            occupied: data.occupied,
                            stats,
                            triggeredBy: 'esp32',
                            timestamp: Date.now()
                        });
                    }
                } catch (e) {
                    console.error("Device message parse error", e);
                }
            });

            ws.on('close', () => {
                if (deviceClient === ws) {
                    deviceClient = null;
                    deviceState.online = false;
                    broadcastDeviceStatus(false);
                }
            });
        } else {
            // Web Client
            const url = new URL(req.url, `http://${req.headers.host}`);
            const token = url.searchParams.get('token');
            if (!token) {
                ws.close(1008, 'Token required');
                return;
            }

            try {
                const user = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
                ws.user = user;
                webClients.add(ws);

                // Send initial state to web client
                const db = getDb();
                const { getAutomation } = require('./automation');
                const devices = db.prepare('SELECT * FROM devices ORDER BY id').all();
                const parsed = devices.map(d => ({
                    ...d,
                    state: JSON.parse(d.state || '{}'),
                    automation: getAutomation(d.id)
                }));

                const slots = db.prepare('SELECT * FROM parking_slots ORDER BY id ASC').all();
                const parsedSlots = slots.map(s => ({ ...s, occupied: s.occupied === 1 }));
                const totalSlots = parsedSlots.length;
                const occupiedCount = parsedSlots.filter(s => s.occupied).length;
                const availableSlots = Math.max(0, totalSlots - occupiedCount);
                const parkingStats = {
                    total: totalSlots,
                    occupied: occupiedCount,
                    available: availableSlots,
                    isFull: totalSlots > 0 && availableSlots === 0
                };
                const emergencyRow = db.prepare("SELECT value FROM system_settings WHERE key = 'emergency_mode'").get();
                const emergencyMode = emergencyRow ? emergencyRow.value : 'normal';

                ws.send(JSON.stringify({
                    type: 'init-state',
                    devices: parsed,
                    deviceStatus: getDeviceStatus(),
                    parking: { slots: parsedSlots, stats: parkingStats },
                    emergency: { mode: emergencyMode }
                }));

                ws.on('message', (message) => {
                    try {
                        const data = JSON.parse(message);
                        if (data.type === 'device-update') {
                            const db = getDb();
                            db.prepare('UPDATE devices SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                              .run(JSON.stringify(data.state), data.deviceId);
                              
                            broadcastDeviceUpdate(data.deviceId, data.state, ws.user.username);
                        }
                    } catch (e) {
                        console.error("Web client message error", e);
                    }
                });

                ws.on('close', () => {
                    webClients.delete(ws);
                });
            } catch (err) {
                ws.close(1008, 'Invalid token');
            }
        }
    });

    setInterval(() => {
        if (deviceState.online && Date.now() - deviceState.lastSeen > HEARTBEAT_TIMEOUT) {
            deviceState.online = false;
            broadcastDeviceStatus(false);
            if (deviceClient) {
                deviceClient.terminate();
                deviceClient = null;
            }
        }
    }, 5000);
}

module.exports = {
    setupWebSocket,
    broadcastDeviceUpdate,
    broadcastToAll,
    getDeviceStatus,
    setDeviceStatus,
    getEsp32Status: getDeviceStatus,
    setEsp32Status: setDeviceStatus
};
