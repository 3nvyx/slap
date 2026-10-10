// Double-slap detection. Two hit sources feed one event:
//   (a) mic transient: a short burst (<= SLAP_MIC_MAX_HIT_MS) of 10 ms block RMS above
//       max(SLAP_MIC_MIN_RMS, K x running baseline), baseline = slow EMA while idle;
//   (b) MPU6050 motion interrupt on PIN_IMU_INT (active-low pulse), via an ISR.
// Hits closer than SLAP_MIN_GAP_MS are one physical hit (a slap shows up on both sensors).
// A slap = a second hit within SLAP_WINDOW_MS of the first. The server toggles the session.
#pragma once
#include <stdint.h>

// Wire must already be running. wokeByImu: the deep-sleep wake was the IMU interrupt,
// so it counts as the first hit (with the longer SLAP_WAKE_WINDOW_MS, since boot eats time).
void slap_begin(bool wokeByImu);
bool slap_imuOk();

// Called by the audio task once per 10 ms block (RMS in 16-bit units).
void slap_onMicBlock(uint32_t rms, uint32_t tMs);
void slap_setMicEnabled(bool on);
uint32_t slap_micBaseline();
uint32_t slap_micThreshold();

// Called from loop(): consumes queued hits; true once per detected double slap.
bool slap_poll(uint32_t nowMs);

// Before deep sleep: switch the IMU INT to latched level mode (held low until INT_STATUS is
// read) so ext1 can wake on it, and clear any pending interrupt. True if INT is idle (high).
bool slap_prepareSleep();

// IMU_PLOT bench helper: prints accelerometer magnitude at 20 Hz.
void slap_imuPlot(uint32_t nowMs);
