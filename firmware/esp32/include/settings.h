// Single include for configuration: user config (secrets + overrides) followed by
// defaults for anything config.h does not define, plus compile-time sanity checks.
#pragma once

#if __has_include("config.h")
#include "config.h"
#else
#warning "include/config.h missing: building with config.example.h (copy it and set Wi-Fi/server)"
#include "config.example.h"
#endif

#define FW_VERSION "0.2.0"

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
#define PIN_LED 2
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

// ---------- Display / power / debug ----------
#ifndef OLED_SERVER_FRAME_TTL_MS
#define OLED_SERVER_FRAME_TTL_MS 5000
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
static_assert(AUDIO_FRAME_SAMPLES % AUDIO_BLOCK_SAMPLES == 0, "frame must be a whole number of blocks");
static_assert(SLAP_MIN_GAP_MS < SLAP_WINDOW_MS, "SLAP_MIN_GAP_MS must be below SLAP_WINDOW_MS");
static_assert(IMU_MOT_THR >= 1 && IMU_MOT_THR <= 255, "IMU_MOT_THR is an 8-bit register");
static_assert(IMU_WAKE_THR >= 1 && IMU_WAKE_THR <= 255, "IMU_WAKE_THR is an 8-bit register");
static_assert(SLAP_SETTLE_MS >= 2 * IMU_QUIET_MS, "SLAP_SETTLE_MS must leave room for the second slap's ringing");
static_assert(IMU_MOT_DUR >= 1 && IMU_MOT_DUR <= 255, "IMU_MOT_DUR is an 8-bit register");
static_assert(PIN_IMU_INT <= 21, "the IMU INT pin must be an RTC GPIO (0-21 on the S3) to wake from deep sleep");
