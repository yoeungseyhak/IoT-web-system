const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

let db;

function initDatabase() {
    const dbPath = path.join(__dirname, '../database.sqlite');
    db = new Database(dbPath);

    // Enable WAL mode and normal synchronous for high-concurrency real-time WebSocket traffic
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user' CHECK(role IN ('superadmin','admin','user')),
            can_control INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            pin TEXT DEFAULT '',
            controller_id TEXT DEFAULT '',
            state TEXT NOT NULL DEFAULT '{}',
            disabled INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            action TEXT NOT NULL,
            device_id TEXT,
            device_name TEXT,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS automations (
            device_id TEXT PRIMARY KEY,
            schedule TEXT DEFAULT NULL,
            countdown TEXT DEFAULT NULL,
            cycle_count TEXT DEFAULT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT DEFAULT 'bug',
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS parking_slots (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            sensor_pin TEXT DEFAULT '',
            sensor_type TEXT DEFAULT 'ultrasonic',
            occupied INTEGER DEFAULT 0,
            controller_id TEXT DEFAULT '',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS controllers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            ip_address TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Performance Indexes for real-time telemetry and search queries
        CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_logs_device_id ON logs(device_id);
        CREATE INDEX IF NOT EXISTS idx_devices_controller_id ON devices(controller_id);
        CREATE INDEX IF NOT EXISTS idx_slots_controller_id ON parking_slots(controller_id);
        CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
        CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
    `);

    // Migration for existing database: add pin column if missing
    try {
        db.exec("ALTER TABLE devices ADD COLUMN pin TEXT DEFAULT ''");
    } catch (e) {
        // column already exists
    }

    // Migration for existing database: add controller_id column to devices if missing
    try {
        db.exec("ALTER TABLE devices ADD COLUMN controller_id TEXT DEFAULT ''");
    } catch (e) {
        // column already exists
    }

    // Migration for existing database: add controller_id column to parking_slots if missing
    try {
        db.exec("ALTER TABLE parking_slots ADD COLUMN controller_id TEXT DEFAULT ''");
    } catch (e) {
        // column already exists
    }

    // Migration for existing database: add can_control column if missing
    try {
        db.exec("ALTER TABLE users ADD COLUMN can_control INTEGER DEFAULT 1");
    } catch (e) {
        // column already exists
    }

    // Migration for existing database: add disabled column to devices if missing
    try {
        db.exec("ALTER TABLE devices ADD COLUMN disabled INTEGER DEFAULT 0");
    } catch (e) {
        // column already exists
    }

    // Migration for existing database: add pending_sync column for missed automation replay on reconnect
    try {
        db.exec("ALTER TABLE devices ADD COLUMN pending_sync TEXT DEFAULT NULL");
    } catch (e) {
        // column already exists
    }

    // Seed default controllers if none exist
    try {
        const controllerCount = db.prepare('SELECT COUNT(*) as count FROM controllers').get().count;
        if (controllerCount === 0) {
            const insertController = db.prepare('INSERT INTO controllers (id, name, description) VALUES (?, ?, ?)');
            insertController.run('esp32-1', 'ESP32 Controller 1 (Primary)', 'Primary controller for main building lights, boom gate, and sensor relays');
            insertController.run('esp32-2', 'ESP32 Controller 2 (Secondary)', 'Secondary controller for additional building lights or parking bays');
        }
        // Clean up legacy Zone tags from controllers
        db.prepare("UPDATE controllers SET name = 'ESP32 Controller 1 (Primary)' WHERE id = 'esp32-1' AND name LIKE '%Zone%'").run();
        db.prepare("UPDATE controllers SET name = 'ESP32 Controller 2 (Secondary)' WHERE id = 'esp32-2' AND name LIKE '%Zone%'").run();

        // Associate default devices with esp32-1 if not assigned
        db.prepare("UPDATE devices SET controller_id = 'esp32-1' WHERE controller_id IS NULL OR controller_id = ''").run();
    } catch (e) {
        console.error('Error seeding controllers:', e);
    }

    // Migration for existing database: ensure role column CHECK constraint allows 'superadmin'
    try {
        const userTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get()?.sql || '';
        if (!userTableSql.includes('superadmin')) {
            db.exec(`
                PRAGMA foreign_keys=off;
                BEGIN TRANSACTION;
                CREATE TABLE IF NOT EXISTS users_temp (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT DEFAULT 'user' CHECK(role IN ('superadmin','admin','user')),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    can_control INTEGER DEFAULT 1
                );
                INSERT INTO users_temp (id, username, password_hash, role, created_at, can_control)
                SELECT id, username, password_hash, role, created_at, COALESCE(can_control, 1) FROM users;
                DROP TABLE users;
                ALTER TABLE users_temp RENAME TO users;
                COMMIT;
                PRAGMA foreign_keys=on;
            `);
        }
    } catch (e) {
        console.error("Migration error updating users table CHECK constraint:", e);
    }

    // Ensure only the primary Super Admin has role = 'superadmin' (Strictly 1 Super Admin)
    const superAdmins = db.prepare("SELECT id, username FROM users WHERE role = 'superadmin' ORDER BY id ASC").all();
    if (superAdmins.length > 1) {
        // Retain the primary superadmin ('admin' or lowest id) and demote any extras to 'admin'
        const primarySuper = superAdmins.find(u => u.username === 'admin' || u.username === 'superadmin') || superAdmins[0];
        db.prepare("UPDATE users SET role = 'admin' WHERE role = 'superadmin' AND id != ?").run(primarySuper.id);
    } else if (superAdmins.length === 0) {
        // Ensure at least one superadmin exists in the database
        db.prepare("UPDATE users SET role = 'superadmin', can_control = 1 WHERE id = (SELECT MIN(id) FROM users)").run();
    }

    // Ensure the single Super Administrator always has full device control (can_control = 1)
    db.prepare("UPDATE users SET can_control = 1 WHERE role = 'superadmin'").run();


    // Seed Data
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount === 0) {
        const insertUser = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
        insertUser.run('yoeungseyhak', bcrypt.hashSync('Admin@12345', 10), 'superadmin');
    }

    // Seed default devices if missing
    try {
        const defaultDevices = [
            { id: 'light-1', name: 'Light 1', type: 'light', pin: 'GPIO 4', state: '{"on":false}', controller: 'esp32-1' },
            { id: 'light-2', name: 'Light 2', type: 'light', pin: 'GPIO 5', state: '{"on":false}', controller: 'esp32-1' },
            { id: 'light-3', name: 'Light 3', type: 'light', pin: 'GPIO 18', state: '{"on":false}', controller: 'esp32-1' },
            { id: 'party-light', name: 'Party Light', type: 'party-light', pin: 'GPIO 2', state: '{"on":false,"brightness":100,"color":"#ff00ff","mode":"static"}', controller: 'esp32-1' },
            { id: 'boom-gate', name: 'Boom Gate', type: 'boom-gate', pin: 'GPIO 27', state: '{"status":"closed"}', controller: 'esp32-1' },
            { id: 'relay-14', name: 'Aux Relay 14', type: 'light', pin: 'GPIO 14', state: '{"on":false}', controller: 'esp32-1' },
            { id: 'relay-ldr', name: 'LDR Night Relay', type: 'light', pin: 'GPIO 23', state: '{"on":false}', controller: 'esp32-1' },
            { id: 'relay-sound', name: 'Sound Sensor Relay', type: 'light', pin: 'GPIO 15', state: '{"on":false}', controller: 'esp32-1' }
        ];

        const insertDevStmt = db.prepare('INSERT OR IGNORE INTO devices (id, name, type, pin, state, controller_id) VALUES (?, ?, ?, ?, ?, ?)');
        const updatePinStmt = db.prepare('UPDATE devices SET pin = ?, controller_id = ? WHERE id = ?');

        defaultDevices.forEach(d => {
            const exists = db.prepare('SELECT id, pin, controller_id FROM devices WHERE id = ?').get(d.id);
            if (!exists) {
                insertDevStmt.run(d.id, d.name, d.type, d.pin, d.state, d.controller);
            } else {
                if (!exists.controller_id || !exists.pin) {
                    updatePinStmt.run(d.pin, d.controller, d.id);
                }
            }
        });

        // Clean up legacy Zone tags from devices
        db.prepare("UPDATE devices SET name = 'Light 1' WHERE id = 'light-1' AND name LIKE '%Zone%'").run();
        db.prepare("UPDATE devices SET name = 'Light 2' WHERE id = 'light-2' AND name LIKE '%Zone%'").run();
        db.prepare("UPDATE devices SET name = 'Light 3' WHERE id = 'light-3' AND name LIKE '%Zone%'").run();

        // Associate unassigned default parking slots with esp32-1
        db.prepare("UPDATE parking_slots SET controller_id = 'esp32-1' WHERE controller_id IS NULL OR controller_id = ''").run();
    } catch (e) {
        console.error('Error seeding default devices:', e);
    }

    // Seed system_settings if empty
    const emergencyMode = db.prepare("SELECT value FROM system_settings WHERE key = 'emergency_mode'").get();
    if (!emergencyMode) {
        db.prepare("INSERT INTO system_settings (key, value) VALUES ('emergency_mode', 'normal')").run();
    }

    // Seed default parking slots if empty
    const slotCount = db.prepare('SELECT COUNT(*) as count FROM parking_slots').get().count;
    if (slotCount === 0) {
        const insertSlot = db.prepare('INSERT INTO parking_slots (id, name, sensor_pin, sensor_type, occupied) VALUES (?, ?, ?, ?, ?)');
        insertSlot.run('slot-1', 'Slot A1', 'GPIO 32', 'switch', 0);
        insertSlot.run('slot-2', 'Slot A2', 'GPIO 33', 'switch', 0);
        insertSlot.run('slot-3', 'Slot A3', 'GPIO 25', 'switch', 0);
        insertSlot.run('slot-4', 'Slot A4', 'GPIO 26', 'switch', 0);
        insertSlot.run('slot-5', 'Slot A5', 'GPIO 13', 'switch', 0);
    }

    // Ensure slot-5 exists
    const hasSlot5 = db.prepare("SELECT COUNT(*) as count FROM parking_slots WHERE id = 'slot-5'").get().count;
    if (hasSlot5 === 0) {
        db.prepare('INSERT INTO parking_slots (id, name, sensor_pin, sensor_type, occupied) VALUES (?, ?, ?, ?, ?)').run('slot-5', 'Slot A5', 'GPIO 13', 'switch', 0);
    }

    // Migration: update legacy default slots to match mechanical switch GPIO assignments
    try {
        db.prepare("UPDATE parking_slots SET sensor_type = 'switch', sensor_pin = 'GPIO 32' WHERE id = 'slot-1' AND sensor_pin = 'GPIO 32, 33'").run();
        db.prepare("UPDATE parking_slots SET sensor_type = 'switch', sensor_pin = 'GPIO 33' WHERE id = 'slot-2' AND sensor_pin = 'GPIO 34, 35'").run();
        db.prepare("UPDATE parking_slots SET sensor_type = 'switch', sensor_pin = 'GPIO 25' WHERE id = 'slot-3' AND sensor_pin = 'GPIO 36'").run();
        db.prepare("UPDATE parking_slots SET sensor_type = 'switch', sensor_pin = 'GPIO 26' WHERE id = 'slot-4' AND sensor_pin = 'GPIO 39'").run();
    } catch (e) {}

    return db;
}

function getDb() {
    if (!db) throw new Error("Database not initialized");
    return db;
}

module.exports = { initDatabase, getDb };
