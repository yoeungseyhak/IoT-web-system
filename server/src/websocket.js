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
        if (client.readyState === 1) client.send(msgStr);
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
