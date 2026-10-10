# Measurements still needed (housing v2.3)

Use calipers and give values to 0.1 mm. The SCAD parameter for each value is in brackets.

## OLED module (2.42" SSD1309)
- [x] PCB width, the long side (`oled_pcb_w`): **70.1** (9 Oct)
- [x] PCB height, the short side (`oled_pcb_h`): **48.0** (9 Oct)
- [x] PCB thickness, without the glass (`oled_pcb_t`): **1.0**; whole stack 4.07 (9 Oct)
- [ ] Mounting hole diameter (`oled_hole_d`, provisional 2.2): ____
- [ ] Hole centre-to-centre spacing, X (long side): ____ → inset = (PCB width − spacing)/2 (`oled_hole_inset_x`, provisional 3.0)
- [ ] Hole centre-to-centre spacing, Y (short side): ____ → inset = (PCB height − spacing)/2 (`oled_hole_inset_y`, provisional 3.0)
- [ ] Glass position on the PCB: distance from the glass left edge to the PCB left edge ____ and from the glass top edge to the PCB top edge ____ (`oled_glass_dx/dy`)
- [ ] Does the FPC ribbon wrap around a PCB edge? Which edge, and how far does it stick out? ____
- [ ] 4-pin header position: distance from the PCB left edge to the centre of the header ____ (`oled_hdr_x`)

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
- [ ] PCB thickness (`mic_pcb_t`, assumed 1.0): ____
- [ ] Is the sound port hole at the PCB centre? If not, give its offset: ____ (`mic_port_dx/dy`)

## Cable and LED
- [ ] USB-C cable plug overmold width x height (`usb_plug_w/h`, assumed 12.5 x 7.0): ____
- [ ] LED flange diameter (assumed 5.8): ____

## Added for the v2.1 slab

- [ ] **ESP32 long pins below the PCB, including the plastic spacer** (`dev_pin_below`, assumed 9.0). At least 6 mm must stick out past the spacer so the Duponts grip.
- [ ] **ESP32 header spacer thickness** (`header_spacer`, 2.5) and the short pins + solder height above the PCB (`dev_pin_above`, assumed 2.5).
- [ ] **ESP32 module shield height** above the PCB (`dev_mod_h`, 3.2). This sets the overall height.
- [ ] **OLED PCB back:** tallest part height (`oled_back_keep`, assumed 1.0), and whether any parts sit over the area where the ESP32 module ends up (the right half of the OLED, seen from the front). If that area is clear, set 0 and save 1 mm. Also check that a 6 mm strip along each short edge is clear for the clips.
- [ ] **OLED header:** is it on the long edge, and how far is its centre from the PCB centre (`oled_hdr_x`)? Confirm that after soldering at least 6 mm of pin sticks out past the spacer on the inward side.
- [ ] **INMP441 headers:** two 3-pin strips or one 6-pin row? Where are they relative to the PCB centre (`mic_hdr_off` 4.5)? Confirm at least 6 mm of pin points inward.
- [ ] **F/F Dupont housing length** (`jumper_h`, assumed 14). This sets the height.
- [ ] **ESP32 BOOT key** height above the PCB (`dev_btn_h`, assumed 2.0) and position (`dev_boot_u` 7.8 / `dev_boot_v` 13.8). This sets the button column and the slab length.
- [ ] **ESP32 module:** how far the antenna tip overhangs the PCB (`dev_ant_overhang`, 6.36) and the module PCB thickness at the tip (0.8).
- [ ] **ESP32 underside:** any parts on the bare centre strip where the pedestals sit (u 4.5–20.9, v 9–17 and 44–56)?
- [ ] **5 mm LED:** body diameter and length (5.0 / 8.6).
- [ ] **USB-C cable overmold** width x height (`usb_plug_w/h`, assumed 12.0 x 6.5).
- [ ] **Rubber feet** diameter (8) and NFC sticker size (30 x 30).
- [ ] **After printing the fit-test coupons:** note each result against the "What to change after the coupons" table in the README.

## Added for v2.2: IMU (10-DOF, GY-87 style)

- [ ] **IMU PCB** length x width x thickness (`imu_w`, `imu_d`, `imu_pcb_t`; assumed 22 x 17 x 1.6).
- [ ] **Tallest part** on the top side (`imu_comp_h`, assumed 1.2). Are the 0.8 mm strips along the two short edges free of parts? The snap tabs sit there.
- [ ] **Header:** number of pins (`imu_pins`, assumed 8), distance from the row centre to the PCB edge (`imu_pin_inset`, 1.27), spacer thickness (`imu_spacer`, 2.5).
- [ ] **Pin protrusion below the PCB, including the spacer** (`imu_pin_below`, assumed 6.0). At least 6 mm must stick out past the spacer for a Dupont to grip; 6.0 total gives only 3.5.
- [ ] **Mounting holes:** diameter (`imu_hole_d`, assumed 3.0) and centre positions from the PCB centre, +Y toward the edge opposite the header (`imu_holes`, assumed (±8.5, +5.5)). If there are none, delete the pegs (`imu_holes = []`).
- [ ] **Underside:** any parts under the area the pedestal supports (everything except the 3.4 mm header strip)?
