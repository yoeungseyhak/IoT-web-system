import { useState, useEffect } from 'react';
import { getDevices, getParkingSlots } from '../api';

const SPI_FLASH_PINS = new Set([6, 7, 8, 9, 10, 11]);
const INPUT_ONLY_PINS = new Set([34, 35, 36, 39]);

export function normalizeControllerScope(controllerId) {
  if (typeof controllerId !== 'string') return '';
  const trimmed = controllerId.trim();
  if (!trimmed || trimmed.toLowerCase() === 'all') return '';
  return trimmed;
}

export function controllersOverlap(ctrlA, ctrlB) {
  const a = normalizeControllerScope(ctrlA);
  const b = normalizeControllerScope(ctrlB);
  return !a || !b || a === b;
}

export function parsePinTokens(pinStr) {
  if (typeof pinStr !== 'string') return { tokens: [], invalid: false };
  const trimmed = pinStr.trim();
  if (!trimmed) return { tokens: [], invalid: false };

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

export function validateAndFindPinConflict({
  pin,
  controllerId = '',
  devices = [],
  slots = [],
  controllers = [],
  excludeDeviceId = null,
  excludeSlotId = null,
  allowInputOnly = false
}) {
  const { tokens, invalid } = parsePinTokens(pin);
  if (invalid) {
    return 'Invalid ESP32 pin format. Use numeric GPIO pin numbers (e.g. 13 or 25, 26).';
  }
  if (tokens.length === 0) return null;

  const seen = new Set();
  for (const p of tokens) {
    if (!Number.isInteger(p) || p < 0 || p > 39) {
      return `Invalid ESP32 pin ${p}. Valid GPIO range is 0–39.`;
    }
    if (seen.has(p)) {
      return `Duplicate pin ${p} specified in the same pin list.`;
    }
    seen.add(p);

    if (SPI_FLASH_PINS.has(p)) {
      return `Pin ${p} is reserved for ESP32 SPI flash (pins 6–11) and cannot be used.`;
    }
    if (!allowInputOnly && INPUT_ONLY_PINS.has(p)) {
      return `Pin ${p} is input-only (pins 34, 35, 36, 39) and cannot drive output components.`;
    }
  }

  const targetScope = normalizeControllerScope(controllerId);
  const targetPinSet = new Set(tokens);
  const ctrlNameMap = new Map(controllers.map((c) => [c.id, c.name || c.id]));
  const formatCtrl = (scope) => (!scope ? 'All Controllers' : ctrlNameMap.get(scope) || scope);

  for (const dev of devices) {
    if (excludeDeviceId && dev.id === excludeDeviceId) continue;
    if (!controllersOverlap(targetScope, dev.controller_id)) continue;

    const { tokens: devTokens } = parsePinTokens(dev.pin || '');
    const match = devTokens.find((p) => targetPinSet.has(p));
    if (match !== undefined) {
      const scope = normalizeControllerScope(dev.controller_id) || targetScope;
      return `Pin ${match} is already assigned to component "${dev.name}" (${formatCtrl(scope)}).`;
    }
  }

  for (const slot of slots) {
    if (excludeSlotId && slot.id === excludeSlotId) continue;
    if (!controllersOverlap(targetScope, slot.controller_id)) continue;

    const { tokens: slotTokens } = parsePinTokens(slot.sensor_pin || '');
    const match = slotTokens.find((p) => targetPinSet.has(p));
    if (match !== undefined) {
      const scope = normalizeControllerScope(slot.controller_id) || targetScope;
      return `Pin ${match} is already assigned to parking slot "${slot.name}" (${formatCtrl(scope)}).`;
    }
  }

  return null;
}

export function getUsedPinsMap({
  controllerId = '',
  devices = [],
  slots = [],
  excludeDeviceId = null,
  excludeSlotId = null
}) {
  const used = new Map();
  const targetScope = normalizeControllerScope(controllerId);

  for (const dev of devices) {
    if (excludeDeviceId && dev.id === excludeDeviceId) continue;
    if (!controllersOverlap(targetScope, dev.controller_id)) continue;
    const { tokens } = parsePinTokens(dev.pin || '');
    for (const p of tokens) {
      if (!used.has(p)) {
        used.set(p, { ownerType: 'component', ownerName: dev.name });
      }
    }
  }

  for (const slot of slots) {
    if (excludeSlotId && slot.id === excludeSlotId) continue;
    if (!controllersOverlap(targetScope, slot.controller_id)) continue;
    const { tokens } = parsePinTokens(slot.sensor_pin || '');
    for (const p of tokens) {
      if (!used.has(p)) {
        used.set(p, { ownerType: 'slot', ownerName: slot.name });
      }
    }
  }

  return used;
}

export function useHardwareInventory(isOpen) {
  const [devices, setDevices] = useState([]);
  const [slots, setSlots] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    Promise.all([
      getDevices().catch(() => ({ devices: [] })),
      getParkingSlots().catch(() => ({ slots: [] }))
    ]).then(([devRes, slotRes]) => {
      if (!active) return;
      setDevices(devRes?.devices || []);
      setSlots(slotRes?.slots || []);
    });
    return () => {
      active = false;
    };
  }, [isOpen]);

  return { devices, slots };
}
