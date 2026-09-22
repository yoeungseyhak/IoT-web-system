/**
 * ==============================================================================
 * FLOOR MANAGEMENT - ESP32 EMBEDDED FIRMWARE
 * ==============================================================================
 * Project: Floor Management IoT System
 * Target Hardware: ESP32 DevKit V1 (30 or 38 pin)
 * Protocol: WebSocket Client (/ws/device)
 *
 * Required Libraries (Install via Arduino Library Manager):
 * 1. WebSockets by Markus Sattler (Links2004) v2.4.0+
 * 2. ArduinoJson by Benoit Blanchon v6.21.0+ or v7.x
 * ==============================================================================
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ==============================================================================
// 1. NETWORK CONFIGURATION
// ==============================================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Server Settings (Change to your EC2 domain or local server IP)
// For local testing: e.g. "192.168.1.100" and port 5050
// For production EC2: "floormanagement.site" and port 80 or 5050
const char* WS_HOST       = "floormanagement.site";
const uint16_t WS_PORT    = 80;
const char* WS_PATH       = "/ws/device";

WebSocketsClient webSocket;

// ==============================================================================
// 2. PIN DEFINITIONS
// ==============================================================================
// --- Building Block: 3x LEDs ---
#define PIN_LED1            2
#define PIN_LED2            4
#define PIN_LED3            5

// --- Building Block: 3x Push Buttons for LEDs (Active LOW with INPUT_PULLUP) ---
#define PIN_BTN1            13
#define PIN_BTN2            14
#define PIN_BTN3            27

// --- Building Block: L9110S Motor Driver for Rolling Door ---
#define PIN_MOTOR_INA       18  // Forward / Open
#define PIN_MOTOR_INB       19  // Reverse / Close

// --- Building Block: 2x Push Buttons for Rolling Door (Active LOW) ---
#define PIN_BTN_DOOR_OPEN   32
#define PIN_BTN_DOOR_CLOSE  33

// --- Street Block ---
#define PIN_LDR_STREET      34  // Analog Input (ADC1)
#define PIN_RELAY_STREET    21  // Street Light / Gate Relay (Active HIGH or LOW)

// --- Parking Block ---
#define PIN_LDR_PARKING     35  // Analog Input (ADC1)
#define PIN_RELAY_PARKING   22  // Parking Light Relay

// --- Optional Party Light Pin ---
#define PIN_PARTY_LIGHT     23

// Relay Active State (Set to LOW if using active-low relay board, HIGH if active-high)
#define RELAY_ON            HIGH
#define RELAY_OFF           LOW

// ==============================================================================
// 3. STATE VARIABLES
// ==============================================================================
// Light States
bool state_led1 = false;
bool state_led2 = false;
bool state_led3 = false;
bool state_relay_street = false;
bool state_relay_parking = false;
bool state_party_light = false;

// Rolling Door State Machine
// Possible states: "closed", "opening", "opened", "closing"
String door_status = "closed";
unsigned long door_motion_start_time = 0;
const unsigned long DOOR_MOVE_DURATION_MS = 2000; // 2 Seconds wait time

// Heartbeat & Timers
unsigned long last_heartbeat_time = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 5000;

unsigned long last_ldr_read_time = 0;
const unsigned long LDR_INTERVAL_MS = 3000;

// Button Debounce Timers (50ms debounce)
const unsigned long DEBOUNCE_DELAY_MS = 50;

struct Button {
  uint8_t pin;
  bool lastState;
  bool currentState;
  unsigned long lastDebounceTime;
};

Button btn1 = { PIN_BTN1, HIGH, HIGH, 0 };
Button btn2 = { PIN_BTN2, HIGH, HIGH, 0 };
Button btn3 = { PIN_BTN3, HIGH, HIGH, 0 };
Button btn_door_open = { PIN_BTN_DOOR_OPEN, HIGH, HIGH, 0 };
Button btn_door_close = { PIN_BTN_DOOR_CLOSE, HIGH, HIGH, 0 };

// ==============================================================================
// 4. FUNCTION DECLARATIONS
// ==============================================================================
void connectWiFi();
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
void handleServerMessage(uint8_t * payload, size_t length);
void sendStateReport(const char* deviceId, const char* stateJson);
void sendHeartbeat();
void startDoorOpening();
void startDoorClosing();
void stopDoorMotor();
void updateDoorStateMachine();
void checkPhysicalButtons();
void updateButton(Button &btn, void (*onPress)());

// ==============================================================================
// 5. MOTOR CONTROL LOGIC (2-SECOND INTERLOCK)
// ==============================================================================
void startDoorOpening() {
  if (door_status == "opening" || door_status == "closing") {
    Serial.println("[DOOR] Motion rejected: Door is currently moving!");
    return;
  }
  if (door_status == "opened") {
    Serial.println("[DOOR] Door is already opened.");
    return;
  }

  Serial.println("[DOOR] Starting to OPEN (Running motor forward for 2s)...");
  door_status = "opening";
  door_motion_start_time = millis();

  // Run motor forward
  digitalWrite(PIN_MOTOR_INA, HIGH);
  digitalWrite(PIN_MOTOR_INB, LOW);

  // Notify server
  sendStateReport("rolling-door", "{\"status\":\"opening\"}");
}

void startDoorClosing() {
  if (door_status == "opening" || door_status == "closing") {
    Serial.println("[DOOR] Motion rejected: Door is currently moving!");
    return;
  }
  if (door_status == "closed") {
    Serial.println("[DOOR] Door is already closed.");
    return;
  }

  Serial.println("[DOOR] Starting to CLOSE (Running motor reverse for 2s)...");
  door_status = "closing";
  door_motion_start_time = millis();

  // Run motor reverse
  digitalWrite(PIN_MOTOR_INA, LOW);
  digitalWrite(PIN_MOTOR_INB, HIGH);

  // Notify server
  sendStateReport("rolling-door", "{\"status\":\"closing\"}");
}

void stopDoorMotor() {
  digitalWrite(PIN_MOTOR_INA, LOW);
  digitalWrite(PIN_MOTOR_INB, LOW);
}

void updateDoorStateMachine() {
  if (door_status == "opening") {
    if (millis() - door_motion_start_time >= DOOR_MOVE_DURATION_MS) {
      stopDoorMotor();
      door_status = "opened";
      Serial.println("[DOOR] Motor stopped. Door is now fully OPENED.");
      sendStateReport("rolling-door", "{\"status\":\"opened\"}");
    }
  } else if (door_status == "closing") {
    if (millis() - door_motion_start_time >= DOOR_MOVE_DURATION_MS) {
      stopDoorMotor();
      door_status = "closed";
      Serial.println("[DOOR] Motor stopped. Door is now fully CLOSED.");
      sendStateReport("rolling-door", "{\"status\":\"closed\"}");
    }
  }
}

// ==============================================================================
// 6. WEBSOCKET MESSAGING
// ==============================================================================
void sendStateReport(const char* deviceId, const char* stateJson) {
  if (!webSocket.isConnected()) return;

  StaticJsonDocument<256> doc;
  doc["type"] = "state-report";
  doc["deviceId"] = deviceId;

  StaticJsonDocument<128> stateDoc;
  deserializeJson(stateDoc, stateJson);
  doc["state"] = stateDoc;

  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(output);
  Serial.printf("[WS SEND] %s\n", output.c_str());
}

void sendHeartbeat() {
  if (!webSocket.isConnected()) return;
  webSocket.sendTXT("{\"type\":\"heartbeat\"}");
  Serial.println("[WS HEARTBEAT] Sent");
}

void handleServerMessage(uint8_t * payload, size_t length) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error) {
    Serial.printf("[JSON] Deserialization error: %s\n", error.c_str());
    return;
  }

  const char* type = doc["type"];
  if (!type) return;

  if (strcmp(type, "device-update") == 0) {
    const char* deviceId = doc["deviceId"];
    if (!deviceId) return;
    JsonObject state = doc["state"];

    Serial.printf("[COMMAND] Device: %s\n", deviceId);

    // --- Light 1 ---
    if (strcmp(deviceId, "light-1") == 0 && state.containsKey("on")) {
      state_led1 = state["on"];
      digitalWrite(PIN_LED1, state_led1 ? HIGH : LOW);
      Serial.printf("  Light 1 -> %s\n", state_led1 ? "ON" : "OFF");
    }
    // --- Light 2 ---
    else if (strcmp(deviceId, "light-2") == 0 && state.containsKey("on")) {
      state_led2 = state["on"];
      digitalWrite(PIN_LED2, state_led2 ? HIGH : LOW);
      Serial.printf("  Light 2 -> %s\n", state_led2 ? "ON" : "OFF");
    }
    // --- Light 3 ---
    else if (strcmp(deviceId, "light-3") == 0 && state.containsKey("on")) {
      state_led3 = state["on"];
      digitalWrite(PIN_LED3, state_led3 ? HIGH : LOW);
      Serial.printf("  Light 3 -> %s\n", state_led3 ? "ON" : "OFF");
    }
    // --- Rolling Door ---
    else if (strcmp(deviceId, "rolling-door") == 0 && state.containsKey("status")) {
      const char* targetStatus = state["status"];
      if (strcmp(targetStatus, "opening") == 0) {
        startDoorOpening();
      } else if (strcmp(targetStatus, "closing") == 0) {
        startDoorClosing();
      }
    }
    // --- Boom Gate / Street Relay ---
    else if (strcmp(deviceId, "boom-gate") == 0 && state.containsKey("status")) {
      const char* gateStatus = state["status"];
      state_relay_street = (strcmp(gateStatus, "open") == 0);
      digitalWrite(PIN_RELAY_STREET, state_relay_street ? RELAY_ON : RELAY_OFF);
      Serial.printf("  Boom Gate -> %s\n", gateStatus);
    }
    // --- Party Light ---
    else if (strcmp(deviceId, "party-light") == 0 && state.containsKey("on")) {
      state_party_light = state["on"];
      digitalWrite(PIN_PARTY_LIGHT, state_party_light ? HIGH : LOW);
      Serial.printf("  Party Light -> %s\n", state_party_light ? "ON" : "OFF");
    }
  }
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected from server!");
      break;

    case WStype_CONNECTED:
      Serial.printf("[WS] Connected to ws://%s:%u%s\n", WS_HOST, WS_PORT, WS_PATH);
      sendHeartbeat();
      break;

    case WStype_TEXT:
      Serial.printf("[WS RECV] %s\n", payload);
      handleServerMessage(payload, length);
      break;

    case WStype_BIN:
    case WStype_ERROR:
    case WStype_FRAGMENT_TEXT_START:
    case WStype_FRAGMENT_BIN_START:
    case WStype_FRAGMENT:
    case WStype_FRAGMENT_FIN:
    case WStype_PING:
    case WStype_PONG:
      break;
  }
}

// ==============================================================================
// 7. PHYSICAL BUTTONS (DEBOUNCED)
// ==============================================================================
void onBtn1Press() {
  state_led1 = !state_led1;
  digitalWrite(PIN_LED1, state_led1 ? HIGH : LOW);
  Serial.printf("[PHYSICAL BTN 1] Light 1 -> %s\n", state_led1 ? "ON" : "OFF");
  sendStateReport("light-1", state_led1 ? "{\"on\":true}" : "{\"on\":false}");
}

void onBtn2Press() {
  state_led2 = !state_led2;
  digitalWrite(PIN_LED2, state_led2 ? HIGH : LOW);
  Serial.printf("[PHYSICAL BTN 2] Light 2 -> %s\n", state_led2 ? "ON" : "OFF");
  sendStateReport("light-2", state_led2 ? "{\"on\":true}" : "{\"on\":false}");
}

void onBtn3Press() {
  state_led3 = !state_led3;
  digitalWrite(PIN_LED3, state_led3 ? HIGH : LOW);
  Serial.printf("[PHYSICAL BTN 3] Light 3 -> %s\n", state_led3 ? "ON" : "OFF");
  sendStateReport("light-3", state_led3 ? "{\"on\":true}" : "{\"on\":false}");
}

void onBtnDoorOpenPress() {
  Serial.println("[PHYSICAL BTN] Door Open Pressed");
  startDoorOpening();
}

void onBtnDoorClosePress() {
  Serial.println("[PHYSICAL BTN] Door Close Pressed");
  startDoorClosing();
}

void updateButton(Button &btn, void (*onPress)()) {
  int reading = digitalRead(btn.pin);
  if (reading != btn.lastState) {
    btn.lastDebounceTime = millis();
  }
  if ((millis() - btn.lastDebounceTime) > DEBOUNCE_DELAY_MS) {
    if (reading != btn.currentState) {
      btn.currentState = reading;
      if (btn.currentState == LOW) { // Pressed (pulled to GND)
        onPress();
      }
    }
  }
  btn.lastState = reading;
}

void checkPhysicalButtons() {
  updateButton(btn1, onBtn1Press);
  updateButton(btn2, onBtn2Press);
  updateButton(btn3, onBtn3Press);
  updateButton(btn_door_open, onBtnDoorOpenPress);
  updateButton(btn_door_close, onBtnDoorClosePress);
}

// ==============================================================================
// 8. LDR AUTOMATION (STREET & PARKING)
// ==============================================================================
void checkLDRSensors() {
  if (millis() - last_ldr_read_time >= LDR_INTERVAL_MS) {
    last_ldr_read_time = millis();

    int streetLdrVal = analogRead(PIN_LDR_STREET);
    int parkingLdrVal = analogRead(PIN_LDR_PARKING);

    // Darkness threshold (Analog read is 0-4095 on ESP32)
    // Adjust threshold based on your physical LDR resistor divider
    const int DARK_THRESHOLD = 1500;

    if (streetLdrVal < DARK_THRESHOLD && !state_relay_street) {
      Serial.printf("[LDR AUTO] Street is dark (%d), turning ON relay...\n", streetLdrVal);
      state_relay_street = true;
      digitalWrite(PIN_RELAY_STREET, RELAY_ON);
      sendStateReport("boom-gate", "{\"status\":\"open\"}");
    }

    if (parkingLdrVal < DARK_THRESHOLD && !state_relay_parking) {
      Serial.printf("[LDR AUTO] Parking is dark (%d), turning ON relay...\n", parkingLdrVal);
      state_relay_parking = true;
      digitalWrite(PIN_RELAY_PARKING, RELAY_ON);
    }
  }
}

// ==============================================================================
// 9. SETUP & MAIN LOOP
// ==============================================================================
void connectWiFi() {
  Serial.print("[WIFI] Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n[WIFI] Connected!");
  Serial.print("[WIFI] ESP32 IP Address: ");
  Serial.println(WiFi.localIP());
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=============================================");
  Serial.println("  FLOOR MANAGEMENT - ESP32 EMBEDDED SYSTEM   ");
  Serial.println("=============================================");

  // Output Pins Configuration
  pinMode(PIN_LED1, OUTPUT);
  pinMode(PIN_LED2, OUTPUT);
  pinMode(PIN_LED3, OUTPUT);
  pinMode(PIN_MOTOR_INA, OUTPUT);
  pinMode(PIN_MOTOR_INB, OUTPUT);
  pinMode(PIN_RELAY_STREET, OUTPUT);
  pinMode(PIN_RELAY_PARKING, OUTPUT);
  pinMode(PIN_PARTY_LIGHT, OUTPUT);

  // Initialize all outputs to OFF
  digitalWrite(PIN_LED1, LOW);
  digitalWrite(PIN_LED2, LOW);
  digitalWrite(PIN_LED3, LOW);
  stopDoorMotor();
  digitalWrite(PIN_RELAY_STREET, RELAY_OFF);
  digitalWrite(PIN_RELAY_PARKING, RELAY_OFF);
  digitalWrite(PIN_PARTY_LIGHT, LOW);

  // Input Pins with Internal Pull-Ups
  pinMode(PIN_BTN1, INPUT_PULLUP);
  pinMode(PIN_BTN2, INPUT_PULLUP);
  pinMode(PIN_BTN3, INPUT_PULLUP);
  pinMode(PIN_BTN_DOOR_OPEN, INPUT_PULLUP);
  pinMode(PIN_BTN_DOOR_CLOSE, INPUT_PULLUP);

  // LDR Analog Inputs
  pinMode(PIN_LDR_STREET, INPUT);
  pinMode(PIN_LDR_PARKING, INPUT);

  // Connect to Wi-Fi
  connectWiFi();

  // Initialize WebSocket Client
  webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000);
}

void loop() {
  // 1. Maintain WebSocket Connection
  webSocket.loop();

  // 2. Process Door Motor Movement (2-second duration auto-stop)
  updateDoorStateMachine();

  // 3. Scan Physical Buttons (debounced edge triggers)
  checkPhysicalButtons();

  // 4. Check LDR Light Sensors
  checkLDRSensors();

  // 5. Send Periodic Heartbeat to Server
  if (millis() - last_heartbeat_time >= HEARTBEAT_INTERVAL_MS) {
    last_heartbeat_time = millis();
    sendHeartbeat();
  }

  // 6. Wi-Fi Reconnect Watchdog
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Connection lost. Reconnecting...");
    WiFi.reconnect();
    delay(1000);
  }
}
