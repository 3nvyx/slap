#include "link.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>
#include <string.h>

#include "app_state.h"
#include "audio.h"
#include "display.h"
#include "settings.h"

namespace {

WebSocketsClient ws;

char g_path[192];     // SERVER_PATH?key=DEVICE_KEY
char g_hello[224];    // prebuilt hello JSON
char g_helloId[24], g_helloMac[18], g_helloWake[8];

void buildHello(const char* lang) {
  snprintf(g_hello, sizeof g_hello, "{\"type\":\"hello\",\"deviceId\":\"%s\",\"fw\":\"%s\",\"mac\":\"%s\",\"lang\":\"%s\",\"wake\":\"%s\"}",
           g_helloId, FW_VERSION, g_helloMac, lang, g_helloWake);
}
bool g_connected = false;
bool g_begun = false;

// Reconnect backoff. The library retries every setReconnectInterval() ms but reports no
// event for a failed TCP connect, so we double the interval each time a full interval has
// passed while still disconnected: attempts at ~0, 2, 6, 14, 30, 60, 90 ... s (cap 30 s).
uint32_t g_backoff = WS_RECONNECT_MIN_MS;
uint32_t g_nextBump = 0;

uint32_t g_lastLevel = 0;
uint32_t g_framesSent = 0;

// Audio TX buffer with WEBSOCKETS_MAX_HEADER_SIZE (14) bytes of headroom: sendBIN(...,
// headerToPayload=true) writes the frame header into the headroom and sends header+payload
// in one TCP write, with no heap allocation or copy inside the library.
uint8_t g_tx[WEBSOCKETS_MAX_HEADER_SIZE + AUDIO_FRAME_BYTES];

bool parseState(const char* s, AppState* out) {
  if (!strcmp(s, "idle")) *out = AppState::IDLE;
  else if (!strcmp(s, "recording")) *out = AppState::RECORDING;
  else if (!strcmp(s, "error")) *out = AppState::ERROR;
  else return false;
  return true;
}

void handleText(const uint8_t* payload, size_t len) {
  JsonDocument doc;   // small heap use on the network task only, never in the audio path
  DeserializationError err = deserializeJson(doc, payload, len);
  if (err) {
    Serial.printf("[ws] bad JSON (%s): %.*s\n", err.c_str(), (int)(len > 80 ? 80 : len), (const char*)payload);
    return;
  }
  const char* type = doc["type"] | "";

  if (!strcmp(type, "state")) {
    AppState s;
    const char* st = doc["state"] | "";
    if (!parseState(st, &s)) {
      Serial.printf("[ws] unknown state '%s'\n", st);
      return;
    }
    app_onServerState(s, doc["sessionId"] | "", doc["classCode"] | "", doc["message"] | "");
  } else if (!strcmp(type, "ping")) {
    // {type:"pong", t} echoing the server's t unchanged (number of any size).
    JsonDocument out;
    out["type"] = "pong";
    if (doc["t"].isNull()) out["t"] = millis();
    else out["t"] = doc["t"];
    char buf[64];
    size_t n = serializeJson(out, buf, sizeof buf);
    ws.sendTXT(buf, n);
  } else {
    Serial.printf("[ws] ignored message type '%s'\n", type);
  }
}

void onEvent(WStype_t type, uint8_t* payload, size_t len) {
  uint32_t now = millis();
  switch (type) {
    case WStype_CONNECTED:
      g_connected = true;
      g_backoff = WS_RECONNECT_MIN_MS;
      ws.setReconnectInterval(g_backoff);
      Serial.printf("[ws] connected %s:%d%s\n", SERVER_HOST, SERVER_PORT, SERVER_PATH);
      ws.sendTXT(g_hello);
      app_onLinkUp();
      break;
    case WStype_DISCONNECTED:
      if (g_connected) {
        g_connected = false;
        Serial.println("[ws] disconnected");
        display_dropServerFrame();
        app_onLinkDown();
      }
      g_nextBump = now + g_backoff;
      break;
    case WStype_TEXT:
      handleText(payload, len);
      break;
    case WStype_BIN:
      // Contract: a binary frame to the device is a whole-screen 1,024-byte XBM bitmap.
      if (!display_setServerFrame(payload, len, now)) Serial.printf("[ws] binary frame of %u bytes ignored\n", (unsigned)len);
      break;
    case WStype_ERROR:
      Serial.printf("[ws] error: %.*s\n", (int)len, payload ? (const char*)payload : "");
      break;
    default:
      break;   // WS-level ping/pong are handled by the library's heartbeat
  }
}

}  // namespace

void link_begin(const char* deviceId, const char* mac, const char* lang, const char* wake) {
  snprintf(g_helloWake, sizeof g_helloWake, "%s", wake);
  snprintf(g_path, sizeof g_path, "%s?key=%s", SERVER_PATH, DEVICE_KEY);
  snprintf(g_helloId, sizeof g_helloId, "%s", deviceId);
  snprintf(g_helloMac, sizeof g_helloMac, "%s", mac);
  buildHello(lang);

  ws.onEvent(onEvent);
  // Empty subprotocol: no Sec-WebSocket-Protocol header (the server does not negotiate one).
#if SERVER_TLS
  // wss:// without certificate pinning (library calls setInsecure when no fingerprint/CA).
  ws.beginSSL(SERVER_HOST, SERVER_PORT, g_path, "", "");
#else
  ws.begin(SERVER_HOST, SERVER_PORT, g_path, "");
#endif
  ws.setReconnectInterval(WS_RECONNECT_MIN_MS);
  // WebSocket-level ping every 10 s; no pong in 3 s twice = dead link, reconnect.
  ws.enableHeartbeat(WS_HB_PING_MS, WS_HB_PONG_MS, WS_HB_MISSES);
  g_backoff = WS_RECONNECT_MIN_MS;
  g_nextBump = millis() + g_backoff;
  g_begun = true;
  Serial.printf("[ws] %s://%s:%d%s?key=***\n", SERVER_TLS ? "wss" : "ws", SERVER_HOST, SERVER_PORT, SERVER_PATH);
}

void link_stop() {
  if (!g_begun) return;
  ws.disconnect();
  g_connected = false;
}

void link_loop(uint32_t nowMs, bool streaming) {
  if (!g_begun) return;
  ws.loop();   // may block for a TCP/TLS connect; the audio task has higher priority

  if (!g_connected) {
    if ((int32_t)(nowMs - g_nextBump) >= 0) {
      g_backoff = g_backoff * 2 > WS_RECONNECT_MAX_MS ? WS_RECONNECT_MAX_MS : g_backoff * 2;
      ws.setReconnectInterval(g_backoff);
      g_nextBump = nowMs + g_backoff;
    }
    return;
  }

  // Drain the audio queue: at most 4 frames per pass so the loop stays responsive after a
  // stall; the capture task drops the oldest frames if we fall further behind.
  if (streaming) {
    for (int i = 0; i < 4; i++) {
      if (!audio_popFrame(g_tx + WEBSOCKETS_MAX_HEADER_SIZE)) break;
      if (!ws.sendBIN(g_tx, AUDIO_FRAME_BYTES, true)) break;   // socket died; frame lost
      g_framesSent++;
    }
  }

  if (nowMs - g_lastLevel >= LEVEL_INTERVAL_MS) {
    g_lastLevel = nowMs;
    char buf[40];
    int n = snprintf(buf, sizeof buf, "{\"type\":\"level\",\"rms\":%.3f}", audio_takeLevel());
    ws.sendTXT(buf, (size_t)n);
  }
}

bool link_connected() { return g_connected; }

uint32_t link_retryInMs(uint32_t nowMs) {
  if (g_connected || !g_begun) return 0;
  int32_t d = (int32_t)(g_nextBump - nowMs);
  return d > 0 ? (uint32_t)d : 0;
}

bool link_sendButton(const char* button) {
  if (!g_connected) return false;
  char buf[48];
  int n = snprintf(buf, sizeof buf, "{\"type\":\"button\",\"button\":\"%s\"}", button);
  Serial.printf("[ws] -> %s\n", buf);
  return ws.sendTXT(buf, (size_t)n);
}

void link_setLang(const char* lang) {
  buildHello(lang);
  if (!g_connected) return;
  char buf[40];
  int n = snprintf(buf, sizeof buf, "{\"type\":\"lang\",\"lang\":\"%s\"}", lang);
  Serial.printf("[ws] -> %s\n", buf);
  ws.sendTXT(buf, (size_t)n);
}

uint32_t link_framesSent() { return g_framesSent; }
