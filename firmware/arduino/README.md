# Arduino USB shake bridge

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
One shake emits `SHAKE` when it begins: the acceleration has to stay 0.40 g away from its recent
average for 120 ms in total. A knock on the desk is too short to count, and turning
the case over is too slow. After 0.5 s of stillness it emits `STILL` (the shake is over), and the next shake counts.
`SHAKE_G` and `SHAKE_MS` in the sketch control sensitivity. Motion that did not
count is printed as `motion peak_g=… ms=…` (the server logs it), which shows how
far off a failed shake was. The built-in Arduino LED toggles on each shake.

The library's `read()` reports acceleration in m/s² (its `set_gravity()` does not apply to it); the sketch
divides by 9.80665, so `SHAKE_G` and `QUIET_G` are in g. With the values left in m/s² the sensor's own noise
never counts as still, and only the first shake after power-up is sent.

The sketch restarts the board (`IMU restart: …` in the server log) when no sensor answers at boot, when ten
reads in a row fail, or when the values stop changing for 2 s. A cable contact that opens for an instant
while the sensor is shaken causes the last two. To watch the readings, build with `-DIMU_PLOT=1`: it prints
`ax ay az moved motion_ms` 20 times a second.

To build without Arduino IDE, use the `arduino-cli` bundled in it with the board
`arduino:renesas_uno:unor4wifi`. Stop the API first: it holds the serial port.

The API routes `SHAKE` and `STILL` (and `SLAP` from the earlier double-slap sketch, a shake that is over at once) to
the connected ESP32 named by `ARDUINO_DEVICE_ID` (`triggerUsbSlap` in `apps/api/src/ws/device.ts`). A shake starts a
recording: the ESP32 plays its slap animation, then shows captions. While a recording runs, a shake only blurs the
caption text for as long as it goes on (`shakeFrame` in `apps/api/src/oled.ts`), and one that goes on for more than
about two seconds leaves the cat mascot dizzy for three seconds (`renderDizzy`); it never stops one (hold REC on the
ESP32 for 1 s to save and stop). Events while the ESP32 is
offline are discarded, and a shake cannot wake an ESP32 from deep sleep. With no motion sensor of its own the
ESP32 therefore does not sleep after a recording: it stays connected and darkens its screen (standby).

The ESP32 microphone also detects slaps while idle. For this arrangement,
set `SLAP_MIC_ENABLED` to `0` in `firmware/esp32/include/config.h` and reflash
to avoid two detectors toggling the same recording.

Manufacturer library: https://github.com/sunfounder/sunfounder-imu-arduino
