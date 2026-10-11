# Arduino USB slap bridge

Plug the SunFounder 10-axis IMU into the UNO R4 WiFi's Qwiic socket.
Connect both the Arduino and ESP32 to the Mac by USB. No wires connect the boards.
The ESP32 still needs Wi-Fi and a working server connection for audio.

Install `SunFounder_IMU` in Arduino IDE's Library Manager. Open
`slap_bridge/slap_bridge.ino`, select Arduino UNO R4 WiFi and its USB port,
and upload. Close Serial Monitor before starting the server.

Set these in the repository's `.env.local`:

```dotenv
ARDUINO_PORT=/dev/cu.usbmodemDC5475C954102
ARDUINO_DEVICE_ID=slap-8851b4
ARDUINO_PYTHON=/Users/nootnoot/.platformio/penv/bin/python
```

The Python interpreter must have `pyserial` installed. Restart the API to load
these settings. Port names can change; use Arduino IDE to identify the Arduino
port rather than choosing the ESP32 port. Unset `ARDUINO_PORT` to disable this bridge.

The server logs `USB connected`, and the sketch prints `IMU ready` at boot.
Two hits within 500 ms, followed by 300 ms of stillness, emit `SLAP`. Three
hits are rejected as shaking. `HIT_G` and `QUIET_G` in the sketch control sensitivity.
Fix the sensor rigidly to the case for testing. The built-in Arduino LED toggles
on each detected double slap.

The API routes `SLAP` to the connected ESP32 named by `ARDUINO_DEVICE_ID` using
its existing button handler. Pair that ESP32 and pick a course first. Events
while the ESP32 is offline are discarded. The listener reconnects every three
seconds after unplugging the Arduino. Slaps do not wake a sleeping ESP32.

The ESP32 microphone also detects slaps while idle. For this arrangement,
set `SLAP_MIC_ENABLED` to `0` in `firmware/esp32/include/config.h` and reflash
to avoid two detectors toggling the same recording.

Manufacturer library: https://github.com/sunfounder/sunfounder-imu-arduino
