# Slap device firmware (ESP32-S3)

Captures lecture audio from an INMP441 and streams it to the server over one WebSocket. It shows status or server-rendered frames on the 2.42" SSD1309 OLED, lights the REC LED, and turns a REC press or a double slap on the case into a `button` event. The server decides when a session starts and stops. The protocol is defined in `packages/contracts/src/index.ts`; the firmware follows it by hand.

## Wiring recap (full table in `hardware/wiring.md`)

| Part | Pin(s) on the ESP32-S3 DevKitC-1 |
|---|---|
| INMP441 SCK / WS / SD | GPIO 5 / 4 / 6; L/R to GND (left slot); VDD 3V3 |
| OLED SDA / SCL | GPIO 8 / 9, I2C address 0x3C |
| MPU6050 SDA / SCL / INT | GPIO 8 / 9 (shared bus, 0x68) / GPIO 7 |
| REC LED | GPIO 10 through 220 Ω to the anode, cathode to GND (was GPIO 2; moved so every used pin is on the 3V3 column) |
| REC (start/stop) | BOOT button (GPIO 0), under the housing's REC cap; nothing to wire |

These pins match `firmware/wokwi/diagram.json` (OLED 8/9, LED 2, button 0), so the Wokwi wiring still applies (see "Wokwi" below).

## Gestures (spec)

The device is either asleep or recording. "REC" is the housing button over the board's BOOT button (GPIO 0).

| Device state | Gesture | Result |
|---|---|---|
| Asleep | A real shake (about a second), or a REC press | Switches on: joins Wi-Fi, connects, and the server starts a session at once. Nothing to pick first. |
| Asleep | A knock, a bump on the desk, being carried | The chip wakes, sees it is not a shake (`SHAKE_*`), and sleeps again with the screen dark |
| Recording | Tilt left or right and back, or a short REC press | Previous / next caption language on the screen (English, Vietnamese, Japanese); sent as `{"type":"lang"}`. Kept across sleep. |
| Recording | Hold REC for 2 s | `{"type":"button","button":"boot"}` ends the session; waits up to 3 s for the server's non-recording `state`, shows "Saved", then deep sleep |
| Recording | The session is stopped in the app | The server's "Saved" screen for `SAVED_SHOW_MS`, then deep sleep |
| Awake, not recording | `DEEP_SLEEP_IDLE_MIN` minutes without activity, or hold REC for 2 s | Deep sleep |

Slaps no longer start or stop anything (the detector in `slap.cpp` still runs; its result is ignored).

**Without a motion sensor on the ESP32** (the IMU sits on the Arduino, `firmware/arduino/`): a shake reaches the ESP32 only through the server, which cannot wake it from deep sleep. The device then never sleeps by itself. Powered up or reset, it connects and waits (the server's "SLAP!" screen, which pops in, bobs and takes a slap every couple of seconds; dark after `STANDBY_SCREEN_MS`); a shake or a short REC press starts a session, with the slap animation first (`SHAKE_SPLASH_MS`); a shake during a session throws the caption text about for half a second (drawn by the server); hold REC for 2 s shows "Saved" and returns to the dark, connected standby. Holding REC while not recording is still deep sleep, and only REC wakes it then.

LED: solid while recording, slow 1 Hz blink while booting or connecting, 5 Hz while in the server's error state, off when asleep.

## Configure

```sh
cd firmware/esp32
cp include/config.example.h include/config.h   # git-ignored
```

Set `WIFI_SSID`/`WIFI_PASS` (2.4 GHz), `SERVER_HOST`/`SERVER_PORT`, `SERVER_TLS` (1 for `wss://` through the tunnel on 443, 0 for `ws://` to the laptop on the LAN, port 8787), and `DEVICE_KEY` (one of the server's `DEVICE_KEYS`, URL-safe characters only). Leave `DEVICE_ID` empty to get `slap-xxxxxx` from the MAC. The tunables in the same file have defaults in `include/settings.h`. A `config.h` that defines only the secrets still builds.

TLS is not verified: the client calls `setInsecure()`, so there is no certificate pinning. That is acceptable for the hackathon tunnel. Pin a CA before any real deployment.

## Build, flash, monitor

PlatformIO is pinned to the pioarduino 55.03.35 release (Arduino-ESP32 3.3.5, which has `ESP_I2S`).

```sh
~/.local/bin/pio run                 # build (env esp32s3)
~/.local/bin/pio run -t upload       # flash over the UART/COM USB-C port
~/.local/bin/pio device monitor      # 115200 baud, exception decoder on
~/.local/bin/pio run -e wokwi        # simulator build (SSD1306 + synthetic audio)
```

Serial commands (type one letter in the monitor): `i` info (id, state, heap), `b` asks the server to stop or start the session, `l` next caption language, `z` deep sleep now.

### Build result (8 Oct 2026, fw 0.2.0, env esp32s3)

- RAM: 28.6% (93,780 of 327,680 bytes static). This includes the 25.6 KB audio queue (8 × 3,200 B), the 6 KB audio task stack and the 1 KB OLED frame.
- Flash: 35.0% (1,170,411 of 3,342,336 bytes app partition, default 8 MB layout; measured with `config.example.h`). The wokwi env used 28.2% / 35.6% when last measured.
- Library warnings only (one `NetworkClient::flush()` deprecation in links2004/WebSockets); the IRAM row reads 100% because the S3 places overflow IRAM code in DIRAM (`.text` 68 KB there), which is normal. Our sources build with `-Wall -Wextra` and produce no warnings.

## How it works

- **Audio task** (core 1, priority 10, static stack). Each pass it reads 10 ms (160 × 32-bit slots) from `ESP_I2S` and keeps bits 31..8, the 24-bit sample. A DC blocker runs at about 20 Hz, then the block is scaled to int16 with clipping. With `AUDIO_AGC 1` (the default) the gain follows the room: see "Automatic gain" below. With `AUDIO_AGC 0` it is fixed at `(x24 × AUDIO_GAIN_Q8) >> AUDIO_SHIFT`. The task feeds each block's RMS at the fixed gain to the mic slap detector, so slap thresholds do not move with the automatic gain, and assembles 1,600 samples into a 3,200-byte frame. While recording, it pushes the frame into a static FreeRTOS queue of 8 frames. If the queue is full it drops the oldest frame, so latency stays under 800 ms. No heap is used after init.
- **Network task** (Arduino `loop()`). Runs `ws.loop()` and drains up to 4 frames per pass with `sendBIN(..., headerToPayload=true)`, which needs no library malloc and does one TCP write. It sends `level` at 2 Hz and handles `state`/`ping` (answered with `pong` echoing `t`) and binary 1,024-byte OLED frames. The heartbeat is `enableHeartbeat(10000, 3000, 2)`. Reconnect starts at 2 s and doubles up to 30 s. The audio task has higher priority, so a blocking TCP connect never starves the mic.
- **States**: BOOTING → WIFI → CONNECTING → the server's `state` (RECORDING / IDLE / ERROR). The server answers the hello with RECORDING: a device that is on records. IDLE only follows a stop, and the device then sleeps. If no `state` arrives within 5 s of `hello`, the device assumes IDLE. A link drop goes back to CONNECTING, a Wi-Fi drop back to WIFI; the session carries on when the link is back (the server keeps it for 90 s).
- **hello**: `{"type":"hello","deviceId","fw","mac","lang","wake"}`. `wake` is what switched the device on, said in the first hello after boot: `shake` or `button` (the server starts a session at once) or `power` (powered up or reset: it waits for a shake or a REC press, and a recording it left behind is ended and saved). Later hellos of the same boot say `reconnect`: the link dropped, and the device carries on recording or waiting. There is no pairing and no course to pick: the hello starts a session, and the recording waits in the app under "New recordings" until someone puts it into a course. `lang` is the caption language for this screen (`en`, `vi` or `ja`). The server keeps one device per `DEVICE_KEY`, so two boards need two keys.
- **OLED**: if a server bitmap arrived within the last `OLED_SERVER_FRAME_TTL_MS` (5 s), it is drawn with `drawXBM`: captions, the language banner, "Saved". The server must resend at least that often, or the TTL can be set to 0 to keep the last frame while connected. Otherwise a local screen is drawn. Switching on plays the animation in `src/splash.h` (six frames, about 0.6 s: a hand slaps the mascot) and holds its last frame until `SPLASH_MS` (1.8 s) while Wi-Fi joins behind it. The first frame is drawn from `setup()`; the rest plays from the first `loop()` pass. The frames and their times are the sprites `screen/splash/1` to `6` and `SPLASH_FRAME_MS` in `screen-lab/sprites.js`, copied by `node firmware/esp32/tools/splash_from_lab.mjs`. The others are one large line with a hint under it: "Joining Wi-Fi" and the network name (WIFI); "Connecting", the server host and the time to the next try (CONNECTING); "Starting" (IDLE, the moment before the first server frame); the timer, "Hold REC to save and turn off", and the server's level column and record dot at the right edge (RECORDING); "Error" on a lit bar with the server's message wrapped under it (ERROR). Wi-Fi bars sit in the top right corner, with an up and a down arrow beside them while the socket is open, and "No mic" appears top left when the microphone did not start. Server frames are drawn as they arrive, up to `OLED_SERVER_FPS` (20) a second, because the server animates captions with short bursts of frames (lines roll up, new words fade in); local screens redraw at `OLED_MAX_FPS` (5). `display.cpp` has no Arduino dependency beyond U8g2, so its screens can be rendered on a computer by compiling it against U8g2's C sources with a stand-in `U8g2lib.h`.
- **Deep sleep**: entered after `DEEP_SLEEP_IDLE_MIN` (20) minutes without recording, by holding REC for 2 s, or with `z`. Before sleeping, the IMU is switched to its "shake" profile: `MOT_THR = IMU_WAKE_THR` (100, below the slap threshold) with a latched INT. The device wakes on REC or the IMU INT. Both are active-low, so one `esp_sleep_enable_ext1_wakeup_io(mask, ESP_EXT1_WAKEUP_ANY_LOW)` call covers them. A wake is a cold boot: the IMU is reconfigured first, which restores `IMU_MOT_THR`. The wake becomes a candidate first hit, and the IMU waits for `IMU_QUIET_MS` of quiet before counting a new hit, so a shake still going on during boot does not count.
- **Shake to switch on**: any motion above `IMU_WAKE_THR` wakes the chip. `confirmShake()` in `main.cpp` then reads the accelerometer for `SHAKE_CONFIRM_MS` (1.2 s) and needs `SHAKE_MIN_MS` (250 ms) in total with the acceleration more than `SHAKE_MIN_G` (0.35 g) away from 1 g; otherwise the device sleeps again before the screen or Wi-Fi come up. Boot takes about 0.3 s of the shake, so shake for about a second.
- **Tilt**: `tilt.cpp` (`TiltDetector`, no hardware dependencies) reads the accelerometer every `TILT_SAMPLE_MS` while recording. A tilt is `TILT_ON_G` (0.34 g, about 20°) along the left-right axis away from the resting position, held `TILT_HOLD_MS`, with total acceleration near 1 g (a shake is not a tilt); the next one counts after the device came back under `TILT_OFF_G`. The resting position follows slow drift, and a device left lying tilted for `TILT_REBASE_MS` takes that as its new rest. **Set `IMU_TILT_AXIS` and `IMU_TILT_SIGN` for the way the IMU sits in the housing**: with `IMU_PLOT 1`, tip the right side down and see which of `ax ay az` rises (sign +1) or falls (sign -1). The defaults (X, +1) are a guess.

### Automatic gain (`AUDIO_AGC`)

The audio task tracks the input level per 10 ms block and scales it toward `AUDIO_AGC_TARGET_RMS` (3,000 of 32,768), between `AUDIO_AGC_MIN_GAIN_DB` and `AUDIO_AGC_MAX_GAIN_DB` (0 dB = unity, which is `AUDIO_SHIFT 16`).

- **Level:** rises with a time constant of about 160 ms and falls with about 5 s. Loud speech lowers the gain within 100–200 ms; after the room goes quiet the gain climbs about 7 dB in 5 s.
- **Transients:** one block counts as at most 4× the current level, so a 30 ms slap lowers the gain by about 4.5 dB, which recovers at about 1 dB/s.
- **Limiter:** a block whose peak would pass 30,000 is scaled down by itself. A falling gain applies to the whole block at once; a rising gain ramps across the block.
- **Power-up:** the first 0.5 s runs at the fixed gain, because the mic's power-up thump is not a level.
- **What the fixed gain still does:** `AUDIO_SHIFT` and `AUDIO_GAIN_Q8` set the gain at power-up and the scale of the mic slap thresholds.

Measured on the desk build (10 Oct 2026, noisy room, `AUDIO_SHIFT 14`): gain moved between 6 and 15 dB, and no sample clipped after the first second. With the fixed gain at `AUDIO_SHIFT 12` the same room clipped in most 100 ms frames.

### Exact I2S API used (verified against `ESP_I2S.h` in framework-arduinoespressif32 3.3.5)

```cpp
I2SClass i2s;
i2s.setPins(5 /*bclk*/, 4 /*ws*/, -1 /*dout*/, 6 /*din*/);
i2s.setTimeout(200);
i2s.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO, I2S_STD_SLOT_LEFT);
i2s.readBytes((char*)buf, 160 * 4);   // blocking read of one 10 ms block
```

`begin()` uses Philips standard slots (`I2S_STD_PHILIP_SLOT_DEFAULT_CONFIG`), with 6 DMA descriptors × 240 frames.

### MPU6050 setup (`src/slap.cpp`)

| Register | Value | Why |
|---|---|---|
| PWR_MGMT_1 0x6B | 0x00 | awake, internal 8 MHz clock |
| PWR_MGMT_2 0x6C | 0x07 | gyros in standby; only the accelerometer is used |
| CONFIG 0x1A | 0x00 | DLPF off (260 Hz) so the slap's edge survives |
| SMPLRT_DIV 0x19 | 0x07 | 1 kHz data rate |
| ACCEL_CONFIG 0x1C | 0x11 | ±8 g, accel high-pass 5 Hz. Motion detection compares the high-passed signal; with the HPF at reset (0) it never fires |
| MOT_THR 0x1F | `IMU_MOT_THR` (150) awake / `IMU_WAKE_THR` (100) before sleep | about 2 mg/LSB. The slap profile is about 0.3 g; the shake profile is lower so any deliberate motion wakes the device |
| MOT_DUR 0x20 | `IMU_MOT_DUR` (1) | 1 ms above the threshold |
| INT_PIN_CFG 0x37 | 0x90 awake / 0xA0 before sleep | active-low push-pull. Awake: a 50 µs pulse per event, timestamped by a GPIO ISR, so no I2C is needed per hit. Sleep: latched until INT_STATUS is read, a level that ext1 can wake on |
| INT_ENABLE 0x38 | 0x40 | motion interrupt only |
| INT_STATUS 0x3A | read | clears a latched INT (at boot and before sleep) |

The IMU is not reset (DEVICE_RESET) at boot. A reset after a wake would blind the detector right when the second slap arrives, so every register is written explicitly instead. If WHO_AM_I does not answer, the IMU is disabled and slap detection falls back to the mic.

## Bench test order (one connection at a time)

Start with `include/config.h` set to your hotspot. Watch the serial monitor throughout.

1. **LED**: power up. The LED blinks slowly (1 Hz) while Wi-Fi/WS connect. `s` in the monitor gives a double blink.
2. **REC/BOOT**: press it and look for `[btn] BOOT` (or "held until the link is up" when offline). Hold it for 2 s and the device enters deep sleep (the OLED shows "Asleep"); press again to wake (`wake: BOOT button`).
3. **OLED**: the switch-on animation plays (the hand comes in and slaps), then "Joining Wi-Fi" / "Connecting". If it stays blank, the module is probably not ACKing (see `hardware/wiring.md`): bridge pad D2 on the module. The ESP32 I2C peripheral stops a write when the address is not acknowledged.
4. **Mic levels**: set `MIC_PLOT 1`, flash, and open the Arduino IDE Serial Plotter (115200). Each 100 ms line prints `rms peak clip base thr gain` (`gain` is the gain in use, in dB above unity). Speak at lecture distance (2–3 m). Peaks should reach a few thousand and `clip` should stay at 0 when you speak loudly up close. With `AUDIO_AGC 1`, `gain` should fall when you speak up close and climb back when you stop. With `AUDIO_AGC 0`: too quiet, lower `AUDIO_SHIFT` (each step is +6 dB); clipping, raise it. If `rms` is flat near 0, check SD on GPIO 6 and L/R to GND, then try `-DAUDIO_I2S_SLOT_RIGHT=1`.
5. **IMU**: the boot log should show `MPU6050 WHO_AM_I 0x68` and `motion INT on GPIO 7`. With `IMU_PLOT 1`, the plot shows `g` ≈ 1.00 at rest, and it moves when you tap the case. A slap prints `[slap] hit imu ...`.
6. **Wi-Fi + server**: the log shows `[wifi] up <ip>`, then `[ws] connected`, the server receives `hello`, and `[state] LINK -> REC` follows. The OLED shows "Listening..." with the timer, then captions, and the recording appears in the web app under "New recordings".
7. **Shake to switch on**: send `z` (or hold REC for 2 s) and wait 5 s.
   - Pick the device up and shake it for a second: `wake: IMU`, then Wi-Fi, `[ws] connected` and `REC`.
   - Put it to sleep again and knock on the case once, then bump the desk: the log shows `motion was not a shake (N of 250 ms): back to sleep` and the screen stays dark. If a knock switches it on, raise `SHAKE_MIN_MS`; if a real shake does not, lower `SHAKE_MIN_G`.
   - Leave it asleep on the desk while you type next to it: it should not even wake. If it does, raise `IMU_WAKE_THR`.
8. **Recording gestures**: tip the device to one side and back: `[lang] vi`, the screen shows "Tiếng Việt" for a moment, then Vietnamese captions. A short REC press does the same. A loud clap or a slap must do nothing. Hold REC for 2 s: `boot` is sent, the server's idle `state` arrives, the screen shows "Saved", then the device sleeps.
9. **Filing**: in the web app, "New recordings" lists the transcript with its length and first words; "Add" puts it into a course.

## Tuning slap detection

Every detected hit is logged as `[slap] hit mic|imu|wake t=...`, followed by `(first)`, `(second ...)` or `-> shake`. A confirmed double slap logs `[slap] SLAP`.

- **Rule**: a slap is two hits at least `SLAP_MIN_GAP_MS` (80) apart and within `SLAP_WINDOW_MS` (500) of each other, followed by `SLAP_SETTLE_MS` (300) of stillness. Hits closer than 80 ms are one hit, which merges the mic and IMU views of the same slap. A third hit or continuing motion makes it a shake, which is ignored until the case has been still for `SLAP_SHAKE_QUIET_MS` (800). After a slap, hits are ignored for `SLAP_COOLDOWN_MS` (1 s).
- **Real double slaps rejected as shakes**: raise `SLAP_SETTLE_MS` a little (the ringing check uses half of it), or raise `IMU_QUIET_MS`.
- **IMU** (the robust sensor; the module must be rigidly fixed to the case):
  - Missed slaps: lower `IMU_MOT_THR` (try 100, then 60). Keep `IMU_WAKE_THR` at or below it.
  - Triggers when the desk is bumped or someone types nearby: raise it, up to 255, or raise `IMU_MOT_DUR` to 2–3.
  - One slap counted as two: raise `IMU_QUIET_MS` (the case rings).
- **Mic** (only while not recording): a hit is a burst of 10 ms block RMS above `max(SLAP_MIC_MIN_RMS, SLAP_MIC_K_X10/10 × baseline)` that ends within `SLAP_MIC_MAX_HIT_MS` (80 ms). The baseline is a ~2.5 s EMA of quiet blocks. With `MIC_PLOT 1`, `base` and `thr` are printed next to `rms`.
  - Claps or door slams trigger it: raise `SLAP_MIC_K_X10` or `SLAP_MIC_MIN_RMS`.
  - Slaps are missed: lower them.
  - Thresholds are in 16-bit units after the gain, so re-tune after changing `AUDIO_SHIFT`.
- **Desk build without an IMU**: slaps can start a session (mic) but not stop it. Use REC to stop.

### Tunables at a glance (`include/config.example.h`)

| Name | Default | Meaning |
|---|---|---|
| `IMU_MOT_THR` | 150 | awake slap profile, MOT_THR register (about 2 mg/LSB, so about 0.3 g) |
| `IMU_WAKE_THR` | 100 | asleep shake profile; a shake or one slap wakes |
| `IMU_MOT_DUR` | 1 | ms above the threshold |
| `IMU_QUIET_MS` | 60 | gap without INT pulses before a new IMU hit |
| `SLAP_WINDOW_MS` | 500 | max time between the two hits |
| `SLAP_MIN_GAP_MS` | 80 | min time between hits; closer hits are merged |
| `SLAP_SETTLE_MS` | 300 | stillness required after the second hit |
| `SLAP_SHAKE_QUIET_MS` | 800 | stillness that re-arms detection after a shake |
| `SLAP_COOLDOWN_MS` | 1000 | dead time after a slap |
| `SLAP_WAKE_WINDOW_MS` | 1500 | after an IMU wake, the second hit must land this soon after boot |
| `SLAP_PENDING_TTL_MS` | 15000 | how long an offline press waits for the link |
| `SHAKE_CONFIRM_MS` / `SHAKE_MIN_G` / `SHAKE_MIN_MS` | 1200 / 0.35 / 250 | what counts as a shake after an IMU wake |
| `IMU_TILT_AXIS` / `IMU_TILT_SIGN` | 0 / 1 | which accelerometer axis is left-right, and its direction |
| `TILT_ON_G` / `TILT_OFF_G` / `TILT_HOLD_MS` | 0.34 / 0.18 / 80 | tilt size, return size, hold time |
| `SPLASH_MS` | 1800 | how long the switch-on animation and its last frame stay up |
| `OLED_SERVER_FPS` | 20 | most server frames drawn per second |
| `STANDBY_SCREEN_MS` | 12000 | standby: how long the screen stays lit after a stop or power-up |
| `SHAKE_SPLASH_MS` | 1100 | how long the slap animation runs when a shake starts a session |
| `SAVED_SHOW_MS` | 2500 | how long "Saved" stays up after a stop from the app |
| `SLAP_MIC_K_X10` / `SLAP_MIC_MIN_RMS` / `SLAP_MIC_MAX_HIT_MS` | 60 / 1200 / 80 | mic hit: 6× baseline, absolute floor, max burst length |
| `AUDIO_SHIFT` / `AUDIO_GAIN_Q8` | 12 / 256 | mic gain (+24 dB) and fine gain |
| `AUDIO_AGC` | 1 | automatic gain on; 0 = fixed gain from the row above |
| `AUDIO_AGC_TARGET_RMS` | 3000 | level the automatic gain aims for (16-bit units) |
| `AUDIO_AGC_MIN_GAIN_DB` / `AUDIO_AGC_MAX_GAIN_DB` | −6 / 36 | limits of the automatic gain, in dB above unity |
| `DEEP_SLEEP_IDLE_MIN` | 20 | idle minutes before sleep (0 = never) |
| `OLED_SERVER_FRAME_TTL_MS` | 5000 | how long a server bitmap stays up |

## Wokwi

`pio run -e wokwi` builds with the SSD1306 constructor (Wokwi's only OLED part) and `FAKE_AUDIO` (a 440 Hz tone with a slow swell, real-time paced; the mic and IMU are not simulated, and the IMU is detected as absent). Point a `wokwi.toml` at `.pio/build/wokwi/firmware.bin` / `firmware.elf` with the existing `firmware/wokwi/diagram.json`. The pins are identical, so no wiring changes are needed. In Wokwi, set `WIFI_SSID "Wokwi-GUEST"` and an empty password. To reach the backend you need the private gateway, because the public gateway closes WebSockets (see `firmware/wokwi/README.md`).

## Not verifiable without hardware (check on the bench)

- **Gain at lecture distance**: the left slot and `>> 8` alignment are confirmed on the desk build (a 1 kHz tone from a laptop was picked up 35× above the background, 10 Oct 2026). Still to check with bench step 4: that the automatic gain reaches a usable level for a speaker 2–3 m away.
- **MOT_THR scale**: the register map gives about 2 mg/LSB, and some clones differ. Also whether the motion INT pulses once or repeatedly per slap. Check with step 5 and the `[slap] hit imu` log.
- **INT polarity**: whether active-low push-pull on the 10-DOF module's INT pin reaches GPIO 7 (some modules add level shifters or pull-ups). Check with step 5.
- **Shake wake** (bench step 7). Check each of these:
  - `IMU_WAKE_THR` wakes on a deliberate shake but not on desk bumps or typing nearby.
  - The latched INT on GPIO 7 actually wakes the S3 through ext1 ANY_LOW.
  - The time from wake to `slap_begin()`, which is roughly the gap between `wake` and `[imu]` in the log. If the second slap of a quick double slap lands before the IMU is reconfigured, it is lost and the user has to double-slap again; widen `SLAP_WAKE_WINDOW_MS` if needed.
  - A shake never logs `SLAP`. The weak case is a shake that produces exactly one more hit and then stops dead within 300 ms; if that happens, raise `SLAP_SETTLE_MS`.
  - Whether the MPU emits INT pulses continuously during sustained motion. The "motion continues" check relies on it; if the MPU pulses only once per event, only the third-hit rule catches shakes.
- **REC wake**: GPIO 0 is a strapping pin, so confirm that a wake by REC boots normally and does not enter download mode.
- **OLED without ACK**: see step 3.
- **Throughput**: 32 kB/s up on a phone hotspot. During a recording, `[stat]` lines every 10 s show `sent`, `dropped` and `queued`. `dropped` should stay at 0.
- **Server side**: the server must answer `hello` with a recording `state`, stop on `boot`, accept `lang`, and refresh OLED frames within the 5 s TTL.
