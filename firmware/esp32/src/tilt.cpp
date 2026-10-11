#include "tilt.h"

#include <math.h>

#include "settings.h"

int TiltDetector::update(const float g[3], uint32_t nowMs) {
  if (!started_) {
    for (int i = 0; i < 3; i++) lp_[i] = base_[i] = g[i];
    started_ = true;
    armed_ = true;
    startMs_ = nowMs;
    overSince_ = underSince_ = 0;
    return 0;
  }
  for (int i = 0; i < 3; i++) lp_[i] += 0.5f * (g[i] - lp_[i]);
  // A shake or a knock is not a tilt: total acceleration far from 1 g restarts the hold timer.
  float mag = sqrtf(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]);
  bool calm = mag > 0.75f && mag < 1.25f;
  float d = (lp_[axis_] - base_[axis_]) * (float)sign_;
  float ad = fabsf(d);

  if (armed_) {
    // Follow slow drift of the resting position (the desk is not level, the device was nudged).
    if (calm && ad < TILT_OFF_G) for (int i = 0; i < 3; i++) base_[i] += 0.02f * (lp_[i] - base_[i]);
    if (nowMs - startMs_ < TILT_SETTLE_MS) return 0;
    if (!calm || ad < TILT_ON_G) { overSince_ = 0; return 0; }
    if (!overSince_) overSince_ = nowMs ? nowMs : 1;
    if (nowMs - overSince_ < TILT_HOLD_MS) return 0;
    armed_ = false;
    firedAt_ = nowMs;
    overSince_ = underSince_ = 0;
    return d > 0 ? 1 : -1;
  }
  // Fired: wait for the device to come back before the next tilt counts.
  if (ad < TILT_OFF_G) {
    if (!underSince_) underSince_ = nowMs ? nowMs : 1;
    if (nowMs - underSince_ >= TILT_RETURN_MS) armed_ = true;
  } else {
    underSince_ = 0;
    // Left lying in the new position: that is the resting position from now on.
    if (calm && nowMs - firedAt_ > TILT_REBASE_MS) {
      for (int i = 0; i < 3; i++) base_[i] = lp_[i];
      armed_ = true;
    }
  }
  return 0;
}
