#include <Wire.h>
#include <SunFounder_IMU.hpp>
#include <math.h>

// UNO R4 WiFi's small Qwiic socket uses Wire1.
SunFounder_IMU imu(&Wire1);
constexpr float HIT_G = 1.2f;
constexpr float QUIET_G = 0.35f;
unsigned long firstHit = 0, lastHit = 0, settleAt = 0, cooldownUntil = 0;
bool armed = true, ready = false;
float baseline = 1.0f;

void setup() {
  Serial.begin(115200);
  unsigned long started = millis();
  while (!Serial && millis() - started < 4000) delay(10);
  Wire1.begin();
  imu.begin();
  ready = imu.is_motion_sensor_found();
  if (ready) imu.motion_sensor->set_gravity(1.0f); // keep acceleration in g
  Serial.println(ready ? "IMU ready" : "IMU missing: check Qwiic cable");
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  if (!ready) { delay(1000); return; }
  if (!imu.read()) { delay(10); return; }
  Vector3f a = imu.get_accel(); // manufacturer's library returns g
  float magnitude = sqrtf(a.x*a.x + a.y*a.y + a.z*a.z);
  float spike = fabsf(magnitude - baseline);
  unsigned long now = millis();
  if (spike < QUIET_G) { baseline += 0.02f * (magnitude - baseline); armed = true; }
  if ((long)(now - cooldownUntil) < 0) { delay(5); return; }
  if (settleAt) {
    // A third hit or continued motion rejects shaking.
    if (armed && spike > HIT_G) { settleAt = firstHit = 0; cooldownUntil = now + 1000; }
    else if (now - settleAt >= 300) {
      if (spike < QUIET_G) { Serial.println("SLAP"); digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN)); }
      settleAt = firstHit = 0;
      cooldownUntil = now + 1000;
    }
  } else if (armed && spike > HIT_G && now - lastHit >= 80) {
    armed = false;
    lastHit = now;
    if (firstHit && now - firstHit <= 500) settleAt = now;
    else firstHit = now;
  }
  if (firstHit && !settleAt && now - firstHit > 500) firstHit = 0;
  delay(5);
}
