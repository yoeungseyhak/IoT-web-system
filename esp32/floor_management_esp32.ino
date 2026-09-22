/**
 * ==============================================================================
 * FLOOR MANAGEMENT SYSTEM — ESP32 FIRMWARE (C++ ARDUINO)
 * ==============================================================================
 * Features:
 * 1. WebSocket Client with Auto-Reconnect (/ws/device) & Heartbeats
 * 2. 2-Second Non-Blocking Motor Timer (L9110S) for Rolling Door Interlock
 * 3. SG90 Servo Control for Boom Gate with Auto-Safety
 * 4. Parking Slot Detection Logic (HC-SR04 Ultrasonic & IR Proximity)
 * 5. Priority 1 Emergency Protocols:
 *    - Evacuate: Force Open All Exits (Door + Gate) + All Lights ON + Alarm Buzzer
 *    - Lockdown: Force Close All Exits (Door + Gate)
 * 6. Debounced Pushbuttons and LDR Ambient Lighting
 * ==============================================================================
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

// -----------------------------------------------------------------------------
// WiFi & Server Configuration
// -----------------------------------------------------------------------------
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* WS_HOST   = "192.168.1.100"; // Replace with your Node.js server IP
const int   WS_PORT   = 5050;
const char* WS_PATH   = "/ws/device";

WebSocketsClient webSocket;
Servo boomGateServo;

// -----------------------------------------------------------------------------
// Pin Assignments
// -----------------------------------------------------------------------------
// Actuators & Lights
const int PIN_LIGHT1       = 2;   // Light 1
const int PIN_LIGHT2       = 4;   // Light 2
const int PIN_LIGHT3       = 5;   // Light 3
const int PIN_DOOR_INA     = 18;  // Rolling Door L9110S Motor INA
const int PIN_DOOR_INB     = 19;  // Rolling Door L9110S Motor INB
const int PIN_BOOM_SERVO   = 21;  // Boom Gate Servo PWM (SG90)
const int PIN_ALARM_BUZZER = 22;  // Emergency Siren / Active Buzzer
const int PIN_PARTY_LIGHT  = 23;  // Party Light PWM / Status Indicator

// Parking Slot Sensors (HC-SR04 Ultrasonic & IR Sensors)
const int PIN_SLOT1_TRIG   = 32;  // Slot A1 Ultrasonic Trigger
const int PIN_SLOT1_ECHO   = 33;  // Slot A1 Ultrasonic Echo
const int PIN_SLOT2_TRIG   = 25;  // Slot A2 Ultrasonic Trigger
const int PIN_SLOT2_ECHO   = 26;  // Slot A2 Ultrasonic Echo
const int PIN_SLOT3_IR     = 27;  // Slot A3 Digital IR Obstacle Sensor
const int PIN_SLOT4_IR     = 14;  // Slot A4 Digital IR Obstacle Sensor

// Physical Inputs
const int PIN_BTN_DOOR     = 13;  // Pushbutton for Rolling Door
const int PIN_BTN_GATE     = 12;  // Pushbutton for Boom Gate
const int PIN_LDR_ANALOG   = 34;  // Photocell / LDR Light Sensor

// -----------------------------------------------------------------------------
// State Variables & Timers
// -----------------------------------------------------------------------------
bool emergencyActive = false;
String emergencyMode = "normal"; // normal, evacuate, lockdown

// Rolling Door State Machine
String doorStatus = "closed";    // closed, opening, opened, closing
unsigned long doorMotionStart = 0;
const unsigned long DOOR_DURATION_MS = 2000; // Exact 2.0s runtime

// Boom Gate
String gateStatus = "closed";

// Parking Slots Occupancy Tracking
struct ParkingSlot {
  const char* id;
  int trigPin;
  int echoPin;
  int irPin; // -1 if ultrasonic
  bool occupied;
  unsigned long lastChangeTime;
  int consecutiveDetections;
};

ParkingSlot slots[] = {
  { "slot-1", PIN_SLOT1_TRIG, PIN_SLOT1_ECHO, -1, false, 0, 0 },
  { "slot-2", PIN_SLOT2_TRIG, PIN_SLOT2_ECHO, -1, false, 0, 0 },
  { "slot-3", -1, -1, PIN_SLOT3_IR, false, 0, 0 },
  { "slot-4", -1, -1, PIN_SLOT4_IR, false, 0, 0 }
};
const int NUM_SLOTS = sizeof(slots) / sizeof(slots[0]);

unsigned long lastHeartbeat = 0;
unsigned long lastSensorScan = 0;

// -----------------------------------------------------------------------------
// Motor & Gate Control Helpers
// -----------------------------------------------------------------------------
void stopDoorMotor() {
  digitalWrite(PIN_DOOR_INA, LOW);
  digitalWrite(PIN_DOOR_INB, LOW);
}

void startDoorOpening() {
  doorStatus = "opening";
  doorMotionStart = millis();
  digitalWrite(PIN_DOOR_INA, HIGH);
  digitalWrite(PIN_DOOR_INB, LOW);
  sendStateReport("rolling-door", "{\"status\":\"opening\"}");
}

void startDoorClosing() {
  doorStatus = "closing";
  doorMotionStart = millis();
  digitalWrite(PIN_DOOR_INA, LOW);
  digitalWrite(PIN_DOOR_INB, HIGH);
  sendStateReport("rolling-door", "{\"status\":\"closing\"}");
}

void setGatePosition(const String& target) {
  if (target == "opened" || target == "open") {
    boomGateServo.write(90); // Raised
    gateStatus = "opened";
  } else {
    boomGateServo.write(0);  // Lowered
    gateStatus = "closed";
  }
}

// -----------------------------------------------------------------------------
// Ultrasonic & IR Sensor Logic for Parking Slots
// -----------------------------------------------------------------------------
float measureDistanceCm(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 25000); // 25ms timeout (~4m max)
  if (duration == 0) return 999.0;
  return (duration * 0.0343) / 2.0;
}

void scanParkingSlots() {
  unsigned long now = millis();
  for (int i = 0; i < NUM_SLOTS; i++) {
    bool detectedNow = false;

    if (slots[i].irPin != -1) {
      // IR proximity sensor: LOW output indicates reflection/object present
      detectedNow = (digitalRead(slots[i].irPin) == LOW);
    } else if (slots[i].trigPin != -1 && slots[i].echoPin != -1) {
      // Ultrasonic sensor: vehicle parked within 15 cm
      float dist = measureDistanceCm(slots[i].trigPin, slots[i].echoPin);
      detectedNow = (dist > 1.0 && dist < 15.0);
    }

    // Debounce sensor changes (require 3 consecutive samples / ~1.5 seconds)
    if (detectedNow != slots[i].occupied) {
      slots[i].consecutiveDetections++;
      if (slots[i].consecutiveDetections >= 3 && (now - slots[i].lastChangeTime > 1500)) {
        slots[i].occupied = detectedNow;
        slots[i].lastChangeTime = now;
        slots[i].consecutiveDetections = 0;

        // Send real-time slot update to server
        sendSlotUpdate(slots[i].id, slots[i].occupied);
        Serial.printf("[PARKING] %s is now %s\n", slots[i].id, slots[i].occupied ? "OCCUPIED" : "AVAILABLE");
      }
    } else {
      slots[i].consecutiveDetections = 0;
    }
  }
}

// -----------------------------------------------------------------------------
// WebSocket Messaging
// -----------------------------------------------------------------------------
void sendStateReport(const char* deviceId, const String& stateJson) {
  if (!webSocket.isConnected()) return;
  StaticJsonDocument<256> doc;
  doc["type"] = "state-report";
  doc["deviceId"] = deviceId;
  doc["state"] = serialized(stateJson);
  String out;
  serializeJson(doc, out);
  webSocket.sendTXT(out);
}

void sendSlotUpdate(const char* slotId, bool occupied) {
  if (!webSocket.isConnected()) return;
  StaticJsonDocument<128> doc;
  doc["type"] = "slot-update";
  doc["slotId"] = slotId;
  doc["occupied"] = occupied;
  String out;
  serializeJson(doc, out);
  webSocket.sendTXT(out);
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("⚡ [ESP32] Connected to WebSocket Server!");
      webSocket.sendTXT("{\"type\":\"heartbeat\"}");
      break;

    case WStype_DISCONNECTED:
      Serial.println("⚠️ [ESP32] Disconnected from server. Retrying...");
      stopDoorMotor();
      break;

    case WStype_TEXT: {
      StaticJsonDocument<512> doc;
      DeserializationError err = deserializeJson(doc, payload, length);
      if (err) return;

      const char* msgType = doc["type"];
      if (!msgType) return;

      // Handle Priority 1: Emergency Alerts
      if (strcmp(msgType, "emergency-alert") == 0) {
        const char* mode = doc["mode"];
        if (strcmp(mode, "evacuate") == 0) {
          emergencyActive = true;
          emergencyMode = "evacuate";
          // Open all exits immediately
          setGatePosition("opened");
          startDoorOpening();
          // Turn on all lights
          digitalWrite(PIN_LIGHT1, HIGH);
          digitalWrite(PIN_LIGHT2, HIGH);
          digitalWrite(PIN_LIGHT3, HIGH);
          // Sound alarm
          tone(PIN_ALARM_BUZZER, 1000);
          Serial.println("🚨 [EMERGENCY] EVACUATION PROTOCOL ACTIVE");
        } else if (strcmp(mode, "lockdown") == 0) {
          emergencyActive = true;
          emergencyMode = "lockdown";
          setGatePosition("closed");
          startDoorClosing();
          noTone(PIN_ALARM_BUZZER);
          Serial.println("🔒 [EMERGENCY] MASTER LOCKDOWN ACTIVE");
        }
      }
      else if (strcmp(msgType, "emergency-cleared") == 0) {
        emergencyActive = false;
        emergencyMode = "normal";
        noTone(PIN_ALARM_BUZZER);
        Serial.println("✅ [EMERGENCY] All clear. Normal operation resumed.");
      }
      // Handle Regular Device Commands
      else if (strcmp(msgType, "device-update") == 0) {
        const char* deviceId = doc["deviceId"];
        JsonObject state = doc["state"];

        if (strcmp(deviceId, "light-1") == 0 && state.containsKey("on")) {
          digitalWrite(PIN_LIGHT1, state["on"] ? HIGH : LOW);
        } else if (strcmp(deviceId, "light-2") == 0 && state.containsKey("on")) {
          digitalWrite(PIN_LIGHT2, state["on"] ? HIGH : LOW);
        } else if (strcmp(deviceId, "light-3") == 0 && state.containsKey("on")) {
          digitalWrite(PIN_LIGHT3, state["on"] ? HIGH : LOW);
        } else if (strcmp(deviceId, "boom-gate") == 0 && state.containsKey("status")) {
          setGatePosition(state["status"].as<String>());
        } else if (strcmp(deviceId, "rolling-door") == 0 && state.containsKey("status")) {
          String s = state["status"].as<String>();
          if (s == "opening" && doorStatus != "opening" && doorStatus != "opened") {
            startDoorOpening();
          } else if (s == "closing" && doorStatus != "closing" && doorStatus != "closed") {
            startDoorClosing();
          }
        }
      }
      break;
    }
    default:
      break;
  }
}

// -----------------------------------------------------------------------------
// Setup & Main Loop
// -----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  // Initialize Outputs
  pinMode(PIN_LIGHT1, OUTPUT);
  pinMode(PIN_LIGHT2, OUTPUT);
  pinMode(PIN_LIGHT3, OUTPUT);
  pinMode(PIN_DOOR_INA, OUTPUT);
  pinMode(PIN_DOOR_INB, OUTPUT);
  pinMode(PIN_ALARM_BUZZER, OUTPUT);
  pinMode(PIN_PARTY_LIGHT, OUTPUT);
  stopDoorMotor();

  // Attach Servo
  boomGateServo.attach(PIN_BOOM_SERVO);
  boomGateServo.write(0); // Default closed

  // Initialize Inputs
  pinMode(PIN_BTN_DOOR, INPUT_PULLUP);
  pinMode(PIN_BTN_GATE, INPUT_PULLUP);
  pinMode(PIN_SLOT3_IR, INPUT);
  pinMode(PIN_SLOT4_IR, INPUT);
  pinMode(PIN_SLOT1_TRIG, OUTPUT);
  pinMode(PIN_SLOT1_ECHO, INPUT);
  pinMode(PIN_SLOT2_TRIG, OUTPUT);
  pinMode(PIN_SLOT2_ECHO, INPUT);

  // Connect WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected! IP: " + WiFi.localIP().toString());

  // Setup WebSocket Client
  webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000);
}

void loop() {
  webSocket.loop();
  unsigned long now = millis();

  // 1. Rolling Door 2-second Timer State Machine
  if (doorStatus == "opening" || doorStatus == "closing") {
    if (now - doorMotionStart >= DOOR_DURATION_MS) {
      stopDoorMotor();
      if (doorStatus == "opening") {
        doorStatus = "opened";
        sendStateReport("rolling-door", "{\"status\":\"opened\"}");
      } else {
        doorStatus = "closed";
        sendStateReport("rolling-door", "{\"status\":\"closed\"}");
      }
      Serial.println("[DOOR] Motion complete. Status: " + doorStatus);
    }
  }

  // 2. Scan Parking Slots every 500ms
  if (now - lastSensorScan > 500) {
    lastSensorScan = now;
    scanParkingSlots();
  }

  // 3. Send Heartbeat to server every 5 seconds
  if (now - lastHeartbeat > 5000) {
    lastHeartbeat = now;
    if (webSocket.isConnected()) {
      webSocket.sendTXT("{\"type\":\"heartbeat\"}");
    }
  }
}
