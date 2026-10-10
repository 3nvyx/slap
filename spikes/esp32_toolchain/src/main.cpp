#include <Arduino.h>
// Throwaway hardware check for the lecture device, run in Wokwi before the
// boards arrive. Exercises everything in the schematic except the I2S mic:
//   - SSD1306/SSD1309 128x64 OLED on I2C (SDA 8, SCL 9)
//   - BOOT button on GPIO 0 as start/stop
//   - recording LED on GPIO 2
//   - Wi-Fi join + WebSocket round trip to a public echo server
//   - blitting a raw 1024-byte frame to the display (the "server renders the
//     OLED" path)
// Discarded on hackathon day; the real firmware is written from scratch then.

#include <WiFi.h>
#include <HTTPClient.h>
#include <U8g2lib.h>
#include <WebSocketsClient.h>   // links2004/WebSockets

// ---- pins (ESP32-S3 DevKitC-1) ------------------------------------------
static const int PIN_SDA = 8;
static const int PIN_SCL = 9;
static const int PIN_LED = 2;
static const int PIN_BTN = 0;   // BOOT button, active low

// ---- display ------------------------------------------------------------
// Wokwi only has an SSD1306 part. On the real 2.42" SSD1309 module use:
//   U8G2_SSD1309_128X64_NONAME0_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE, PIN_SCL, PIN_SDA);
U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE, PIN_SCL, PIN_SDA);

// ---- network ------------------------------------------------------------
static const char* WIFI_SSID = "Wokwi-GUEST";   // Wokwi's simulated open AP
static const char* WIFI_PASS = "";
static const char* WS_HOST   = "ws.ifelse.io";   // public echo server; our backend on hardware
static const int   WS_PORT   = 80;
static const char* WS_PATH   = "/";

WebSocketsClient ws;

// ---- state ---------------------------------------------------------------
bool recording   = false;
bool wifiUp      = false;
bool wsUp        = false;
bool wsEchoSeen  = false;
int  binEchoes   = 0;
unsigned long recStart = 0;
unsigned long lastPing = 0;
unsigned long lastAudio = 0;
unsigned long lastDraw = 0;

const char* PAIR_CODE = "A7K2QX";
const char* CAPTION[] = { "gradient descent", "minimises the", "loss function",
                          "by stepping", "downhill" };
int captionIdx = 0;

uint8_t frame[1024];   // 128x64 1-bit, XBM layout (row-major, LSB first)

// ---- helpers --------------------------------------------------------------
void setPixel(int x, int y, bool on) {
  int i = y * 16 + (x >> 3);
  uint8_t m = 1 << (x & 7);
  if (on) frame[i] |= m; else frame[i] &= ~m;
}

// Fake "server frame": three QR-style finder squares plus a checker field,
// to prove the raw-bitmap blit path works on this display.
void buildTestFrame() {
  memset(frame, 0, sizeof(frame));
  for (int y = 0; y < 64; y++)
    for (int x = 32; x < 96; x++)
      setPixel(x, y, ((x >> 2) + (y >> 2)) & 1);
  auto finder = [](int ox, int oy) {
    for (int y = 0; y < 14; y++)
      for (int x = 0; x < 14; x++) {
        bool ring = (x == 0 || y == 0 || x == 13 || y == 13);
        bool core = (x >= 4 && x <= 9 && y >= 4 && y <= 9);
        setPixel(ox + x, oy + y, ring || core);
      }
  };
  finder(34, 2);
  finder(80, 2);
  finder(34, 48);
}

void drawIdle() {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x12_tf);
  u8g2.drawStr(0, 10, "SLAP            idle");
  u8g2.drawHLine(0, 13, 128);
  u8g2.setFont(u8g2_font_10x20_tf);
  u8g2.drawStr(4, 36, "Join:");
  u8g2.drawStr(56, 36, PAIR_CODE);
  u8g2.setFont(u8g2_font_6x12_tf);
  u8g2.drawStr(0, 52, wifiUp ? "WiFi ok" : "WiFi ...");
  u8g2.drawStr(64, 52, wsUp ? (wsEchoSeen ? "WS echo ok" : "WS open") : "WS ...");
  u8g2.drawStr(0, 63, "BOOT = start");
  u8g2.sendBuffer();
}

void drawRecording() {
  unsigned long s = (millis() - recStart) / 1000;
  char line[32];
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x12_tf);
  u8g2.drawDisc(4, 6, 3);
  snprintf(line, sizeof line, "REC  %02lu:%02lu", s / 60, s % 60);
  u8g2.drawStr(12, 10, line);
  snprintf(line, sizeof line, "echo %d", binEchoes);
  u8g2.drawStr(80, 10, line);
  u8g2.drawHLine(0, 13, 128);
  // fake level meter
  int lvl = 20 + (millis() / 150) % 80;
  u8g2.drawFrame(0, 18, 128, 6);
  u8g2.drawBox(1, 19, lvl, 4);
  // fake caption, last word emphasised
  u8g2.setFont(u8g2_font_7x14B_tf);
  u8g2.drawStr(0, 44, CAPTION[captionIdx]);
  u8g2.setFont(u8g2_font_6x12_tf);
  u8g2.drawStr(0, 63, "BOOT = stop");
  u8g2.sendBuffer();
}

void drawFrameBlit() {
  u8g2.clearBuffer();
  u8g2.drawXBM(0, 0, 128, 64, frame);
  u8g2.sendBuffer();
}

void wsEvent(WStype_t type, uint8_t* payload, size_t len) {
  switch (type) {
    case WStype_CONNECTED:
      wsUp = true;
      Serial.println("[ws] opened");
      ws.sendTXT("{\"hello\":\"sim\",\"fw\":\"0.1\",\"code\":\"A7K2QX\"}");
      break;
    case WStype_DISCONNECTED:
      wsUp = false;
      Serial.println("[ws] closed");
      break;
    case WStype_TEXT:
      Serial.printf("[ws] text: %.*s\n", (int)len, (const char*)payload);
      if (strstr((const char*)payload, "hello")) wsEchoSeen = true;
      break;
    case WStype_BIN:
      binEchoes++;
      break;
    case WStype_ERROR:
      Serial.printf("[ws] error %.*s\n", (int)len, (const char*)payload);
      break;
    default:
      break;
  }
}

void connectWs() {
  Serial.printf("[ws] connecting ws://%s:%d%s\n", WS_HOST, WS_PORT, WS_PATH);
  ws.onEvent(wsEvent);
  ws.setReconnectInterval(5000);
  ws.begin(WS_HOST, WS_PORT, WS_PATH);
}

// ---- arduino ----------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BTN, INPUT_PULLUP);
  digitalWrite(PIN_LED, LOW);

  u8g2.begin();
  u8g2.setFont(u8g2_font_6x12_tf);
  u8g2.clearBuffer();
  u8g2.drawStr(0, 12, "booting...");
  u8g2.sendBuffer();

  // Prove the raw-frame path first, before any network.
  buildTestFrame();
  drawFrameBlit();
  Serial.println("[oled] test frame shown");
  delay(1500);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[wifi] joining");
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
    delay(250);
    Serial.print(".");
  }
  wifiUp = WiFi.status() == WL_CONNECTED;
  Serial.printf("\n[wifi] %s %s\n", wifiUp ? "ok" : "FAILED",
                wifiUp ? WiFi.localIP().toString().c_str() : "");
  if (wifiUp) {
    // Plain HTTP first: separates "internet works" from "WebSocket works".
    HTTPClient http;
    http.begin("http://example.com/");
    int code = http.GET();
    Serial.printf("[http] GET example.com -> %d\n", code);
    http.end();
    connectWs();
  }
  drawIdle();
}

void loop() {
  // --- button: falling edge with debounce ---
  static int  lastRaw = HIGH;
  static unsigned long lastEdge = 0;
  int raw = digitalRead(PIN_BTN);
  if (raw != lastRaw && millis() - lastEdge > 40) {
    lastEdge = millis();
    lastRaw = raw;
    if (raw == LOW) {
      recording = !recording;
      digitalWrite(PIN_LED, recording ? HIGH : LOW);
      if (recording) { recStart = millis(); binEchoes = 0; Serial.println("[btn] start"); }
      else Serial.println("[btn] stop");
      if (wsUp) ws.sendTXT(recording ? "{\"button\":\"start\"}" : "{\"button\":\"stop\"}");
    }
  }

  // --- network housekeeping ---
  if (wifiUp) ws.loop();   // handles reconnects itself
  if (wsUp && millis() - lastPing > 5000) {
    lastPing = millis();
    ws.sendPing();
  }

  // --- "audio": one 3200-byte frame per second while recording ---
  if (recording && wsUp && millis() - lastAudio > 1000) {
    lastAudio = millis();
    static uint8_t pcm[3200];
    for (int i = 0; i < 3200; i += 2) {
      int16_t s = (int16_t)(8000.0 * sin(i * 0.05));
      pcm[i] = s & 0xff; pcm[i + 1] = s >> 8;
    }
    ws.sendBIN(pcm, sizeof pcm);
    captionIdx = (captionIdx + 1) % 5;
  }

  // --- display refresh ---
  if (millis() - lastDraw > 200) {
    lastDraw = millis();
    if (recording) drawRecording(); else drawIdle();
  }
}
