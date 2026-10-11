# Testing the device screen from another machine

Updated 2026-10-10. Agent-facing: one rule per line, imperative, no padding. Match this style when editing.

## Constraints

- The board is plugged into one Mac (git user `3nvyx`). Only that machine can flash firmware or read the serial log.
- The device connects to one server: `SERVER_HOST:SERVER_PORT` compiled into the firmware. Changing it needs a reflash on that Mac.
- `firmware/esp32/include/config.h` is git-ignored. A `git pull` never changes where a device connects, and never brings the other machine's Wi-Fi or `DEVICE_KEY`.
- Nobody on the other machine can see the glass. Never report that a screen looks right on the hardware without a photo or a camera view from the person at the board.
- `firmware/`, `hardware/` and `screen-lab/` belong to the hardware session on the `3nvyx` Mac. Do not edit them from another session without asking.
- Never stop the process on port 8787 on the `3nvyx` Mac without asking; a bench test may be using it.

## Where the pixels come from

- Server frames: `apps/api/src/oled.ts` renders each 128 x 64 one-bit frame; `apps/api/src/ws/device.ts` picks the screen for the device state and resends it every `FRAME_REFRESH_MS` (3 s) over `/ws/device`.
- Firmware screens: `firmware/esp32/src/display.cpp` draws the switch-on art, "Joining Wi-Fi", "Connecting", "Starting", "Saved" and "Asleep", and its own recording and error screens, when no server frame arrived within `OLED_SERVER_FRAME_TTL_MS` (5 s, `firmware/esp32/include/settings.h`).
- USB carries power, flashing and the serial log only. No frame travels over USB.
- A change to `oled.ts` or `ws/device.ts` needs no flash. A change to `display.cpp` needs a flash.

## Methods, cheapest first

### 1. No hardware: print the frames

Use this for any server-side screen change before involving the board.

Start the API (`pnpm dev` from the repo root), then from `apps/api`:

```sh
node --env-file-if-exists=../../.env.local src/scripts/fake_device.ts --show-oled
```

`--show-oled` prints every frame the server sends as ASCII. The server starts a session as soon as the fake device says hello; `--no-start` then sends no audio, so the screen stays on "Listening...".
For layout, font and language work use `screen-lab/` (see `screen-lab/README.md`); it draws with the server's own font files and matches its line breaks and text position; single pixels on letter edges differ.

### 2. Push and pull

- Push a branch from the editing machine.
- Pull it on the `3nvyx` Mac. `pnpm dev` runs `node --watch`, so the API restarts on the changed file.
- The device reconnects by itself (backoff 2 s, doubling to 30 s) and shows the new frame.
- Needs no flash and no network change.

### 3. Device pointed at the other machine's API

- Both machines and the device must be on the same network. The device joins 2.4 GHz only. Campus and venue networks often block device-to-device traffic; use a phone hotspot if the connection never opens.
- On an iPhone hotspot a Mac can end up IPv6-only (`ipconfig getifaddr en0` prints nothing), and the device, which is IPv4 only, cannot reach it. Give the Mac a fixed address while on the hotspot: `sudo networksetup -setmanual Wi-Fi 172.20.10.14 255.255.255.240 172.20.10.1`, and use that as `SERVER_HOST`. Run `sudo networksetup -setdhcp Wi-Fi` before joining any other network.
- On the `3nvyx` Mac set `SERVER_HOST` in `firmware/esp32/include/config.h` to the other machine's address (`ipconfig getifaddr en0` there), `SERVER_PORT 8787`, `SERVER_TLS 0`.
- The other machine's `DEVICE_KEYS` (in `.env.local`) must contain the firmware's `DEVICE_KEY`. The default when unset is `dev-device-key`.
- Flash on the `3nvyx` Mac: `cd firmware/esp32 && ~/.local/bin/pio run -t upload`.
- After that, every save on the other machine restarts its API and updates the screen within 3 s.

### 4. Tunnel (different networks)

- Run the API on the editing machine and expose `localhost:8787` through a tunnel with a fixed hostname.
- In `config.h` set `SERVER_HOST` to that hostname, `SERVER_PORT 443`, `SERVER_TLS 1`, then flash once.
- The firmware does not verify the certificate (`setInsecure()`); acceptable for testing only.

### 5. Remote shell into the `3nvyx` Mac

- The only method that covers firmware changes: edit that checkout over SSH or a shared editor session, then run `pio` there.
- Coordinate with the hardware session first; it has uncommitted work in the same tree.

## Check that the device is connected

- Serial log on the `3nvyx` Mac (`~/.local/bin/pio device monitor`): `[wifi] up <ip>` then `[ws] connected <host>:<port>/ws/device`.
- API log: lines prefixed `[device]`.
- Glass showing LINK or WI-FI means no server connection.
- `GET /api/devices` lists exactly the devices that are connected now (there is no pairing). A device that is absent from it is not connected to this API.

## State on 2026-10-10

- `config.h` on the `3nvyx` Mac had a `SERVER_HOST` that was no longer that Mac's address (it had changed networks), and the API's device list showed only `fake-device-1`, offline.
- Verify `SERVER_HOST` against `ipconfig getifaddr en0` before debugging anything else.
