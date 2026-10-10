// =====================================================================
// SLAP desk housing - v2 "slab" (Teenage Engineering-style flat slab)
// ESP32-S3-DevKitC-1 (N16R8 clone) + 2.42" SSD1309 OLED + INMP441 + 5 mm LED
//
// Units: mm. OpenSCAD 2021.01+; verified with the 2026.10.05 snapshot:
//   openscad --backend=Manifold -o stl/slab_top.stl -D 'part="top"' housing_slab.scad
//
// Coordinates (assembly): X = length (centred, dev-board USB end at +X),
// Y = depth (centred, +Y = back), Z = up (0 = desk).
//
// SCREWLESS. Parts:
//   top       2.0 mm top plate + 3 mm registration skirt. Carries the flush OLED
//             window, seat and 4 necked pegs, 8x7 mic grille + mic ring, 12 mm
//             button bore + guide, 3 mm LED window + socket, engraved labels,
//             skirt windows for the snap hooks, 2 hold-down posts for the board.
//   tray      floor + walls: 5 cantilever snap hooks, two tall dev-board pedestals
//             (Duponts hang from the long pins below the board), 2 board snap tabs,
//             antenna catch, USB-C slot (right end wall), pry slot (back edge),
//             rubber-foot recesses and NFC recess underneath.
//   button    captive orange record button (collar under the top plate) over BOOT.
//   oled_clip removable fork clip that snaps onto the OLED peg necks (print 2).
//   labels    optional 0.4 mm inlay bodies for a dark second filament.
// v2.2: 10-DOF IMU (GY-87 style) on its own rigid floor pedestal left of the
//       dev board's antenna end, under the OLED; pocket + 2 pegs + 2 snap tabs.
// colour() is used only in assembly(); exported parts carry no colour.
// =====================================================================

/* [Render] */
part = "assembly"; // [assembly, top, tray, button, oled_clip, labels, fit_tests, fit_oled_ring, fit_oled_frame, fit_mic, fit_usb, fit_boot, fit_snap, fit_imu, clash_check]
print_orient    = true;   // single parts come out in print orientation
show_components = true;   // ghost PCBs / Dupont housings (F5 preview only)
show_text       = true;   // engraved labels on/off
$fn = 48;

/* [FDM tolerances: Bambu P2S, 0.4 nozzle, PLA - tune these after the coupons] */
tol_hole     = 0.3;   // added to the DIAMETER of every printed round hole/bore
tol_fit      = 0.2;   // per side: sliding, press and registration fits
tol_snap     = 0.25;  // snap beam face to catch face
tol_window   = 0.3;   // per side: windows and panel cut-outs (0.4 printed slightly loose on the glass)
tol_efoot    = 0.3;   // first-layer chamfer / inset on bed faces
tol_min_wall = 1.2;
tol_min_feat = 0.8;
tol_shaft    = 0.3;   // button cap diameter under its bore (nominal)
tol_text_stroke = 0.5;
tol_text_depth  = 0.4;

/* [Slab] */
L_min    = 104;   // target length; grows if the parts need more (see echo)
W_min    = 50;    // target depth; grows if the parts need more
corner_r = 3;
top_chamfer = 0.8;
wall     = 2.0;
plate_t  = 2.0;
skirt_h  = 3.0;
skirt_t  = 1.2;
floor_t  = 2.0;

/* [Snap hooks (tray) / catches (top skirt)] */
hook_w        = 5.0;   // along the wall
hook_t        = 1.2;   // beam thickness
hook_len      = 9.0;   // free beam length below the lip
hook_lip      = 0.8;
hook_return   = 35;    // lip underside angle from horizontal (90 = permanent)
skirt_strip   = 1.2;   // skirt left below the catch window
pry_w = 3;  pry_d = 1;

/* [Height budget] */
// v2.1: Duponts plug onto the LONG pins under the dev board and hang down;
// the board sits component-side up on two pedestals.
floor_clear    = 0.5;   // floor to the wire bend under the Duponts
wire_bend      = 2.0;   // wire exits the housing end and turns horizontal
jumper_h       = 14.0;  // ASSUMED F/F Dupont housing length
jumper_w       = 2.54;
jumper_grip    = 6.0;   // pin length a Dupont needs to hold
header_spacer  = 2.5;   // DATASHEET plastic spacer of a 2.54 mm header
dev_pin_below  = 9.0;   // ASSUMED PCB bottom to long-pin tip (incl. spacer, user est. 8.5-9)
dev_pcb_t      = 1.6;   // DATASHEET
dev_pin_above  = 2.5;   // ASSUMED short pins + solder above the PCB (pre-soldered header)
top_clear      = 0.5;   // tallest board part (module shield) to the OLED back parts
oled_back_keep = 1.0;   // ASSUMED parts on the OLED PCB back

/* [OLED 2.42" SSD1309] */
oled_glass_w   = 62.81; // MEASURED
oled_glass_h   = 39.85; // MEASURED
oled_stack_t   = 4.07;  // MEASURED glass + PCB (9 Oct)
oled_pcb_t     = 1.0;   // MEASURED (9 Oct)
oled_pcb_w     = 70.1;  // MEASURED (9 Oct)
oled_pcb_h     = 48.0;  // MEASURED (9 Oct)
oled_pegs      = false; // pegs need the real hole positions; the v2.2 guess missed. Off until measured.
oled_post      = 4.0;   // tray corner posts that press the PCB up into the lid pocket (sandwich hold)
oled_post_gap  = 0.15;  // post top below the PCB back
oled_glass_dx  = 0;     // ASSUMED glass centred on PCB
oled_glass_dy  = 0;
oled_hole_inset_x = 3.0; // ASSUMED
oled_hole_inset_y = 3.0; // ASSUMED
oled_hole_d    = 2.2;    // ASSUMED (M2 clearance)
oled_fence_h   = 1.0;
oled_fence_t   = 0.8;
oled_proud     = 0;
oled_hdr_x     = 0;      // header centre along the BACK edge, from PCB centre
oled_hdr_pins  = 4;
peg_neck_d     = 1.2;    // clip groove on the peg
clip_t         = 1.2;
clip_w         = 6.0;
clip_snap      = 0.2;    // clip slot narrower than the neck (diameter)

/* [Mic INMP441 + grille] */
mic_d        = 14.0;  // MEASURED (9 Oct)
mic_clear    = 0.45;  // per side: the 0.2 (tol_fit) pocket printed too small for the 14 mm board
mic_pcb_t    = 1.0;   // ASSUMED
mic_ring_t   = 1.2;
mic_ring_h   = 1.2;
mic_hdr_off  = 4.5;   // two 3-pin strips along Y at mic x +/- this
grille_cols  = 8;
grille_rows  = 7;
grille_hole  = 1.2;   // nominal printed hole
grille_pitch = 2.2;
grille_cy    = 12.5;  // grille centre Y (mic centred under the middle row)
mic_dx       = -1.1;  // mic centre from grille centre: port under a hole

/* [LED] */
led_mode     = "window"; // [window, hole]
led_win      = 3.0;   // nominal window diameter
led_skin     = 0.4;
led_d        = 5.0;   // DATASHEET 5 mm LED body
led_top_gap  = 1.0;   // dome top below the top surface
led_boss_depth = 6.0;
led_dy       = 1.1;   // half a grille pitch back: clears the board's back snap tab

/* [Record button (BOOT plunger)] */
btn_cap      = 12.0;  // nominal cap diameter
btn_proud    = 1.0;
btn_guide_wall = 1.2;
btn_stroke   = 1.0;   // upward play, covers board-height tolerance
btn_flange   = 13.6;
btn_flange_t = 0.8;
btn_shaft    = 6.0;
btn_nose     = 3.5;
btn_collar_clear = 0.3; // collar above the short pins / BOOT

/* [Hold-down posts on the USB-C shells] */
post_d = 4.0;

/* [Dev board ESP32-S3-DevKitC-1 (Espressif drawing v1.1)] */
dev_pcb_len      = 62.74; // DATASHEET
dev_w            = 25.4;  // DATASHEET
dev_ant_overhang = 6.36;  // DATASHEET (scaled from drawing)
dev_mod_w        = 18.0;
dev_mod_len      = 25.5;
dev_mod_pcb_t    = 0.8;
dev_mod_h        = 3.2;
dev_pin_inset    = 1.27;  // DATASHEET
dev_pin_v0       = 8.0;   // DATASHEET
dev_pins         = 22;
dev_usb_overhang = 0.8;   // ASSUMED
dev_usb_gap      = 0.2;   // connector face to the inner wall face (was 0.5)
dev_usb_uart_u   = 6.1;   // DATASHEET (scaled)
dev_usb_otg_u    = 19.5;  // DATASHEET (scaled)
dev_usb_w        = 8.94;
dev_usb_h        = 3.26;  // DATASHEET (USB-C receptacle)
dev_boot_u       = 7.8;   // DATASHEET (scaled)
dev_boot_v       = 13.8;  // DATASHEET (scaled)
dev_btn_h        = 2.0;   // ASSUMED

/* [Board holder] */
pad_u0 = 4.5;  pad_u1 = 20.9;
pad_a_v = [9, 17];
pad_b_v = [44, 56];
tab_v = 3.5;  tab_w = 4.0;  tab_t = 1.6;  tab_lip = 0.8;   // snap tabs (IMU only; the board tabs snapped on the first print)
// v2.3: the USB end of the board sits in a cradle fused to the end wall instead of on snap tabs:
// a ledge under the pin-free strip (v 0..cradle_v), cheeks beside the PCB edges to locate it,
// hold-down from the lid posts on the USB shells. Nothing flexes, so pulling the cable loads the wall.
cradle_v      = 6.3;   // reaches to 0.4 before the first Dupont housing (pins start at v 8)
cradle_edge   = 1.2;   // full-height strip under each PCB edge
cradle_drop   = 1.2;   // ledge drop under the rest of the strip (USB shell anchor legs poke through)
cheek_t       = 2.0;
cheek_up      = 2.0;   // cheek height above the PCB top

/* [IMU 10-DOF (MPU6050 + HMC5883L + BMP180, GY-87 style) - all ASSUMED] */
imu_enable  = true;
imu_w       = 22.0;   // ASSUMED PCB length (along X, header edge)
imu_d       = 17.0;   // ASSUMED PCB width (along Y)
imu_pcb_t   = 1.6;    // ASSUMED
imu_comp_h  = 1.2;    // ASSUMED tallest part on top
imu_pins    = 8;      // ASSUMED pins in the header row (5 used: VCC GND SCL SDA INT)
imu_pin_inset = 1.27; // ASSUMED row centre from the header edge
imu_spacer  = 2.5;    // ASSUMED header plastic spacer under the PCB
imu_pin_below = 6.0;  // ASSUMED pin protrusion below the PCB (incl. spacer)
imu_holes   = [[-8.5, 5.5], [8.5, 5.5]];  // ASSUMED mounting holes from PCB centre (+Y = far edge)
imu_hole_d  = 3.0;    // ASSUMED
imu_cy      = 8.0;    // PCB centre Y (header edge toward the front)
imu_strip   = 3.4;    // pedestal starts this far from the header edge (clears spacer + Duponts)
imu_fence_h = 1.0;    // locating fence on the far edge
imu_peg_h   = 1.4;    // peg length above the pedestal (< PCB + parts)
catch_engage = 2.0;  catch_back = 2.0;  catch_w = 10;  catch_jaw_t = 1.5;

/* [USB-C slot, right end wall] */
usb_slot_mode = "uart"; // [uart, both, two]
usb_plug_w = 12.0;      // ASSUMED cable overmold
usb_plug_h = 6.5;       // ASSUMED

/* [Labels] */
label_font = "Helvetica Neue:style=Bold";
brand_text = "SLAP";
brand_size = 4.0;
rec_text   = "REC";
rec_size   = 3.6;
text_grow  = 0.05;

/* [Underside] */
nfc_side  = "bottom"; // [bottom, none]
nfc_size  = 30;
nfc_depth = 0.4;
nfc_cx    = -28.5;
nfc_cy    = 0;
foot_d     = 8;
foot_depth = 0.6;
foot_inset = 5.5;

// =====================================================================
// Derived (do not edit)
// =====================================================================
function hole(d) = d + tol_hole;      // printed round hole for nominal d

oled_seat      = oled_stack_t - oled_pcb_t - oled_proud;
oled_pocket_w  = oled_pcb_w + 2*tol_fit;
oled_pocket_h  = oled_pcb_h + 2*tol_fit;
oled_win_w     = oled_glass_w + 2*tol_window;
oled_win_h     = oled_glass_h + 2*tol_window;
oled_peg_d     = oled_hole_d - 2*tol_fit;          // pin into a real (unprinted) hole
mic_pocket_dia = hole(mic_d + 2*mic_clear);
mic_ring_r     = mic_pocket_dia/2 + mic_ring_t;
led_bore       = hole(led_d);                       // snug press for the LED body
led_boss_r     = led_bore/2 + tol_min_wall;
led_win_d      = hole(led_win);
btn_bore       = hole(btn_cap + tol_shaft);         // prints ~ cap + 0.3
btn_guide_r    = btn_bore/2 + btn_guide_wall;
grille_hole_d  = min(hole(grille_hole), grille_pitch - tol_min_feat);
grille_span_x  = (grille_cols - 1)*grille_pitch + grille_hole_d;
grille_span_y  = (grille_rows - 1)*grille_pitch + grille_hole_d;

oled_left_k = wall + tol_fit + skirt_t + tol_snap + hook_t + 0.3 + oled_fence_t; // outer edge to PCB pocket
k_boot      = wall + dev_usb_gap + dev_usb_overhang + dev_boot_v;                // right outer edge to BOOT
L_req = k_boot - mic_dx + mic_ring_r + oled_left_k + oled_pocket_w + oled_fence_t + 0.3;
W_req = oled_pocket_h + 2*(0.2 + skirt_t + tol_fit + wall);   // long-side skirt doubles as OLED fence
L = max(L_min, ceil(L_req*2)/2);
W = max(W_min, ceil(W_req*2)/2);

// heights
jumper_bot = floor_t + floor_clear + wire_bend;          // Dupont housing bottom end
pcb_z0  = jumper_bot + jumper_h + header_spacer;          // housing pushed up to the spacer
pcb_top = pcb_z0 + dev_pcb_t;
// the module end of the board is under the OLED
H_oled = pcb_top + dev_mod_h + top_clear + oled_back_keep + oled_stack_t;
// the button column: collar clears the short pins, upward play, then the lid
btn_bore_tmp  = btn_cap + tol_shaft + tol_hole;
collar_bot    = pcb_top + dev_pin_above + btn_collar_clear;
collar_seat   = collar_bot + btn_flange_t + (btn_flange - btn_bore_tmp)/2;  // cone touches the bore
H_btn  = collar_seat + btn_stroke + plate_t;
H_usb  = pcb_top + dev_usb_h + tol_fit + plate_t + 1;     // posts at least 1 mm long
H = max(H_oled, H_btn, H_usb);
tray_h = H - plate_t;
jumper_top = pcb_z0 - header_spacer;                      // top of the hanging Duponts

// shell rings
in_hx = L/2 - wall;           in_hy = W/2 - wall;
sk_ox = in_hx - tol_fit;      sk_oy = in_hy - tol_fit;     // skirt outer
sk_ix = sk_ox - skirt_t;      sk_iy = sk_oy - skirt_t;     // skirt inner
beam_fx = sk_ix - tol_snap;   beam_fy = sk_iy - tol_snap;  // hook beam outer face

// hook heights
skirt_bot = tray_h - skirt_h;
z_wb   = skirt_bot + skirt_strip;                     // catch window bottom
d_ret  = hook_lip*tan(hook_return);
z_lip  = z_wb + 0.05 + d_ret*(1 - tol_snap/hook_lip); // lip tip underside
z_tip  = z_lip + 0.4 + hook_lip;
z_wt   = z_tip + tol_snap;
z_root = z_lip - d_ret - hook_len;

// OLED placement
oled_cx = -L/2 + oled_left_k + oled_pocket_w/2;
oled_cy = 0;
oled_fence_end = oled_cx + oled_pocket_w/2 + oled_fence_t;

// control column and dev board
x_usb   = L/2 - wall - dev_usb_gap - dev_usb_overhang;            // PCB USB edge
mic_reach = 2.54 + jumper_w/2;                                     // mic Dupont half-span in Y
dev_y_f = grille_cy - mic_reach - 0.2 - dev_w;                     // board front edge (3V3 row side)
function dev_xy(u, v) = [x_usb - v, dev_y_f + u];
boot_xy = dev_xy(dev_boot_u, dev_boot_v);
btn_top = pcb_top + dev_btn_h;
uart_y  = dev_y_f + dev_usb_uart_u;
otg_y   = dev_y_f + dev_usb_otg_u;
usb_z   = pcb_top + dev_usb_h/2;
gx = boot_xy[0];
gy = grille_cy;
mic_xy = [gx + mic_dx, gy];
led_xy = [sk_ix - 0.2 - led_boss_r, gy + led_dy];
posts  = [[x_usb - 3.5, uart_y], [x_usb - 3.5, otg_y]];

// button (modelled nose-down, z = 0 at the nose tip, at rest on BOOT)
btn_len      = H + btn_proud - btn_top;
btn_cone_h   = (btn_flange - btn_cap)/2;
btn_flange_z = collar_bot + btn_flange_t + btn_cone_h - btn_top;  // top of the collar cone = cap start
btn_nose_l   = collar_bot - btn_top;
btn_guide_depth = H - (collar_seat + btn_stroke);                // bore length from the top surface

// hooks: [wall, position along the wall]
hx1 = oled_fence_end + 0.3 + hook_w/2;
hx2 = sk_ix - 0.3 - hook_w/2;
// no right-end hook: the dev board's USB end fills that wall
hooks = [["left", 0], ["back", hx1], ["back", hx2], ["front", hx1], ["front", hx2]];

// pins actually used (wiring.md): [column, index from antenna end]
// column 0 = 3V3 row: 3V3,3V3,RST,4,5,6,7,15,16,17,18,8,3,46,9,10,11,12,13,14,5V,G
// column 1 = far row: G,TX,RX,1,2,42,41,40,39,38,37,36,35,0,45,48,47,21,20,19,G,G
used_pins = [[0,0],[0,1],[0,3],[0,4],[0,5],[0,11],[0,14],[0,21],[1,0],[1,4],[1,20],[1,21]];
function pin_xy(c, k) = dev_xy(c == 0 ? dev_pin_inset : dev_w - dev_pin_inset,
                               dev_pin_v0 + (dev_pins - 1 - k)*2.54);
function rect_dist(p, x0, x1, y0, y1) =
    norm([max(x0 - p[0], 0, p[0] - x1), max(y0 - p[1], 0, p[1] - y1)]);

// IMU: same hanging-Dupont stack as the dev board; x centred in the free strip
// between the left wall (tab flex room) and the dev board's antenna tip
imu_z0   = floor_t + floor_clear + wire_bend + jumper_h + imu_spacer;
imu_top  = imu_z0 + imu_pcb_t;
imu_span = imu_w + 2*(tol_fit + tab_t);                       // tabs included
imu_x_l  = -in_hx + 1.0;                                       // 1 mm flex room at the wall
imu_x_r  = x_usb - dev_pcb_len - dev_ant_overhang - 0.5;      // antenna tip
imu_cx   = (imu_x_l + imu_x_r)/2;
imu_y0   = imu_cy - imu_d/2;                                   // header edge (front)
function imu_hole_xy(h) = [imu_cx + h[0], imu_cy + h[1]];
oled_back_z = H - oled_stack_t - oled_back_keep;
// OLED corner posts: inside the PCB outline by 0.5 + post/2 at every corner (6 mm edge strips assumed clear)
oled_post_pos = [for (sx = [-1, 1], sy = [-1, 1])
    [oled_cx + sx*(oled_pcb_w/2 - 0.5 - oled_post/2), oled_cy + sy*(oled_pcb_h/2 - 0.5 - oled_post/2)]];

ring_hook_gap = rect_dist(mic_xy, hx1 - hook_w/2, hx1 + hook_w/2, beam_fy - hook_t, beam_fy) - mic_ring_r;
led_hook_gap  = rect_dist(led_xy, hx2 - hook_w/2, hx2 + hook_w/2, beam_fy - hook_t, beam_fy) - led_boss_r;

echo(str("SLAB v2.3: outer L x W x H = ", L, " x ", W, " x ", H, " mm (L_req ", L_req, ", W_req ", W_req, ")"));
echo(str("  height budget: floor ", floor_t, " + clearance ", floor_clear, " + wire bend ", wire_bend,
         " + Dupont ", jumper_h, " + header spacer ", header_spacer, " = PCB bottom ", pcb_z0,
         "; + PCB ", dev_pcb_t, " = ", pcb_top));
echo(str("  H candidates: OLED over module ", H_oled, " (module ", dev_mod_h, " + clear ", top_clear,
         " + OLED back parts ", oled_back_keep, " + OLED stack ", oled_stack_t, "), button column ", H_btn,
         " (pins ", dev_pin_above, " + clear ", btn_collar_clear, " + collar ", btn_flange_t, "+cone, play ",
         btn_stroke, " + lid ", plate_t, "), USB posts ", H_usb, " -> H = ", H));
echo(str("  long pin in the Dupont ", dev_pin_below - header_spacer, " mm (need ", jumper_grip, ")",
         "; OLED back z ", H - oled_stack_t, ", tray top ", tray_h, ", skirt bottom ", skirt_bot,
         ", button guide depth ", btn_guide_depth, ", nose ", btn_nose_l));
echo(str("  hook: root z ", z_root, ", lip ", z_lip, ", tip ", z_tip, ", window ", z_wb, "..", z_wt,
         ", strain ~", 150*hook_t*(hook_lip - tol_snap)/(hook_len*hook_len), " %"));
echo(str("  button [", gx, ", ", boot_xy[1], "] len ", btn_len, " bore ", btn_bore, "; mic ", mic_xy,
         "; LED ", led_xy, "; grille hole ", grille_hole_d));
echo(str("  OLED centre x ", oled_cx, ", fence end ", oled_fence_end, "; board y ", dev_y_f, "..", dev_y_f + dev_w,
         "; UART y ", uart_y));
if (imu_enable) echo(str("  IMU centre [", imu_cx, ", ", imu_cy, "], PCB z ", imu_z0, "..", imu_top,
         ", free x ", imu_x_l, "..", imu_x_r, " (needs ", imu_span, "), OLED back parts at z ", oled_back_z));
echo(str("  hooks ", hooks, "; ring-hook gap ", ring_hook_gap, ", LED-hook gap ", led_hook_gap));

assert(btn_guide_depth >= plate_t, "button guide shorter than the lid");
assert(skirt_bot >= pcb_top + dev_usb_h + 0.3, "skirt hits the USB-C connectors");
if (dev_pin_below - header_spacer < jumper_grip)
    echo(str("WARNING: only ", dev_pin_below - header_spacer, " mm of long pin inside the Dupont (need ", jumper_grip, ")"));
assert((mic_xy[0] - mic_ring_r) - oled_fence_end >= 0.2, "mic ring hits OLED fence");
assert(sk_ix - 0.2 >= led_xy[0] + led_boss_r, "LED socket hits the skirt");
assert(gx - btn_guide_r >= oled_fence_end + 0.2, "button guide hits OLED fence");
assert(ring_hook_gap >= 0.15, "mic ring hits the back hook");
assert(led_hook_gap >= 0.15, "LED socket hits the back hook");
assert(!imu_enable || imu_x_r - imu_x_l >= imu_span, "IMU does not fit beside the antenna end");
assert(!imu_enable || imu_top + imu_comp_h + 0.5 <= oled_back_z, "IMU hits the OLED back");
assert(!imu_enable || imu_y0 + imu_d + tol_fit + tab_t <= in_hy - 0.5, "IMU fence hits the back wall");
if (imu_enable && imu_pin_below - imu_spacer < jumper_grip)
    echo(str("WARNING: IMU pins give only ", imu_pin_below - imu_spacer, " mm inside a Dupont (need ", jumper_grip,
             "); measure, or use longer-pin headers"));
assert(sk_iy >= oled_pocket_h/2, "skirt cuts into the OLED pocket");
assert(hx1 - hook_w/2 >= oled_fence_end + 0.2, "hook under the OLED");
assert(hook_t >= tol_min_wall && skirt_t >= tol_min_wall && btn_guide_wall >= tol_min_wall, "wall below tol_min_wall");
assert(peg_neck_d >= tol_min_feat && hook_lip >= tol_min_feat, "feature below tol_min_feat");
if (grille_hole_d < hole(grille_hole))
    echo(str("NOTE: grille hole clamped to ", grille_hole_d, " to keep a ", tol_min_feat, " mm web"));
if (H > 28.5) echo(str("NOTE: height ", H, " mm; driven by ", H == H_oled ? "the OLED stacked over the ESP32 module" : H == H_btn ? "the button column" : "the USB posts"));

// =====================================================================
// Helpers
// =====================================================================
module rr(l, w, r) offset(r = r) square([l - 2*r, w - 2*r], center = true);

// 2D profile extruded with a first-layer elephant-foot inset
module ef_extrude(h) {
    linear_extrude(tol_efoot + 0.01) offset(delta = -tol_efoot) children();
    translate([0, 0, tol_efoot]) linear_extrude(h - tol_efoot) children();
}

module label_2d(txt, size)
    offset(delta = text_grow)
        text(txt, size = size, font = label_font, halign = "center", valign = "center");

module labels_2d() {
    translate([gx, (boot_xy[1] + btn_cap/2 + gy - grille_span_y/2)/2]) label_2d(rec_text, rec_size);
    translate([gx, -W/2 + 4.5]) label_2d(brand_text, brand_size);
}

// frame on a tray wall: local +Y points at the wall, origin on the hook beam's outer face
module at_wall(side, along) {
    if (side == "back")       translate([along,  beam_fy, 0]) children();
    else if (side == "front") translate([along, -beam_fy, 0]) rotate([0, 0, 180]) children();
    else if (side == "right") translate([ beam_fx, along, 0]) rotate([0, 0, -90]) children();
    else                      translate([-beam_fx, along, 0]) rotate([0, 0, 90]) children();
}

// hook profile in (n = toward the wall, z)
module hook_2d() {
    n_wall = tol_snap + skirt_t + tol_fit + 0.5;     // reaches 0.5 into the wall
    union() {
        translate([-hook_t, z_root]) square([hook_t, z_tip - z_root]);
        polygon([[0, z_lip - d_ret], [hook_lip, z_lip], [hook_lip, z_lip + 0.4], [0, z_tip]]);
        // root block with a 45 deg underside (prints without support)
        polygon([[-hook_t, z_root + 0.01], [-hook_t, z_root - 2], [n_wall, z_root - 2 - (n_wall + hook_t)],
                 [n_wall, z_root + 0.01]]);
    }
}

module hook_3d() rotate([90, 0, 90]) linear_extrude(hook_w, center = true) hook_2d();

module catch_window()
    translate([-(hook_w + 0.6)/2, tol_snap - 0.05, z_wb]) cube([hook_w + 0.6, skirt_t + 0.1, z_wt - z_wb]);

module oled_peg() {   // grows downward from the seat plane (local z = 0, -z = inward)
    shaft = oled_pcb_t + 0.1;
    neck  = clip_t + 0.15;
    cone  = (oled_peg_d - peg_neck_d)/2;
    mirror([0, 0, 1]) {
        translate([0, 0, -0.3]) cylinder(d = oled_peg_d, h = shaft + 0.3);
        translate([0, 0, shaft - 0.01]) cylinder(d = peg_neck_d, h = neck + 0.02);
        translate([0, 0, shaft + neck]) cylinder(d1 = peg_neck_d, d2 = oled_peg_d, h = cone + 0.01);
        translate([0, 0, shaft + neck + cone]) cylinder(d = oled_peg_d, h = 0.4);
        translate([0, 0, shaft + neck + cone + 0.39]) cylinder(d1 = oled_peg_d, d2 = oled_peg_d - 0.6, h = 0.3);
    }
}
peg_pos = [for (sx = [-1, 1], sy = [-1, 1])
           [sx*(oled_pcb_w/2 - oled_hole_inset_x), sy*(oled_pcb_h/2 - oled_hole_inset_y)]];

// fork clip 2D: x = 0 at the PCB edge, +x toward the OLED centre; slides on from +x
module oled_clip_2d() {
    pp = oled_pcb_h/2 - oled_hole_inset_y;
    slot = peg_neck_d - clip_snap;
    difference() {
        translate([0, -(oled_pcb_h - 1)/2]) square([clip_w, oled_pcb_h - 1]);
        for (sy = [-1, 1]) translate([oled_hole_inset_x, sy*pp]) {
            circle(d = hole(peg_neck_d));
            translate([0, -slot/2]) square([clip_w, slot]);
            translate([clip_w - oled_hole_inset_x, 0]) polygon([[-0.8, -slot/2], [0.01, -slot/2 - 0.5], [0.01, slot/2 + 0.5], [-0.8, slot/2]]);
            for (s = [-1, 1])   // relief cuts make 1.0 mm tines
                translate([-1.3, s*(slot/2 + 1.0) + (s < 0 ? -tol_min_feat : 0)]) square([clip_w, tol_min_feat]);
        }
    }
}
module oled_clip() ef_extrude(clip_t) oled_clip_2d();

// snap tab profile in (y, z): PCB edge at y = 0, PCB toward +y, z = 0 at the floor top
module snap_tab_2d(z_pcb_top) {
    g  = tol_fit;
    zc = z_pcb_top - floor_t + 0.01 + tol_fit;   // lip underside
    zt = zc + 0.6 + tab_lip + g;
    polygon([[-g - tab_t, 0], [-g, 0], [-g, zc], [tab_lip, zc], [tab_lip, zc + 0.6], [-g, zt], [-g - tab_t, zt]]);
}
module board_tab_3d() rotate([90, 0, 90]) linear_extrude(tab_w, center = true) snap_tab_2d(pcb_top);

// USB-end cradle (v2.3): z = 0 at the world floor. Runs from the PCB USB edge back to cradle_v
// and forward into the end wall so it is one solid with it.
module usb_cradle() {
    x0 = x_usb - cradle_v;  x1 = in_hx + 0.5;
    y0 = dev_y_f - tol_fit - cheek_t;  y1 = dev_y_f + dev_w + tol_fit + cheek_t;
    difference() {
        translate([x0, y0, floor_t - 0.01]) cube([x1 - x0, y1 - y0, pcb_top + cheek_up - floor_t + 0.01]);
        // PCB slot between the cheeks, open upward
        translate([x0 - 1, dev_y_f - tol_fit, pcb_z0]) cube([x1 - x0 + 2, dev_w + 2*tol_fit, 50]);
        // ledge drop under the middle of the strip (shell anchor legs), edges stay full height
        translate([x0 - 1, dev_y_f + cradle_edge, pcb_z0 - cradle_drop])
            cube([x1 - x0 + 2, dev_w - 2*cradle_edge, cradle_drop + 1]);
        // keep the end wall's inner face clear above the PCB for the connectors
        translate([x_usb, dev_y_f - tol_fit, pcb_z0]) cube([x1 - x_usb + 1, dev_w + 2*tol_fit, 50]);
    }
}

// IMU mount at the origin (PCB centre x/y = 0), z = 0 at the floor top:
// rigid pedestal + far-edge fence + 2 pegs + 2 snap tabs on the short ends
module imu_mount() {
    y0 = -imu_d/2;
    ph = imu_z0 - floor_t;
    // pedestal under everything except the header strip
    translate([-imu_w/2 + 0.5, y0 + imu_strip, -0.01])
        cube([imu_w - 1, imu_d - imu_strip + tol_fit + tab_t, ph + 0.01]);
    // far-edge fence
    translate([-imu_w/2 + 0.5, imu_d/2 + tol_fit, ph - 0.01]) cube([imu_w - 1, tab_t, imu_pcb_t + imu_fence_h + 0.01]);
    // pegs into the mounting holes
    for (h = imu_holes) translate([h[0], h[1], ph - 0.01]) {
        cylinder(d = imu_hole_d - 2*tol_fit, h = imu_pcb_t + 0.01);
        translate([0, 0, imu_pcb_t]) cylinder(d1 = imu_hole_d - 2*tol_fit, d2 = imu_hole_d - 2*tol_fit - 0.6, h = imu_peg_h - imu_pcb_t + 0.01);
    }
    // snap tabs on the short ends, in the pedestal half (away from the header Duponts)
    for (sx = [-1, 1])
        translate([sx*imu_w/2, (y0 + imu_strip + imu_d/2)/2, 0]) rotate([0, 0, sx > 0 ? 90 : -90])
            rotate([90, 0, 90]) linear_extrude(tab_w, center = true) snap_tab_2d(imu_top);
}

module slot2d(yc, wy, hz)
    hull() for (dy = [-1, 1]) translate([yc + dy*(wy - hz)/2, usb_z]) circle(d = hz);

usb_cw = usb_plug_w + 2*tol_window;
usb_ch = usb_plug_h + 2*tol_window;
function usb_span() = usb_slot_mode == "uart"
    ? [uart_y - usb_cw/2, uart_y + usb_cw/2]
    : [min(uart_y, otg_y) - usb_cw/2, max(uart_y, otg_y) + usb_cw/2];

module usb_slot_2d() {   // in (Y, Z)
    if (usb_slot_mode == "uart")
        slot2d(uart_y, usb_cw, usb_ch);
    else if (usb_slot_mode == "two") {
        slot2d(uart_y, usb_cw, usb_ch);
        slot2d(otg_y, usb_cw, usb_ch);
    } else
        slot2d((usb_span()[0] + usb_span()[1])/2, usb_span()[1] - usb_span()[0], usb_ch);
}

// =====================================================================
// Top plate
// =====================================================================
module plate_outer()
    hull() {
        translate([0, 0, tray_h]) linear_extrude(plate_t - top_chamfer) rr(L, W, corner_r);
        translate([0, 0, H - 0.01]) linear_extrude(0.01)
            rr(L - 2*top_chamfer, W - 2*top_chamfer, corner_r - top_chamfer);
    }

module top_add() {
    // registration skirt
    translate([0, 0, skirt_bot]) linear_extrude(skirt_h + 0.01)
        difference() { rr(2*sk_ox, 2*sk_oy, corner_r - wall); rr(2*sk_ix, 2*sk_iy, 0.5); }
    // OLED seat pad + fence (the long-side fence merges into the skirt)
    translate([oled_cx, oled_cy, H - oled_seat - oled_fence_h])
        linear_extrude(oled_seat + oled_fence_h - plate_t + 0.01)
            intersection() {
                square([oled_pocket_w + 2*oled_fence_t, oled_pocket_h + 2*oled_fence_t], center = true);
                translate([-oled_cx, 0]) rr(2*sk_ox, 2*sk_oy, 0.5);
            }
    // mic ring
    translate([mic_xy[0], mic_xy[1], tray_h - mic_ring_h]) cylinder(r = mic_ring_r, h = mic_ring_h + 0.01);
    // LED socket
    translate([led_xy[0], led_xy[1], H - led_boss_depth]) cylinder(r = led_boss_r, h = led_boss_depth - plate_t + 0.01);
    // button guide
    translate([gx, boot_xy[1], H - btn_guide_depth]) cylinder(r = btn_guide_r, h = btn_guide_depth - plate_t + 0.01);
    // hold-down posts onto the USB-C shells
    for (p = posts)
        translate([p[0], p[1], pcb_top + dev_usb_h + tol_fit])
            cylinder(d = post_d, h = tray_h - (pcb_top + dev_usb_h + tol_fit) + 0.01);
}

module top_cuts() {
    // OLED PCB pocket and glass window (0.3 chamfer on the bed-side edge)
    translate([oled_cx, oled_cy, H - oled_seat - oled_fence_h - 1])
        linear_extrude(oled_fence_h + 1) square([oled_pocket_w, oled_pocket_h], center = true);
    translate([oled_cx + oled_glass_dx, oled_cy + oled_glass_dy, 0]) {
        translate([0, 0, H - oled_seat - 1]) linear_extrude(oled_seat + 2) square([oled_win_w, oled_win_h], center = true);
        hull() {
            translate([0, 0, H - tol_efoot]) linear_extrude(0.01) square([oled_win_w, oled_win_h], center = true);
            translate([0, 0, H]) linear_extrude(0.01) square([oled_win_w + 2*tol_efoot, oled_win_h + 2*tol_efoot], center = true);
        }
    }
    // grille (through the plate only)
    for (i = [0 : grille_cols - 1], j = [0 : grille_rows - 1])
        translate([gx + (i - (grille_cols - 1)/2)*grille_pitch, gy + (j - (grille_rows - 1)/2)*grille_pitch, tray_h - 0.01])
            cylinder(d = grille_hole_d, h = plate_t + 1, $fn = 20);
    // mic pocket inside the ring
    translate([mic_xy[0], mic_xy[1], tray_h - mic_ring_h - 1]) cylinder(d = mic_pocket_dia, h = mic_ring_h + 1);
    // LED socket bore + window
    translate([led_xy[0], led_xy[1], 0]) {
        translate([0, 0, H - led_boss_depth - 1]) cylinder(d = led_bore, h = led_boss_depth + 1 - led_top_gap);
        translate([0, 0, H - led_top_gap - 0.01])
            cylinder(d = led_win_d, h = led_mode == "hole" ? led_top_gap + 1 : led_top_gap - led_skin + 0.01);
    }
    // button bore with a 0.3 chamfer at the top surface
    translate([gx, boot_xy[1], 0]) {
        translate([0, 0, H - btn_guide_depth - 1]) cylinder(d = btn_bore, h = btn_guide_depth + 2);
        translate([0, 0, H - tol_efoot]) cylinder(d1 = btn_bore, d2 = btn_bore + 2*tol_efoot, h = tol_efoot + 0.01);
    }
    // skirt notch over the USB-C slot (cable overmold reaches 0.5 mm inside)
    translate([sk_ix - 0.5, 0, 0]) rotate([90, 0, 90]) linear_extrude(L) usb_slot_2d();
    // snap catch windows in the skirt
    for (hk = hooks) at_wall(hk[0], hk[1]) catch_window();
    // labels
    if (show_text)
        translate([0, 0, H - tol_text_depth]) linear_extrude(tol_text_depth + 1) labels_2d();
}

module top() {
    difference() {
        union() { plate_outer(); top_add(); }
        top_cuts();
    }
    if (oled_pegs) for (p = peg_pos) translate([oled_cx + p[0], oled_cy + p[1], H - oled_seat]) oled_peg();
}

module labels() if (show_text)
    translate([0, 0, H - tol_text_depth]) linear_extrude(tol_text_depth) labels_2d();

// =====================================================================
// Tray
// =====================================================================
module tray() {
    x_tip = x_usb - dev_pcb_len - dev_ant_overhang;
    difference() {
        union() {
            difference() {
                hull() {   // elephant-foot chamfer on the bottom edge
                    linear_extrude(0.01) rr(L - 2*tol_efoot, W - 2*tol_efoot, corner_r - tol_efoot);
                    translate([0, 0, tol_efoot]) linear_extrude(tray_h - tol_efoot) rr(L, W, corner_r);
                }
                translate([0, 0, floor_t]) linear_extrude(tray_h) rr(2*in_hx, 2*in_hy, corner_r - wall);
            }
            for (hk = hooks) at_wall(hk[0], hk[1]) hook_3d();
            // board pads under the bare centre strip
            for (pv = [pad_a_v, pad_b_v])
                let (p0 = dev_xy(pad_u0, pv[1]))
                    translate([p0[0], p0[1], floor_t - 0.01])
                        cube([pv[1] - pv[0], pad_u1 - pad_u0, pcb_z0 - floor_t + 0.01]);
            // USB-end cradle, fused to the end wall
            usb_cradle();
            // OLED corner posts: press the PCB up into the lid pocket (replaces the pegs until measured)
            for (p = oled_post_pos) translate([p[0] - oled_post/2, p[1] - oled_post/2, floor_t - 0.01])
                cube([oled_post, oled_post, H - oled_stack_t - oled_post_gap - floor_t + 0.01]);
            // IMU pedestal (rigid to the floor)
            if (imu_enable) translate([imu_cx, imu_cy, floor_t]) imu_mount();
            // antenna catch (antenna tip points -X; the slot opens toward +X)
            translate([x_tip - catch_back, dev_y_f + dev_w/2 - catch_w/2, floor_t - 0.01])
                cube([catch_engage + catch_back, catch_w,
                      pcb_top + dev_mod_pcb_t + 2*tol_fit + catch_jaw_t - floor_t + 0.01]);
        }
        // antenna slot
        translate([x_tip - 0.5, dev_y_f + dev_w/2 - catch_w/2 - 1, pcb_top - tol_fit])
            cube([catch_engage + 1.5, catch_w + 2, dev_mod_pcb_t + 3*tol_fit]);
        // USB-C slot in the right end wall, continued 1.5 mm inside so the cable overmold clears the cradle cheeks
        translate([x_usb - 1.5, 0, 0]) rotate([90, 0, 90]) linear_extrude(L/2 + 1 - (x_usb - 1.5)) usb_slot_2d();
        // pry slot on the back edge
        translate([gx - pry_w/2, in_hy - 0.1, tray_h - pry_d]) cube([pry_w, wall + 1, pry_d + 1]);
        // rubber feet
        for (sx = [-1, 1], sy = [-1, 1])
            translate([sx*(L/2 - foot_inset), sy*(W/2 - foot_inset), -1]) cylinder(d = hole(foot_d), h = foot_depth + 1);
        // NFC sticker recess underneath
        if (nfc_side == "bottom")
            translate([nfc_cx, nfc_cy, -1 + nfc_depth/2])
                cube([nfc_size + 2*tol_fit, nfc_size + 2*tol_fit, 2 + nfc_depth], center = true);
    }
}

// =====================================================================
// Button (nose-down, z = 0 at the nose tip)
// =====================================================================
module button() {
    cylinder(d = btn_nose, h = btn_nose_l + 0.01);
    if (btn_flange_z - btn_flange_t - btn_cone_h - btn_nose_l > 0.05)
        translate([0, 0, btn_nose_l]) cylinder(d = btn_shaft, h = btn_flange_z - btn_flange_t - btn_cone_h - btn_nose_l + 0.01);
    translate([0, 0, btn_flange_z - btn_flange_t - btn_cone_h]) {
        cylinder(d = btn_flange, h = btn_flange_t + 0.01);
        translate([0, 0, btn_flange_t]) cylinder(d1 = btn_flange, d2 = btn_cap, h = btn_cone_h + 0.01);
    }
    translate([0, 0, btn_flange_z - 0.01]) {
        cylinder(d = btn_cap, h = btn_len - btn_flange_z - 0.5 + 0.01);
        translate([0, 0, btn_len - btn_flange_z - 0.49]) cylinder(d1 = btn_cap, d2 = btn_cap - 1.0, h = 0.5);
    }
}

// =====================================================================
// Ghost components / keep-outs
// =====================================================================
module housing_at(xy, z0, h) translate([xy[0] - jumper_w/2, xy[1] - jumper_w/2, z0]) cube([jumper_w, jumper_w, h]);

module dev_board_proxy() {
    translate([x_usb - dev_pcb_len, dev_y_f, pcb_z0]) cube([dev_pcb_len, dev_w, dev_pcb_t]);
    // module: shielded body full height, antenna end only the 0.8 mm module PCB
    translate([x_usb - dev_pcb_len - dev_ant_overhang, dev_y_f + dev_w/2 - dev_mod_w/2, pcb_top]) {
        cube([dev_mod_len, dev_mod_w, dev_mod_pcb_t]);
        translate([7.5, 0, 0]) cube([dev_mod_len - 7.5, dev_mod_w, dev_mod_h]);
    }
    for (u = [dev_usb_uart_u, dev_usb_otg_u])
        translate([x_usb - 7.35 + dev_usb_overhang, dev_y_f + u - dev_usb_w/2, pcb_top]) cube([7.35, dev_usb_w, dev_usb_h]);
    translate([boot_xy[0] - 2, boot_xy[1] - 1.5, pcb_top]) cube([4, 3, dev_btn_h - 0.05]);
    for (u = [dev_pin_inset, dev_w - dev_pin_inset]) let (p1 = dev_xy(u, dev_pin_v0 + (dev_pins - 1)*2.54)) {
        // header spacer + long pins below, short pins/solder above
        translate([p1[0] - 1.27, p1[1] - 1.27, pcb_z0 - header_spacer]) cube([dev_pins*2.54, 2.54, header_spacer]);
        translate([p1[0] - 0.32, p1[1] - 0.32, pcb_z0 - dev_pin_below]) cube([(dev_pins - 1)*2.54 + 0.64, 0.64, dev_pin_below]);
        translate([p1[0] - 0.9, p1[1] - 0.9, pcb_top]) cube([(dev_pins - 1)*2.54 + 1.8, 1.8, dev_pin_above]);
    }
    // Duponts hanging from the used long pins, plus the wire-bend zone below them
    for (p = used_pins) housing_at(pin_xy(p[0], p[1]), jumper_bot - wire_bend, wire_bend + jumper_h);
}

module oled_proxy() {
    difference() {
        translate([oled_cx - oled_pcb_w/2, oled_cy - oled_pcb_h/2, H - oled_seat - oled_pcb_t]) cube([oled_pcb_w, oled_pcb_h, oled_pcb_t]);
        if (oled_pegs) for (p = peg_pos) translate([oled_cx + p[0], oled_cy + p[1], 0]) cylinder(d = oled_hole_d, h = 2*H);
    }
    translate([oled_cx + oled_glass_dx - oled_glass_w/2, oled_cy + oled_glass_dy - oled_glass_h/2, H - oled_seat]) cube([oled_glass_w, oled_glass_h, oled_seat - 0.01]);
    translate([oled_cx - oled_pcb_w/2 + clip_w + 0.5, oled_cy - oled_pcb_h/2 + 6, H - oled_stack_t - oled_back_keep])
        cube([oled_pcb_w - 2*clip_w - 1, oled_pcb_h - 12, oled_back_keep]);
    for (i = [0 : oled_hdr_pins - 1])
        housing_at([oled_cx + oled_hdr_x + (i - (oled_hdr_pins - 1)/2)*2.54, oled_cy + oled_pcb_h/2 - 2.5],
                   H - oled_stack_t - header_spacer - jumper_h - wire_bend, header_spacer + jumper_h + wire_bend);
}

module mic_proxy() {
    translate([mic_xy[0], mic_xy[1], tray_h - mic_pcb_t]) cylinder(d = mic_d, h = mic_pcb_t);
    for (sx = [-1, 1], i = [-1 : 1])
        housing_at([mic_xy[0] + sx*mic_hdr_off, mic_xy[1] + i*2.54],
                   tray_h - mic_pcb_t - header_spacer - jumper_h - wire_bend, header_spacer + jumper_h + wire_bend);
}

module led_proxy() {
    translate([led_xy[0], led_xy[1], H - led_top_gap - 8.6]) { cylinder(d = led_d, h = 8.6); cylinder(d = 5.8, h = 1); }
    for (dx = [-1.27, 1.27]) housing_at([led_xy[0] + dx, led_xy[1]], H - led_top_gap - 8.6 - jumper_h - wire_bend, jumper_h + wire_bend);
}

module usb_plug_proxy()
    translate([x_usb + dev_usb_overhang, 0, 0]) rotate([90, 0, 90]) linear_extrude(20)
        hull() for (dy = [-1, 1]) translate([uart_y + dy*(usb_plug_w - usb_plug_h)/2, usb_z]) circle(d = usb_plug_h);

module clips_placed()
    if (oled_pegs) for (s = [-1, 1])
        translate([oled_cx + s*oled_pcb_w/2, oled_cy, H - oled_stack_t - 0.1 - clip_t])
            mirror([s > 0 ? 1 : 0, 0, 0]) oled_clip();

module imu_proxy() if (imu_enable) {
    difference() {
        translate([imu_cx - imu_w/2, imu_y0, imu_z0]) cube([imu_w, imu_d, imu_pcb_t]);
        for (h = imu_holes) translate([imu_hole_xy(h)[0], imu_hole_xy(h)[1], 0]) cylinder(d = imu_hole_d, h = 2*H);
    }
    translate([imu_cx - imu_w/2 + 2, imu_y0 + imu_strip, imu_top]) cube([imu_w - 4, imu_d - imu_strip - 3.5, imu_comp_h]);
    // header spacer, pins and every pin's Dupont + wire bend
    translate([imu_cx - imu_pins*2.54/2, imu_y0 + imu_pin_inset - 1.27, imu_z0 - imu_spacer]) cube([imu_pins*2.54, 2.54, imu_spacer]);
    for (i = [0 : imu_pins - 1])
        housing_at([imu_cx + (i - (imu_pins - 1)/2)*2.54, imu_y0 + imu_pin_inset],
                   imu_z0 - imu_spacer - jumper_h - wire_bend, jumper_h + wire_bend);
}

module components() { dev_board_proxy(); oled_proxy(); mic_proxy(); led_proxy(); usb_plug_proxy(); imu_proxy(); }

module assembly() {
    color("#d8d8d8") tray();
    color("#d8d8d8") top();
    color("#d8d8d8") clips_placed();
    if (show_text) color("#3a3a3a") translate([0, 0, -0.01]) labels();
    // visual stand-ins only (not printed): dark OLED glass, red LED dome
    color("#1c1c1c") translate([oled_cx + oled_glass_dx - oled_glass_w/2, oled_cy + oled_glass_dy - oled_glass_h/2, H - oled_seat])
        cube([oled_glass_w, oled_glass_h, oled_seat - 0.05]);
    color("#b01010") translate([led_xy[0], led_xy[1], H - led_top_gap - 3]) cylinder(d = led_d, h = 3 - 0.05);
    color("#202020") translate([mic_xy[0], mic_xy[1], tray_h - mic_pcb_t]) cylinder(d = mic_d, h = mic_pcb_t - 0.05);
    color("#ff6a00") translate([gx, boot_xy[1], btn_top]) button();
    if (show_components) %components();
}

// debug: any solid left here is a collision
module clash_check() {
    intersection() { components(); union() { top(); tray(); clips_placed(); } }
    intersection() { translate([gx, boot_xy[1], btn_top]) button(); union() { top(); tray(); components(); } }
    intersection() { top(); tray(); }
    intersection() { clips_placed(); tray(); }
}

// =====================================================================
// Fit-test coupons
// =====================================================================
module fit_oled_ring()
    ef_extrude(3) difference() {
        square([oled_win_w + 8, oled_win_h + 8], center = true);
        square([oled_win_w, oled_win_h], center = true);
    }

// flat seat with fence, window, necked pegs, plus one fork clip beside it
module fit_oled_frame() {
    t0 = 1.2;
    fw = oled_pocket_w + 2*oled_fence_t;
    fh = oled_pocket_h + 2*oled_fence_t;
    difference() {
        union() {
            ef_extrude(t0) difference() { square([fw, fh], center = true); square([oled_win_w, oled_win_h], center = true); }
            translate([0, 0, t0 - 0.01]) linear_extrude(oled_fence_h + 0.01)
                difference() { square([fw, fh], center = true); square([oled_pocket_w, oled_pocket_h], center = true); }
        }
    }
    for (p = peg_pos) translate([p[0], p[1], t0]) mirror([0, 0, 1]) oled_peg();
    translate([fw/2 + 3, 0, 0]) oled_clip();
}

// grille + mic ring + LED socket, face-down as printed
module fit_mic() {
    lx = led_xy[0] - mic_xy[0];
    s = 2*mic_ring_r + 4;
    difference() {
        union() {
            ef_extrude(plate_t) translate([-s/2, -s/2]) square([s + lx, s]);
            cylinder(r = mic_ring_r, h = plate_t + mic_ring_h);
            translate([lx, 0, 0]) cylinder(r = led_boss_r, h = led_boss_depth);
        }
        for (i = [0 : grille_cols - 1], j = [0 : grille_rows - 1])
            translate([-mic_dx + (i - (grille_cols - 1)/2)*grille_pitch, (j - (grille_rows - 1)/2)*grille_pitch, -1])
                cylinder(d = grille_hole_d, h = plate_t + 1.01, $fn = 20);
        translate([0, 0, plate_t]) cylinder(d = mic_pocket_dia, h = mic_ring_h + 1);
        translate([lx, 0, led_top_gap]) cylinder(d = led_bore, h = led_boss_depth);
        translate([lx, 0, led_mode == "hole" ? -1 : led_skin]) cylinder(d = led_win_d, h = led_top_gap + 1);
    }
}

module fit_usb() {
    sp = usb_span();
    translate([0, 0, 0]) ef_extrude(wall) difference() {
        translate([sp[0] - 4, usb_z - usb_ch/2 - 4]) square([sp[1] - sp[0] + 8, usb_ch + 8]);
        usb_slot_2d();
    }
}

// button bore + guide (face-down, as printed) and a full-size button
module fit_boot() {
    difference() {
        union() {
            ef_extrude(plate_t) square([20, 20], center = true);
            cylinder(r = btn_guide_r, h = btn_guide_depth);
        }
        translate([0, 0, -1]) cylinder(d = btn_bore, h = btn_guide_depth + 2);
    }
    translate([24, 0, btn_len]) rotate([180, 0, 0]) button();
}

// one hook on a wall stub + its catch on a skirt stub; same z geometry as the slab
module fit_snap() {
    z0 = z_root - 2 - (tol_snap + skirt_t + tol_fit + 0.5 + hook_t) - floor_t;  // coupon floor at z = 0
    bw = hook_w + 8;
    // tray stub: floor, wall, hook
    translate([0, 0, -z0]) {
        translate([-bw/2, -6, z0]) cube([bw, 6 + tol_snap + skirt_t + tol_fit + wall, floor_t]);
        translate([-bw/2, tol_snap + skirt_t + tol_fit, z0]) cube([bw, wall, tray_h - z0]);
        hook_3d();
    }
    // catch stub: plate piece + skirt with window, printed face-down
    translate([bw + 4, 0, 0])
        difference() {
            union() {
                translate([-bw/2, -6, 0]) cube([bw, 6 + tol_snap + skirt_t + tol_fit + wall, plate_t]);
                translate([-bw/2, tol_snap, 0]) cube([bw, skirt_t, plate_t + skirt_h]);
            }
            translate([0, 0, H]) mirror([0, 0, 1]) catch_window();
        }
}

// IMU pedestal (full height, so the tabs flex as in the tray) on a floor stub
module fit_imu() {
    translate([-imu_w/2 - tab_t - 2, -imu_d/2 - 1, 0]) cube([imu_w + 2*tab_t + 4, imu_d + tab_t + 3, floor_t]);
    translate([0, 0, floor_t - 0.01]) imu_mount();
}

module fit_tests() {
    sp = usb_span();
    fit_oled_ring();
    translate([-8, 58, 0]) fit_oled_frame();
    translate([62, -16, 0]) fit_mic();
    translate([62 - (sp[0] + sp[1])/2, 10 - usb_z, 0]) fit_usb();
    translate([56, 32, 0]) fit_boot();
    translate([0, -40, 0]) fit_snap();
    translate([48, -44, 0]) fit_imu();
}

// =====================================================================
// Part selector
// =====================================================================
if (part == "assembly") {
    assembly();
} else if (part == "top") {
    if (print_orient) translate([0, 0, H]) rotate([180, 0, 0]) top();   // face-down
    else top();
} else if (part == "tray") {
    tray();
} else if (part == "button") {
    if (print_orient) translate([0, 0, btn_len]) rotate([180, 0, 0]) button();  // on the cap
    else button();
} else if (part == "oled_clip") {
    oled_clip();
} else if (part == "labels") {
    if (print_orient) translate([0, 0, H]) rotate([180, 0, 0]) labels();
    else labels();
} else if (part == "fit_tests") {
    fit_tests();
} else if (part == "fit_oled_ring") {
    fit_oled_ring();
} else if (part == "fit_oled_frame") {
    fit_oled_frame();
} else if (part == "fit_mic") {
    fit_mic();
} else if (part == "fit_usb") {
    fit_usb();
} else if (part == "fit_boot") {
    fit_boot();
} else if (part == "fit_snap") {
    fit_snap();
} else if (part == "fit_imu") {
    fit_imu();
} else if (part == "clash_check") {
    clash_check();
} else {
    echo(str("Unknown part: ", part));
}
