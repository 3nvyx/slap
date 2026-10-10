#include "slap.h"

#include <Arduino.h>
#include <Wire.h>
#include <atomic>
#include <esp_timer.h>

#include "settings.h"

namespace {

// ---------------- MPU6050 registers (register map rev 4.2) ----------------
constexpr uint8_t REG_SMPLRT_DIV = 0x19;
constexpr uint8_t REG_CONFIG = 0x1A;
constexpr uint8_t REG_ACCEL_CONFIG = 0x1C;
constexpr uint8_t REG_MOT_THR = 0x1F;
constexpr uint8_t REG_MOT_DUR = 0x20;
constexpr uint8_t REG_INT_PIN_CFG = 0x37;
constexpr uint8_t REG_INT_ENABLE = 0x38;
constexpr uint8_t REG_INT_STATUS = 0x3A;
constexpr uint8_t REG_ACCEL_XOUT_H = 0x3B;
constexpr uint8_t REG_PWR_MGMT_1 = 0x6B;
constexpr uint8_t REG_PWR_MGMT_2 = 0x6C;
constexpr uint8_t REG_WHO_AM_I = 0x75;

// INT_PIN_CFG bits: 7 INT_LEVEL (1 = active low), 6 INT_OPEN (0 = push-pull),
// 5 LATCH_INT_EN (1 = held until cleared, 0 = 50 us pulse), 4 INT_RD_CLEAR (1 = any read clears).
constexpr uint8_t INT_CFG_AWAKE = 0x80 | 0x10;  // active-low 50 us pulse per event; ISR timestamps edges
constexpr uint8_t INT_CFG_SLEEP = 0x80 | 0x20;  // active-low, latched until INT_STATUS is read: a level ext1 can see
constexpr uint8_t INT_MOT = 0x40;               // INT_ENABLE.MOT_EN and INT_STATUS.MOT_INT

enum HitSrc : uint8_t { SRC_MIC, SRC_IMU, SRC_WAKE };
const char* srcName(uint8_t s) { return s == SRC_MIC ? "mic" : s == SRC_IMU ? "imu" : "wake"; }

struct Hit {
  uint32_t t;
  uint8_t src;
};

// Hit ring shared by the IMU ISR, the audio task and loop(). The critical section
// macros work from both ISR and task context.
constexpr int kRing = 16;
Hit g_ring[kRing];
volatile uint8_t g_head = 0, g_tail = 0;
portMUX_TYPE g_mux = portMUX_INITIALIZER_UNLOCKED;

bool g_imuOk = false;
volatile uint32_t g_imuLastEdge = 0u - 1000u;
uint32_t g_imuIgnoreUntil = 0;   // cold boot: let the accel high-pass settle

std::atomic<bool> g_micEnabled{false};
float g_micBaseline = -1.0f;     // audio task only
std::atomic<uint32_t> g_micBaselinePub{0};
std::atomic<uint32_t> g_micThresholdPub{SLAP_MIC_MIN_RMS};

void IRAM_ATTR pushHit(uint8_t src, uint32_t t) {
  portENTER_CRITICAL_SAFE(&g_mux);
  uint8_t next = (uint8_t)((g_head + 1) % kRing);
  if (next != g_tail) {   // full: drop the new hit (the ring holds 16; a slap needs 2)
    g_ring[g_head].t = t;
    g_ring[g_head].src = src;
    g_head = next;
  }
  portEXIT_CRITICAL_SAFE(&g_mux);
}

// INT is an active-low 50 us pulse per motion event; the MPU may pulse repeatedly while a
// slap rings the case. A pulse starts a new hit only after IMU_QUIET_MS without pulses.
void IRAM_ATTR imuIsr() {
  uint32_t t = (uint32_t)(esp_timer_get_time() / 1000);
  if (t - g_imuLastEdge >= (uint32_t)IMU_QUIET_MS) pushHit(SRC_IMU, t);
  g_imuLastEdge = t;
}

bool imuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(IMU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  return Wire.endTransmission() == 0;
}

bool imuRead(uint8_t reg, uint8_t* buf, uint8_t n) {
  Wire.beginTransmission(IMU_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((uint8_t)IMU_ADDR, n) != n) return false;
  for (uint8_t i = 0; i < n; i++) buf[i] = (uint8_t)Wire.read();
  return true;
}

bool imuConfigure() {
  uint8_t who = 0;
  if (!imuRead(REG_WHO_AM_I, &who, 1)) {
    Serial.printf("[imu] no answer at 0x%02X: IMU disabled (mic-only slap)\n", IMU_ADDR);
    return false;
  }
  if (who != 0x68) Serial.printf("[imu] WHO_AM_I 0x%02X (expected 0x68, clone?): trying anyway\n", who);
  else Serial.println("[imu] MPU6050 WHO_AM_I 0x68");

  uint8_t st;
  imuRead(REG_INT_STATUS, &st, 1);   // clear whatever latched while we slept

  // No DEVICE_RESET: after a deep-sleep wake it would discard the high-pass filter state and
  // blind the detector for ~100 ms right when the second slap arrives. Every register the
  // detector depends on is written explicitly instead.
  bool ok = true;
  ok &= imuWrite(REG_PWR_MGMT_1, 0x00);       // awake, internal 8 MHz clock (gyros are off, no PLL)
  ok &= imuWrite(REG_PWR_MGMT_2, 0x07);       // gyro X/Y/Z standby: only the accelerometer is needed
  ok &= imuWrite(REG_CONFIG, 0x00);           // DLPF off: 260 Hz accel bandwidth keeps the slap's sharp edge
  ok &= imuWrite(REG_SMPLRT_DIV, 0x07);       // 1 kHz data rate (motion detection runs at 1 kHz regardless)
  // ACCEL_CONFIG: AFS_SEL=2 (+-8 g, bits 4:3) | ACCEL_HPF=1 (5 Hz high-pass, bits 2:0).
  // The motion detector compares the HIGH-PASSED acceleration against MOT_THR; with the
  // HPF in its reset state (0) the detector never fires. 5 Hz removes gravity and tilt.
  ok &= imuWrite(REG_ACCEL_CONFIG, 0x10 | 0x01);
  ok &= imuWrite(REG_MOT_THR, IMU_MOT_THR);   // slap profile, ~2 mg/LSB: 150 = ~0.3 g of high-passed accel on any axis
  ok &= imuWrite(REG_MOT_DUR, IMU_MOT_DUR);   // above threshold for this many 1 ms samples
  ok &= imuWrite(REG_INT_PIN_CFG, INT_CFG_AWAKE);
  ok &= imuWrite(REG_INT_ENABLE, INT_MOT);    // only the motion interrupt drives INT
  imuRead(REG_INT_STATUS, &st, 1);
  if (!ok) Serial.println("[imu] register write failed: IMU disabled");
  else Serial.printf("[imu] motion INT on GPIO %d: slap MOT_THR %d (sleep/shake %d) MOT_DUR %d, active-low pulse\n",
                     PIN_IMU_INT, IMU_MOT_THR, IMU_WAKE_THR, IMU_MOT_DUR);
  return ok;
}

}  // namespace

void slap_begin(bool wokeByImu) {
  // A wake by IMU motion is a candidate first half of a double slap: it becomes a slap only if
  // exactly one more hit follows within SLAP_WAKE_WINDOW_MS of boot and the case then goes
  // still. A shake (or a single slap) just wakes the device.
  if (wokeByImu) {
    pushHit(SRC_WAKE, 0);
    // Motion may still be going on (a shake): a new IMU hit needs IMU_QUIET_MS of quiet first.
    g_imuLastEdge = (uint32_t)(esp_timer_get_time() / 1000);
  }

#if IMU_ENABLED
  g_imuOk = imuConfigure();
  if (g_imuOk) {
    if (!wokeByImu) g_imuIgnoreUntil = millis() + 300;
    pinMode(PIN_IMU_INT, INPUT_PULLUP);   // MPU drives push-pull; the pull-up keeps an unwired pin quiet
    attachInterrupt(digitalPinToInterrupt(PIN_IMU_INT), imuIsr, FALLING);
  }
#endif
}

bool slap_imuOk() { return g_imuOk; }

void slap_setMicEnabled(bool on) { g_micEnabled.store(on && SLAP_MIC_ENABLED); }

uint32_t slap_micBaseline() { return g_micBaselinePub.load(); }

uint32_t slap_micThreshold() { return g_micThresholdPub.load(); }

// Audio task, every 10 ms. A slap is an impulse: loud for a few blocks, then gone.
// Speech and music stay loud longer than SLAP_MIC_MAX_HIT_MS and are rejected.
void slap_onMicBlock(uint32_t rms, uint32_t tMs) {
  enum { QUIET, BURST, SUSTAINED };
  static int st = QUIET;
  static uint32_t burstStart = 0;

  if (g_micBaseline < 0) g_micBaseline = (float)rms;   // first block seeds the baseline
  uint32_t thr = (uint32_t)(g_micBaseline * SLAP_MIC_K_X10 / 10.0f);
  if (thr < SLAP_MIC_MIN_RMS) thr = SLAP_MIC_MIN_RMS;
  g_micThresholdPub.store(thr);
  g_micBaselinePub.store((uint32_t)g_micBaseline);

  if (!g_micEnabled.load()) {   // recording (or disabled): freeze the baseline, reset the detector
    st = QUIET;
    return;
  }

  switch (st) {
    case QUIET:
      if (rms > thr) {
        st = BURST;
        burstStart = tMs - 10;   // the block began ~10 ms before it was delivered
      } else {
        // Slow EMA, only on quiet blocks so the slaps themselves do not raise it.
        g_micBaseline += ((float)rms - g_micBaseline) / (float)(1 << SLAP_MIC_BASELINE_SHIFT);
      }
      break;
    case BURST:
      if (rms <= thr) {
        if (tMs - burstStart <= (uint32_t)SLAP_MIC_MAX_HIT_MS + 10) pushHit(SRC_MIC, burstStart);
        st = QUIET;
      } else if (tMs - burstStart > (uint32_t)SLAP_MIC_MAX_HIT_MS + 10) {
        st = SUSTAINED;
      }
      break;
    default:   // SUSTAINED: wait for the sound to end
      if (rms <= thr) st = QUIET;
      break;
  }
}

// Double slap vs shake. A slap is an impulse; a shake is a train of hits or continuous
// motion. So a double slap must be exactly two hits within the window, followed by a still
// case for SLAP_SETTLE_MS. A third hit, or IMU pulses still arriving after the settle window,
// means shake: nothing is sent, and the detector re-arms after SLAP_SHAKE_QUIET_MS of stillness.
bool slap_poll(uint32_t nowMs) {
  enum Phase { IDLE, ARMED, CONFIRM, SHAKE };
  static Phase phase = IDLE;
  static bool haveLast = false, cooling = false;
  static uint32_t firstT = 0, firstWindow = SLAP_WINDOW_MS, secondT = 0, lastT = 0, lastMotion = 0, coolUntil = 0;

  // Drain the ring, then sort by time (mic hits are reported up to ~100 ms late).
  Hit hits[kRing];
  int n = 0;
  portENTER_CRITICAL(&g_mux);
  while (g_tail != g_head && n < kRing) {
    hits[n++] = g_ring[g_tail];
    g_tail = (uint8_t)((g_tail + 1) % kRing);
  }
  portEXIT_CRITICAL(&g_mux);
  for (int i = 1; i < n; i++)
    for (int j = i; j > 0 && (int32_t)(hits[j].t - hits[j - 1].t) < 0; j--) {
      Hit tmp = hits[j];
      hits[j] = hits[j - 1];
      hits[j - 1] = tmp;
    }

  for (int i = 0; i < n; i++) {
    const Hit& h = hits[i];
    if (h.src == SRC_IMU && (int32_t)(h.t - g_imuIgnoreUntil) < 0) continue;
    if (cooling && (int32_t)(h.t - coolUntil) < 0) continue;
    cooling = false;
    // Same physical hit seen by the other sensor (or reported late): merge.
    if (haveLast && (int32_t)(h.t - lastT) < SLAP_MIN_GAP_MS) continue;
    haveLast = true;
    lastT = h.t;

    bool late = phase == ARMED && (int32_t)(h.t - firstT) > (int32_t)firstWindow;
    if (phase == IDLE || late) {   // first hit (a late second hit starts a new pair)
      Serial.printf("[slap] hit %s t=%lu (first)\n", srcName(h.src), (unsigned long)h.t);
      phase = ARMED;
      firstT = h.t;
      firstWindow = h.src == SRC_WAKE ? SLAP_WAKE_WINDOW_MS : SLAP_WINDOW_MS;
    } else if (phase == ARMED) {
      Serial.printf("[slap] hit %s t=%lu (second, +%lu ms), checking for shake\n", srcName(h.src), (unsigned long)h.t,
                    (unsigned long)(h.t - firstT));
      phase = CONFIRM;
      secondT = h.t;
    } else {
      if (phase == CONFIRM) Serial.printf("[slap] hit %s t=%lu (third) -> shake, ignored\n", srcName(h.src), (unsigned long)h.t);
      phase = SHAKE;
      lastMotion = h.t;
    }
  }

  // Time-driven transitions.
  uint32_t edge = g_imuLastEdge;
  switch (phase) {
    case ARMED:
      if ((int32_t)(nowMs - firstT) > (int32_t)firstWindow + SLAP_MIN_GAP_MS) phase = IDLE;   // single hit (or a wake alone)
      break;
    case CONFIRM:
      if ((int32_t)(nowMs - secondT) < SLAP_SETTLE_MS) break;
      // The second slap's own ringing ends well within half the settle time; IMU pulses
      // after that mean the case is still moving (shake).
      if (g_imuOk && (int32_t)(edge - secondT) > SLAP_SETTLE_MS / 2) {
        Serial.println("[slap] motion continues after second hit -> shake, ignored");
        phase = SHAKE;
        lastMotion = edge;
        break;
      }
      Serial.printf("[slap] SLAP (hits %lu ms apart)\n", (unsigned long)(secondT - firstT));
      phase = IDLE;
      cooling = true;
      coolUntil = secondT + SLAP_COOLDOWN_MS;
      return true;
    case SHAKE: {
      uint32_t last = (g_imuOk && (int32_t)(edge - lastMotion) > 0) ? edge : lastMotion;
      if ((int32_t)(nowMs - last) >= SLAP_SHAKE_QUIET_MS) {
        Serial.println("[slap] still again, re-armed");
        phase = IDLE;
      }
      break;
    }
    default:
      break;
  }
  return false;
}

bool slap_prepareSleep() {
  if (!g_imuOk) return true;
  detachInterrupt(digitalPinToInterrupt(PIN_IMU_INT));
  // Sleep profile: the lower "shake" threshold, so a shake or a single slap wakes the device.
  // imuConfigure() restores IMU_MOT_THR (the slap profile) on the next boot.
  imuWrite(REG_MOT_THR, IMU_WAKE_THR);
  imuWrite(REG_INT_PIN_CFG, INT_CFG_SLEEP);
  uint8_t st;
  imuRead(REG_INT_STATUS, &st, 1);   // clear: INT returns high until the next motion
  delay(2);
  return digitalRead(PIN_IMU_INT) == HIGH;
}

void slap_imuPlot(uint32_t nowMs) {
#if IMU_PLOT
  static uint32_t last = 0;
  if (!g_imuOk || nowMs - last < 50) return;
  last = nowMs;
  uint8_t b[6];
  if (!imuRead(REG_ACCEL_XOUT_H, b, 6)) return;
  // +-8 g full scale: 4096 LSB per g.
  float ax = (int16_t)(b[0] << 8 | b[1]) / 4096.0f;
  float ay = (int16_t)(b[2] << 8 | b[3]) / 4096.0f;
  float az = (int16_t)(b[4] << 8 | b[5]) / 4096.0f;
  Serial.printf("ax:%.2f ay:%.2f az:%.2f g:%.2f\n", ax, ay, az, sqrtf(ax * ax + ay * ay + az * az));
#else
  (void)nowMs;
#endif
}
