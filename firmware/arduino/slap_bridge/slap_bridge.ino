#include <Wire.h>
#include <SunFounder_IMU.hpp>
#include <math.h>

// UNO R4 WiFi's small Qwiic socket uses Wire1.
SunFounder_IMU imu(&Wire1);

// One shake starts or stops a recording. A shake is motion that lasts: the acceleration stays
// SHAKE_G away from its recent average for SHAKE_MS in total. A knock on the desk is over in
// tens of milliseconds and turning the case over changes too slowly, so neither adds up.
constexpr float SHAKE_G = 0.40f;           // lower = more sensitive
constexpr float SHAKE_MS = 120.0f;         // lower = fires sooner, but a hard knock may count
constexpr float QUIET_G = 0.15f;
constexpr unsigned long REARM_MS = 500;    // still this long before the next shake counts
constexpr float AVERAGE_MS = 70.0f;        // time constant of the "recent average"
constexpr float LEAK = 0.25f;              // ms of motion forgotten per ms without it
constexpr float MS2_PER_G = 9.80665f;      // the library's read() reports m/s^2 (set_gravity() does not apply to it)

// The sensor hangs on a cable and gets shaken. A contact that opens for an instant can leave the bus
// stuck (every read fails) or reset the sensor (reads work, the values never change). In both cases,
// and when no sensor answers at boot, the board restarts itself and sets the bus and sensor up again.
constexpr int FAILED_READS = 10;           // in a row (about a second, the library prints each one)
constexpr unsigned long FROZEN_MS = 2000;  // a live accelerometer always has noise in its last digits
constexpr unsigned long RETRY_MS = 2000;   // no sensor at boot: look again this often

// Bench helper: 1 prints the readings 20 times a second (acceleration in g, its distance from the
// recent average, and the motion total that decides a shake). The server logs every line, so keep it 0.
#ifndef IMU_PLOT
#define IMU_PLOT 0
#endif

Vector3f avg, last;
bool ready = false, haveAvg = false, fired = false;
unsigned long lastRead = 0, quietSince = 0, changedAt = 0;
int failedReads = 0;
float motionMs = 0;                        // leaky total that decides a shake
float episodeMs = 0, episodePeak = 0;      // reported for motion that did not count

void restart(const char* why) {
  Serial.print("IMU restart: ");
  Serial.println(why);
  Serial.flush();
  NVIC_SystemReset();
}

// A sensor cut off in the middle of a read can hold the data line low for good; nine clock pulses
// make it let go. The clock line is only ever pulled low or released (the bus has its own pull-ups).
void freeBus() {
  for (int i = 0; i < 9; i++) {
    pinMode(WIRE1_SCL_PIN, OUTPUT);
    digitalWrite(WIRE1_SCL_PIN, LOW);
    delayMicroseconds(10);
    pinMode(WIRE1_SCL_PIN, INPUT);
    delayMicroseconds(10);
  }
}

void setup() {
  Serial.begin(115200);
  unsigned long started = millis();
  while (!Serial && millis() - started < 4000) delay(10);
  freeBus();
  Wire1.begin();
  imu.begin();
  ready = imu.is_motion_sensor_found();
  Serial.println(ready ? "IMU ready" : "IMU missing: check Qwiic cable");
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  if (!ready) { delay(RETRY_MS); restart("no sensor"); }
  if (!imu.read()) {
    if (++failedReads >= FAILED_READS) restart("reads failed");
    delay(5);
    return;
  }
  failedReads = 0;
  Vector3f a = imu.get_accel();
  a.x /= MS2_PER_G; a.y /= MS2_PER_G; a.z /= MS2_PER_G;   // to g: every threshold above is in g
  unsigned long now = millis();
  if (!haveAvg) { avg = last = a; haveAvg = true; lastRead = quietSince = changedAt = now; return; }
  if (a.x != last.x || a.y != last.y || a.z != last.z) { last = a; changedAt = now; }
  else if (now - changedAt >= FROZEN_MS) restart("values frozen");
  float dt = (float)(now - lastRead);
  if (dt > 50.0f) dt = 50.0f;
  lastRead = now;

  float dx = a.x - avg.x, dy = a.y - avg.y, dz = a.z - avg.z;
  float moved = sqrtf(dx*dx + dy*dy + dz*dz);
  float k = dt / (AVERAGE_MS + dt);
  avg.x += k * dx; avg.y += k * dy; avg.z += k * dz;

  if (moved > SHAKE_G) {
    motionMs += dt;
    episodeMs += dt;
    if (moved > episodePeak) episodePeak = moved;
  } else {
    motionMs -= dt * LEAK;
    if (motionMs < 0) motionMs = 0;
  }
  if (moved > QUIET_G) quietSince = now;

#if IMU_PLOT
  static unsigned long lastPlot = 0;
  if (now - lastPlot >= 50) {
    lastPlot = now;
    Serial.print("ax:");
    Serial.print(a.x, 2);
    Serial.print(" ay:");
    Serial.print(a.y, 2);
    Serial.print(" az:");
    Serial.print(a.z, 2);
    Serial.print(" moved:");
    Serial.print(moved, 2);
    Serial.print(" motion_ms:");
    Serial.println((int)motionMs);
  }
#endif

  if (!fired && motionMs >= SHAKE_MS) {
    fired = true;   // one event per shake, however long it goes on
    Serial.println("SHAKE");
    digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
  }
  if (now - quietSince >= REARM_MS) {
    // Motion that ended without counting: printed so SHAKE_G and SHAKE_MS can be tuned.
    if (!fired && episodeMs >= 20.0f) {
      Serial.print("motion peak_g=");
      Serial.print(episodePeak, 2);
      Serial.print(" ms=");
      Serial.println((int)episodeMs);
    }
    fired = false;
    motionMs = episodeMs = episodePeak = 0;
  }
  delay(2);
}
