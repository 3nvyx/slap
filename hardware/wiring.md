# Device wiring

ESP32-S3 DevKitC-1 (N16R8) + INMP441 I2S mic + 2.42" SSD1309 OLED (I2C) + MPU6050 IMU (the kit's 10-DOF module, I2C) + LED.
Every connection is one female-to-female jumper from a module pin to a board pin.
Same wiring on the desk and inside the housing.

| Module pin | ESP32-S3 pin | Notes |
|---|---|---|
| INMP441 VDD | 3V3 | 3.3 V only, never 5 V |
| INMP441 GND | GND | |
| INMP441 SCK | GPIO 5 | I2S bit clock |
| INMP441 WS | GPIO 4 | I2S word select |
| INMP441 SD | GPIO 6 | data into the ESP32 |
| INMP441 L/R | GND | selects the left slot |
| OLED VDD | 3V3 | module has its own boost converter |
| OLED GND | GND | |
| OLED SCL | GPIO 9 | I2C |
| OLED SDA | GPIO 8 | I2C, address 0x3C |
| MPU6050 (10-DOF module) VCC | 3V3 | 3.3 V |
| MPU6050 GND | GND | |
| MPU6050 SCL | GPIO 9 | shared I2C bus with the OLED |
| MPU6050 SDA | GPIO 8 | shared I2C bus; address 0x68, no conflict with the OLED at 0x3C |
| MPU6050 INT | GPIO 7 | interrupt, wake source from deep sleep |
| LED anode (long leg) | GPIO 10 via 220 Ω | recording light (was GPIO 2; every used pin is now on the 3V3 column) |
| LED cathode | GND | |
| Start/stop | BOOT button (GPIO 0) | onboard, nothing to wire |
| Power | USB-C | laptop (also serial log) or USB power bank |

Jumpers: 10 (mic 6 + OLED 4) + 5 (IMU) + 2 (LED and resistor sockets) = 17 F/F. The mic pack's ten no longer cover everything: the ELEGOO jumper set is now worth buying, or use the kit's F/M jumpers via the breadboard for the desk build. Three modules now share 3V3 and GND; the DevKitC-1 breaks out 3V3 more than once and has several GND pins (check the silkscreen), or use the breadboard rails.

Pins to avoid on the S3: 0 (except as BOOT), 19, 20, 26–37, 43–46.

## If a classic ESP32 (WROOM-32) is used instead

| Signal | Classic ESP32 |
|---|---|
| Mic SCK / WS / SD | 14 / 15 / 32 |
| OLED SCL / SDA | 22 / 21 |
| IMU SCL / SDA | 22 / 21 (shared with the OLED) |
| IMU INT | 33 (RTC-capable; provisional) |
| LED | 13 |
| BOOT | 0 |

Avoid 6–11 (flash), 1 and 3 (serial), 12 (strapping).

## Soldering (20 joints)

- INMP441 ×2: two 3-pin strips each, pins out of the component (metal can) side,
  so the bare side with the sound port faces the housing wall.
- OLED ×2: one 4-pin strip each in the top-edge holes (GND VDD SCL SDA), pins
  out of the back, away from the screen.
- IMU: the kit's 10-DOF module has its pins pre-soldered (confirm on arrival); if it does not, its header adds joints to this list.
- Nothing on the ESP32, LED, resistor or wires.

## Notes

- The OLED's "如需ACK应答，请短接D2" note means it may not ACK on I2C unless pad
  D2 is bridged. An I2C scanner can report nothing even when wiring is right;
  U8g2 (`U8G2_SSD1309_128X64_NONAME0_F_HW_I2C`) drives it regardless.
- MPU6050 (the kit's 10-DOF module): I2C address 0x68, no conflict with the OLED at 0x3C. 10-DOF boards usually carry more I2C parts than the MPU6050 (a compass and a barometer) at other addresses; confirm what is on the kit module and which pin is INT. The MPU6050 has no dedicated tap register as far as the register map shows (tap detection is a DMP feature, confirm in the datasheet), so configure its motion-detection interrupt on INT with a threshold high enough for a slap, and confirm the double hit in firmware from the accelerometer if needed. Fix the module rigidly to the case so slaps reach it.
- Slap to start (decided 6 October): the firmware detects a double slap on the device, from an amplitude spike pattern on the mic while idle (two hits within 500 ms) and from the IMU, and reports it to the server as `{button: "slap"}`, like the BOOT button. GPIO 7 is an RTC-capable pin on the S3 (GPIO 0–21), so the IMU interrupt can wake the ESP32 from deep sleep and a slap turns the device on. A wake from deep sleep is a cold boot: Wi-Fi and the WebSocket take seconds to reconnect.
- The INMP441 is bottom-ported: the opening is the small hole on the bare side
  of the PCB under the can.
- Wi-Fi is 2.4 GHz only. Use the UART/COM USB-C port for flashing.
- Toolchain: the standard PlatformIO `espressif32` platform ships the Arduino-ESP32 2.0.x core, which has no `ESP_I2S` API. Use the pioarduino platform fork pinned to a numbered release (not its moving "stable" URL), or Arduino CLI/IDE with Espressif's package. A toolchain mismatch would look like an I2S bug.
- Firmware structure: one audio capture task feeding a bounded queue, one network task draining it, display updates infrequent. If the socket blocks, drop the oldest audio rather than growing a backlog.
- WebSocket library: links2004/WebSockets (arduinoWebSockets), pinned, with heartbeat and reconnect with bounded backoff.
- Mic samples: the INMP441 outputs 24-bit samples in 32-bit I2S slots. Capture 32-bit, select the left slot (L/R to GND), shift to signed 16-bit little-endian, and check gain and clipping on the serial plotter before connecting speech-to-text.
- Mic availability: TDK lists the INMP441 as NRND (not recommended for new designs, still in production). Fine for the hackathon; pick a different mic for any later PCB.
- OLED frame format: the server sends a 1,024-byte bitmap in XBM layout: row-major, 128 px per row = 16 bytes per row, 64 rows, least significant bit = leftmost pixel in each byte, 1 = lit. The device draws it with U8g2 `drawXBM`. Start with status text and the join code; server-rendered multilingual captions come after.

## Measurements

- OLED glass panel: 62.81 × 39.85 mm; panel + PCB stack 4.1 mm thick (measured 6 Oct).
- OLED PCB: 70.1 × 48.0 × 1.0 mm, whole stack 4.07 mm (measured 9 Oct). Hole spacing: still to measure.
- INMP441 PCB: 14.0 mm diameter (measured 9 Oct).
- IMU module outline and hole spacing: to measure (needed for the housing pocket).

## Bench test order (stock examples, one connection at a time)

1. Blink on GPIO 10 → LED and resistor.
2. Button example on GPIO 0 → BOOT button.
3. U8g2 HelloWorld, hardware I2C constructor → OLED.
4. Arduino-ESP32 I2S example (core 3.x toolchain, see Notes), serial plotter → mic; capture 32-bit, left slot, shift to 16-bit, check gain and clipping.
5. IMU read + tap interrupt: I2C scan or WHO_AM_I read shows 0x68 (the OLED may not ACK, see Notes), accelerometer values move when the case is tapped, and INT on GPIO 7 fires on a slap; then try waking from deep sleep on it.
6. Wi-Fi scan → phone hotspot visible on 2.4 GHz.
