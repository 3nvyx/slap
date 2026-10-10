#include "button.h"

#include <Arduino.h>
#include <esp_timer.h>
#include <soc/gpio_reg.h>

#include "settings.h"

namespace {

// The press edge is captured by an ISR so a press is not lost while loop() is stuck in a
// blocking TCP connect; loop() then follows the level for release / long press.
volatile bool g_pressed = false;
volatile uint32_t g_pressAt = 0;
volatile uint32_t g_lastEdge = 0u - 10000u;

void IRAM_ATTR buttonIsr() {
  uint32_t t = (uint32_t)(esp_timer_get_time() / 1000);
  // Debounce: a falling edge (pin low) is a press only after BUTTON_LOCKOUT_MS without any
  // edge, so press bounces and release bounces are ignored. The pin is read straight from
  // the GPIO input register: the ISR runs from IRAM and must not call flash code.
  bool low = ((REG_READ(GPIO_IN_REG) >> PIN_BUTTON) & 1u) == 0;
  if (low && t - g_lastEdge >= (uint32_t)BUTTON_LOCKOUT_MS) {
    g_pressed = true;
    g_pressAt = t;
  }
  g_lastEdge = t;
}

enum { B_IDLE, B_DOWN, B_LONG_FIRED } g_bstate = B_IDLE;

uint32_t g_slapFlashAt = 0;
bool g_slapFlash = false;

}  // namespace

void button_begin() {
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_BUTTON), buttonIsr, CHANGE);
}

bool button_isDown() { return digitalRead(PIN_BUTTON) == LOW; }

ButtonEvent button_poll(uint32_t nowMs) {
  switch (g_bstate) {
    case B_IDLE:
      if (g_pressed) {
        g_pressed = false;
        g_bstate = B_DOWN;
      }
      return ButtonEvent::NONE;
    case B_DOWN:
      if (!button_isDown() && nowMs - g_lastEdge > (uint32_t)BUTTON_LOCKOUT_MS) {
        // Released and stable. A press shorter than the loop latency still counts.
        g_bstate = B_IDLE;
        return ButtonEvent::SHORT_PRESS;
      }
      if (button_isDown() && nowMs - g_pressAt >= BUTTON_LONG_MS) {
        g_bstate = B_LONG_FIRED;
        return ButtonEvent::LONG_PRESS;
      }
      return ButtonEvent::NONE;
    default:   // B_LONG_FIRED: wait for release
      if (!button_isDown()) {
        g_bstate = B_IDLE;
        g_pressed = false;
      }
      return ButtonEvent::NONE;
  }
}

void led_begin() {
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);
}

void led_flashSlap(uint32_t nowMs) {
  g_slapFlash = true;
  g_slapFlashAt = nowMs;
}

void led_off() { digitalWrite(PIN_LED, LOW); }

void led_update(uint32_t nowMs, AppState s) {
  bool on;
  if (g_slapFlash && nowMs - g_slapFlashAt < 480) {
    // Double blink: on 80, off 80, on 80, off 240 ms.
    uint32_t p = nowMs - g_slapFlashAt;
    on = p < 80 || (p >= 160 && p < 240);
  } else {
    g_slapFlash = false;
    switch (s) {
      case AppState::RECORDING: on = true; break;
      case AppState::BOOTING:
      case AppState::WIFI:
      case AppState::CONNECTING: on = (nowMs % 1000) < 500; break;   // slow blink, 1 Hz
      case AppState::ERROR: on = (nowMs % 200) < 100; break;          // fast blink, 5 Hz
      default: on = false; break;
    }
  }
  digitalWrite(PIN_LED, on ? HIGH : LOW);
}
