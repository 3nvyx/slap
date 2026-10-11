// Slap device firmware: setup/loop orchestration and the state machine.
//
// Tasks:
//   audio (core 1, prio 10)  I2S capture -> 16-bit PCM -> mic slap detector + frame queue
//   loopTask (core 1, prio 1) network task: Wi-Fi, WebSocket, queue drain, slap events,
//                             button, LED, OLED (all I2C traffic happens here)
//   Wi-Fi/lwIP (core 0)       ESP-IDF
//
// The device is either asleep or recording (REC = the housing button over BOOT, GPIO 0):
//   asleep     a real shake (SHAKE_* in settings.h) or a REC press switches it on; a knock or
//              being carried wakes the chip for a second and it goes back to sleep unlit
//   on         joins Wi-Fi, connects, and the server starts a session at once (no course to pick)
//   recording  tilt left / right, or a short REC press: next caption language (en, vi, ja);
//              hold REC 1 s: the session is ended and saved, then the device sleeps
// A session ended from the app also puts the device to sleep, after the "Saved" screen.
//
// States: BOOTING -> WIFI -> CONNECTING -> (server says) RECORDING | IDLE | ERROR.
// The server owns the session and answers every change with a `state`. A link or Wi-Fi drop
// falls back to CONNECTING / WIFI and the session carries on when the link is back.

#include <Arduino.h>
#include <WiFi.h>
#include <Wire.h>
#include <driver/rtc_io.h>
#include <esp_mac.h>
#include <esp_sleep.h>
#include <string.h>

#include "app_state.h"
#include "audio.h"
#include "button.h"
#include "display.h"
#include "link.h"
#include "settings.h"
#include "slap.h"
#include "tilt.h"

namespace {

// Caption language on this device's screen; kept across deep sleep (not across power loss).
const char* const kLangs[] = {"en", "vi", "ja"};
constexpr int kLangCount = sizeof kLangs / sizeof kLangs[0];
RTC_DATA_ATTR uint8_t g_lang = 0;
TiltDetector g_tilt(IMU_TILT_AXIS, IMU_TILT_SIGN);
uint32_t g_lastTilt = 0;
uint32_t g_savedAt = 0;        // when the server ended the session (0 = it has not)
const char* g_wake = "power";  // what switched the device on: "shake" | "button" | "power"
bool g_bootSession = false;    // the first session follows the switch-on animation, so it does not play again
uint32_t g_idleSince = 0;      // for the standby screen timeout

AppState g_state = AppState::BOOTING;
AppState g_lastServerState = AppState::IDLE;

char g_mac[18];
char g_deviceId[24];
char g_classCode[16];
char g_message[64];
char g_sessionId[48];

uint32_t g_recStart = 0;
uint32_t g_lastActivity = 0;   // deep-sleep idle timer
uint32_t g_wifiBeganAt = 0;
uint32_t g_helloAt = 0;
bool g_waitingState = false;
bool g_linkBegun = false;

// A press or slap made while offline (e.g. the slap that woke the device) is held and sent
// once the link is up, if still recent.
const char* g_pendingButton = nullptr;
uint32_t g_pendingAt = 0;

uint32_t g_lastStat = 0;

void setState(AppState s) {
  if (s == g_state) return;
  Serial.printf("[state] %s -> %s\n", appStateName(g_state), appStateName(s));
  g_state = s;
  g_lastActivity = g_idleSince = millis();
  // Mic slaps only while not recording: during a lecture a loud consonant or a desk thump
  // near the mic must not stop the session (the IMU and REC still can).
  slap_setMicEnabled(s != AppState::BOOTING && s != AppState::RECORDING);
}

void makeIdentity() {
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  snprintf(g_mac, sizeof g_mac, "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  if (DEVICE_ID[0]) snprintf(g_deviceId, sizeof g_deviceId, "%s", DEVICE_ID);
  else snprintf(g_deviceId, sizeof g_deviceId, "slap-%02x%02x%02x", mac[3], mac[4], mac[5]);
}

void sendOrHold(const char* button, uint32_t now) {
  if (link_connected()) {
    link_sendButton(button);
    g_pendingButton = nullptr;
  } else {
    Serial.printf("[btn] %s held until the link is up\n", button);
    g_pendingButton = button;
    g_pendingAt = now;
  }
}

void startWifi() {
  Serial.printf("[wifi] joining '%s'\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  g_wifiBeganAt = millis();
}

// Steps the caption language (dir = -1 left, +1 right; it wraps) and tells the server.
void changeLang(int dir) {
  g_lang = (uint8_t)((g_lang + kLangCount + dir) % kLangCount);
  Serial.printf("[lang] %s\n", kLangs[g_lang]);
  link_setLang(kLangs[g_lang]);
  g_lastActivity = millis();
}

// After a wake by the IMU: true if the motion is a real shake (SHAKE_* in settings.h).
bool confirmShake() {
  if (!slap_imuOk()) return true;   // cannot tell: stay on rather than play dead
  uint32_t t0 = millis(), last = t0, active = 0;
  float g[3];
  while (millis() - t0 < SHAKE_CONFIRM_MS) {
    uint32_t now = millis();
    if (slap_readAccel(g) && fabsf(sqrtf(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]) - 1.0f) > SHAKE_MIN_G) active += now - last;
    last = now;
    if (active >= SHAKE_MIN_MS) return true;
    delay(5);
  }
  Serial.printf("[boot] motion was not a shake (%lu of %d ms): back to sleep\n", (unsigned long)active, SHAKE_MIN_MS);
  return false;
}

// Arms the wake sources (REC, and IMU motion when there is an IMU) and enters deep sleep. Does not return.
void sleepNow() {
  // BOOT held now would wake us at once (ext1 is level-triggered): wait for release.
  for (int i = 0; i < 100 && button_isDown(); i++) delay(50);

  uint64_t mask = 1ULL << PIN_BUTTON;
  if (slap_imuOk()) {
    // Latched INT; retry if a motion is in progress (INT low would wake us immediately).
    bool idle = false;
    for (int i = 0; i < 20 && !(idle = slap_prepareSleep()); i++) delay(50);
    if (idle) mask |= 1ULL << PIN_IMU_INT;
    else Serial.println("[sleep] IMU INT stuck low: IMU wake disabled for this sleep");
  }
  // Both sources are active-low (MPU INT configured active-low push-pull), so one ext1
  // ANY_LOW mask covers both. Keep the RTC IO domain powered so the pull-ups hold.
  rtc_gpio_pullup_en((gpio_num_t)PIN_BUTTON);
  rtc_gpio_pulldown_dis((gpio_num_t)PIN_BUTTON);
  rtc_gpio_pullup_en((gpio_num_t)PIN_IMU_INT);
  rtc_gpio_pulldown_dis((gpio_num_t)PIN_IMU_INT);
  esp_sleep_pd_config(ESP_PD_DOMAIN_RTC_PERIPH, ESP_PD_OPTION_ON);
  esp_sleep_enable_ext1_wakeup_io(mask, ESP_EXT1_WAKEUP_ANY_LOW);
  Serial.flush();
  esp_deep_sleep_start();
}

// saved: a session was just ended, so the screen says where the transcript went.
void enterDeepSleep(const char* why, bool saved = false) {
  Serial.printf("[sleep] %s: deep sleep, wake on REC%s\n", why, slap_imuOk() ? " or a shake" : "");
  if (saved) display_notice("Saved", "See it in the app");
  else display_notice("Asleep", slap_imuOk() ? "Shake to record" : "Press REC to record");
  audio_setStreaming(false);
  link_stop();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  delay(saved ? 1800 : 1200);
  display_off();
  led_off();
  sleepNow();
}

// Hold REC while recording: ask the server to stop, give it up
// to 3 s to confirm with a non-recording `state` so the lecture is closed cleanly, then sleep.
void stopRecordingThenSleep() {
  Serial.println("[btn] REC held while recording: stop, then sleep");
  audio_setStreaming(false);
  if (link_connected()) {
    link_sendButton("boot");
    uint32_t t0 = millis();
    while (g_state == AppState::RECORDING && link_connected() && millis() - t0 < 3000) {
      link_loop(millis(), false);
      led_update(millis(), g_state);
      vTaskDelay(pdMS_TO_TICKS(5));
    }
    if (g_state == AppState::RECORDING) Serial.println("[sleep] no stop confirmation from the server");
  }
  // With its own motion sensor the device sleeps and a shake wakes it. Without one it stays connected,
  // shows the server's "Saved" and goes dark (standby), so a shake can still reach it through the server.
  if (slap_imuOk()) enterDeepSleep("REC held while recording", true);
}

void serialCommands(uint32_t now) {
  while (Serial.available()) {
    int c = Serial.read();
    switch (c) {
      case 'b': Serial.println("[cmd] BOOT press"); sendOrHold("boot", now); break;
      case 'l': Serial.println("[cmd] next language"); changeLang(1); break;
      case 'z': enterDeepSleep("serial command"); break;
      case 'w': {   // scan: shows whether the configured SSID is visible on 2.4 GHz
        Serial.println("[scan] scanning 2.4 GHz...");
        WiFi.disconnect();      // a scan fails (-2) while the station is mid-connect
        delay(300);
        int n = WiFi.scanNetworks();
        bool seen = false;
        for (int k = 0; k < n; k++) {
          bool me = WiFi.SSID(k) == WIFI_SSID;
          seen |= me;
          Serial.printf("[scan] %s ch %d rssi %d '%s'\n", me ? "*" : " ", (int)WiFi.channel(k), (int)WiFi.RSSI(k), WiFi.SSID(k).c_str());
        }
        Serial.printf("[scan] %d networks, '%s' %s\n", n, WIFI_SSID, seen ? "VISIBLE" : "NOT VISIBLE (5 GHz only, hidden, or hotspot asleep)");
        WiFi.scanDelete();
        startWifi();
        break;
      }
      case 'i':
        Serial.printf("[info] fw %s id %s mac %s state %s wifi %d rssi %d ws %d mic %d imu %d heap %u\n",
                      FW_VERSION, g_deviceId, g_mac, appStateName(g_state), WiFi.status() == WL_CONNECTED,
                      (int)WiFi.RSSI(), link_connected(), audio_ok(), slap_imuOk(), (unsigned)ESP.getFreeHeap());
        Serial.printf("[info] ssid '%s' wl_status %d ip %s gw %s mask %s server %s:%d\n", WIFI_SSID, (int)WiFi.status(),
                      WiFi.localIP().toString().c_str(), WiFi.gatewayIP().toString().c_str(),
                      WiFi.subnetMask().toString().c_str(), SERVER_HOST, SERVER_PORT);
        break;
      default: break;
    }
  }
}

}  // namespace

// ---------- callbacks from link.cpp (network task) ----------

void app_onLinkUp() {
  // hello was just sent; the server answers with a `state`.
  g_waitingState = true;
  g_helloAt = millis();
  setState(AppState::CONNECTING);
  if (g_pendingButton) {
    if (millis() - g_pendingAt < SLAP_PENDING_TTL_MS) link_sendButton(g_pendingButton);
    else Serial.printf("[btn] held %s expired\n", g_pendingButton);
    g_pendingButton = nullptr;
  }
}

void app_onLinkDown() {
  audio_setStreaming(false);
  setState(WiFi.status() == WL_CONNECTED ? AppState::CONNECTING : AppState::WIFI);
}

void app_onServerState(AppState s, const char* sessionId, const char* classCode, const char* message) {
  g_waitingState = false;
  snprintf(g_classCode, sizeof g_classCode, "%s", classCode);
  snprintf(g_message, sizeof g_message, "%s", message);
  // REC timer: restart on a new session, keep it across a reconnect into the same one.
  if (s == AppState::RECORDING && g_state != AppState::RECORDING &&
      !(sessionId[0] && !strcmp(sessionId, g_sessionId) && g_lastServerState == AppState::RECORDING)) {
    g_recStart = millis();
    // A session started by a shake while the device was waiting: the slap plays first.
    if (!g_bootSession) display_playSplash(SHAKE_SPLASH_MS);
    g_bootSession = false;
  }
  snprintf(g_sessionId, sizeof g_sessionId, "%s", sessionId);
  g_lastServerState = s;
  // The server ended the session (a stop from the app): show its "Saved" screen, then sleep.
  if (s == AppState::IDLE && g_state == AppState::RECORDING) g_savedAt = millis() ? millis() : 1;
  if (s == AppState::RECORDING) { g_savedAt = 0; g_tilt.reset(); }
  setState(s);
}

// ---------- Arduino ----------

void setup() {
  Serial.begin(115200);

  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  bool wokeImu = false, wokeButton = false;
  if (cause == ESP_SLEEP_WAKEUP_EXT1) {
    uint64_t st = esp_sleep_get_ext1_wakeup_status();
    wokeImu = st & (1ULL << PIN_IMU_INT);
    wokeButton = st & (1ULL << PIN_BUTTON);
    // The wake pins were handed to the RTC IO mux for sleep; give them back to the GPIO
    // matrix before pinMode/attachInterrupt use them.
    rtc_gpio_deinit((gpio_num_t)PIN_BUTTON);
    rtc_gpio_deinit((gpio_num_t)PIN_IMU_INT);
  }

  // I2C first: the IMU is configured before anything slow so the second half of a wake
  // slap is not missed. U8g2 later calls Wire.begin() again on the same pins (harmless).
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 400000);
  slap_begin(wokeImu);

  Serial.printf("\n[boot] Slap fw %s, wake: %s\n", FW_VERSION,
                wokeImu ? "IMU (slap)" : wokeButton ? "BOOT button" : cause == ESP_SLEEP_WAKEUP_UNDEFINED ? "power-on/reset" : "other");

  led_begin();
  button_begin();
  // On = recording, so a wake by motion has to be a deliberate shake, not a knock or a walk in a bag.
  if (wokeImu && !confirmShake()) sleepNow();
  g_wake = wokeImu ? "shake" : wokeButton ? "button" : "power";
  g_bootSession = wokeImu || wokeButton;
  makeIdentity();
  Serial.printf("[boot] id %s mac %s\n", g_deviceId, g_mac);

  display_begin();
  DisplayModel boot{};
  boot.state = AppState::BOOTING;
  boot.micOk = true;
  boot.ssid = WIFI_SSID;
  boot.host = SERVER_HOST;
  display_update(millis(), boot);   // the switch-on art; it stays up for SPLASH_MS

  if (!audio_begin()) Serial.println("[boot] mic unavailable: recording will send nothing");

  WiFi.persistent(false);    // no NVS writes (keeps flash quiet while ISRs run)
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);      // modem sleep adds 100+ ms latency bursts to the audio stream
  WiFi.setAutoReconnect(true);
  startWifi();
  setState(AppState::WIFI);
  g_lastActivity = millis();
}

void loop() {
  uint32_t now = millis();
  serialCommands(now);

  // ---- BOOT button ----
  switch (button_poll(now)) {
    case ButtonEvent::SHORT_PRESS:
      g_idleSince = now;   // lights the screen again in standby
      if (g_state == AppState::RECORDING) {
        Serial.println("[btn] REC: next language");
        changeLang(1);
      } else {
        Serial.println("[btn] REC: start");
        sendOrHold("boot", now);
      }
      break;
    case ButtonEvent::LONG_PRESS:
      if (g_state == AppState::RECORDING) stopRecordingThenSleep();
      else enterDeepSleep("REC held");
      break;
    default: break;
  }

  // ---- Wi-Fi ----
  bool wifiUp = WiFi.status() == WL_CONNECTED;
  if (!wifiUp) {
    if (g_state != AppState::WIFI) {
      Serial.println("[wifi] lost");
      audio_setStreaming(false);
      setState(AppState::WIFI);
      g_wifiBeganAt = now;
    } else if (now - g_wifiBeganAt > WIFI_RETRY_MS) {
      WiFi.disconnect();
      startWifi();
    }
  } else if (g_state == AppState::WIFI) {
    Serial.printf("[wifi] up %s gw %s mask %s rssi %d\n", WiFi.localIP().toString().c_str(),
                  WiFi.gatewayIP().toString().c_str(), WiFi.subnetMask().toString().c_str(), (int)WiFi.RSSI());
    if (!g_linkBegun) {
      link_begin(g_deviceId, g_mac, kLangs[g_lang], g_wake);
      g_linkBegun = true;
    }
    setState(link_connected() ? (g_waitingState ? AppState::CONNECTING : g_lastServerState) : AppState::CONNECTING);
  }

  // ---- WebSocket + audio drain ----
  link_loop(now, g_state == AppState::RECORDING);
  audio_setStreaming(g_state == AppState::RECORDING && link_connected());

  if (g_waitingState && link_connected() && now - g_helloAt > WS_STATE_WAIT_MS) {
    Serial.println("[ws] no state after hello: assuming idle");
    app_onServerState(AppState::IDLE, "", "", "");
  }

  // ---- motion ----
  slap_poll(now);   // keeps the detector's queue drained; slaps no longer start or stop anything
  if (g_state == AppState::RECORDING && now - g_lastTilt >= TILT_SAMPLE_MS) {
    g_lastTilt = now;
    float g[3];
    if (slap_readAccel(g)) {
      int dir = g_tilt.update(g, now);
      if (dir) changeLang(dir);
    }
  }
  if (g_savedAt && now - g_savedAt > SAVED_SHOW_MS) {
    g_savedAt = 0;
    if (slap_imuOk()) enterDeepSleep("session ended by the server", true);
  }
  if (g_pendingButton && now - g_pendingAt > SLAP_PENDING_TTL_MS) {
    Serial.printf("[btn] held %s expired\n", g_pendingButton);
    g_pendingButton = nullptr;
  }
  slap_imuPlot(now);

  // ---- idle deep sleep ----
#if DEEP_SLEEP_IDLE_MIN > 0
  if (g_state == AppState::RECORDING) g_lastActivity = now;
  else if (now - g_lastActivity > (uint32_t)DEEP_SLEEP_IDLE_MIN * 60000u) enterDeepSleep("idle timeout");
#endif

  // ---- LED + OLED ----
  led_update(now, g_state);
  // Standby: waiting for a shake with nothing to show, the screen goes dark after a while.
  display_setPower(!(g_state == AppState::IDLE && now - g_idleSince > STANDBY_SCREEN_MS));
  DisplayModel m;
  m.state = g_state;
  m.wifiUp = wifiUp;
  m.rssi = wifiUp ? (int)WiFi.RSSI() : 0;
  m.wsUp = link_connected();
  m.micOk = audio_ok();
  m.imuOk = slap_imuOk();
  m.classCode = g_classCode;
  m.message = g_message;
  m.ssid = WIFI_SSID;
  m.host = SERVER_HOST;
  m.recStartMs = g_recStart;
  m.level = audio_lastLevel();
  m.retryInMs = link_retryInMs(now);
  display_update(now, m);

  // ---- periodic stats ----
  if (now - g_lastStat > (g_state == AppState::RECORDING ? 10000u : 60000u)) {
    g_lastStat = now;
    Serial.printf("[stat] %s sent %lu dropped %lu queued %u i2s_err %lu heap %u\n", appStateName(g_state),
                  (unsigned long)link_framesSent(), (unsigned long)audio_droppedFrames(), (unsigned)audio_queued(),
                  (unsigned long)audio_readErrors(), (unsigned)ESP.getFreeHeap());
  }

  vTaskDelay(1);   // yield 1 tick so lower-priority work on core 1 runs
}
