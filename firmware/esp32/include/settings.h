// Single include for configuration: user config (secrets + overrides) followed by
// defaults for anything config.h does not define, plus compile-time sanity checks.
#pragma once

#if __has_include("config.h")
#include "config.h"
#else
#warning "include/config.h missing: building with config.example.h (copy it and set Wi-Fi/server)"
#include "config.example.h"
#endif

#define FW_VERSION "0.3.0"

// ---------- Network ----------
#ifndef SERVER_TLS
#define SERVER_TLS 0
#endif
#ifndef SERVER_PATH
#define SERVER_PATH "/ws/device"
#endif
#ifndef DEVICE_ID
#define DEVICE_ID ""
#endif
#define WS_RECONNECT_MIN_MS  2000    // first retry delay (setReconnectInterval)
#define WS_RECONNECT_MAX_MS 30000    // exponential backoff cap
#define WS_HB_PING_MS       10000    // enableHeartbeat(ping every 10 s,
#define WS_HB_PONG_MS        3000    //   pong within 3 s,
#define WS_HB_MISSES            2    //   disconnect after 2 misses)
#define WS_STATE_WAIT_MS     5000    // no `state` after hello within this -> assume idle
#define WIFI_RETRY_MS       20000    // restart the Wi-Fi join if not connected after this
#define LEVEL_INTERVAL_MS     500    // `level` message rate (~2 Hz)

// ---------- Pins ----------
#ifndef PIN_I2S_BCLK
#define PIN_I2S_BCLK 5
#endif
#ifndef PIN_I2S_WS
#define PIN_I2S_WS 4
#endif
#ifndef PIN_I2S_DIN
#define PIN_I2S_DIN 6
#endif
#ifndef PIN_I2C_SDA
#define PIN_I2C_SDA 8
#endif
#ifndef PIN_I2C_SCL
#define PIN_I2C_SCL 9
#endif
#ifndef PIN_IMU_INT
#define PIN_IMU_INT 7
#endif
#ifndef PIN_LED
#define PIN_LED 10
#endif
#ifndef PIN_BUTTON
#define PIN_BUTTON 0
#endif

// ---------- Audio ----------
#ifndef AUDIO_SHIFT
#define AUDIO_SHIFT 12
#endif
#ifndef AUDIO_GAIN_Q8
#define AUDIO_GAIN_Q8 256
#endif
#ifndef AUDIO_DC_BLOCK
#define AUDIO_DC_BLOCK 1
#endif
#ifndef AUDIO_AGC
#define AUDIO_AGC 1
#endif
#ifndef AUDIO_AGC_TARGET_RMS
#define AUDIO_AGC_TARGET_RMS 3000
#endif
#ifndef AUDIO_AGC_MIN_GAIN_DB
#define AUDIO_AGC_MIN_GAIN_DB (-6)
#endif
#ifndef AUDIO_AGC_MAX_GAIN_DB
#define AUDIO_AGC_MAX_GAIN_DB 36
#endif
#ifndef AUDIO_QUEUE_FRAMES
#define AUDIO_QUEUE_FRAMES 8
#endif
#ifndef FAKE_AUDIO
#define FAKE_AUDIO 0
#endif

// Wire format (packages/contracts): 16 kHz, 16-bit signed LE mono, 3,200-byte frames = 100 ms.
#define AUDIO_SAMPLE_RATE   16000
#define AUDIO_FRAME_BYTES    3200
#define AUDIO_FRAME_SAMPLES (AUDIO_FRAME_BYTES / 2)            // 1600
#define AUDIO_BLOCK_SAMPLES  160                               // 10 ms analysis block
#define AUDIO_BLOCKS_PER_FRAME (AUDIO_FRAME_SAMPLES / AUDIO_BLOCK_SAMPLES)

// ---------- Slap ----------
#ifndef SLAP_WINDOW_MS
#define SLAP_WINDOW_MS 500
#endif
#ifndef SLAP_MIN_GAP_MS
#define SLAP_MIN_GAP_MS 80
#endif
#ifndef SLAP_COOLDOWN_MS
#define SLAP_COOLDOWN_MS 1000
#endif
#ifndef SLAP_WAKE_WINDOW_MS
#define SLAP_WAKE_WINDOW_MS 1500
#endif
#ifndef SLAP_PENDING_TTL_MS
#define SLAP_PENDING_TTL_MS 15000
#endif
#ifndef SLAP_SETTLE_MS
#define SLAP_SETTLE_MS 300
#endif
#ifndef SLAP_SHAKE_QUIET_MS
#define SLAP_SHAKE_QUIET_MS 800
#endif
#ifndef SLAP_MIC_ENABLED
#define SLAP_MIC_ENABLED 1
#endif
#ifndef SLAP_MIC_K_X10
#define SLAP_MIC_K_X10 60
#endif
#ifndef SLAP_MIC_MIN_RMS
#define SLAP_MIC_MIN_RMS 1200
#endif
#ifndef SLAP_MIC_MAX_HIT_MS
#define SLAP_MIC_MAX_HIT_MS 80
#endif
#ifndef SLAP_MIC_BASELINE_SHIFT
#define SLAP_MIC_BASELINE_SHIFT 8
#endif
#ifndef IMU_ENABLED
#define IMU_ENABLED 1
#endif
#ifndef IMU_ADDR
#define IMU_ADDR 0x68
#endif
#ifndef IMU_MOT_THR
#define IMU_MOT_THR 150
#endif
#ifndef IMU_WAKE_THR
#define IMU_WAKE_THR 100
#endif
#ifndef IMU_MOT_DUR
#define IMU_MOT_DUR 1
#endif
#ifndef IMU_QUIET_MS
#define IMU_QUIET_MS 60
#endif

// ---- Shake to switch on ----
// A wake by the IMU only counts as "on" if it is a real shake: within SHAKE_CONFIRM_MS of the wake the
// acceleration must differ from 1 g by more than SHAKE_MIN_G for SHAKE_MIN_MS in total. A knock, a bump on the
// desk or steps while the device is carried do not add up to that, and the device goes back to sleep unlit.
#ifndef SHAKE_CONFIRM_MS
#define SHAKE_CONFIRM_MS 1200
#endif
#ifndef SHAKE_MIN_G
#define SHAKE_MIN_G 0.35f
#endif
#ifndef SHAKE_MIN_MS
#define SHAKE_MIN_MS 250
#endif

// ---- Tilt left / right: caption language ----
// IMU_TILT_AXIS is the accelerometer axis that runs left-right across the device as it stands in use
// (0 = X, 1 = Y, 2 = Z); IMU_TILT_SIGN is +1 if it reads positive with the right side tipped down, else -1.
// Check both on the bench with IMU_PLOT 1 (it prints ax ay az). A tilt is TILT_ON_G along that axis
// (0.34 g is about 20 degrees) held for TILT_HOLD_MS; the next one counts after the device came back
// under TILT_OFF_G for TILT_RETURN_MS.
#ifndef IMU_TILT_AXIS
#define IMU_TILT_AXIS 0
#endif
#ifndef IMU_TILT_SIGN
#define IMU_TILT_SIGN 1
#endif
#ifndef TILT_SAMPLE_MS
#define TILT_SAMPLE_MS 40
#endif
#ifndef TILT_ON_G
#define TILT_ON_G 0.34f
#endif
#ifndef TILT_OFF_G
#define TILT_OFF_G 0.18f
#endif
#ifndef TILT_HOLD_MS
#define TILT_HOLD_MS 80
#endif
#ifndef TILT_RETURN_MS
#define TILT_RETURN_MS 250
#endif
#ifndef TILT_SETTLE_MS
#define TILT_SETTLE_MS 1500
#endif
#ifndef TILT_REBASE_MS
#define TILT_REBASE_MS 4000
#endif
// How long the server's "Saved" screen stays up before the device sleeps, when the session was ended from the app.
#ifndef SAVED_SHOW_MS
#define SAVED_SHOW_MS 2500
#endif

// ---------- Display / power / debug ----------
#ifndef OLED_SERVER_FRAME_TTL_MS
#define OLED_SERVER_FRAME_TTL_MS 5000
#endif
// How long the switch-on animation and its last frame stay up before "Joining Wi-Fi" (Wi-Fi joins behind it
// meanwhile). The animation itself is about 0.6 s (src/splash.h).
#ifndef SPLASH_MS
#define SPLASH_MS 1800
#endif
// Server frames are drawn as they arrive, up to this many a second (one takes about 25 ms on the I2C bus).
// The device's own screens redraw at OLED_MAX_FPS.
#ifndef OLED_SERVER_FPS
#define OLED_SERVER_FPS 20
#endif
#ifndef OLED_MAX_FPS
#define OLED_MAX_FPS 5
#endif
#ifndef OLED_SSD1306
#define OLED_SSD1306 0
#endif
#ifndef DEEP_SLEEP_IDLE_MIN
#define DEEP_SLEEP_IDLE_MIN 20
#endif
#ifndef MIC_PLOT
#define MIC_PLOT 0
#endif
#ifndef IMU_PLOT
#define IMU_PLOT 0
#endif

#define BUTTON_LOCKOUT_MS   50    // BOOT must be quiet this long before an edge counts (debounce)
#define BUTTON_LONG_MS    2000    // hold BOOT/REC this long = (stop recording and) deep sleep

// ---------- Checks ----------
static_assert(AUDIO_SHIFT >= 8 && AUDIO_SHIFT <= 16, "AUDIO_SHIFT must be 8..16 (16 = unity, 8 = +48 dB)");
static_assert(AUDIO_GAIN_Q8 > 0 && AUDIO_GAIN_Q8 <= 1024, "AUDIO_GAIN_Q8 must be 1..1024 (x4 max, keeps int32 math safe)");
static_assert(AUDIO_QUEUE_FRAMES >= 2, "AUDIO_QUEUE_FRAMES must be >= 2");
static_assert(AUDIO_AGC_TARGET_RMS >= 100 && AUDIO_AGC_TARGET_RMS <= 10000, "AUDIO_AGC_TARGET_RMS must be 100..10000 (16-bit units)");
static_assert(AUDIO_AGC_MIN_GAIN_DB >= -20 && AUDIO_AGC_MIN_GAIN_DB < AUDIO_AGC_MAX_GAIN_DB && AUDIO_AGC_MAX_GAIN_DB <= 48,
              "AGC gain limits must satisfy -20 <= MIN < MAX <= 48 dB");
static_assert(AUDIO_FRAME_SAMPLES % AUDIO_BLOCK_SAMPLES == 0, "frame must be a whole number of blocks");
static_assert(SLAP_MIN_GAP_MS < SLAP_WINDOW_MS, "SLAP_MIN_GAP_MS must be below SLAP_WINDOW_MS");
static_assert(IMU_MOT_THR >= 1 && IMU_MOT_THR <= 255, "IMU_MOT_THR is an 8-bit register");
static_assert(IMU_WAKE_THR >= 1 && IMU_WAKE_THR <= 255, "IMU_WAKE_THR is an 8-bit register");
static_assert(SLAP_SETTLE_MS >= 2 * IMU_QUIET_MS, "SLAP_SETTLE_MS must leave room for the second slap's ringing");
static_assert(IMU_MOT_DUR >= 1 && IMU_MOT_DUR <= 255, "IMU_MOT_DUR is an 8-bit register");
static_assert(PIN_IMU_INT <= 21, "the IMU INT pin must be an RTC GPIO (0-21 on the S3) to wake from deep sleep");
