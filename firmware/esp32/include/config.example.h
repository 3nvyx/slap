// Slap device configuration.
//
// Copy this file to include/config.h (git-ignored) and fill in the secrets:
//   cp include/config.example.h include/config.h
// Every tunable below has the same default in include/settings.h, so a config.h
// that only defines the secrets still builds. Override a tunable by defining it here.
#pragma once

// ---------- Network (secrets) ----------
#define WIFI_SSID   "your-hotspot"       // 2.4 GHz only
#define WIFI_PASS   "your-password"

// The laptop running apps/api, or the fixed Cloudflare tunnel hostname.
#define SERVER_HOST "192.168.4.10"
#define SERVER_PORT 8787
#define SERVER_TLS  0                    // 1 = wss:// (tunnel, port 443), 0 = ws:// (LAN)
#define SERVER_PATH "/ws/device"         // the firmware appends ?key=DEVICE_KEY

// Shared secret listed in the server's DEVICE_KEYS. URL-safe characters only
// (letters, digits, - _ . ~): it goes into the query string unescaped.
#define DEVICE_KEY  "dev-device-key"
// Stable id sent in hello. Empty string = derive "slap-XXXXXX" from the MAC.
#define DEVICE_ID   ""

// ---------- Pins (ESP32-S3 DevKitC-1, see hardware/wiring.md) ----------
#define PIN_I2S_BCLK   5     // INMP441 SCK
#define PIN_I2S_WS     4     // INMP441 WS
#define PIN_I2S_DIN    6     // INMP441 SD (L/R tied to GND = left slot)
#define PIN_I2C_SDA    8     // OLED + MPU6050
#define PIN_I2C_SCL    9
#define PIN_IMU_INT    7     // MPU6050 INT, RTC-capable: deep-sleep wake source
#define PIN_LED        10    // recording LED via 220 ohm (right-hand pin column, next to 9)
#define PIN_BUTTON     0     // BOOT button, active low

// ---------- Audio ----------
// Total right shift from the 32-bit I2S slot to 16-bit PCM. 16 = unity (top 16 of
// the 24 mic bits); every step below 16 is +6 dB. 12 = +24 dB, a lecture-hall start.
// Tune on the serial plotter (MIC_PLOT 1): speech peaks well under 32767, clip = 0.
#define AUDIO_SHIFT    12
// Fine gain after the shift, Q8 fixed point (256 = x1.0, max 1024 = x4.0).
#define AUDIO_GAIN_Q8  256
// Remove the mic's DC offset with a one-pole high-pass (~20 Hz). 0 = off.
#define AUDIO_DC_BLOCK 1
// Audio frames buffered between the capture task and the socket (100 ms each).
// When full, the OLDEST frame is dropped so latency stays bounded.
#define AUDIO_QUEUE_FRAMES 8

// ---------- Slap detection ----------
#define SLAP_WINDOW_MS        500   // two hits within this window = one double slap
#define SLAP_MIN_GAP_MS        80   // hits closer than this are the same hit (merged across sensors)
#define SLAP_SETTLE_MS        300   // after the 2nd hit the case must be still this long, else it was a shake
#define SLAP_SHAKE_QUIET_MS   800   // after a shake, detection re-arms once still for this long
#define SLAP_COOLDOWN_MS     1000   // ignore hits after a slap so a triple slap toggles once
#define SLAP_WAKE_WINDOW_MS  1500   // after an IMU wake, one more hit within this many ms of boot = double slap
#define SLAP_PENDING_TTL_MS 15000   // a slap/press made while offline is sent if the link is up within this

// Mic transient (10 ms blocks of the 16-bit signal). Only while NOT recording: during a
// session only the IMU (and REC) can stop it.
#define SLAP_MIC_ENABLED          1
#define SLAP_MIC_K_X10           60     // hit when block RMS > 6.0 x baseline ...
#define SLAP_MIC_MIN_RMS        1200    // ... and > this absolute RMS (16-bit units)
#define SLAP_MIC_MAX_HIT_MS       80    // a burst longer than this is sound (speech, music), not a slap
#define SLAP_MIC_BASELINE_SHIFT    8    // baseline EMA alpha = 1/2^n per 10 ms block (8 = ~2.5 s)

// MPU6050 motion interrupt.
#define IMU_ENABLED     1
#define IMU_ADDR        0x68
#define IMU_MOT_THR     150   // awake "slap" profile: MOT_THR register, ~2 mg/LSB (map rev 4.2): 150 = ~0.3 g
#define IMU_WAKE_THR    100   // asleep "shake" profile: lower, so a shake or a single slap wakes the device
#define IMU_MOT_DUR     1     // MOT_DUR register, 1 ms/LSB at the 1 kHz accel rate
#define IMU_QUIET_MS    60    // an INT pulse starts a new hit only after this much quiet

// ---------- Display ----------
#define OLED_SERVER_FRAME_TTL_MS 5000   // server bitmap shown this long after it arrives; 0 = while connected
#define OLED_MAX_FPS             5

// ---------- Power ----------
#define DEEP_SLEEP_IDLE_MIN 20          // minutes not recording before deep sleep; 0 = never

// ---------- Debug ----------
#define MIC_PLOT  0    // 1 = print rms/peak/clip/baseline per 100 ms frame for the serial plotter
#define IMU_PLOT  0    // 1 = print accelerometer magnitude at 20 Hz
