#include "display.h"

#include <Arduino.h>
#include <U8g2lib.h>
#include <string.h>

#include "settings.h"
#include "splash.h"

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
int g_splashFrame = -1;        // frame of the switch-on animation on screen (-1 = none yet)
bool g_splashRunning = false, g_splashDone = false;
uint32_t g_splashAt = 0;

void drawSplash(int i) {
  u8g2.clearBuffer();
  u8g2.drawXBM(0, 0, 128, 64, kSplash[i]);
  u8g2.sendBuffer();
  g_splashFrame = i;
}

const uint8_t* FONT_TEXT = u8g2_font_helvR10_tf;    // hint and detail lines, about 22 chars per line
const uint8_t* FONT_TITLE = u8g2_font_helvB12_tr;
const uint8_t* FONT_BIG = u8g2_font_helvB18_tr;

void centered(const char* s, int y) {
  int w = u8g2.getStrWidth(s);
  u8g2.drawStr(w < 128 ? (128 - w) / 2 : 0, y, s);
}

// Copies `s` into `out`, cut with ".." so it fits `maxW` px in the current font.
void fitted(char* out, size_t n, const char* s, int maxW) {
  strncpy(out, s ? s : "", n - 1);
  out[n - 1] = 0;
  size_t len = strlen(out);
  while (len > 2 && u8g2.getStrWidth(out) > maxW) {
    len--;
    out[len] = 0;
    out[len - 1] = out[len - 2] = '.';
  }
}

// Wi-Fi strength: four bars, 2 px wide, bottom-aligned at y. Nothing while Wi-Fi is down (the WIFI screen says so).
void wifiIcon(int x, int y, bool up, int rssi) {
  if (!up) return;
  int bars = rssi > -55 ? 4 : rssi > -65 ? 3 : rssi > -75 ? 2 : 1;
  for (int i = 0; i < 4; i++) {
    int h = 2 + i * 2;
    if (i < bars) u8g2.drawBox(x + i * 3, y - h, 2, h);
    else u8g2.drawPixel(x + i * 3, y - 1);
  }
}

// Top corners of every local screen but ERROR: Wi-Fi strength, and an up and a down arrow while the
// server socket is open; "No mic" on the left when the microphone did not start.
void statusIcons(const DisplayModel& m, int dx = 0) {
  wifiIcon(117 + dx, 9, m.wifiUp, m.rssi);
  if (m.wsUp) {
    u8g2.drawVLine(105 + dx, 1, 8);
    u8g2.drawHLine(104 + dx, 2, 3);
    u8g2.drawHLine(103 + dx, 3, 5);
    u8g2.drawVLine(111 + dx, 1, 8);
    u8g2.drawHLine(110 + dx, 7, 3);
    u8g2.drawHLine(109 + dx, 6, 5);
  }
  if (!m.micOk) {
    u8g2.setFont(FONT_TEXT);
    u8g2.drawStr(0, 11, "No mic");
  }
}

// Three dots under a "working on it" screen, lit one after another.
void progressDots(uint32_t nowMs, int y) {
  int lit = (nowMs / 400) % 4;
  for (int i = 0; i < 3; i++) {
    if (i < lit) u8g2.drawBox(55 + i * 8, y, 3, 3);
    else u8g2.drawPixel(56 + i * 8, y + 1);
  }
}

// Word-wraps `s` in the current font into at most `maxLines` lines from the left edge, `pitch` px apart from baseline y.
void wrapped(const char* s, int y, int pitch, int maxLines) {
  char buf[40];
  size_t n = 0, lastSpace = 0;
  int row = 0;
  while (*s && row < maxLines) {
    if (*s == ' ' && n == 0) { s++; continue; }
    buf[n] = *s;
    buf[n + 1] = 0;
    if (*s == ' ') lastSpace = n;
    if (u8g2.getStrWidth(buf) > 126 || n + 2 >= sizeof buf) {
      // Break at the last space of the line, or mid-word when it has none.
      size_t cut = lastSpace ? lastSpace : n;
      s -= n - cut;
      buf[cut] = 0;
      u8g2.drawStr(1, y + row++ * pitch, buf);
      n = lastSpace = 0;
      continue;
    }
    n++;
    s++;
  }
  if (n && row < maxLines) {
    buf[n] = 0;
    u8g2.drawStr(1, y + row * pitch, buf);
  }
}

// The screens the device draws by itself: before the server is reached, and when its frames stop.
// They follow the server's screens (apps/api/src/oled.ts): one large line, one hint under it.
void drawLocal(uint32_t nowMs, const DisplayModel& m) {
  char buf[40];
  u8g2.clearBuffer();
  // While recording the level column has the right edge, so the icons sit left of it.
  if (m.state != AppState::BOOTING && m.state != AppState::ERROR) statusIcons(m, m.state == AppState::RECORDING ? -10 : 0);

  switch (m.state) {
    case AppState::BOOTING:
      u8g2.drawXBM(0, 0, 128, 64, kSplash[kSplashFrames - 1]);   // the switch-on art (splash.h); display_update animates it
      break;

    case AppState::WIFI:
      u8g2.setFont(FONT_TITLE);
      centered("Joining Wi-Fi", 30);
      u8g2.setFont(FONT_TEXT);
      fitted(buf, sizeof buf, m.ssid, 126);
      centered(buf, 46);
      progressDots(nowMs, 55);
      break;

    case AppState::CONNECTING:
      u8g2.setFont(FONT_TITLE);
      centered("Connecting", 30);
      u8g2.setFont(FONT_TEXT);
      fitted(buf, sizeof buf, m.host, 126);
      centered(buf, 46);
      if (m.wsUp) centered("Waiting for server", 61);
      else if (m.retryInMs > 0) {
        snprintf(buf, sizeof buf, "Next try in %lu s", (unsigned long)((m.retryInMs + 999) / 1000));
        centered(buf, 61);
      } else {
        progressDots(nowMs, 55);
      }
      break;

    case AppState::IDLE:
      // The second or so between the hello and the server's first recording frame.
      u8g2.setFont(FONT_TITLE);
      centered("Starting", 32);
      progressDots(nowMs, 44);
      break;

    case AppState::RECORDING: {
      // The server's frames stopped: timer, how to stop, and the server's level column and record dot.
      uint32_t s = (nowMs - m.recStartMs) / 1000;
      if (s >= 3600) snprintf(buf, sizeof buf, "%lu:%02lu:%02lu", (unsigned long)(s / 3600), (unsigned long)(s / 60 % 60), (unsigned long)(s % 60));
      else snprintf(buf, sizeof buf, "%02lu:%02lu", (unsigned long)(s / 60), (unsigned long)(s % 60));
      u8g2.setFont(FONT_BIG);
      u8g2.drawStr((118 - u8g2.getStrWidth(buf)) / 2, 30, buf);
      u8g2.setFont(FONT_TEXT);
      u8g2.drawStr((118 - u8g2.getStrWidth("Hold REC to")) / 2, 45, "Hold REC to");
      u8g2.drawStr((118 - u8g2.getStrWidth("save and turn off")) / 2, 58, "save and turn off");
      // Level: sqrt-ish scale so speech (-30..-10 dBFS) spans the column of 13 blocks.
      float l = m.level * 4.0f;
      if (l > 1.0f) l = 1.0f;
      int lit = (int)(l * 13.0f + 0.5f);
      for (int i = 0; i < lit; i++) {
        u8g2.drawBox(121, 49 - i * 4, 3, 3);
        u8g2.drawBox(125, 49 - i * 4, 3, 3);
      }
      u8g2.drawDisc(124, 59, 3);
      break;
    }

    case AppState::ERROR:
      // Title on a lit bar, as the server draws it.
      u8g2.drawBox(0, 0, 128, 17);
      u8g2.setDrawColor(0);
      u8g2.setFont(FONT_TITLE);
      u8g2.drawStr(3, 14, "Error");
      u8g2.setDrawColor(1);
      u8g2.setFont(FONT_TEXT);
      wrapped(m.message && m.message[0] ? m.message : "See the server log", 31, 14, 3);
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
  // Switching on: the first frame of the animation is drawn at once from setup(). The rest plays from the
  // first loop() pass (setup blocks for a moment, which would swallow frames), and the last frame stays until
  // SPLASH_MS. Wi-Fi joins behind it meanwhile.
  if (m.state == AppState::BOOTING) {
    if (g_splashFrame < 0) drawSplash(0);
    return;
  }
  if (g_splashFrame >= 0 && !g_splashDone && m.state != AppState::ERROR) {
    if (!g_splashRunning) {
      g_splashRunning = true;
      g_splashAt = nowMs;
    }
    uint32_t t = nowMs - g_splashAt;
    if (t < SPLASH_MS) {
      int i = 0;
      for (uint32_t end = 0; i < kSplashFrames - 1 && t >= (end += kSplashFrameMs[i]); i++) {}
      if (i != g_splashFrame) drawSplash(i);
      return;
    }
    g_splashDone = true;
  }

#if OLED_SERVER_FRAME_TTL_MS > 0
  // Signed age: a frame stamped in the network callback can be a few ms newer than this pass's nowMs.
  bool fresh = g_haveFrame && m.wsUp && (int32_t)(nowMs - g_frameAt) < (int32_t)OLED_SERVER_FRAME_TTL_MS;
#else
  bool fresh = g_haveFrame && m.wsUp;   // TTL 0: keep the last server frame while connected
#endif
  if (fresh) {
    // Server bitmap: XBM layout (16 bytes per row, LSB = leftmost pixel, 1 = lit), exactly what drawXBM
    // expects. Redrawn only when a new frame arrived, at most OLED_SERVER_FPS times a second: the server
    // animates captions with short bursts of frames. A frame that arrives too soon waits for the next pass.
    if ((g_frameDirty || !g_showingServer) && nowMs - g_lastDraw >= 1000u / OLED_SERVER_FPS) {
      u8g2.clearBuffer();
      u8g2.drawXBM(0, 0, 128, 64, g_frame);
      u8g2.sendBuffer();
      g_lastDraw = nowMs;
      g_frameDirty = false;
      g_showingServer = true;
    }
    return;
  }
  if (nowMs - g_lastDraw < 1000u / OLED_MAX_FPS) return;
  g_showingServer = false;
  drawLocal(nowMs, m);
  g_lastDraw = nowMs;
}

void display_notice(const char* big, const char* small) {
  u8g2.clearBuffer();
  u8g2.setFont(FONT_BIG);
  centered(big, 36);
  u8g2.setFont(FONT_TEXT);
  centered(small, 56);
  u8g2.sendBuffer();
}

void display_off() { u8g2.setPowerSave(1); }
