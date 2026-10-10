#include "display.h"

#include <Arduino.h>
#include <U8g2lib.h>
#include <string.h>

#include "settings.h"

namespace {

#if OLED_SSD1306
// Wokwi has only an SSD1306 part; same pins, same 128x64 buffer.
U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE, PIN_I2C_SCL, PIN_I2C_SDA);
#else
// The 2.42" module. It may not ACK on I2C (pad D2 open); U8g2 does not check ACKs.
U8G2_SSD1309_128X64_NONAME0_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE, PIN_I2C_SCL, PIN_I2C_SDA);
#endif

constexpr size_t kFrameBytes = 128 * 64 / 8;   // 1,024 (contracts OLED_FRAME_BYTES)
uint8_t g_frame[kFrameBytes];
bool g_haveFrame = false;
bool g_frameDirty = false;
bool g_showingServer = false;
uint32_t g_frameAt = 0;
uint32_t g_lastDraw = 0;

const uint8_t* FONT_SMALL = u8g2_font_6x10_tf;   // 21 chars per line
const uint8_t* FONT_TINY = u8g2_font_5x8_tf;     // 25 chars per line
const uint8_t* FONT_BIG = u8g2_font_helvB18_tr;
const uint8_t* FONT_TIME = u8g2_font_logisoso24_tn;

void centered(const char* s, int y) {
  int w = u8g2.getStrWidth(s);
  u8g2.drawStr((128 - w) / 2, y, s);
}

void wifiIcon(int x, int y, bool up, int rssi) {
  // Four bars, 2 px wide, bottom-aligned at y.
  int bars = !up ? 0 : rssi > -55 ? 4 : rssi > -65 ? 3 : rssi > -75 ? 2 : 1;
  for (int i = 0; i < 4; i++) {
    int h = 2 + i * 2;
    if (i < bars) u8g2.drawBox(x + i * 3, y - h, 2, h);
    else u8g2.drawPixel(x + i * 3, y - 1);
  }
  if (!up) {
    u8g2.drawLine(x, y - 8, x + 10, y);
  }
}

void statusBar(const DisplayModel& m) {
  u8g2.setFont(FONT_SMALL);
  if (m.state == AppState::RECORDING) {
    u8g2.drawDisc(4, 4, 3);
    u8g2.drawStr(10, 8, "REC");
    if (m.classCode && m.classCode[0]) {   // active course, up to 7 chars between REC and the icons
      char cc[8];
      strncpy(cc, m.classCode, sizeof cc - 1);
      cc[sizeof cc - 1] = 0;
      u8g2.drawStr(32, 8, cc);
    }
  } else {
    u8g2.drawStr(0, 8, "SLAP");
  }
  int x = 128;
  // WS indicator: filled box with inverted "WS" when the socket is open, outline when not.
  x -= 15;
  if (m.wsUp) {
    u8g2.drawBox(x, 0, 15, 9);
    u8g2.setDrawColor(0);
    u8g2.drawStr(x + 2, 8, "WS");
    u8g2.setDrawColor(1);
  } else {
    u8g2.drawFrame(x, 0, 15, 9);
    u8g2.drawStr(x + 2, 8, "WS");
  }
  x -= 14;
  wifiIcon(x, 9, m.wifiUp, m.rssi);
  if (!m.micOk) {
    x -= 20;
    u8g2.drawStr(x, 8, "MIC!");
  }
  u8g2.drawHLine(0, 11, 128);
}

// Truncating copy for one OLED line (21 chars of 6x10).
void line(char* out, size_t n, const char* s) {
  strncpy(out, s ? s : "", n - 1);
  out[n - 1] = 0;
}

void drawLocal(uint32_t nowMs, const DisplayModel& m) {
  char buf[32];
  u8g2.clearBuffer();
  statusBar(m);

  switch (m.state) {
    case AppState::BOOTING:
      u8g2.setFont(FONT_BIG);
      centered("SLAP", 38);
      u8g2.setFont(FONT_SMALL);
      centered("booting  fw " FW_VERSION, 60);
      break;

    case AppState::WIFI:
      u8g2.setFont(FONT_BIG);
      centered("WI-FI", 38);
      u8g2.setFont(FONT_SMALL);
      snprintf(buf, sizeof buf, "joining %s", m.ssid);
      buf[21] = 0;
      centered(buf, 60);
      break;

    case AppState::CONNECTING:
      u8g2.setFont(FONT_BIG);
      centered("LINK", 38);
      u8g2.setFont(FONT_SMALL);
      line(buf, 22, m.host);
      centered(buf, 50);
      if (m.wsUp) centered("waiting for server", 62);
      else if (m.retryInMs > 0) {
        snprintf(buf, sizeof buf, "retry in %lus", (unsigned long)((m.retryInMs + 999) / 1000));
        centered(buf, 62);
      } else {
        centered("connecting...", 62);
      }
      break;

    case AppState::UNPAIRED:
      u8g2.setFont(FONT_SMALL);
      centered("pair this device", 23);
      u8g2.setFont(FONT_BIG);
      centered(m.pairCode, 46);
      u8g2.setFont(FONT_SMALL);
      centered("enter code in web app", 62);
      break;

    case AppState::IDLE:
      u8g2.setFont(FONT_BIG);
      centered("READY", 36);
      if (m.classCode && m.classCode[0]) {
        // Active course chosen in the web app (state.classCode).
        u8g2.setFont(FONT_SMALL);
        snprintf(buf, sizeof buf, "course %s", m.classCode);
        buf[21] = 0;
        centered(buf, 50);
        centered("slap to start", 62);
      } else {
        // Paired but no active course (state.classCode null/absent): recording has nowhere to go.
        u8g2.setFont(FONT_TINY);
        centered("Pick a course in the app", 50);
        u8g2.setFont(FONT_SMALL);
        centered("then slap to start", 62);
      }
      break;

    case AppState::RECORDING: {
      uint32_t s = (nowMs - m.recStartMs) / 1000;
      snprintf(buf, sizeof buf, "%02lu:%02lu", (unsigned long)(s / 60 % 100), (unsigned long)(s % 60));
      u8g2.setFont(FONT_TIME);
      centered(buf, 42);
      // Level meter: sqrt-ish scale so speech (-30..-10 dBFS) spans the bar.
      float l = m.level * 4.0f;
      if (l > 1.0f) l = 1.0f;
      int w = (int)(l * 124.0f);
      u8g2.drawFrame(0, 46, 128, 6);
      if (w > 0) u8g2.drawBox(2, 48, w, 2);
      u8g2.setFont(FONT_SMALL);
      centered("slap to stop", 62);
      break;
    }

    case AppState::ERROR:
      u8g2.setFont(FONT_BIG);
      centered("ERROR", 36);
      u8g2.setFont(FONT_SMALL);
      line(buf, 22, m.message && m.message[0] ? m.message : "see server");
      centered(buf, 50);
      if (m.message && strlen(m.message) > 21) {
        line(buf, 22, m.message + 21);
        centered(buf, 62);
      }
      break;
  }
  u8g2.sendBuffer();
}

}  // namespace

void display_begin() {
  u8g2.setBusClock(400000);   // 1 KB frame in ~25 ms; the MPU6050 is fine at 400 kHz too
  u8g2.begin();
}

bool display_setServerFrame(const uint8_t* data, size_t len, uint32_t nowMs) {
  if (len != kFrameBytes) return false;
  memcpy(g_frame, data, kFrameBytes);
  g_haveFrame = true;
  g_frameDirty = true;
  g_frameAt = nowMs;
  return true;
}

void display_dropServerFrame() { g_haveFrame = false; }

void display_update(uint32_t nowMs, const DisplayModel& m) {
  if (nowMs - g_lastDraw < 1000u / OLED_MAX_FPS) return;

#if OLED_SERVER_FRAME_TTL_MS > 0
  bool fresh = g_haveFrame && m.wsUp && nowMs - g_frameAt < (uint32_t)OLED_SERVER_FRAME_TTL_MS;
#else
  bool fresh = g_haveFrame && m.wsUp;   // TTL 0: keep the last server frame while connected
#endif
  if (fresh) {
    // Server bitmap: XBM layout (16 bytes per row, LSB = leftmost pixel, 1 = lit),
    // exactly what drawXBM expects. Only redraw when a new frame arrived.
    if (g_frameDirty || !g_showingServer) {
      u8g2.clearBuffer();
      u8g2.drawXBM(0, 0, 128, 64, g_frame);
      u8g2.sendBuffer();
      g_lastDraw = nowMs;
    }
    g_frameDirty = false;
    g_showingServer = true;
    return;
  }
  g_showingServer = false;
  drawLocal(nowMs, m);
  g_lastDraw = nowMs;
}

void display_notice(const char* big, const char* small) {
  u8g2.clearBuffer();
  u8g2.setFont(FONT_BIG);
  centered(big, 34);
  u8g2.setFont(FONT_SMALL);
  centered(small, 56);
  u8g2.sendBuffer();
}

void display_off() { u8g2.setPowerSave(1); }
