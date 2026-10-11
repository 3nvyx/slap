// WebSocket link to the server (links2004/WebSockets), protocol per packages/contracts:
//   up:   text JSON hello / button / lang / level / pong, binary 3,200-byte PCM frames
//   down: text JSON state / ping, binary 1,024-byte OLED frames (XBM layout)
// Everything here runs in the network task (Arduino loop()).
#pragma once
#include <stdint.h>

// lang: caption language for this device's screen ("en" | "vi" | "ja"), sent in every hello.
void link_begin(const char* deviceId, const char* mac, const char* lang);
// Call every loop(): socket I/O, reconnect backoff, audio drain, level messages.
// streaming = the device is RECORDING (audio frames are sent only then).
void link_loop(uint32_t nowMs, bool streaming);
void link_stop();

bool link_connected();
uint32_t link_retryInMs(uint32_t nowMs);   // CONNECTING screen: time until the next attempt

bool link_sendButton(const char* button);   // "boot" | "slap"
// Changes the caption language: told to the server now if connected, and in every later hello.
void link_setLang(const char* lang);
uint32_t link_framesSent();
