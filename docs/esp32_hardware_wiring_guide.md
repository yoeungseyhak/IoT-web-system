# Detailed ESP32 Hardware Wiring & Circuit Guide

---

## 1. Low-Voltage Signal Wiring (ESP32 to Relay Module)

```mermaid
flowchart TD
    subgraph PowerSupply["5V DC Power Supply (2A)"]
        PSU_5V["+5V Output (Red)"]
        PSU_GND["GND Output (Black)"]
    end

    subgraph ESP32["ESP32 DevKit V1 (30 / 38 Pin)"]
        VIN["VIN / 5V"]
        EGND["GND"]
        
        G2["GPIO 2"]
        G4["GPIO 4"]
        G5["GPIO 5"]
        G18["GPIO 18"]
        G19["GPIO 19"]
        G21["GPIO 21"]
        G22["GPIO 22"]
        G23["GPIO 23"]
    end

    subgraph RelayBoard["8-Channel Relay Module (Optocoupled)"]
        RVCC["VCC (+5V)"]
        RGND["GND"]
        
        IN1["IN1 (Light 1)"]
        IN2["IN2 (Light 2)"]
        IN3["IN3 (Light 3)"]
        IN4["IN4 (Door Open)"]
        IN5["IN5 (Door Close)"]
        IN6["IN6 (Gate Open)"]
        IN7["IN7 (Gate Close)"]
        IN8["IN8 (Party Light)"]
    end

    %% Power distribution
    PSU_5V ===> VIN
    PSU_5V ===> RVCC
    PSU_GND ===> EGND
    PSU_GND ===> RGND

    %% Logic signals
    G2 --->|"Signal Wire"| IN1
    G4 --->|"Signal Wire"| IN2
    G5 --->|"Signal Wire"| IN3
    G18 --->|"Signal Wire"| IN4
    G19 --->|"Signal Wire"| IN5
    G21 --->|"Signal Wire"| IN6
    G22 --->|"Signal Wire"| IN7
    G23 --->|"Signal Wire"| IN8
```

---

## 2. High-Voltage / Appliance Wiring (Relay Terminals to Loads)

```mermaid
flowchart LR
    subgraph MainsPower["AC Mains (110V / 220V)"]
        AC_L["Live / Phase (L) - Brown/Red"]
        AC_N["Neutral (N) - Blue/Black"]
    end

    subgraph MotorPower["Motor Power Supply (12V / 24V DC)"]
        DC_POS["+12V / +24V (Red)"]
        DC_NEG["GND / 0V (Black)"]
    end

    subgraph Relays["Relay Module Output Terminals"]
        subgraph R1["Relay 1: Light 1"]
            R1_COM["COM"]
            R1_NO["NO"]
        end
        subgraph R2["Relay 2: Light 2"]
            R2_COM["COM"]
            R2_NO["NO"]
        end
        subgraph R3["Relay 3: Light 3"]
            R3_COM["COM"]
            R3_NO["NO"]
        end
        subgraph R4["Relay 4: Door Open"]
            R4_COM["COM"]
            R4_NO["NO"]
        end
        subgraph R5["Relay 5: Door Close"]
            R5_COM["COM"]
            R5_NO["NO"]
        end
        subgraph R6["Relay 6: Gate Open"]
            R6_COM["COM"]
            R6_NO["NO"]
        end
        subgraph R7["Relay 7: Gate Close"]
            R7_COM["COM"]
            R7_NO["NO"]
        end
        subgraph R8["Relay 8: Party Light"]
            R8_COM["COM"]
            R8_NO["NO"]
        end
    end

    subgraph Appliances["Controlled Hardware"]
        L1["💡 Light 1 Bulb"]
        L2["💡 Light 2 Bulb"]
        L3["💡 Light 3 Bulb"]
        DoorMotor["🚪 Rolling Door Controller / Motor"]
        GateMotor["🚧 Boom Gate Controller / Motor"]
        PartyLight["🎉 Party Strobe Light"]
    end

    %% Lights AC Wiring
    AC_L ==> R1_COM
    AC_L ==> R2_COM
    AC_L ==> R3_COM
    AC_L ==> R8_COM

    R1_NO --> L1
    R2_NO --> L2
    R3_NO --> L3
    R8_NO --> PartyLight

    L1 ===> AC_N
    L2 ===> AC_N
    L3 ===> AC_N
    PartyLight ===> AC_N

    %% Motors DC / Switch Wiring
    DC_POS ==> R4_COM
    DC_POS ==> R5_COM
    DC_POS ==> R6_COM
    DC_POS ==> R7_COM

    R4_NO -->|"Open Command"| DoorMotor
    R5_NO -->|"Close Command"| DoorMotor
    R6_NO -->|"Raise Command"| GateMotor
    R7_NO -->|"Lower Command"| GateMotor

    DoorMotor ===> DC_NEG
    GateMotor ===> DC_NEG
```

---

## 3. Terminal Connection Pin-by-Pin Table

| Component | ESP32 Pin | Relay Input | Relay Output Terminals | Load Connection |
|---|:---:|:---:|:---:|---|
| **Light 1** | `GPIO 2` | `IN 1` | `COM 1` ➔ AC Live<br/>`NO 1` ➔ Light 1 (L) | Light 1 (N) ➔ AC Neutral |
| **Light 2** | `GPIO 4` | `IN 2` | `COM 2` ➔ AC Live<br/>`NO 2` ➔ Light 2 (L) | Light 2 (N) ➔ AC Neutral |
| **Light 3** | `GPIO 5` | `IN 3` | `COM 3` ➔ AC Live<br/>`NO 3` ➔ Light 3 (L) | Light 3 (N) ➔ AC Neutral |
| **Rolling Door (Open)** | `GPIO 18` | `IN 4` | `COM 4` ➔ Motor DC (+)<br/>`NO 4` ➔ Door Open wire | Door Controller Common ➔ DC (-) |
| **Rolling Door (Close)** | `GPIO 19` | `IN 5` | `COM 5` ➔ Motor DC (+)<br/>`NO 5` ➔ Door Close wire | Door Controller Common ➔ DC (-) |
| **Boom Gate (Open)** | `GPIO 21` | `IN 6` | `COM 6` ➔ Gate DC (+)<br/>`NO 6` ➔ Gate Open wire | Gate Controller Common ➔ DC (-) |
| **Boom Gate (Close)** | `GPIO 22` | `IN 7` | `COM 7` ➔ Gate DC (+)<br/>`NO 7` ➔ Gate Close wire | Gate Controller Common ➔ DC (-) |
| **Party Light** | `GPIO 23` | `IN 8` | `COM 8` ➔ AC Live<br/>`NO 8` ➔ Party Light (L) | Party Light (N) ➔ AC Neutral |

---

## 4. Key Wiring Rules & Safety

> [!IMPORTANT]
> **Use Normally Open (NO) Terminals**:  
> Always connect your appliances between **COM** (Common) and **NO** (Normally Open). This ensures that if the ESP32 loses power or reboots, all lights and motors stay safely **OFF**.

> [!TIP]
> **Common Ground**:  
> The ESP32 `GND` and the Relay Board `GND` **must be connected together** to create a shared reference point for the logic signals.
