const { getDb } = require('./database');
const { broadcastDeviceUpdate, broadcastToAll } = require('./websocket');

// In-memory cache of automations for fast evaluation
// Key: deviceId -> { schedule, countdown, cycle_count }
const automationsMap = new Map();

function initAutomations() {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM automations').all();
    rows.forEach(row => {
      automationsMap.set(row.device_id, {
        schedule: row.schedule ? JSON.parse(row.schedule) : null,
        countdown: row.countdown ? JSON.parse(row.countdown) : null,
        cycle_count: row.cycle_count ? JSON.parse(row.cycle_count) : null
      });
    });
    console.log(`Loaded automations for ${automationsMap.size} devices`);
  } catch (err) {
    console.error('Error initializing automations:', err);
  }

  // Start tick loop every 1 second
  setInterval(tick, 1000);
}

function saveAutomationToDb(deviceId) {
  try {
    const db = getDb();
    const auto = automationsMap.get(deviceId) || {};
    const scheduleStr = auto.schedule ? JSON.stringify(auto.schedule) : null;
    const countdownStr = auto.countdown ? JSON.stringify(auto.countdown) : null;
    const cycleStr = auto.cycle_count ? JSON.stringify(auto.cycle_count) : null;

    db.prepare(`
      INSERT INTO automations (device_id, schedule, countdown, cycle_count, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(device_id) DO UPDATE SET
        schedule = excluded.schedule,
        countdown = excluded.countdown,
        cycle_count = excluded.cycle_count,
        updated_at = CURRENT_TIMESTAMP
    `).run(deviceId, scheduleStr, countdownStr, cycleStr);
  } catch (err) {
    console.error(`Failed to persist automation for ${deviceId}:`, err);
  }
}

function getAutomation(deviceId) {
  return automationsMap.get(deviceId) || { schedule: null, countdown: null, cycle_count: null };
}

function broadcastAutomationUpdate(deviceId) {
  const auto = getAutomation(deviceId);
  broadcastToAll({
    type: 'automation-update',
    deviceId,
    automation: auto,
    timestamp: Date.now()
  });
}

function setDeviceStateInternal(deviceId, state, reason) {
  try {
    const db = getDb();
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
    if (!device) return;

    const existingState = JSON.parse(device.state || '{}');
    const newState = { ...existingState, ...state };

    db.prepare('UPDATE devices SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(JSON.stringify(newState), deviceId);

    const stateDesc = Object.entries(state).map(([k, v]) => `${k}: ${v}`).join(', ');
    db.prepare('INSERT INTO logs (user_id, username, action, device_id, device_name, details) VALUES (?, ?, ?, ?, ?, ?)')
      .run(null, 'Automation', 'device-update', deviceId, device.name, `${reason} (${stateDesc})`);

    broadcastDeviceUpdate(deviceId, newState, 'Automation');
  } catch (err) {
    console.error(`Error updating device state for ${deviceId}:`, err);
  }
}

// ----------------------------------------------------
// PUBLIC API METHODS
// ----------------------------------------------------

function setSchedule(deviceId, config, username = 'admin') {
  const current = automationsMap.get(deviceId) || { schedule: null, countdown: null, cycle_count: null };
  current.schedule = {
    enabled: config.enabled !== false,
    on_time: config.on_time || null,       // "HH:mm" or "YYYY-MM-DDTHH:mm"
    off_time: config.off_time || null,     // "HH:mm" or "YYYY-MM-DDTHH:mm"
    days: Array.isArray(config.days) ? config.days : [0, 1, 2, 3, 4, 5, 6], // default everyday
    last_on_triggered: null,
    last_off_triggered: null
  };
  automationsMap.set(deviceId, current);
  saveAutomationToDb(deviceId);
  broadcastAutomationUpdate(deviceId);

  const db = getDb();
  db.prepare('INSERT INTO logs (user_id, username, action, device_id, device_name, details) VALUES (?, ?, ?, ?, ?, ?)')
    .run(null, username, 'set-schedule', deviceId, deviceId, `Schedule set: ON at ${config.on_time || 'none'}, OFF at ${config.off_time || 'none'}`);

  return current;
}

function setCountdown(deviceId, config, username = 'admin') {
  const current = automationsMap.get(deviceId) || { schedule: null, countdown: null, cycle_count: null };
  const durationSec = Math.max(1, parseInt(config.duration_seconds || 60, 10));
  const targetTime = Date.now() + durationSec * 1000;

  current.countdown = {
    active: true,
    action: config.action === 'turn_on' ? 'turn_on' : 'turn_off',
    target_time: targetTime,
    duration_seconds: durationSec,
    started_at: Date.now()
  };

  automationsMap.set(deviceId, current);
  saveAutomationToDb(deviceId);
  broadcastAutomationUpdate(deviceId);

  const db = getDb();
  db.prepare('INSERT INTO logs (user_id, username, action, device_id, device_name, details) VALUES (?, ?, ?, ?, ?, ?)')
    .run(null, username, 'set-countdown', deviceId, deviceId, `Auto ${current.countdown.action === 'turn_on' ? 'ON' : 'OFF'} in ${durationSec}s`);

  return current;
}

function setCycleCount(deviceId, config, username = 'admin') {
  const current = automationsMap.get(deviceId) || { schedule: null, countdown: null, cycle_count: null };
  const totalCount = Math.max(1, parseInt(config.total_count || 1, 10));
  const intervalOn = Math.max(1, parseInt(config.interval_on_sec || 2, 10));
  const intervalOff = Math.max(1, parseInt(config.interval_off_sec || 2, 10));

  current.cycle_count = {
    active: true,
    total_count: totalCount,
    current_count: 0,
    interval_on_sec: intervalOn,
    interval_off_sec: intervalOff,
    phase: 'on',
    next_toggle_time: Date.now() + intervalOn * 1000
  };

  automationsMap.set(deviceId, current);
  saveAutomationToDb(deviceId);

  // Immediately turn ON for the first cycle
  setDeviceStateInternal(deviceId, { on: true }, `Started cycle 1 of ${totalCount}`);
  broadcastAutomationUpdate(deviceId);

  const db = getDb();
  db.prepare('INSERT INTO logs (user_id, username, action, device_id, device_name, details) VALUES (?, ?, ?, ?, ?, ?)')
    .run(null, username, 'start-cycle', deviceId, deviceId, `Started count cycle: ${totalCount} times (ON ${intervalOn}s / OFF ${intervalOff}s)`);

  return current;
}

function cancelAutomation(deviceId, type, username = 'admin') {
  const current = automationsMap.get(deviceId) || { schedule: null, countdown: null, cycle_count: null };

  if (type === 'schedule' || type === 'all') {
    if (current.schedule) current.schedule.enabled = false;
  }
  if (type === 'countdown' || type === 'all') {
    current.countdown = null;
  }
  if (type === 'cycle_count' || type === 'all') {
    if (current.cycle_count) {
      current.cycle_count.active = false;
      current.cycle_count = null;
    }
  }

  automationsMap.set(deviceId, current);
  saveAutomationToDb(deviceId);
  broadcastAutomationUpdate(deviceId);

  const db = getDb();
  db.prepare('INSERT INTO logs (user_id, username, action, device_id, device_name, details) VALUES (?, ?, ?, ?, ?, ?)')
    .run(null, username, 'cancel-automation', deviceId, deviceId, `Cancelled automation: ${type}`);

  return current;
}

// ----------------------------------------------------
// CORE TICK LOOP (Runs every 1 second)
// ----------------------------------------------------

function tick() {
  const now = new Date();
  const nowMs = now.getTime();
  const currentDay = now.getDay(); // 0 = Sun, 1 = Mon, etc.
  
  // Format current HH:mm
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const currentHHmm = `${hours}:${minutes}`;
  const currentDateISO = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm

  automationsMap.forEach((auto, deviceId) => {
    let changed = false;

    // 1. EVALUATE SCHEDULE
    if (auto.schedule && auto.schedule.enabled) {
      const { on_time, off_time, days, last_on_triggered, last_off_triggered } = auto.schedule;
      const isDayActive = !days || days.length === 0 || days.includes(currentDay);

      // Check ON schedule
      if (on_time && isDayActive) {
        const matches = on_time.includes('T') ? currentDateISO === on_time : currentHHmm === on_time;
        if (matches && last_on_triggered !== currentDateISO) {
          auto.schedule.last_on_triggered = currentDateISO;
          setDeviceStateInternal(deviceId, { on: true }, `Scheduled Auto-ON (${on_time})`);
          changed = true;
        }
      }

      // Check OFF schedule
      if (off_time && isDayActive) {
        const matches = off_time.includes('T') ? currentDateISO === off_time : currentHHmm === off_time;
        if (matches && last_off_triggered !== currentDateISO) {
          auto.schedule.last_off_triggered = currentDateISO;
          setDeviceStateInternal(deviceId, { on: false }, `Scheduled Auto-OFF (${off_time})`);
          changed = true;
        }
      }
    }

    // 2. EVALUATE COUNTDOWN TIMER
    if (auto.countdown && auto.countdown.active) {
      if (nowMs >= auto.countdown.target_time) {
        const targetAction = auto.countdown.action === 'turn_on';
        setDeviceStateInternal(
          deviceId,
          { on: targetAction },
          `Countdown Auto-${targetAction ? 'ON' : 'OFF'} complete`
        );
        auto.countdown = null;
        changed = true;
      }
    }

    // 3. EVALUATE CYCLE COUNT
    if (auto.cycle_count && auto.cycle_count.active) {
      if (nowMs >= auto.cycle_count.next_toggle_time) {
        if (auto.cycle_count.phase === 'on') {
          // Switch to OFF
          auto.cycle_count.phase = 'off';
          auto.cycle_count.next_toggle_time = nowMs + auto.cycle_count.interval_off_sec * 1000;
          auto.cycle_count.current_count += 1;

          setDeviceStateInternal(
            deviceId,
            { on: false },
            `Cycle count ${auto.cycle_count.current_count}/${auto.cycle_count.total_count} (OFF phase)`
          );

          if (auto.cycle_count.current_count >= auto.cycle_count.total_count) {
            // All cycles completed
            auto.cycle_count.active = false;
            setDeviceStateInternal(
              deviceId,
              { on: false },
              `Cycle count completed all ${auto.cycle_count.total_count} cycles`
            );
            auto.cycle_count = null;
          }
          changed = true;
        } else {
          // Switch to ON
          auto.cycle_count.phase = 'on';
          auto.cycle_count.next_toggle_time = nowMs + auto.cycle_count.interval_on_sec * 1000;

          setDeviceStateInternal(
            deviceId,
            { on: true },
            `Cycle count ${auto.cycle_count.current_count + 1}/${auto.cycle_count.total_count} (ON phase)`
          );
          changed = true;
        }
      }
    }

    if (changed) {
      saveAutomationToDb(deviceId);
      broadcastAutomationUpdate(deviceId);
    }
  });
}

module.exports = {
  initAutomations,
  getAutomation,
  setSchedule,
  setCountdown,
  setCycleCount,
  cancelAutomation
};
