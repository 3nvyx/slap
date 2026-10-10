// SSD1309 128x64 OLED via U8g2 (full frame buffer, hardware I2C shared with the MPU6050).
// Server bitmaps (1,024 bytes, XBM layout) win while fresh; otherwise a local screen per state.
#pragma once
#include <stddef.h>
#include <stdint.h>

#include "app_state.h"

struct DisplayModel {
  AppState state;
  bool wifiUp;
  int rssi;               // dBm, valid when wifiUp
  bool wsUp;
  bool micOk;
  bool imuOk;
  const char* pairCode;   // 6 chars, shown when UNPAIRED
  const char* classCode;  // from the server's `state`, may be empty
  const char* message;    // from the server's `state`, may be empty
  const char* ssid;
  const char* host;
  uint32_t recStartMs;    // RECORDING start (millis)
  float level;            // last mic frame RMS 0..1
  uint32_t retryInMs;     // CONNECTING: time to the next attempt (0 = unknown)
};

void display_begin();
// Copies a 1,024-byte server frame; other lengths are ignored (returns false).
bool display_setServerFrame(const uint8_t* data, size_t len, uint32_t nowMs);
void display_dropServerFrame();
// Redraws at most OLED_MAX_FPS times per second.
void display_update(uint32_t nowMs, const DisplayModel& m);
// Immediate two-line notice (boot, sleep).
void display_notice(const char* big, const char* small);
void display_off();
