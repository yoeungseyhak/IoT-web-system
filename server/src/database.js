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
            role TEXT DEFAULT 'user' CHECK(role IN ('admin','user')),
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
    `);

    // Migration for existing database: add pin column if missing
    try {
        db.exec("ALTER TABLE devices ADD COLUMN pin TEXT DEFAULT ''");
    } catch (e) {
        // column already exists
    }

    // Seed Data
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount === 0) {
        const insertUser = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
        insertUser.run('admin', bcrypt.hashSync('Admin@12345', 10), 'admin');
        insertUser.run('user1', bcrypt.hashSync('User@12345', 10), 'user');

        const insertDevice = db.prepare('INSERT INTO devices (id, name, type, pin, state) VALUES (?, ?, ?, ?, ?)');
        insertDevice.run('light-1', 'Light 1', 'light', 'GPIO 2', '{"on":false}');
        insertDevice.run('light-2', 'Light 2', 'light', 'GPIO 4', '{"on":false}');
        insertDevice.run('light-3', 'Light 3', 'light', 'GPIO 5', '{"on":false}');
        insertDevice.run('rolling-door', 'Rolling Door', 'rolling-door', 'GPIO 18, 19', '{"status":"closed"}');
        insertDevice.run('boom-gate', 'Boom Gate', 'boom-gate', 'GPIO 21, 22', '{"status":"closed"}');
        insertDevice.run('party-light', 'Party Light', 'party-light', 'GPIO 23', '{"on":false,"brightness":100,"color":"#ff00ff","mode":"static"}');
    }

    // Ensure existing default devices have default pins if empty
    db.prepare("UPDATE devices SET pin = 'GPIO 2' WHERE id = 'light-1' AND (pin IS NULL OR pin = '')").run();
    db.prepare("UPDATE devices SET pin = 'GPIO 4' WHERE id = 'light-2' AND (pin IS NULL OR pin = '')").run();
    db.prepare("UPDATE devices SET pin = 'GPIO 5' WHERE id = 'light-3' AND (pin IS NULL OR pin = '')").run();
    db.prepare("UPDATE devices SET pin = 'GPIO 18, 19' WHERE id = 'rolling-door' AND (pin IS NULL OR pin = '')").run();
    db.prepare("UPDATE devices SET pin = 'GPIO 21, 22' WHERE id = 'boom-gate' AND (pin IS NULL OR pin = '')").run();
    db.prepare("UPDATE devices SET pin = 'GPIO 23' WHERE id = 'party-light' AND (pin IS NULL OR pin = '')").run();

    return db;
}

function getDb() {
    if (!db) throw new Error("Database not initialized");
    return db;
}

module.exports = { initDatabase, getDb };
