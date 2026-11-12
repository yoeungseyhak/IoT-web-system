const SPI_FLASH_PINS = new Set([6, 7, 8, 9, 10, 11]);
const INPUT_ONLY_PINS = new Set([34, 35, 36, 39]);

function normalizeControllerScope(controllerId) {
  if (typeof controllerId !== 'string') return '';
  const trimmed = controllerId.trim();
  if (!trimmed || trimmed.toLowerCase() === 'all') return '';
  return trimmed;
}

function controllersOverlap(ctrlA, ctrlB) {
  const a = normalizeControllerScope(ctrlA);
  const b = normalizeControllerScope(ctrlB);
  return !a || !b || a === b;
}

function parsePinTokens(pinStr) {
  if (typeof pinStr !== 'string') return { tokens: [], invalid: false };
  const trimmed = pinStr.trim();
  if (!trimmed) return { tokens: [], invalid: false };

  // Strip optional "GPIO" prefixes and check for unexpected characters outside numbers/separators
  const cleaned = trimmed.replace(/gpio/gi, ' ');
  if (/[^0-9,\s+/;-]/.test(cleaned)) {
    return { tokens: [], invalid: true };
  }

  const matches = cleaned.match(/\d+/g);
  if (!matches || matches.length === 0) {
    return { tokens: [], invalid: true };
  }

  return {
    tokens: matches.map((n) => parseInt(n, 10)),
    invalid: false
  };
}

function validateHardwarePin(pinStr, { allowInputOnly = false } = {}) {
  const { tokens, invalid } = parsePinTokens(pinStr);
  if (invalid) {
    return {
      valid: false,
      status: 400,
      message: 'Invalid ESP32 pin format. Use numeric GPIO pin numbers (e.g. 13 or 25, 26).'
    };
  }
  if (tokens.length === 0) {
    return { valid: true, tokens: [] };
  }

  const seen = new Set();
  for (const pin of tokens) {
    if (!Number.isInteger(pin) || pin < 0 || pin > 39) {
      return {
        valid: false,
        status: 400,
        message: `Invalid ESP32 pin ${pin}. Valid GPIO range is 0–39.`
      };
    }
    if (seen.has(pin)) {
      return {
        valid: false,
        status: 400,
        message: `Duplicate pin ${pin} specified in the same pin list.`
      };
    }
    seen.add(pin);

    if (SPI_FLASH_PINS.has(pin)) {
      return {
        valid: false,
        status: 400,
        message: `Pin ${pin} is reserved for ESP32 SPI flash (pins 6–11) and cannot be used.`
      };
    }
    if (!allowInputOnly && INPUT_ONLY_PINS.has(pin)) {
      return {
        valid: false,
        status: 400,
        message: `Pin ${pin} is input-only (pins 34, 35, 36, 39) and cannot drive output components.`
      };
    }
  }

  return { valid: true, tokens };
}

function findPinConflict(db, { pin, controllerId = '', excludeDeviceId = null, excludeSlotId = null }) {
  const { tokens } = parsePinTokens(pin);
  if (tokens.length === 0) return null;

  const targetScope = normalizeControllerScope(controllerId);
  const targetPinSet = new Set(tokens);

  const controllerNames = new Map();
  try {
    const rows = db.prepare('SELECT id, name FROM controllers').all();
    for (const c of rows) controllerNames.set(c.id, c.name || c.id);
  } catch (e) {}

  const formatCtrlLabel = (scope) => {
    if (!scope) return 'All Controllers';
    return controllerNames.get(scope) || scope;
  };

  const devices = db.prepare('SELECT id, name, pin, controller_id FROM devices').all();
  for (const dev of devices) {
    if (excludeDeviceId && dev.id === excludeDeviceId) continue;
    if (!controllersOverlap(targetScope, dev.controller_id)) continue;

    const { tokens: devTokens } = parsePinTokens(dev.pin || '');
    const match = devTokens.find((p) => targetPinSet.has(p));
    if (match !== undefined) {
      const scope = normalizeControllerScope(dev.controller_id) || targetScope;
      const ctrlLabel = formatCtrlLabel(scope);
      return {
        pin: match,
        ownerType: 'component',
        ownerId: dev.id,
        ownerName: dev.name,
        controllerId: dev.controller_id || '',
        controllerLabel: ctrlLabel,
        message: `Pin ${match} is already assigned to component "${dev.name}" (${ctrlLabel}).`
      };
    }
  }

  const slots = db.prepare('SELECT id, name, sensor_pin, controller_id FROM parking_slots').all();
  for (const slot of slots) {
    if (excludeSlotId && slot.id === excludeSlotId) continue;
    if (!controllersOverlap(targetScope, slot.controller_id)) continue;

    const { tokens: slotTokens } = parsePinTokens(slot.sensor_pin || '');
    const match = slotTokens.find((p) => targetPinSet.has(p));
    if (match !== undefined) {
      const scope = normalizeControllerScope(slot.controller_id) || targetScope;
      const ctrlLabel = formatCtrlLabel(scope);
      return {
        pin: match,
        ownerType: 'parking slot',
        ownerId: slot.id,
        ownerName: slot.name,
        controllerId: slot.controller_id || '',
        controllerLabel: ctrlLabel,
        message: `Pin ${match} is already assigned to parking slot "${slot.name}" (${ctrlLabel}).`
      };
    }
  }

  return null;
}

module.exports = {
  parsePinTokens,
  normalizeControllerScope,
  controllersOverlap,
  validateHardwarePin,
  findPinConflict
};
