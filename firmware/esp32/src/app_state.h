// Device state machine states, shared by main, link and display.
#pragma once
#include <stdint.h>

enum class AppState : uint8_t {
  BOOTING,     // local: hardware init
  WIFI,        // local: joining the access point
  CONNECTING,  // local: Wi-Fi up, WebSocket not open yet (or waiting for the first `state`)
  IDLE,        // server: online, no session; a slap or BOOT press asks the server to start
  RECORDING,   // server: session live; audio frames stream up
  ERROR,       // server: error state (message shown)
};

inline const char* appStateName(AppState s) {
  switch (s) {
    case AppState::BOOTING:    return "BOOT";
    case AppState::WIFI:       return "WI-FI";
    case AppState::CONNECTING: return "LINK";
    case AppState::IDLE:       return "READY";
    case AppState::RECORDING:  return "REC";
    case AppState::ERROR:      return "ERROR";
  }
  return "?";
}

// Implemented in main.cpp; called by link.cpp from the network (loop) task.
void app_onLinkUp();
void app_onLinkDown();
void app_onServerState(AppState s, const char* sessionId, const char* classCode, const char* message);
