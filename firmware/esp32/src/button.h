// BOOT button (GPIO 0, active low) and the recording LED (GPIO 2).
#pragma once
#include <stdint.h>

#include "app_state.h"

enum class ButtonEvent : uint8_t { NONE, SHORT_PRESS, LONG_PRESS };

void button_begin();
// Short press = released before BUTTON_LONG_MS. Long press fires while still held.
ButtonEvent button_poll(uint32_t nowMs);
bool button_isDown();

void led_begin();
// Base pattern from the state: solid while RECORDING, slow blink while BOOTING/WIFI/CONNECTING,
// fast blink on ERROR, off otherwise. led_flashSlap() overlays a double blink.
void led_update(uint32_t nowMs, AppState s);
void led_flashSlap(uint32_t nowMs);
void led_off();
