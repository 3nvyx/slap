# Wokwi simulation of the Slap device

Verifies the schematic's display, button, LED, Wi-Fi and internet paths before
the ESP32-S3 boards arrive. The I2S microphone cannot be simulated in Wokwi; it
is verified on the bench with the real board.

## Results (run 6 October 2026, Wokwi web, ESP32-S3)

| Path | Result |
|---|---|
| OLED on I2C (SDA 8, SCL 9), raw 1024-byte frame blit then text screens | Works: test frame drawn, idle screen shows `Join: A7K2QX`, `WiFi ok` |
| BOOT button on GPIO 0 (simulated push button) | Works: `[btn] start` in serial, state toggles |
| Recording LED on GPIO 2 via 220 Ω | Works: LED turns on with recording |
| Wi-Fi join (Wokwi-GUEST) | Works: `[wifi] ok 10.10.0.2` |
| Plain HTTP from the board | Works: `GET example.com -> 200` |
| WebSocket to a public echo server | Not verified: both ArduinoWebsockets and links2004/WebSockets get an immediate close through Wokwi's public gateway (`ws.ifelse.io`, `echo.websocket.org`). HTTP on the same path works, so this is a gateway limitation, not the wiring or the sketch. |

Conclusion: everything in the schematic except the mic and the WebSocket
handshake is proven in simulation. The WebSocket link is tested first thing on
Saturday against the real backend (hour 0–3), as the plan already requires. If
a simulated WebSocket test is wanted before then, Wokwi's private gateway
(`wokwigw`) connects the simulator to a server on localhost.

## Run it in the browser

1. Open https://wokwi.com/projects/new/esp32-s3
2. Replace `sketch.ino` with `sim_test/sim_test.ino`.
3. Replace `diagram.json` with `diagram.json`.
4. In Library Manager add `U8g2` and `WebSockets` (same as `libraries.txt`).
5. Press play. Build servers can be slow; a busy notice is normal, it still runs.

## What you should see

1. A checker/QR-style test frame on the OLED for 1.5 s (raw 1024-byte blit).
2. The idle screen: `Join: A7K2QX`, then `WiFi ok`.
3. Click the green button (stands in for BOOT): LED on, screen shows
   `REC 00:00` counting up, a level bar and a fake caption.
4. Click again: LED off, back to idle.

Serial monitor prints the same events plus the HTTP and WebSocket attempts.

## Wiring in diagram.json

Identical to `hardware/wiring.md`: OLED SDA→8, SCL→9, 3V3, GND; LED on GPIO 2
through 220 Ω; button on GPIO 0 (BOOT) to GND.

The sketch is a throwaway check and is not the hackathon firmware.
