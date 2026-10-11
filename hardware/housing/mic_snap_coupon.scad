// Mic snap-in holder: standalone fit coupon (11 Oct).
// Replaces the round mic ring of housing_slab.scad, which was loose (15.2 pocket on the 14.0 board) and
// did not hold the mic once the lid is turned over. Not folded into housing_slab.scad yet: print this
// first, then copy the mic_* values and mic_snap_up() across.
//
// Printed face-down like the lid: z = 0 is the lid's outer face on the plate, the holder points up.
// Origin = mic centre. +X = toward the LED, as in the housing. The mic's two 3-pin strips sit at x = +/-4.5,
// so the two rigid cheeks are on the +/-X sides and the two spring bars on the +/-Y sides.
//
// How it holds: each spring bar is a 0.8 mm strip bridged between the cheeks, 0.6 mm clear of the lid, with
// a small hook at mid-span. Press the board straight in: both bars bow outward 0.35 mm (strain about 1.5 %,
// bending in the layer plane) and close over the back of the board. The hook underside is 45 deg, so it
// presses a board between 1.85 and 2.2 mm thick against the lid without play.
// To remove: push one bar outward with a fingernail and tip the board out.

/* [Copied from housing_slab.scad, do not change here] */
plate_t      = 2.0;
tol_hole     = 0.3;
tol_efoot    = 0.3;
tol_min_wall = 1.2;
tol_min_feat = 0.8;
grille_cols  = 8;
grille_rows  = 7;
grille_hole  = 1.2;
grille_pitch = 2.2;
mic_dx       = -1.1;   // mic centre from grille centre
led_d        = 5.0;
led_win      = 3.0;
led_skin     = 0.4;
led_top_gap  = 1.0;
led_boss_depth = 6.0;
led_at       = [10.45, 2.2];   // LED centre from the mic centre in the housing (led_xy - mic_xy)

/* [Mic snap] */
mic_d        = 14.0;   // MEASURED (9 Oct)
mic_t        = 2.0;    // MEASURED, about (builder, 11 Oct): board as it sits on the lid
mic_c        = 0.2;    // per side, board to cheeks and to the bars (pocket 14.4; 15.2 was loose, 14.7 too tight as a full ring)
mic_bar_t    = 0.8;    // spring bar thickness (two 0.4 lines)
mic_bar_len  = 18.0;   // free span between the cheeks
mic_bar_gap  = 0.6;    // bar underside above the lid (three layers, so the bridge cannot fuse to the lid)
mic_hold_h   = 3.4;    // cheek and bar height above the lid
mic_hook_e   = 0.55;   // hook depth
mic_hook_w   = 3.0;    // hook length along the bar
mic_hook_pre = 0.35;   // hook depth at the board's back face: 0.15 more than mic_c, the preload
mic_anchor   = 1.6;    // cheek past each bar end
mic_cheek_x0 = 5.0;    // cheeks start here (clear of the bars' flex slots)
mic_slot     = 1.2;    // slot between each bar and the cheek tips

mic_R     = mic_d/2 + mic_c;
mic_hx    = mic_bar_len/2 + mic_anchor;        // holder half-size in X
mic_hy    = mic_R + mic_bar_t;                 // holder half-size in Y
mic_hk_z0 = mic_t - mic_hook_pre;              // hook starts here
mic_hk_z1 = mic_hk_z0 + mic_hook_e;            // full depth from here (45 deg underside)
mic_strain = 300*(mic_hook_e - mic_c)*mic_bar_t/pow((mic_bar_len - mic_hook_w)/2, 2);

function hole(d) = d + tol_hole;
led_bore   = hole(led_d);
led_boss_r = led_bore/2 + tol_min_wall;
led_win_d  = hole(led_win);
grille_hole_d = min(hole(grille_hole), grille_pitch - tol_min_feat);

echo(str("mic snap: pocket ", 2*mic_R, ", holder ", 2*mic_hx, " x ", 2*mic_hy, " x ", mic_hold_h,
         ", hook ", mic_hk_z0, "..", mic_hk_z1, ", bar strain ~", mic_strain, " %"));
assert(mic_hk_z1 + 0.1 < mic_hold_h - 0.6, "no room for the lead-in above the hook");
assert(mic_hk_z0 > mic_bar_gap, "hook starts below the bar");
assert(mic_strain < 2.0, "spring bar strain too high");

// z = 0 is the lid underside, +z into the housing
module mic_snap_up() {
    // rigid cheeks on the +/-X sides: locate the board in X and anchor the bars
    for (sx = [-1, 1]) mirror([sx < 0 ? 1 : 0, 0, 0])
        translate([0, 0, -0.01]) linear_extrude(mic_hold_h + 0.01) difference() {
            translate([mic_cheek_x0, -mic_hy]) square([mic_hx - mic_cheek_x0, 2*mic_hy]);
            circle(r = mic_R, $fn = 96);
            for (sy = [-1, 1]) translate([0, sy > 0 ? mic_R - mic_slot : -mic_hy - 1])
                square([mic_bar_len/2, mic_bar_t + mic_slot + 1]);
        }
    // spring bars on the +/-Y sides, bridged between the cheeks, each with a hook at mid-span
    for (sy = [-1, 1]) mirror([0, sy < 0 ? 1 : 0, 0]) {
        translate([-mic_bar_len/2 - 0.01, mic_R, mic_bar_gap]) cube([mic_bar_len + 0.02, mic_bar_t, mic_hold_h - mic_bar_gap]);
        // hook profile in (y, z): 45 deg underside, short land, lead-in up to the bar top
        rotate([90, 0, 90]) linear_extrude(mic_hook_w, center = true)
            polygon([[mic_R + 0.01, mic_hk_z0 - 0.01], [mic_R - mic_hook_e, mic_hk_z1], [mic_R - mic_hook_e, mic_hk_z1 + 0.1],
                     [mic_R, mic_hold_h], [mic_R + 0.01, mic_hold_h]]);
    }
}

module ef_extrude(h) {   // first layer pulled in by tol_efoot
    linear_extrude(tol_efoot + 0.01) offset(delta = -tol_efoot) children();
    translate([0, 0, tol_efoot]) linear_extrude(h - tol_efoot) children();
}

module fit_mic_snap() {
    x0 = -mic_hx - 2;  x1 = led_at[0] + led_boss_r + 2;  y0 = -mic_hy - 2;  y1 = mic_hy + 2;
    difference() {
        union() {
            difference() {
                ef_extrude(plate_t) translate([x0, y0]) square([x1 - x0, y1 - y0]);
                for (i = [0 : grille_cols - 1], j = [0 : grille_rows - 1])
                    translate([-mic_dx + (i - (grille_cols - 1)/2)*grille_pitch, (j - (grille_rows - 1)/2)*grille_pitch, -1])
                        cylinder(d = grille_hole_d, h = plate_t + 2, $fn = 20);
            }
            translate([0, 0, plate_t]) mic_snap_up();
            translate([led_at[0], led_at[1], 0]) cylinder(r = led_boss_r, h = led_boss_depth, $fn = 48);
        }
        translate([led_at[0], led_at[1], led_top_gap]) cylinder(d = led_bore, h = led_boss_depth, $fn = 48);
        translate([led_at[0], led_at[1], led_skin]) cylinder(d = led_win_d, h = led_top_gap + 1, $fn = 48);
    }
}

fit_mic_snap();
