const { getDb } = require('./database');
const { broadcastDeviceUpdate, broadcastToAll, isControllerOnlineForDevice } = require('./websocket');

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
    if (device.disabled === 1) {
      console.log(`[Automation] Skipped "${device.name}" (${deviceId}) because it is disabled.`);
      return;
    }

    const existingState = JSON.parse(device.state || '{}');
    const newState = { ...existingState, ...state };
    const isOnline = typeof isControllerOnlineForDevice === 'function' ? isControllerOnlineForDevice(deviceId) : true;
    const pendingSync = isOnline
      ? null
      : JSON.stringify({ state: newState, reason, triggeredBy: 'Automation', timestamp: Date.now() });

    db.prepare('UPDATE devices SET state = ?, pending_sync = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(JSON.stringify(newState), pendingSync, deviceId);

    const stateDesc = Object.entries(state).map(([k, v]) => `${k}: ${v}`).join(', ');
    const offlineTag = isOnline ? '' : ' [Queued: ESP32 offline]';
    db.prepare('INSERT INTO logs (user_id, username, action, device_id, device_name, details) VALUES (?, ?, ?, ?, ?, ?)')
      .run(null, 'Automation', 'device-update', deviceId, device.name, `${reason} (${stateDesc})${offlineTag}`);

    broadcastDeviceUpdate(deviceId, newState, 'Automation');
  } catch (err) {
    console.error(`Error updating device state for ${deviceId}:`, err);
  }
}

// ----------------------------------------------------
// PUBLIC API METHODS
// ----------------------------------------------------

function normalizeScheduleTime(val) {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (trimmed.includes('T')) return trimmed.slice(0, 16);
  return trimmed.slice(0, 5);
}

const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function getNowInScheduleTimezone(now, schedule) {
  const tz = schedule && typeof schedule.timezone === 'string' ? schedule.timezone.trim() : '';
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        weekday: 'short'
      }).formatToParts(now);
      const map = {};
      for (const p of parts) {
        if (p.type !== 'literal') map[p.type] = p.value;
      }
      const hour = map.hour === '24' ? '00' : map.hour;
      const dayOfWeek = WEEKDAY_MAP[map.weekday];
      if (map.year && map.month && map.day && hour && map.minute && dayOfWeek !== undefined) {
        const hhmm = `${hour}:${map.minute}`;
        return {
          hhmm,
          dateTime: `${map.year}-${map.month}-${map.day}T${hhmm}`,
          dayOfWeek
        };
      }
    } catch (e) {
      // Fall back to numeric offset or server local time if timezone string is invalid
    }
  }

  if (schedule && typeof schedule.tz_offset === 'number' && Number.isFinite(schedule.tz_offset)) {
    const shifted = new Date(now.getTime() - schedule.tz_offset * 60000);
    const yyyy = shifted.getUTCFullYear();
    const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(shifted.getUTCDate()).padStart(2, '0');
    const hh = String(shifted.getUTCHours()).padStart(2, '0');
    const min = String(shifted.getUTCMinutes()).padStart(2, '0');
    const hhmm = `${hh}:${min}`;
    return {
      hhmm,
      dateTime: `${yyyy}-${mm}-${dd}T${hhmm}`,
      dayOfWeek: shifted.getUTCDay()
    };
  }

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const hhmm = `${hh}:${min}`;
  return {
    hhmm,
    dateTime: `${yyyy}-${mm}-${dd}T${hhmm}`,
    dayOfWeek: now.getDay()
  };
}

function setSchedule(deviceId, config, username = 'admin') {
  const current = automationsMap.get(deviceId) || { schedule: null, countdown: null, cycle_count: null };
  const onTime = normalizeScheduleTime(config.on_time);
  const offTime = normalizeScheduleTime(config.off_time);
  const isDateTimeSchedule = Boolean((onTime && onTime.includes('T')) || (offTime && offTime.includes('T')));
  const days = config.days === null || isDateTimeSchedule
    ? null
    : (Array.isArray(config.days) && config.days.length > 0 ? config.days : [0, 1, 2, 3, 4, 5, 6]);

  current.schedule = {
    enabled: config.enabled !== false,
    on_time: onTime,
    off_time: offTime,
    days,
    timezone: typeof config.timezone === 'string' && config.timezone.trim() ? config.timezone.trim() : null,
    tz_offset: typeof config.tz_offset === 'number' && Number.isFinite(config.tz_offset) ? config.tz_offset : null,
    last_on_triggered: null,
    last_off_triggered: null
  };
  automationsMap.set(deviceId, current);
  saveAutomationToDb(deviceId);
  broadcastAutomationUpdate(deviceId);

  const db = getDb();
  db.prepare('INSERT INTO logs (user_id, username, action, device_id, device_name, details) VALUES (?, ?, ?, ?, ?, ?)')
    .run(null, username, 'set-schedule', deviceId, deviceId, `Schedule set: ON at ${onTime || 'none'}, OFF at ${offTime || 'none'}`);

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

  automationsMap.forEach((auto, deviceId) => {
    let changed = false;

    // 1. EVALUATE SCHEDULE
    if (auto.schedule && auto.schedule.enabled) {
      const { on_time, off_time, days } = auto.schedule;
      const { hhmm, dateTime, dayOfWeek } = getNowInScheduleTimezone(now, auto.schedule);
      const normalizedOn = normalizeScheduleTime(on_time);
      const normalizedOff = normalizeScheduleTime(off_time);
      const isSpecificOn = Boolean(normalizedOn && normalizedOn.includes('T'));
      const isSpecificOff = Boolean(normalizedOff && normalizedOff.includes('T'));
      const isDailyOn = Boolean(normalizedOn && !isSpecificOn);
      const isDailyOff = Boolean(normalizedOff && !isSpecificOff);
      const isDayActive = !days || days.length === 0 || days.includes(dayOfWeek);

      // Check ON schedule
      if (normalizedOn && (isSpecificOn || isDayActive)) {
        const matches = isSpecificOn ? dateTime === normalizedOn : hhmm === normalizedOn;
        if (matches && auto.schedule.last_on_triggered !== dateTime) {
          auto.schedule.last_on_triggered = dateTime;
          setDeviceStateInternal(deviceId, { on: true }, `Scheduled Auto-ON (${normalizedOn})`);
          changed = true;
        }
      }

      // Check OFF schedule
      if (normalizedOff && (isSpecificOff || isDayActive)) {
        const matches = isSpecificOff ? dateTime === normalizedOff : hhmm === normalizedOff;
        if (matches && auto.schedule.last_off_triggered !== dateTime) {
          auto.schedule.last_off_triggered = dateTime;
          setDeviceStateInternal(deviceId, { on: false }, `Scheduled Auto-OFF (${normalizedOff})`);
          changed = true;
        }
      }

      // Auto-remove Specific Date & Time schedules once all configured one-time targets complete
      if ((isSpecificOn || isSpecificOff) && !isDailyOn && !isDailyOff) {
        const onDone = !isSpecificOn || Boolean(auto.schedule.last_on_triggered) || dateTime > normalizedOn;
        const offDone = !isSpecificOff || Boolean(auto.schedule.last_off_triggered) || dateTime > normalizedOff;
        if (onDone && offDone) {
          auto.schedule = null;
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
