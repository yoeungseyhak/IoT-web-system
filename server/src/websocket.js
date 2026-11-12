const { WebSocketServer } = require("ws");
const jwt = require("jsonwebtoken");
const { getDb } = require("./database");

const webClients = new Set();
// Multiple ESP32 controller connections: Map<controllerId, ControllerSession>
const controllerClients = new Map();

function getControllersStatusList() {
  let dbControllers = [];
  try {
    const db = getDb();
    dbControllers = db
      .prepare(
        "SELECT id, name, description, ip_address FROM controllers ORDER BY id ASC",
      )
      .all();
  } catch (e) {
    console.error("Error fetching controllers from DB:", e);
  }

  const result = dbControllers.map((c) => {
    const live = controllerClients.get(c.id);
    const isOnline = Boolean(live && live.ws && live.ws.readyState === 1);
    return {
      id: c.id,
      name: c.name,
      description: c.description || "",
      online: isOnline,
      ip: (live && live.ip) || c.ip_address || "",
      connectedAt: live ? live.connectedAt : null,
      lastSeen: live ? live.lastSeen : null,
    };
  });

  // Also include any connected controllers that were auto-registered but not in initial DB fetch
  controllerClients.forEach((live, id) => {
    if (
      !result.some((r) => r.id === id) &&
      live.ws &&
      live.ws.readyState === 1
    ) {
      result.push({
        id,
        name: live.name || id,
        description: "Auto-detected ESP32 Controller",
        online: true,
        ip: live.ip || "",
        connectedAt: live.connectedAt,
        lastSeen: live.lastSeen,
      });
    }
  });

  return result;
}

function getDeviceStatus() {
  const activeList = Array.from(controllerClients.values()).filter(
    (c) => c.ws && c.ws.readyState === 1,
  );
  const isAnyOnline = activeList.length > 0;
  const latestSeen = activeList.reduce(
    (max, c) => Math.max(max, c.lastSeen),
    0,
  );

  return {
    online: isAnyOnline,
    lastSeen: latestSeen || Date.now(),
    count: activeList.length,
    controllers: getControllersStatusList(),
  };
}

function setDeviceStatus(online) {
  // Legacy compatibility stub
  broadcastDeviceStatus();
}

function isControllerOnlineForDevice(deviceId) {
  try {
    const db = getDb();
    const dev = db
      .prepare("SELECT controller_id FROM devices WHERE id = ?")
      .get(deviceId);
    if (!dev || !dev.controller_id || dev.controller_id === "all") {
      return Array.from(controllerClients.values()).some(
        (c) => c.ws && c.ws.readyState === 1,
      );
    }
    const client = controllerClients.get(dev.controller_id);
    return Boolean(client && client.ws && client.ws.readyState === 1);
  } catch (e) {
    return Array.from(controllerClients.values()).some(
      (c) => c.ws && c.ws.readyState === 1,
    );
  }
}

function broadcastToAll(message, excludeDevice = false) {
  const msgStr =
    typeof message === "string" ? message : JSON.stringify(message);
  webClients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(msgStr);
    } else if (client.readyState !== 0) {
      webClients.delete(client);
    }
  });

  if (!excludeDevice) {
    controllerClients.forEach((c) => {
      if (c.ws && c.ws.readyState === 1) {
        try {
          c.ws.send(msgStr);
        } catch (e) {}
      }
    });
  }
}

function broadcastDeviceStatus() {
  const status = getDeviceStatus();
  broadcastToAll({
    type: "device-status",
    online: status.online,
    count: status.count,
    controllers: status.controllers,
    lastSeen: status.lastSeen,
  });
  broadcastToAll({
    type: "esp32-status",
    online: status.online,
    count: status.count,
    controllers: status.controllers,
    lastSeen: status.lastSeen,
  });
  broadcastToAll({
    type: "controllers-status",
    online: status.online,
    count: status.count,
    controllers: status.controllers,
  });
}

function turnOffDevicesForController(controllerId) {
  try {
    const db = getDb();
    const devices = db
      .prepare("SELECT id, state, type, controller_id FROM devices")
      .all();
    devices.forEach((d) => {
      const matchesController =
        !d.controller_id ||
        d.controller_id === "all" ||
        d.controller_id === controllerId;
      if (matchesController) {
        const state = JSON.parse(d.state || "{}");
        let changed = false;
        if (state.on) {
          state.on = false;
          changed = true;
        }
        if (
          state.status === "open" ||
          state.status === "opened" ||
          state.status === "opening" ||
          state.status === "closing"
        ) {
          state.status = "closed";
          changed = true;
        }
        if (changed) {
          db.prepare(
            "UPDATE devices SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(JSON.stringify(state), d.id);
          broadcastToAll(
            {
              type: "device-update",
              deviceId: d.id,
              state,
              controllerId: d.controller_id || controllerId,
              triggeredBy: "system-offline",
              timestamp: Date.now(),
            },
            true,
          );
        }
      }
    });
  } catch (err) {
    console.error("Error turning off devices for offline controller:", err);
  }
}

function broadcastDeviceUpdate(deviceId, state, triggeredBy) {
  let pin = "";
  let deviceType = "";
  let controllerId = "";
  try {
    const db = getDb();
    const dev = db
      .prepare("SELECT pin, type, controller_id FROM devices WHERE id = ?")
      .get(deviceId);
    if (dev) {
      pin = dev.pin || "";
      deviceType = dev.type || "";
      controllerId = dev.controller_id || "";
    }
  } catch (e) {}

  // Compute baseDeviceId for hardware controllers (e.g. "esp32-2_light-1" -> "light-1")
  let baseDeviceId = deviceId;
  if (controllerId && baseDeviceId.startsWith(`${controllerId}_`)) {
    baseDeviceId = baseDeviceId.substring(controllerId.length + 1);
  } else if (controllerId && baseDeviceId.startsWith(`${controllerId}-`)) {
    baseDeviceId = baseDeviceId.substring(controllerId.length + 1);
  }

  const msg = {
    type: "device-update",
    deviceId,
    state,
    pin,
    deviceType,
    controllerId,
    triggeredBy,
    timestamp: Date.now(),
  };
  const msgStr = JSON.stringify(msg);

  // 1. Broadcast to all web clients (keeps namespaced deviceId for UI card targeting)
  webClients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(msgStr);
    } else if (client.readyState !== 0) {
      webClients.delete(client);
    }
  });

  // 2. Prepare message for ESP32 hardware controllers using baseDeviceId
  const controllerMsg = JSON.stringify({
    ...msg,
    deviceId: baseDeviceId,
  });

  // Route command to targeted ESP32 controller (or broadcast to all if unassigned / 'all')
  if (controllerId && controllerId !== "all") {
    const targetController = controllerClients.get(controllerId);
    if (
      targetController &&
      targetController.ws &&
      targetController.ws.readyState === 1
    ) {
      try {
        targetController.ws.send(controllerMsg);
      } catch (e) {}
    } else {
      // Fallback: If designated controller is not connected, broadcast to all active controllers
      controllerClients.forEach((c) => {
        if (c.ws && c.ws.readyState === 1) {
          try {
            c.ws.send(controllerMsg);
          } catch (e) {}
        }
      });
    }
  } else {
    // Unassigned or broadcast to all controllers
    controllerClients.forEach((c) => {
      if (c.ws && c.ws.readyState === 1) {
        try {
          c.ws.send(controllerMsg);
        } catch (e) {}
      }
    });
  }
}

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });
  const HEARTBEAT_TIMEOUT = parseInt(
    process.env.DEVICE_HEARTBEAT_TIMEOUT ||
      process.env.ESP32_HEARTBEAT_TIMEOUT ||
      "15000",
    10,
  );

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const isDevice =
      req.url.startsWith("/ws/device") ||
      url.searchParams.get("type") === "device" ||
      (!url.searchParams.has("token") &&
        (url.searchParams.has("controllerId") || url.searchParams.has("id")));

    if (isDevice) {
      // ---- Hardware Device Client (Multiple ESP32s supported) ----
      let controllerId =
        url.searchParams.get("id") || url.searchParams.get("controllerId");
      if (!controllerId) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts.length > 2) {
          controllerId = parts[2];
        }
      }
      if (!controllerId && req.headers["x-controller-id"]) {
        controllerId = req.headers["x-controller-id"];
      }

      // Auto-assign next free controller ID if none explicitly specified
      if (!controllerId) {
        const db = getDb();
        try {
          const dbControllers = db
            .prepare("SELECT id FROM controllers ORDER BY id ASC")
            .all();
          for (const c of dbControllers) {
            const existing = controllerClients.get(c.id);
            if (!existing || !existing.ws || existing.ws.readyState !== 1) {
              controllerId = c.id;
              break;
            }
          }
        } catch (e) {}
        if (!controllerId) {
          controllerId = `esp32-${controllerClients.size + 1}`;
        }
      }

      const clientIp = (
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress ||
        ""
      ).replace(/^.*:/, "");
      const requestedName =
        url.searchParams.get("name") || `ESP32 (${controllerId})`;

      // Register or update controller in database
      try {
        const db = getDb();
        const existing = db
          .prepare("SELECT id, name FROM controllers WHERE id = ?")
          .get(controllerId);
        if (!existing) {
          db.prepare(
            "INSERT INTO controllers (id, name, description, ip_address) VALUES (?, ?, ?, ?)",
          ).run(
            controllerId,
            requestedName,
            "Auto-registered ESP32 controller",
            clientIp,
          );
        } else {
          db.prepare("UPDATE controllers SET ip_address = ? WHERE id = ?").run(
            clientIp,
            controllerId,
          );
        }
      } catch (dbErr) {
        console.error("Error recording controller in DB:", dbErr);
      }

      // Clean up any stale connection for this controller ID
      if (controllerClients.has(controllerId)) {
        const old = controllerClients.get(controllerId);
        if (old.ws && old.ws !== ws && old.ws.readyState === 1) {
          try {
            old.ws.close(1000, "Replaced by new connection");
          } catch (e) {}
        }
      }

      const controllerObj = {
        id: controllerId,
        name: requestedName,
        ws,
        ip: clientIp,
        connectedAt: Date.now(),
        lastSeen: Date.now(),
        online: true,
      };
      controllerClients.set(controllerId, controllerObj);

      console.log(
        `[WS] ESP32 Controller "${controllerId}" (${requestedName}) connected from ${clientIp}. Total active: ${controllerClients.size}`,
      );
      broadcastDeviceStatus();

      // Sync states and pin mapping to this ESP32 (only devices bound to this controller, or unassigned / 'all')
      const db = getDb();
      try {
        const relevantDevices = db
          .prepare(
            `
                    SELECT id, state, pin, type, controller_id FROM devices 
                    WHERE controller_id = ? OR controller_id = '' OR controller_id IS NULL OR controller_id = 'all'
                `,
          )
          .all(controllerId);

        relevantDevices.forEach((d) => {
          ws.send(
            JSON.stringify({
              type: "device-update",
              deviceId: d.id,
              state: JSON.parse(d.state || "{}"),
              pin: d.pin || "",
              deviceType: d.type || "",
              controllerId: d.controller_id || controllerId,
              triggeredBy: "system-init",
              timestamp: Date.now(),
            }),
          );
        });
      } catch (devErr) {
        console.error("Error syncing devices on controller connect:", devErr);
      }

      // Sync parking slots assigned to this controller (or unassigned / 'all')
      try {
        const relevantSlots = db
          .prepare(
            `
                    SELECT id, name, sensor_pin, sensor_type, occupied, controller_id FROM parking_slots 
                    WHERE controller_id = ? OR controller_id = '' OR controller_id IS NULL OR controller_id = 'all'
                    ORDER BY id ASC
                `,
          )
          .all(controllerId);

        ws.send(
          JSON.stringify({
            type: "slots-init",
            slots: relevantSlots,
            controllerId,
            timestamp: Date.now(),
          }),
        );

        // Immediate clock synchronization to keep controller RTC & daily schedules accurate
        ws.send(
          JSON.stringify({
            type: "time-sync",
            epoch: Math.floor(Date.now() / 1000),
            tzOffset: new Date().getTimezoneOffset(),
          }),
        );
      } catch (err) {
        console.error(
          "Error syncing parking slots on controller connect:",
          err,
        );
      }

      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message);
          controllerObj.lastSeen = Date.now();

          // Auto-registration and hardware manifest self-discovery
          if (data.type === "register" && data.controllerId) {
            const newId = data.controllerId;
            if (newId !== controllerId) {
              controllerClients.delete(controllerId);
              controllerId = newId;
              controllerObj.id = newId;
              if (data.name) controllerObj.name = data.name;
              controllerClients.set(newId, controllerObj);
              broadcastDeviceStatus();
            } else if (data.name && controllerObj.name !== data.name) {
              controllerObj.name = data.name;
            }

            const db = getDb();

            // 1. Ensure controller is registered in controllers table
            try {
              const existingCtrl = db
                .prepare("SELECT id FROM controllers WHERE id = ?")
                .get(controllerId);
              if (!existingCtrl) {
                db.prepare(
                  "INSERT INTO controllers (id, name, description, ip_address) VALUES (?, ?, ?, ?)",
                ).run(
                  controllerId,
                  controllerObj.name,
                  "Auto-registered ESP32 controller",
                  clientIp,
                );
              } else {
                db.prepare(
                  "UPDATE controllers SET ip_address = ? WHERE id = ?",
                ).run(clientIp, controllerId);
              }
            } catch (ctrlErr) {
              console.error(
                "Error auto-registering controller in DB:",
                ctrlErr,
              );
            }

            // 2. Auto-provision hardware components from manifest
            if (Array.isArray(data.components)) {
              const isPrimary = controllerId === "esp32-1";
              data.components.forEach((comp) => {
                if (!comp || !comp.id) return;
                const targetDevId = isPrimary
                  ? comp.id
                  : `${controllerId}_${comp.id}`;
                const devName = isPrimary
                  ? comp.name || comp.id
                  : `${comp.name || comp.id} (${controllerId})`;
                const devType =
                  comp.type ||
                  (comp.id.includes("gate") ? "boom-gate" : "light");
                const devPin = comp.pin || "";
                const devState = JSON.stringify(
                  comp.state ||
                    (devType === "boom-gate"
                      ? { status: "closed" }
                      : { on: false }),
                );

                try {
                  const existingDev = db
                    .prepare(
                      "SELECT id, name, type, pin, state, controller_id FROM devices WHERE id = ?",
                    )
                    .get(targetDevId);
                  if (!existingDev) {
                    db.prepare(
                      "INSERT INTO devices (id, name, type, pin, state, controller_id) VALUES (?, ?, ?, ?, ?, ?)",
                    ).run(
                      targetDevId,
                      devName,
                      devType,
                      devPin,
                      devState,
                      controllerId,
                    );
                    console.log(
                      `[WS] Auto-registered component "${devName}" (${targetDevId}) for controller "${controllerId}"`,
                    );

                    broadcastToAll(
                      {
                        type: "devices-changed",
                        action: "create",
                        device: {
                          id: targetDevId,
                          name: devName,
                          type: devType,
                          pin: devPin,
                          state:
                            comp.state ||
                            (devType === "boom-gate"
                              ? { status: "closed" }
                              : { on: false }),
                          controller_id: controllerId,
                          controller_name: controllerObj
                            ? controllerObj.name
                            : controllerId,
                          automation: null,
                        },
                      },
                      true,
                    );
                  } else {
                    if (
                      !existingDev.controller_id ||
                      existingDev.controller_id !== controllerId
                    ) {
                      db.prepare(
                        "UPDATE devices SET controller_id = ? WHERE id = ?",
                      ).run(controllerId, targetDevId);
                    }
                    if (!existingDev.pin && devPin) {
                      db.prepare("UPDATE devices SET pin = ? WHERE id = ?").run(
                        devPin,
                        targetDevId,
                      );
                    }
                    if (comp.state) {
                      const currState = JSON.parse(existingDev.state || "{}");
                      const keys = Object.keys(comp.state);
                      const isDiff = keys.some(
                        (k) => currState[k] !== comp.state[k],
                      );
                      if (isDiff) {
                        const merged = { ...currState, ...comp.state };
                        db.prepare(
                          "UPDATE devices SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                        ).run(JSON.stringify(merged), targetDevId);
                        broadcastToAll(
                          {
                            type: "device-update",
                            deviceId: targetDevId,
                            state: merged,
                            controllerId,
                            triggeredBy: "esp32",
                            timestamp: Date.now(),
                          },
                          true,
                        );
                      }
                    }
                  }
                } catch (compErr) {
                  console.error(
                    `[WS] Error provisioning component ${targetDevId}:`,
                    compErr,
                  );
                }
              });
            }

            // 3. Auto-provision parking slots from manifest
            if (Array.isArray(data.slots)) {
              const isPrimary = controllerId === "esp32-1";
              data.slots.forEach((slot) => {
                if (!slot || !slot.id) return;
                const targetSlotId = isPrimary
                  ? slot.id
                  : `${controllerId}_${slot.id}`;
                const slotName = isPrimary
                  ? slot.name || slot.id
                  : `${slot.name || slot.id} (${controllerId})`;
                const sensorPin = slot.sensor_pin || "";
                const sensorType = slot.sensor_type || "switch";
                const occupiedVal = slot.occupied ? 1 : 0;

                try {
                  const existingSlot = db
                    .prepare(
                      "SELECT id, name, sensor_pin, sensor_type, occupied, controller_id FROM parking_slots WHERE id = ?",
                    )
                    .get(targetSlotId);
                  if (!existingSlot) {
                    db.prepare(
                      "INSERT INTO parking_slots (id, name, sensor_pin, sensor_type, occupied, controller_id) VALUES (?, ?, ?, ?, ?, ?)",
                    ).run(
                      targetSlotId,
                      slotName,
                      sensorPin,
                      sensorType,
                      occupiedVal,
                      controllerId,
                    );
                    console.log(
                      `[WS] Auto-registered parking slot "${slotName}" (${targetSlotId}) for controller "${controllerId}"`,
                    );

                    const allSlots = db
                      .prepare("SELECT * FROM parking_slots ORDER BY id ASC")
                      .all();
                    const total = allSlots.length;
                    const occupiedCount = allSlots.filter(
                      (s) => s.occupied === 1,
                    ).length;
                    const available = Math.max(0, total - occupiedCount);
                    const stats = {
                      total,
                      occupied: occupiedCount,
                      available,
                      isFull: total > 0 && available === 0,
                    };

                    broadcastToAll(
                      {
                        type: "slots-changed",
                        action: "create",
                        slot: {
                          id: targetSlotId,
                          name: slotName,
                          sensor_pin: sensorPin,
                          sensor_type: sensorType,
                          occupied: Boolean(slot.occupied),
                          controller_id: controllerId,
                          controller_name: controllerObj
                            ? controllerObj.name
                            : controllerId,
                        },
                        stats,
                        timestamp: Date.now(),
                      },
                      true,
                    );
                  } else {
                    if (
                      !existingSlot.controller_id ||
                      existingSlot.controller_id !== controllerId
                    ) {
                      db.prepare(
                        "UPDATE parking_slots SET controller_id = ? WHERE id = ?",
                      ).run(controllerId, targetSlotId);
                    }
                    if (existingSlot.occupied !== occupiedVal) {
                      db.prepare(
                        "UPDATE parking_slots SET occupied = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                      ).run(occupiedVal, targetSlotId);

                      const allSlots = db
                        .prepare("SELECT * FROM parking_slots ORDER BY id ASC")
                        .all();
                      const total = allSlots.length;
                      const occupiedCount = allSlots.filter(
                        (s) => s.occupied === 1,
                      ).length;
                      const available = Math.max(0, total - occupiedCount);
                      const stats = {
                        total,
                        occupied: occupiedCount,
                        available,
                        isFull: total > 0 && available === 0,
                      };

                      broadcastToAll(
                        {
                          type: "slot-update",
                          slotId: targetSlotId,
                          occupied: Boolean(slot.occupied),
                          stats,
                          controllerId,
                          triggeredBy: "esp32",
                          timestamp: Date.now(),
                        },
                        true,
                      );
                    }
                  }
                } catch (slotErr) {
                  console.error(
                    `[WS] Error provisioning parking slot ${targetSlotId}:`,
                    slotErr,
                  );
                }
              });
            }

            // Sync controller clock on successful registration
            try {
              ws.send(
                JSON.stringify({
                  type: "time-sync",
                  epoch: Math.floor(Date.now() / 1000),
                  tzOffset: new Date().getTimezoneOffset(),
                }),
              );
            } catch (tsErr) {}
          } else if (data.type === "heartbeat") {
            controllerObj.lastSeen = Date.now();
          } else if (data.type === "state-report") {
            let normalizedId = data.deviceId;
            if (normalizedId === "light1") normalizedId = "light-1";
            else if (normalizedId === "light2") normalizedId = "light-2";
            else if (normalizedId === "light3") normalizedId = "light-3";
            else if (normalizedId === "light4") normalizedId = "light-4";
            else if (normalizedId === "light5") normalizedId = "light-5";
            else if (normalizedId === "party") normalizedId = "party-light";
            else if (normalizedId === "gate" || normalizedId === "boomgate")
              normalizedId = "boom-gate";
            else if (
              normalizedId === "relay14" ||
              normalizedId === "switch-hold-relay"
            )
              normalizedId = "relay-14";
            else if (normalizedId === "ldr-relay") normalizedId = "relay-ldr";
            else if (normalizedId === "sound-relay")
              normalizedId = "relay-sound";

            const db = getDb();
            if (normalizedId === "all_lights" || normalizedId === "all") {
              const lights = db
                .prepare(
                  "SELECT id, state, controller_id FROM devices WHERE type = 'light'",
                )
                .all();
              lights.forEach((l) => {
                const currState = JSON.parse(l.state || "{}");
                const keys = Object.keys(data.state || {});
                const isDiff =
                  keys.length === 0 ||
                  keys.some((k) => currState[k] !== data.state[k]);
                if (isDiff) {
                  const merged = { ...currState, ...data.state };
                  db.prepare(
                    "UPDATE devices SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                  ).run(JSON.stringify(merged), l.id);
                  broadcastToAll(
                    {
                      type: "device-update",
                      deviceId: l.id,
                      state: merged,
                      controllerId: l.controller_id || controllerId,
                      triggeredBy: "device",
                      timestamp: Date.now(),
                    },
                    true,
                  );
                }
              });
            } else {
              // Find matching device:
              let targetDevId =
                controllerId && controllerId !== "esp32-1"
                  ? `${controllerId}_${normalizedId}`
                  : normalizedId;
              let existing = db
                .prepare(
                  "SELECT id, name, type, pin, state, controller_id FROM devices WHERE id = ?",
                )
                .get(targetDevId);
              if (!existing) {
                existing = db
                  .prepare(
                    "SELECT id, name, type, pin, state, controller_id FROM devices WHERE id = ?",
                  )
                  .get(normalizedId);
                if (existing) targetDevId = existing.id;
              }
              if (!existing && controllerId) {
                existing = db
                  .prepare(
                    "SELECT id, name, type, pin, state, controller_id FROM devices WHERE (id = ? OR id = ?) AND controller_id = ?",
                  )
                  .get(
                    normalizedId,
                    `${controllerId}_${normalizedId}`,
                    controllerId,
                  );
                if (existing) targetDevId = existing.id;
              }

              if (existing) {
                const currState = JSON.parse(existing.state || "{}");
                const keys = Object.keys(data.state || {});
                const isDiff =
                  keys.length === 0 ||
                  keys.some((k) => currState[k] !== data.state[k]);
                const merged = { ...currState, ...data.state };

                if (isDiff) {
                  db.prepare(
                    "UPDATE devices SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                  ).run(JSON.stringify(merged), targetDevId);

                  try {
                    const stateDesc = Object.entries(merged)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(", ");
                    db.prepare(
                      "INSERT INTO logs (user_id, username, action, device_id, device_name, details) VALUES (?, ?, ?, ?, ?, ?)",
                    ).run(
                      null,
                      `ESP32 (${controllerId})`,
                      "device-update",
                      targetDevId,
                      existing.name,
                      `Hardware state changed (${stateDesc})`,
                    );
                  } catch (logErr) {}

                  broadcastToAll(
                    {
                      type: "device-update",
                      deviceId: targetDevId,
                      state: merged,
                      controllerId: existing.controller_id || controllerId,
                      triggeredBy: "device",
                      timestamp: Date.now(),
                    },
                    true,
                  );
                }
              } else {
                // Auto-provision newly discovered device on the fly!
                const defaultName = `${normalizedId} (${controllerId})`;
                const defaultType = normalizedId.includes("gate")
                  ? "boom-gate"
                  : "light";
                const defaultPin = "";
                const defaultState = JSON.stringify(data.state || {});
                db.prepare(
                  "INSERT INTO devices (id, name, type, pin, state, controller_id) VALUES (?, ?, ?, ?, ?, ?)",
                ).run(
                  targetDevId,
                  defaultName,
                  defaultType,
                  defaultPin,
                  defaultState,
                  controllerId,
                );

                broadcastToAll(
                  {
                    type: "devices-changed",
                    action: "create",
                    device: {
                      id: targetDevId,
                      name: defaultName,
                      type: defaultType,
                      pin: defaultPin,
                      state: data.state || {},
                      controller_id: controllerId,
                      controller_name: controllerObj
                        ? controllerObj.name
                        : controllerId,
                      automation: null,
                    },
                  },
                  true,
                );
              }
            }
          } else if (
            data.type === "slot-update" ||
            data.type === "parking-slot-report"
          ) {
            const db = getDb();
            const rawSlotId = data.slotId || data.id;
            let targetSlotId =
              controllerId && controllerId !== "esp32-1"
                ? `${controllerId}_${rawSlotId}`
                : rawSlotId;
            let existingSlot = db
              .prepare(
                "SELECT id, name, sensor_pin, sensor_type, occupied, controller_id FROM parking_slots WHERE id = ?",
              )
              .get(targetSlotId);
            if (!existingSlot) {
              existingSlot = db
                .prepare(
                  "SELECT id, name, sensor_pin, sensor_type, occupied, controller_id FROM parking_slots WHERE id = ?",
                )
                .get(rawSlotId);
              if (existingSlot) targetSlotId = existingSlot.id;
            }
            if (!existingSlot && controllerId) {
              existingSlot = db
                .prepare(
                  "SELECT id, name, sensor_pin, sensor_type, occupied, controller_id FROM parking_slots WHERE (id = ? OR id = ?) AND controller_id = ?",
                )
                .get(rawSlotId, `${controllerId}_${rawSlotId}`, controllerId);
              if (existingSlot) targetSlotId = existingSlot.id;
            }

            const occupiedVal = data.occupied ? 1 : 0;

            if (existingSlot) {
              // Update only if occupied state changed
              if (existingSlot.occupied !== occupiedVal) {
                db.prepare(
                  "UPDATE parking_slots SET occupied = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                ).run(occupiedVal, targetSlotId);

                try {
                  const bayStatus = occupiedVal === 1 ? 'Occupied 🚗' : 'Available 🟢';
                  db.prepare(
                    "INSERT INTO logs (user_id, username, action, device_id, device_name, details) VALUES (?, ?, ?, ?, ?, ?)",
                  ).run(
                    null,
                    `Sensor (${existingSlot.sensor_type || 'switch'})`,
                    "slot-update",
                    targetSlotId,
                    existingSlot.name,
                    `Bay status changed to ${bayStatus}`,
                  );
                } catch (logErr) {}

                const allSlots = db
                  .prepare("SELECT * FROM parking_slots ORDER BY id ASC")
                  .all();
                const total = allSlots.length;
                const occupiedCount = allSlots.filter(
                  (s) => s.occupied === 1,
                ).length;
                const available = Math.max(0, total - occupiedCount);
                const stats = {
                  total,
                  occupied: occupiedCount,
                  available,
                  isFull: total > 0 && available === 0,
                };

                broadcastToAll(
                  {
                    type: "slot-update",
                    slotId: targetSlotId,
                    occupied: Boolean(data.occupied),
                    stats,
                    controllerId: existingSlot.controller_id || controllerId,
                    triggeredBy: "esp32",
                    timestamp: Date.now(),
                  },
                  true,
                );
              }
            } else {
              // Auto-provision newly discovered parking slot on the fly!
              const slotName = `${rawSlotId.replace("-", " ").toUpperCase()} (${controllerId})`;
              db.prepare(
                "INSERT INTO parking_slots (id, name, sensor_pin, sensor_type, occupied, controller_id) VALUES (?, ?, ?, ?, ?, ?)",
              ).run(
                targetSlotId,
                slotName,
                "",
                "switch",
                occupiedVal,
                controllerId,
              );

              const allSlots = db
                .prepare("SELECT * FROM parking_slots ORDER BY id ASC")
                .all();
              const total = allSlots.length;
              const occupiedCount = allSlots.filter(
                (s) => s.occupied === 1,
              ).length;
              const available = Math.max(0, total - occupiedCount);
              const stats = {
                total,
                occupied: occupiedCount,
                available,
                isFull: total > 0 && available === 0,
              };

              broadcastToAll(
                {
                  type: "slots-changed",
                  action: "create",
                  slot: {
                    id: targetSlotId,
                    name: slotName,
                    sensor_pin: "",
                    sensor_type: "switch",
                    occupied: Boolean(data.occupied),
                    controller_id: controllerId,
                    controller_name: controllerObj
                      ? controllerObj.name
                      : controllerId,
                  },
                  stats,
                  timestamp: Date.now(),
                },
                true,
              );
            }
          }
        } catch (e) {
          console.error("Device message parse error", e);
        }
      });

      ws.on("close", () => {
        console.log(`[WS] ESP32 Controller "${controllerId}" disconnected.`);
        controllerClients.delete(controllerId);
        broadcastDeviceStatus();
      });

      ws.on("error", (err) => {
        console.error(
          `[WS] ESP32 Controller "${controllerId}" error:`,
          err.message,
        );
        try {
          ws.close();
        } catch (e) {}
      });
    } else {
      // ---- Web Client ----
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get("token");
      if (!token) {
        ws.close(1008, "Token required");
        return;
      }

      try {
        const user = jwt.verify(
          token,
          process.env.JWT_SECRET || "fallback_secret",
        );
        ws.user = user;
        webClients.add(ws);

        // Send initial state to web client
        const db = getDb();
        const { getAutomation } = require("./automation");
        const devices = db
          .prepare(
            `
                    SELECT d.*, c.name as controller_name 
                    FROM devices d
                    LEFT JOIN controllers c ON d.controller_id = c.id
                    ORDER BY d.id
                `,
          )
          .all();
        const parsed = devices.map((d) => ({
          ...d,
          state: JSON.parse(d.state || "{}"),
          automation: getAutomation(d.id),
        }));

        const slots = db
          .prepare(
            `
                    SELECT p.*, c.name as controller_name 
                    FROM parking_slots p
                    LEFT JOIN controllers c ON p.controller_id = c.id
                    ORDER BY p.id ASC
                `,
          )
          .all();
        const parsedSlots = slots.map((s) => ({
          ...s,
          occupied: s.occupied === 1,
        }));
        const totalSlots = parsedSlots.length;
        const occupiedCount = parsedSlots.filter((s) => s.occupied).length;
        const availableSlots = Math.max(0, totalSlots - occupiedCount);
        const parkingStats = {
          total: totalSlots,
          occupied: occupiedCount,
          available: availableSlots,
          isFull: totalSlots > 0 && availableSlots === 0,
        };
        const emergencyRow = db
          .prepare(
            "SELECT value FROM system_settings WHERE key = 'emergency_mode'",
          )
          .get();
        const emergencyMode = emergencyRow ? emergencyRow.value : "normal";

        ws.send(
          JSON.stringify({
            type: "init-state",
            devices: parsed,
            deviceStatus: getDeviceStatus(),
            controllers: getControllersStatusList(),
            parking: { slots: parsedSlots, stats: parkingStats },
            emergency: { mode: emergencyMode },
          }),
        );

        ws.on("message", (message) => {
          try {
            const data = JSON.parse(message);
            if (data.type === "device-update") {
              const db = getDb();
              db.prepare(
                "UPDATE devices SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
              ).run(JSON.stringify(data.state), data.deviceId);

              broadcastDeviceUpdate(
                data.deviceId,
                data.state,
                ws.user.username,
              );
            }
          } catch (e) {
            console.error("Web client message error", e);
          }
        });

        ws.on("close", () => {
          webClients.delete(ws);
        });
      } catch (err) {
        ws.close(1008, "Invalid token");
      }
    }
  });

  // Check each controller heartbeat independently
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    controllerClients.forEach((controller, id) => {
      if (now - controller.lastSeen > HEARTBEAT_TIMEOUT) {
        console.warn(
          `[WS] Controller "${id}" heartbeat timed out (${now - controller.lastSeen}ms). Disconnecting...`,
        );
        try {
          controller.ws.terminate();
        } catch (e) {}
        controllerClients.delete(id);
        changed = true;
        turnOffDevicesForController(id);
      }
    });
    if (changed) {
      broadcastDeviceStatus();
    }
  }, 5000);
}

module.exports = {
  setupWebSocket,
  broadcastDeviceUpdate,
  broadcastToAll,
  broadcastDeviceStatus,
  getDeviceStatus,
  setDeviceStatus,
  getControllersStatusList,
  isControllerOnlineForDevice,
  getEsp32Status: getDeviceStatus,
  setEsp32Status: setDeviceStatus,
};
