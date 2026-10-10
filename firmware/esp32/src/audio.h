// INMP441 capture: a FreeRTOS task on core 1 reads the I2S mic, converts to the wire
// format (16 kHz, 16-bit signed LE mono), feeds the mic slap detector every 10 ms and,
// while streaming, pushes 3,200-byte frames into a bounded queue (drop-oldest).
#pragma once
#include <stddef.h>
#include <stdint.h>

bool audio_begin();                 // I2S + queue + capture task; false if I2S failed
bool audio_ok();                    // I2S running (always true with FAKE_AUDIO)

// Frames are queued only while streaming is on. Turning it off flushes the queue.
void audio_setStreaming(bool on);

// Non-blocking: copies the oldest queued frame (AUDIO_FRAME_BYTES) into dst.
bool audio_popFrame(uint8_t* dst);
size_t audio_queued();

// Highest 100 ms frame RMS since the last call, 0..1 of full scale (for `level`).
float audio_takeLevel();
// Last frame RMS, 0..1 (for the OLED meter; does not reset).
float audio_lastLevel();

uint32_t audio_droppedFrames();     // frames discarded because the queue was full
uint32_t audio_readErrors();        // short or failed I2S reads
