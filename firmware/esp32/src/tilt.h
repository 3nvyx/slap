// Tilt gesture: tip the device to one side and let it come back, to step through the caption languages.
// Pure logic on accelerometer samples (no hardware), so it can be compiled and tested on a computer.
#pragma once
#include <stdint.h>

class TiltDetector {
 public:
  // axis: which accelerometer axis runs left-right across the device (0 = X, 1 = Y, 2 = Z);
  // sign: +1 if that axis reads positive when the right side is tipped down, else -1.
  TiltDetector(int axis, int sign) : axis_(axis), sign_(sign) {}
  // One sample in g, about every TILT_SAMPLE_MS. Returns -1 for a tilt to the left, +1 to the right, else 0.
  int update(const float g[3], uint32_t nowMs);
  void reset() { started_ = false; }

 private:
  int axis_, sign_;
  bool started_ = false, armed_ = true;
  float lp_[3] = {0, 0, 0};     // smoothed acceleration
  float base_[3] = {0, 0, 0};   // gravity while the device rests in its normal position
  uint32_t startMs_ = 0, overSince_ = 0, underSince_ = 0, firedAt_ = 0;
};
