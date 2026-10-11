#include "audio.h"

#include <Arduino.h>
#include <ESP_I2S.h>
#include <atomic>
#include <math.h>
#include <string.h>

#include "settings.h"
#include "slap.h"

#ifndef AUDIO_I2S_SLOT_RIGHT
#define AUDIO_I2S_SLOT_RIGHT 0   // 1 = read the right slot (only if L/R is tied to 3V3)
#endif

namespace {

// Capture task: above loop() (priority 1) so a blocking socket write or a TCP connect
// in the network task never starves the mic. Same core as loop(); Wi-Fi runs on core 0.
constexpr uint32_t kTaskStackBytes = 6144;   // headroom for Serial.printf when MIC_PLOT is on
constexpr UBaseType_t kTaskPriority = 10;
constexpr BaseType_t kTaskCore = 1;

I2SClass i2s;
bool g_ok = false;

// Everything in the audio path is static: no heap use after audio_begin().
StaticTask_t g_taskTcb;
StackType_t g_taskStack[kTaskStackBytes];
TaskHandle_t g_task = nullptr;

StaticQueue_t g_queueCtl;
uint8_t g_queueStorage[AUDIO_QUEUE_FRAMES * AUDIO_FRAME_BYTES];
QueueHandle_t g_queue = nullptr;

int16_t g_frame[AUDIO_FRAME_SAMPLES];      // 100 ms frame being assembled
uint8_t g_dropScratch[AUDIO_FRAME_BYTES];  // receives the discarded oldest frame

std::atomic<bool> g_streaming{false};
std::atomic<uint32_t> g_levelMaxQ16{0};    // max frame RMS since last take, 0..65535
std::atomic<uint32_t> g_levelLastQ16{0};
std::atomic<uint32_t> g_dropped{0};
std::atomic<uint32_t> g_readErrors{0};

// Queue policy: the newest audio matters most for live captions. If the network task has
// not drained the queue (socket blocked, Wi-Fi stalled), discard the OLDEST frame and keep
// the new one, so the backlog (and caption latency) never exceeds AUDIO_QUEUE_FRAMES x 100 ms.
void pushFrameDropOldest(const int16_t* frame) {
  if (xQueueSend(g_queue, frame, 0) == pdTRUE) return;
  if (xQueueReceive(g_queue, g_dropScratch, 0) == pdTRUE) g_dropped.fetch_add(1);
  if (xQueueSend(g_queue, frame, 0) != pdTRUE) g_dropped.fetch_add(1);   // only producer: should not happen
}

#if !FAKE_AUDIO
int32_t g_raw[AUDIO_BLOCK_SAMPLES];        // one 10 ms block of 32-bit I2S slots

// DC blocker state (24-bit domain).
int32_t g_dcPrevX = 0;
int32_t g_dcPrevY = 0;

int32_t g_x24[AUDIO_BLOCK_SAMPLES];        // the same block as DC-blocked 24-bit samples

// Gain set by AUDIO_SHIFT and AUDIO_GAIN_Q8, as a plain factor on the top 16 mic bits (1.0 = unity).
constexpr float kFixedGain = (float)AUDIO_GAIN_Q8 * (float)(1 << (16 - AUDIO_SHIFT)) / 256.0f;

#if AUDIO_AGC
// Automatic gain: follow the input level and scale it toward AUDIO_AGC_TARGET_RMS, so a
// quiet lecture hall and a loud room both land in the same 16-bit range. The level rises
// fast and falls slowly, so gain drops within a syllable of loud speech and creeps back
// up over seconds of quiet. A per-block limiter handles what the level is too slow for
// (a slap on the case, a door): that block alone is scaled to fit.
constexpr float kAgcAttack = 1.0f / 16.0f;     // per 10 ms block: level rises with tau ~160 ms
constexpr float kAgcRelease = 1.0f / 512.0f;   // level falls with tau ~5 s
constexpr float kAgcMaxStep = 4.0f;            // a block counts as at most 4x the current level
constexpr float kAgcPeakCeiling = 30000.0f;    // limiter: no block is scaled past this peak
constexpr int kAgcHoldBlocks = 50;             // first 0.5 s at the fixed gain: the mic's power-up thump is not a level
float g_agcMinGain = 1.0f;                     // set from the dB limits in audio_begin()
float g_agcMaxGain = 1.0f;
float g_agcEnv = (float)AUDIO_AGC_TARGET_RMS / kFixedGain;   // so the gain starts at the fixed gain
float g_agcGain = kFixedGain;
int g_agcHold = kAgcHoldBlocks;
#endif
std::atomic<int32_t> g_gainQ8{(int32_t)(kFixedGain * 256.0f)};   // gain in use, for logs

// Stage 1: 32-bit I2S slots -> DC-blocked 24-bit samples in x24[]. Returns the block RMS
// in 16-bit units at unity gain and stores the largest magnitude (24-bit) in *peak24.
float filterBlock(const int32_t* raw, int32_t* x24, int32_t* peak24) {
  uint64_t sumSq = 0;
  int32_t peak = 0;
  for (int i = 0; i < AUDIO_BLOCK_SAMPLES; i++) {
    // The INMP441 sends a 24-bit two's-complement sample MSB-first in a 32-bit slot, so the
    // sample sits in bits 31..8 and bits 7..0 are padding (the mic tri-states them; they can
    // read as noise). An arithmetic >> 8 keeps the sign and leaves the 24-bit sample.
    int32_t x = raw[i] >> 8;
#if AUDIO_DC_BLOCK
    // One-pole high-pass y[n] = x[n] - x[n-1] + a*y[n-1], a = 1 - 2^-7, done with shifts:
    // corner ~ (1-a) * 16000 / 2pi = ~20 Hz. Removes the mic's DC offset, which would
    // otherwise eat headroom and bias the RMS used for levels and slap detection.
    int32_t y = x - g_dcPrevX + g_dcPrevY - (g_dcPrevY >> 7);
    g_dcPrevX = x;
    g_dcPrevY = y;
    x = y;
#endif
    x24[i] = x;
    int32_t a = x < 0 ? -x : x;
    if (a > peak) peak = a;
    int64_t u = x >> 8;   // 16-bit units at unity gain
    sumSq += (uint64_t)(u * u);
  }
  *peak24 = peak;
  return sqrtf((float)sumSq / AUDIO_BLOCK_SAMPLES);
}

#if AUDIO_AGC
// Updates the level from this block and returns the gain to end the block on.
float agcUpdate(float inRms, int32_t peak24) {
  if (g_agcHold > 0) {
    g_agcHold--;
    return kFixedGain;
  }
  // One block can pull the level up by at most kAgcMaxStep x, so a 30 ms slap raises it by
  // a few dB (the limiter below covers the slap itself) while speech still gets there in ~100 ms.
  float in = inRms > g_agcEnv * kAgcMaxStep ? g_agcEnv * kAgcMaxStep : inRms;
  g_agcEnv += (in - g_agcEnv) * (in > g_agcEnv ? kAgcAttack : kAgcRelease);
  float envFloor = (float)AUDIO_AGC_TARGET_RMS / g_agcMaxGain;   // below this the gain is at its limit anyway
  if (g_agcEnv < envFloor) g_agcEnv = envFloor;
  float gain = (float)AUDIO_AGC_TARGET_RMS / g_agcEnv;
  if (gain > g_agcMaxGain) gain = g_agcMaxGain;
  if (gain < g_agcMinGain) gain = g_agcMinGain;
  float peak16 = (float)peak24 / 256.0f;
  if (peak16 * gain > kAgcPeakCeiling) gain = kAgcPeakCeiling / peak16;
  return gain;
}
#endif

// Stage 2: 24-bit -> 16-bit PCM with gain, into out[]. Returns the number of clipped samples.
// Dropping the low 8 bits of the 24-bit value maps mic full scale to 16-bit full scale
// (unity = AUDIO_SHIFT 16 counted from the 32-bit slot). The INMP441 is quiet at lecture
// distances (-26 dBFS at 94 dB SPL, so ~-60 dBFS for speech at a few metres), so the gain
// is above unity: fixed at 2^(16-AUDIO_SHIFT) x AUDIO_GAIN_Q8/256, or set per block by the AGC.
int scaleBlock(const int32_t* x24, int16_t* out, float gainStart, float gainEnd) {
  // Q12 gain against the 24-bit sample: s = x24 * g / 2^8 = (x24 * gQ12) >> 20. int64
  // because x24 (up to ~2^24 after the DC filter) times the gain exceeds int32.
  // A falling gain applies at once, so the loud sample that caused it is covered; a rising
  // gain ramps across the block so the step is inaudible.
  int64_t g1 = (int64_t)(gainEnd * 4096.0f);
  int64_t g0 = gainEnd < gainStart ? g1 : (int64_t)(gainStart * 4096.0f);
  int clips = 0;
  for (int i = 0; i < AUDIO_BLOCK_SAMPLES; i++) {
    int64_t g = g0 + (g1 - g0) * (i + 1) / AUDIO_BLOCK_SAMPLES;
    int32_t s = (int32_t)(((int64_t)x24[i] * g) >> 20);
    if (s > 32767) { s = 32767; clips++; }
    else if (s < -32768) { s = -32768; clips++; }
    out[i] = (int16_t)s;   // ESP32 is little-endian: the int16 array IS the LE wire format
  }
  return clips;
}

// Convert one block of 32-bit I2S slots to 16-bit PCM in out[]. Returns the number of
// clipped samples; *slapRms is the block RMS at the fixed gain, which the slap detector
// uses so its thresholds do not move with the AGC.
int convertBlock(const int32_t* raw, int16_t* out, uint32_t* slapRms) {
  int32_t peak24 = 0;
  float inRms = filterBlock(raw, g_x24, &peak24);
  float fixedRms = inRms * kFixedGain;
  *slapRms = fixedRms > 32767.0f ? 32767u : (uint32_t)fixedRms;
#if AUDIO_AGC
  float gainStart = g_agcGain;
  g_agcGain = agcUpdate(inRms, peak24);
  g_gainQ8.store((int32_t)(g_agcGain * 256.0f));
  return scaleBlock(g_x24, out, gainStart, g_agcGain);
#else
  return scaleBlock(g_x24, out, kFixedGain, kFixedGain);
#endif
}
#endif  // !FAKE_AUDIO

#if FAKE_AUDIO
// Synthetic signal for the simulator and pipeline tests: a 440 Hz tone whose loudness
// swells every 2 s. Never used for the demo.
void synthBlock(int16_t* out) {
  static uint32_t phase = 0;
  static uint32_t n = 0;
  const uint32_t step = (uint32_t)((440.0 * 4294967296.0) / AUDIO_SAMPLE_RATE);
  for (int i = 0; i < AUDIO_BLOCK_SAMPLES; i++, n++) {
    float env = 0.15f + 0.1f * sinf(2.0f * (float)M_PI * (float)(n % 32000) / 32000.0f);
    out[i] = (int16_t)(env * 32767.0f * sinf((float)phase * (2.0f * (float)M_PI / 4294967296.0f)));
    phase += step;
  }
}
#endif

void audioTask(void*) {
  int blockIdx = 0;
  uint64_t frameSumSq = 0;
  int framePeak = 0;
  int frameClips = 0;
#if FAKE_AUDIO
  TickType_t lastWake = xTaskGetTickCount();
#endif

  for (;;) {
    int16_t* block = &g_frame[blockIdx * AUDIO_BLOCK_SAMPLES];
#if FAKE_AUDIO
    vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(10));   // real-time pacing
    synthBlock(block);
    int clips = 0;
#else
    // Blocks until the DMA has 10 ms of samples (Stream timeout guards a dead bus).
    size_t got = i2s.readBytes(reinterpret_cast<char*>(g_raw), sizeof(g_raw));
    if (got != sizeof(g_raw)) {
      g_readErrors.fetch_add(1);
      vTaskDelay(pdMS_TO_TICKS(10));
      continue;
    }
    uint32_t slapRms = 0;
    int clips = convertBlock(g_raw, block, &slapRms);
#endif

    // Block statistics (integer math; sumsq of 160 int16 fits easily in uint64).
    uint64_t sumSq = 0;
    int peak = 0;
    for (int i = 0; i < AUDIO_BLOCK_SAMPLES; i++) {
      int32_t v = block[i];
      sumSq += (uint64_t)(v * v);
      int a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
#if FAKE_AUDIO
    uint32_t slapRms = (uint32_t)sqrtf((float)sumSq / AUDIO_BLOCK_SAMPLES);
#endif
    slap_onMicBlock(slapRms, millis());

    frameSumSq += sumSq;
    if (peak > framePeak) framePeak = peak;
    frameClips += clips;

    if (++blockIdx < AUDIO_BLOCKS_PER_FRAME) continue;

    // ---- a full 100 ms frame ----
    blockIdx = 0;
    float rms = sqrtf((float)frameSumSq / AUDIO_FRAME_SAMPLES) / 32768.0f;
    uint32_t q = (uint32_t)(rms * 65535.0f);
    g_levelLastQ16.store(q);
    uint32_t prev = g_levelMaxQ16.load();
    while (q > prev && !g_levelMaxQ16.compare_exchange_weak(prev, q)) {}

#if MIC_PLOT
    // Serial plotter: label:value pairs, one line per 100 ms. Keep under 64 chars
    // so Print::printf stays on its stack buffer (no heap in this task).
    Serial.printf("rms:%u peak:%d clip:%d base:%u thr:%u gain:%d\n", (unsigned)(rms * 32768.0f), framePeak, frameClips,
                  (unsigned)slap_micBaseline(), (unsigned)slap_micThreshold(), audio_gainDb());
#endif
    frameSumSq = 0;
    framePeak = 0;
    frameClips = 0;

    if (g_streaming.load()) pushFrameDropOldest(g_frame);
  }
}

}  // namespace

bool audio_begin() {
  g_queue = xQueueCreateStatic(AUDIO_QUEUE_FRAMES, AUDIO_FRAME_BYTES, g_queueStorage, &g_queueCtl);

#if FAKE_AUDIO
  g_ok = true;
  Serial.println("[audio] FAKE_AUDIO: synthetic 440 Hz tone, mic not used");
#else
  // ESP_I2S (Arduino-ESP32 3.x): setPins(bclk, ws, dout, din). RX only, so dout = -1.
  i2s.setPins(PIN_I2S_BCLK, PIN_I2S_WS, -1, PIN_I2S_DIN);
  i2s.setTimeout(200);   // readBytes() gives up after 200 ms if the clock dies
  // Philips standard mode, 16 kHz, 32-bit slots (the INMP441 needs >= 24 BCLK per slot,
  // and 32-bit capture keeps all 24 bits), mono = one slot only. L/R tied to GND puts the
  // mic in the LEFT slot (WS low).
  g_ok = i2s.begin(I2S_MODE_STD, AUDIO_SAMPLE_RATE, I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO,
                   AUDIO_I2S_SLOT_RIGHT ? I2S_STD_SLOT_RIGHT : I2S_STD_SLOT_LEFT);
  if (!g_ok) {
    Serial.printf("[audio] I2S begin FAILED (err %d)\n", i2s.lastError());
    return false;
  }
  Serial.printf("[audio] I2S ok: bclk %d ws %d din %d, 16 kHz, 32-bit mono %s, shift %d gain %d/256\n",
                PIN_I2S_BCLK, PIN_I2S_WS, PIN_I2S_DIN, AUDIO_I2S_SLOT_RIGHT ? "right" : "left", AUDIO_SHIFT,
                AUDIO_GAIN_Q8);
#if AUDIO_AGC
  g_agcMinGain = powf(10.0f, (float)AUDIO_AGC_MIN_GAIN_DB / 20.0f);
  g_agcMaxGain = powf(10.0f, (float)AUDIO_AGC_MAX_GAIN_DB / 20.0f);
  Serial.printf("[audio] AGC on: target rms %d, gain %d..%d dB, starts at %d dB\n", AUDIO_AGC_TARGET_RMS,
                AUDIO_AGC_MIN_GAIN_DB, AUDIO_AGC_MAX_GAIN_DB, audio_gainDb());
#endif
#endif

  g_task = xTaskCreateStaticPinnedToCore(audioTask, "audio", kTaskStackBytes, nullptr, kTaskPriority, g_taskStack,
                                         &g_taskTcb, kTaskCore);
  return g_ok;
}

bool audio_ok() { return g_ok; }

void audio_setStreaming(bool on) {
  bool was = g_streaming.exchange(on);
  if (was && !on && g_queue) xQueueReset(g_queue);
}

bool audio_popFrame(uint8_t* dst) { return g_queue && xQueueReceive(g_queue, dst, 0) == pdTRUE; }

size_t audio_queued() { return g_queue ? (size_t)uxQueueMessagesWaiting(g_queue) : 0; }

float audio_takeLevel() { return (float)g_levelMaxQ16.exchange(0) / 65535.0f; }

float audio_lastLevel() { return (float)g_levelLastQ16.load() / 65535.0f; }

int audio_gainDb() {
#if FAKE_AUDIO
  return 0;
#else
  return (int)lroundf(20.0f * log10f((float)g_gainQ8.load() / 256.0f));
#endif
}

uint32_t audio_droppedFrames() { return g_dropped.load(); }

uint32_t audio_readErrors() { return g_readErrors.load(); }
