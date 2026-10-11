# Measurements still needed (housing v3.0)

Use calipers and give values to 0.1 mm. The SCAD parameter for each value is in brackets.

## OLED module (2.42" SSD1309)
- [x] PCB width, the long side (`oled_pcb_w`): **70.1** (9 Oct)
- [x] PCB height, the short side (`oled_pcb_h`): **48.0** (9 Oct)
- [x] PCB thickness, without the glass (`oled_pcb_t`): **1.0**; whole stack 4.07 (9 Oct)
- [x] Mounting hole diameter (`oled_hole_d`): **about 2.5** (builder, 11 Oct; the reference model had 3.0)
- [ ] Hole centre-to-centre spacing, X (long side): ____ → inset = (PCB width − spacing)/2 (`oled_hole_inset_x`, now 2.0 from the reference model, giving 66.1)
- [ ] Hole centre-to-centre spacing, Y (short side): ____ → inset = (PCB height − spacing)/2 (`oled_hole_inset_y`, now 2.0 from the reference model, giving 44.0). **Coupon result, 11 Oct: the pin rectangle at 66.1 x 44.0 is slightly too small; the board rocks on the pins.** Both spacings are needed before the pins can stay. Measure from the left edge of one hole to the left edge of the next: that distance is the centre-to-centre spacing.
- [ ] Glass position on the PCB: distance from the glass left edge to the PCB left edge ____ and from the glass top edge to the PCB top edge ____ (`oled_glass_dx/dy`)
- [ ] Does the FPC ribbon wrap around a PCB edge? Which edge, and how far does it stick out? ____
- [x] 4-pin header: **on the left short side seen from the front, long pin ends out the back, soldered ends just proud of the front** (builder, 10 Oct; `oled_hdr_side`). Its position along that side is not needed.

## ESP32-S3 dev board (clone)
- [ ] PCB length, without the antenna overhang (`dev_pcb_len`, official 62.74): ____
- [ ] Overall length including the module antenna (official about 69.1): ____ → `dev_ant_overhang`
- [ ] PCB width (`dev_w`, official 25.4): ____
- [ ] Mounting holes? yes / no. If yes, give the diameter and positions: ____
- [ ] How far the USB-C connectors stick out past the PCB edge (`dev_usb_overhang`, assumed 0.8): ____
- [ ] Centre of each USB-C port, measured from the long edge on the 3V3/RST pin side (`dev_usb_uart_u` 6.1, `dev_usb_otg_u` 19.5): UART/COM ____, USB ____
- [ ] Which port is labelled UART/COM: the one nearer the 3V3 pin row? yes / no
- [ ] BOOT button centre, measured from the 3V3-side edge and from the USB edge (`dev_boot_u` 7.8, `dev_boot_v` 13.8): ____ / ____
- [ ] Button top height above the PCB (`dev_btn_h`, assumed 2.0): ____
- [ ] Pin length below the PCB (`dev_pin_below`, assumed 9.0): ____
- [ ] Pin length above the PCB (`dev_pin_above`, assumed 6.0): ____
- [ ] Any components on the bottom (bare) side between the header rows? ____

## INMP441 mic
- [x] PCB diameter (`mic_d`): **14.0** (9 Oct)
- [x] PCB thickness (`mic_pcb_t`, was assumed 1.0): **about 2.0** (builder, 11 Oct). Used as `mic_t` in `mic_snap_coupon.scad`; not yet copied into `housing_slab.scad`.
- [ ] Is the sound port hole at the PCB centre? If not, give its offset: ____ (`mic_port_dx/dy`)

## Cable and LED
- [ ] USB-C cable plug overmold width x height (`usb_plug_w/h`, assumed 13.0 x 7.5 since v3): ____
- [ ] LED flange diameter (assumed 5.8): ____

## Added for the v2.1 slab

- [ ] **ESP32 long pins below the PCB, including the plastic spacer** (`dev_pin_below`, assumed 9.0). At least 6 mm must stick out past the spacer so the Duponts grip.
- [ ] **ESP32 header spacer thickness** (`header_spacer`, 2.5) and the short pins + solder height above the PCB (`dev_pin_above`, assumed 2.5).
- [ ] **ESP32 module shield height** above the PCB (`dev_mod_h`, 3.2). This sets the overall height.
- [ ] **OLED PCB back:** tallest part height (`oled_back_keep`, assumed 1.0), and whether any parts sit over the area where the ESP32 module ends up (the right half of the OLED, seen from the front). If that area is clear, set 0 and save 1 mm. Also check that a 6 mm strip along each short edge is clear for the clips.
- [x] **OLED header:** on the left short side, see the OLED section above. Still to confirm: at least 6 mm of pin sticks out past the spacer on the back.
- [x] **INMP441 headers:** **two 3-pin strips, one on each side** (builder, 11 Oct). Pins stand **about 8.7** tall; if that includes the 2.5 spacer, 6.2 mm of pin is left for the Dupont (6 needed). Still open: their distance from the PCB centre (`mic_hdr_off` 4.5).
- [ ] **F/F Dupont housing length** (`jumper_h`, assumed 14). This sets the height.
- [ ] **ESP32 BOOT key** height above the PCB (`dev_btn_h`, assumed 2.0) and position (`dev_boot_u` 7.8 / `dev_boot_v` 13.8). This sets the button column and the slab length.
- [ ] **ESP32 module:** how far the antenna tip overhangs the PCB (`dev_ant_overhang`, 6.36) and the module PCB thickness at the tip (0.8).
- [ ] **ESP32 underside:** any parts on the bare centre strip where the pedestals sit (u 4.5–20.9, v 9–17 and 44–56)?
- [ ] **5 mm LED:** body diameter and length (5.0 / 8.6).
- [ ] **USB-C cable overmold** width x height (`usb_plug_w/h`, assumed 13.0 x 7.5 since v3).
- [ ] **Rubber feet** diameter (8) and NFC sticker size (30 x 30).
- [x] **After printing the fit-test coupons:** see "Coupon results, 11 Oct" at the end of this file.

## Added for v3.0: SunFounder 10-axis IMU (Qwiic) and Arduino UNO R4 WiFi

The v2.2 IMU list (a GY-87 style board on jumper wires) is dropped: the IMU is the SunFounder 10-axis board on a Qwiic cable to the UNO.

**Print `stl/slab_fit_imu.stl` and `stl/slab_fit_uno.stl` first (both are on the coupon plate).** If both boards drop onto their pegs, only the first two IMU lines and the cable line below are still needed.

IMU (the hole values are estimated from SunFounder's product render; no drawing is published):
- [x] **PCB size**, short side x long side x thickness (`imu_w`, `imu_d`, `imu_pcb_t`): **21 x 28 x 1.6** (builder, 10 Oct)
- [x] **Corner hole spacing**, centre to centre, across the short side and along the long side (`imu_hole_dx`, `imu_hole_dy`): **14 / 21**, the estimate, confirmed by the `fit_imu` coupon (11 Oct). `imu_pegs` is on.
- [ ] **Hole diameter** (`imu_hole_d`, estimated 3.2): ____
- [ ] **Tallest part** on top (`imu_comp_h`, assumed 3.0, the Qwiic sockets): ____
- [ ] **Anything on the underside?** The pad is flat; if parts stick out below, the tape needs to be thicker than they are: ____
- [ ] **Qwiic cable length** (the bay has room to coil 100 mm): ____


UNO R4 WiFi (outline, holes, header height and USB-C position are from Arduino's datasheet ABX00087; these are the values it does not give):
- [ ] **DC jack**: how far it sticks out past the PCB edge (`uno_jack`, scaled 2.2) and its height above the PCB (assumed 11.0): ____ / ____
- [ ] **USB-C**: how far it sticks out past the PCB edge (`uno_usb_over`, scaled 1.5): ____
- [ ] **Longest solder tail under the board** (`uno_standoff` leaves 5.0): ____
- [ ] **PCB thickness** (`uno_pcb_t`, assumed 1.6): ____
- [ ] **Header socket height** above the PCB (`uno_hdr_h`, datasheet 8.5). The lid posts stop 0.5 mm above it: ____

USB-C cables, both:
- [ ] **Overmold width x height** of each cable (`usb_plug_w/h`, now assumed 13.0 x 7.5; the slots are 13.6 x 8.1): ____ / ____

## Coupon results, 11 Oct (v3.2 plate)

| Coupon | Result | Action |
|---|---|---|
| OLED pin frame | Rocks on the pins; the pin rectangle is slightly too small. Holes are about Ø2.5. | Open: needs the two hole spacings (OLED section above) |
| UNO frame | Drops on, sits with a slight rock, lifts off if tilted | None: the lid posts hold it down |
| IMU stub | Drops on, lifts off if tilted | `imu_pegs = true`; tape still holds it down |
| Snap pair | Good | None |
| USB bar | Both plugs pass | None |
| OLED ring | Glass fits | None |
| Mic plate | Pocket (15.2) is loose on the 14.0 board; the builder wants it to snap in | Snap-in holder drawn as its own coupon: `mic_snap_coupon.scad`, plate `print/Slap_fit_mic_snap_black_0.4.3mf`. Fold it into `housing_slab.scad` once it has been tried. |
| Button block | Good | None |
