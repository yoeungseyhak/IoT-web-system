const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

let db;

function initDatabase() {
    const dbPath = path.join(__dirname, '../database.sqlite');
    db = new Database(dbPath);

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user' CHECK(role IN ('superadmin','admin','user')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            pin TEXT DEFAULT '',
            state TEXT NOT NULL DEFAULT '{}',
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
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Migration for existing database: add pin column if missing
    try {
        db.exec("ALTER TABLE devices ADD COLUMN pin TEXT DEFAULT ''");
    } catch (e) {
        // column already exists
    }

    // Migration for existing database: add can_control column if missing
    try {
        db.exec("ALTER TABLE users ADD COLUMN can_control INTEGER DEFAULT 1");
    } catch (e) {
        // column already exists
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
        insertUser.run('admin', bcrypt.hashSync('Admin@12345', 10), 'superadmin');
        insertUser.run('user1', bcrypt.hashSync('User@12345', 10), 'user');

        const insertDevice = db.prepare('INSERT INTO devices (id, name, type, pin, state) VALUES (?, ?, ?, ?, ?)');
        insertDevice.run('light-1', 'Light 1', 'light', 'GPIO 2', '{"on":false}');
        insertDevice.run('light-2', 'Light 2', 'light', 'GPIO 4', '{"on":false}');
        insertDevice.run('light-3', 'Light 3', 'light', 'GPIO 5', '{"on":false}');
        insertDevice.run('rolling-door', 'Rolling Door', 'rolling-door', 'GPIO 18, 19', '{"status":"closed"}');
        insertDevice.run('boom-gate', 'Boom Gate', 'boom-gate', 'GPIO 27', '{"status":"closed"}');
        insertDevice.run('party-light', 'Party Light', 'party-light', 'GPIO 23', '{"on":false,"brightness":100,"color":"#ff00ff","mode":"static"}');
    }

    // Ensure existing default devices have default pins if empty
    db.prepare("UPDATE devices SET pin = 'GPIO 2' WHERE id = 'light-1' AND (pin IS NULL OR pin = '')").run();
    db.prepare("UPDATE devices SET pin = 'GPIO 4' WHERE id = 'light-2' AND (pin IS NULL OR pin = '')").run();
    db.prepare("UPDATE devices SET pin = 'GPIO 5' WHERE id = 'light-3' AND (pin IS NULL OR pin = '')").run();
    db.prepare("UPDATE devices SET pin = 'GPIO 18, 19' WHERE id = 'rolling-door' AND (pin IS NULL OR pin = '')").run();
    db.prepare("UPDATE devices SET pin = 'GPIO 27' WHERE id = 'boom-gate' AND (pin IS NULL OR pin = '' OR pin = 'GPIO 21, 22')").run();
    db.prepare("UPDATE devices SET pin = 'GPIO 23' WHERE id = 'party-light' AND (pin IS NULL OR pin = '')").run();

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
