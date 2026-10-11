"""SLAP desk housing v3.5 "deep slab" rebuilt in CadQuery for a Fusion-openable STEP.

Mirror of ../housing_slab.scad (the source of truth). Parameter names match the
OpenSCAD file one to one; change a value there first, then copy it here.

Run from hardware/housing:   uv run --project cad python cad/housing_slab_cq.py
or from hardware/housing/cad: uv run python housing_slab_cq.py
  --no-verify   skip the STL comparison and STEP read-back
  --ref DIR     compare against the slab_*.stl in DIR instead of exporting fresh ones
                from ../housing_slab.scad with `openscad --backend=Manifold`

Coordinates (assembly, closed): X = length (USB end at +X), Y = depth (+Y = back),
Z = up (0 = desk). Tray and lid are modelled in place; the button is modelled
nose-down (z = 0 at the nose tip) and the OLED clip at its 2D origin, exactly as
the OpenSCAD modules, and placed by `assembly()`.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import cadquery as cq
from OCP.BRepBuilderAPI import BRepBuilderAPI_NurbsConvert
from OCP.BRepOffsetAPI import BRepOffsetAPI_MakeOffset
from OCP.GeomAbs import GeomAbs_Arc, GeomAbs_Intersection

V = cq.Vector
HERE = Path(__file__).resolve().parent

# =====================================================================
# Parameters (same names and values as housing_slab.scad)
# =====================================================================
show_text = True

# FDM tolerances
tol_hole = 0.3
tol_fit = 0.2
tol_snap = 0.25
tol_window = 0.3
tol_efoot = 0.3
tol_min_wall = 1.2
tol_min_feat = 0.8
tol_shaft = 0.3
tol_text_stroke = 0.5
tol_text_depth = 0.4

# Slab
L_min = 116
W_min = 50
corner_r = 3
top_chamfer = 0.8
wall = 2.0
plate_t = 2.0
skirt_h = 4.0
skirt_t = 1.2
floor_t = 2.0

# Snap hooks / catches
hook_w = 6.0
hook_t = 2.0
hook_len = 16.0
hook_lip = 0.8
hook_return = 35
skirt_strip = 1.6
pry_w = 3
pry_d = 1

# Spacious margins (v3)
zone_gap = 9.0
dev_clear = 0.4

# Height budget
floor_clear = 5.5
wire_bend = 2.0
jumper_h = 14.0
jumper_w = 2.54
jumper_grip = 6.0
header_spacer = 2.5
dev_pin_below = 9.0
dev_pcb_t = 1.6
dev_pin_above = 2.5
top_clear = 1.5
oled_back_keep = 2.0

# OLED 2.42" SSD1309
oled_glass_w = 62.81
oled_glass_h = 39.85
oled_stack_t = 4.07
oled_pcb_t = 1.0
oled_pcb_w = 70.1
oled_pcb_h = 48.0
oled_pegs = False      # lid pegs + OLED clips off until the real hole positions are measured
oled_post = 4.0        # tray corner posts pressing the PCB up into the lid pocket
oled_post_gap = 0.15   # post top below the PCB back
oled_rib_t = 2.0       # v3.1 divider wall under the back posts
oled_rib_drop = 5.0    # divider top below the post tops
oled_rib_fin = 4.0     # v3.5 wire crossing in the divider: fin kept beside the right-hand post
oled_rib_gap_w = 16.0
oled_rib_sill = 6.0
oled_hdr_side = "left"  # left | right | back: edge the 4-pin header is soldered on, seen from the front
oled_hdr_keep = 6.0    # header-side posts sit this far in from the corners (v3.5)
oled_hdr_relief = 1.0  # lid seat cut back over the header strip
oled_glass_dx = 0
oled_glass_dy = 0
oled_hole_inset_x = 2.0   # from the builder's reference model: 3.0 mm holes 2.0 mm from both edges
oled_hole_inset_y = 2.0
oled_hole_d = 2.5
oled_pins = False      # locating pin on each tray post; off (v3.4), the hole spacing is not measured
oled_pin_d = 2.0
oled_pin_h = 2.4
oled_lead = 0.4        # lead-in chamfer on the window and pocket edges
oled_fence_h = 1.0
oled_fence_t = 0.8
oled_proud = 0
peg_neck_d = 1.2
clip_t = 1.2
clip_w = 6.0
clip_snap = 0.2

# Mic INMP441 + grille
mic_d = 14.0
mic_pcb_t = 2.0
# v3.4 snap-in holder (see mic_snap_up() in the SCAD)
mic_c = 0.2
mic_bar_t = 0.8
mic_bar_len = 18.0
mic_bar_gap = 0.6
mic_hold_h = 3.4
mic_hook_e = 0.55
mic_hook_w = 3.0
mic_hook_pre = 0.35
mic_anchor = 1.6
mic_cheek_x0 = 5.0
mic_slot = 1.2
grille_cols = 8
grille_rows = 7
grille_hole = 1.2
grille_pitch = 2.2
grille_cy = 12.5
mic_dx = -1.1

# LED
led_mode = "window"  # window | hole
led_win = 3.0
led_skin = 0.4
led_d = 5.0
led_top_gap = 1.0
led_boss_depth = 6.0
led_dy = 2.2

# Record button
btn_cap = 12.0
btn_proud = 1.0
btn_guide_wall = 1.2
btn_stroke = 1.0
btn_flange = 13.6
btn_flange_t = 0.8
btn_shaft = 6.0
btn_nose = 5.0
btn_collar_clear = 0.3

# Hold-down posts
post_d = 4.0

# Dev board ESP32-S3-DevKitC-1
dev_pcb_len = 62.74
dev_w = 25.4
dev_ant_overhang = 6.36
dev_mod_w = 18.0
dev_mod_len = 25.5
dev_mod_pcb_t = 0.8
dev_mod_h = 3.2
dev_usb_overhang = 0.8
dev_usb_gap = 0.2
dev_usb_uart_u = 6.1
dev_usb_otg_u = 19.5
dev_usb_h = 3.26
dev_boot_u = 7.8
dev_boot_v = 13.8
dev_btn_h = 2.0

# Board holder
pad_u0, pad_u1 = 4.5, 20.9
pad_a_v = (9, 17)
pad_b_v = (44, 56)
# v2.3 USB-end cradle fused to the end wall (replaces the board snap tabs)
cradle_v = 6.3
cradle_edge = 1.2
cradle_drop = 1.2
cheek_t = 2.0
cheek_up = 2.0
# antenna gate: solid block + two short pillars + a bridged bar
catch_engage = 3.0
catch_back = 2.5
catch_dn = 0.4
catch_up = 1.0
catch_jaw_t = 1.6
gate_clear = 0.8
gate_pillar = 3.2

# Arduino UNO R4 WiFi (datasheet ABX00087; u from the USB edge, v from the DC-jack-side edge)
uno_len = 68.58
uno_w = 53.34
uno_pcb_t = 1.6
uno_holes = [(13.97, 2.54), (15.24, 50.8), (66.04, 7.62), (66.04, 35.56)]
uno_hole_d = 3.2
uno_peg_d = 2.6
uno_peg_h = 3.0
uno_pad_d = 5.0
uno_standoff = 4.0
uno_usb_gap = 3.5
uno_back_gap = 5.0
uno_usb_v = 37.86
uno_usb_h = 3.0
uno_hdr_h = 8.5
uno_hdr_dig = (17.29, 65.02, 50.8)
uno_hdr_ana = (26.42, 65.02, 2.54)
uno_jack = (-2.2, 12.0, 4.1, 13.2, 11.0)
uno_post_u = 35
uno_post_u2 = 57    # analog-in strip; the power strip takes the amp's 5V and GND jumpers
uno_post_d = 5.0
uno_post_base = 9.0   # the lid posts are cones
uno_post_gap = 0.5

# IMU: SunFounder 10-axis, Qwiic (size ESTIMATED from the product render)
imu_pcb_t = 1.6
imu_pad_w = 30.0
imu_pad_d = 34.0
imu_pad_h = 3.0
imu_wall_gap = 3.5
imu_plug_room = 6.0
imu_pegs = True        # on since the fit_imu coupon fitted (11 Oct)
imu_hole_dx = 14.0
imu_hole_dy = 21.0
imu_peg_d = 2.6
imu_peg_h = 2.6

# Speaker "3128" (body from the builder's STEP file) and its clip-in holder under the lid
spk_enable = True
spk_w = 31.0
spk_d = 28.0
spk_t = 14.92
spk_clear = 0.4
spk_wall = 2.0
spk_pad = 1.0
spk_seg = 8.0
spk_lip = 1.0
spk_tongue_w = 10.0
spk_tongue_t = 2.0
spk_grille_r = 10.5

# USB-C slot
usb_slot_mode = "uart"  # uart | both | two
usb_plug_w = 13.0
usb_plug_h = 7.5

# Labels
label_font = "Helvetica Neue"   # OpenSCAD: "Helvetica Neue:style=Bold"
label_kind = "bold"
brand_text = "SLAP"
brand_size = 4.0
rec_text = "REC"
rec_size = 3.6
text_grow = 0.05
# OpenSCAD's text(size=s) gives an em of s/0.72 (cap height ~0.99*s in Helvetica
# Neue Bold); OCCT's fontsize is the em, so scale by this factor.
OPENSCAD_TEXT_EM = 1 / 0.72

# Underside
nfc_side = "bottom"  # bottom | none
nfc_size = 30
nfc_depth = 0.4
nfc_dx = 0
nfc_dy = 0
foot_d = 8
foot_depth = 0.6
foot_inset = 5.5

# =====================================================================
# Derived (same formulas as the SCAD "Derived" block)
# =====================================================================
def hole(d):
    return d + tol_hole


oled_seat = oled_stack_t - oled_pcb_t - oled_proud
oled_pocket_w = oled_pcb_w + 2 * tol_fit
oled_pocket_h = oled_pcb_h + 2 * tol_fit
oled_win_w = oled_glass_w + 2 * tol_window
oled_win_h = oled_glass_h + 2 * tol_window
oled_peg_d = oled_hole_d - 2 * tol_fit
mic_R = mic_d / 2 + mic_c
mic_hx = mic_bar_len / 2 + mic_anchor
mic_hy = mic_R + mic_bar_t
mic_hk_z0 = mic_pcb_t - mic_hook_pre
mic_hk_z1 = mic_hk_z0 + mic_hook_e
led_bore = hole(led_d)
led_boss_r = led_bore / 2 + tol_min_wall
led_win_d = hole(led_win)
btn_bore = hole(btn_cap + tol_shaft)
btn_guide_r = btn_bore / 2 + btn_guide_wall
grille_hole_d = min(hole(grille_hole), grille_pitch - tol_min_feat)
grille_span_x = (grille_cols - 1) * grille_pitch + grille_hole_d
grille_span_y = (grille_rows - 1) * grille_pitch + grille_hole_d

oled_left_k = wall + tol_fit + skirt_t + tol_snap + hook_t + 0.3 + oled_fence_t
oled_front_k = wall + tol_fit + skirt_t + 0.2
k_boot = wall + dev_usb_gap + dev_usb_overhang + dev_boot_v
L_req = k_boot - mic_dx + mic_hx + oled_left_k + oled_pocket_w + oled_fence_t + 0.3
L_uno = 2 * wall + uno_usb_gap + uno_len + imu_plug_room + imu_pad_w + imu_wall_gap
W_req = oled_front_k + oled_pocket_h + oled_fence_t + zone_gap + uno_w + uno_back_gap + wall
L = max(L_min, math.ceil(max(L_req, L_uno) * 2) / 2)
W = max(W_min, math.ceil(W_req * 2) / 2)

jumper_bot = floor_t + floor_clear + wire_bend
pcb_z0 = jumper_bot + jumper_h + header_spacer
pcb_top = pcb_z0 + dev_pcb_t
H_oled = pcb_top + dev_mod_h + top_clear + oled_back_keep + oled_stack_t
btn_bore_tmp = btn_cap + tol_shaft + tol_hole
collar_bot = pcb_top + dev_pin_above + btn_collar_clear
collar_seat = collar_bot + btn_flange_t + (btn_flange - btn_bore_tmp) / 2
H_btn = collar_seat + btn_stroke + plate_t
H_usb = pcb_top + dev_usb_h + tol_fit + plate_t + 1
uno_z0 = floor_t + uno_standoff
uno_top = uno_z0 + uno_pcb_t
H_uno = uno_top + uno_jack[4] + 1 + plate_t
H = max(H_oled, H_btn, H_usb, H_uno)
tray_h = H - plate_t

in_hx, in_hy = L / 2 - wall, W / 2 - wall
sk_ox, sk_oy = in_hx - tol_fit, in_hy - tol_fit
sk_ix, sk_iy = sk_ox - skirt_t, sk_oy - skirt_t
beam_fx, beam_fy = sk_ix - tol_snap, sk_iy - tol_snap

skirt_bot = tray_h - skirt_h
z_wb = skirt_bot + skirt_strip
d_ret = hook_lip * math.tan(math.radians(hook_return))
z_lip = z_wb + 0.05 + d_ret * (1 - tol_snap / hook_lip)
z_tip = z_lip + 0.4 + hook_lip
z_wt = z_tip + tol_snap
z_root = z_lip - d_ret - hook_len

oled_cx = -L / 2 + oled_left_k + oled_pocket_w / 2
oled_cy = -W / 2 + oled_front_k + oled_pocket_h / 2
oled_fence_end = oled_cx + oled_pocket_w / 2 + oled_fence_t

x_usb = L / 2 - wall - dev_usb_gap - dev_usb_overhang
mic_reach = 2.54 + jumper_w / 2
gy = oled_cy + grille_cy
dev_y_f = gy - mic_reach - 0.2 - dev_w


def dev_xy(u, v):
    return (x_usb - v, dev_y_f + u)


boot_xy = dev_xy(dev_boot_u, dev_boot_v)
btn_top = pcb_top + dev_btn_h
uart_y = dev_y_f + dev_usb_uart_u
otg_y = dev_y_f + dev_usb_otg_u
usb_z = pcb_top + dev_usb_h / 2
gx = boot_xy[0]
mic_xy = (gx + mic_dx, gy)
led_xy = (sk_ix - 0.2 - led_boss_r, gy + led_dy)
posts = [(x_usb - 3.5, uart_y), (x_usb - 3.5, otg_y)]
x_tip = x_usb - dev_pcb_len - dev_ant_overhang
dev_cy = dev_y_f + dev_w / 2
gate_w = dev_mod_w + 2 * gate_clear
gate_top = pcb_top + dev_mod_pcb_t + catch_up + catch_jaw_t

# UNO R4 WiFi: USB end at +X, DC-jack side toward the back wall
uno_x_usb = in_hx - uno_usb_gap
uno_y_b = in_hy - uno_back_gap


def uno_xy(u, v):
    return (uno_x_usb - u, uno_y_b - v)


uno_y_f = uno_y_b - uno_w
uno_usb_y = uno_y_b - uno_usb_v
uno_usb_z = uno_top + uno_usb_h / 2
uno_post_z = uno_top + uno_hdr_h + uno_post_gap
uno_posts = [uno_xy(uno_post_u, uno_hdr_dig[2]), uno_xy(uno_post_u2, uno_hdr_ana[2])]

# Speaker: under the lid over the back-left bay
spk_cx = -(beam_fx - hook_t) + 1.5 + spk_tongue_t + spk_clear + spk_w / 2
spk_cy = uno_y_f + 24
spk_zb = spk_pad + spk_t
spk_hw = spk_zb + 1.55
spk_grille = [(i * grille_pitch, j * grille_pitch) for i in range(-6, 7) for j in range(-6, 7)
              if math.hypot(i, j) * grille_pitch <= spk_grille_r]

# IMU pad: back-left bay
imu_cx = -in_hx + imu_wall_gap + imu_pad_w / 2
imu_cy = uno_y_f + imu_pad_d / 2
imu_peg_pos = [(sx * imu_hole_dx / 2, sy * imu_hole_dy / 2) for sx in (-1, 1) for sy in (-1, 1)]

btn_len = H + btn_proud - btn_top
btn_cone_h = (btn_flange - btn_cap) / 2
btn_flange_z = collar_bot + btn_flange_t + btn_cone_h - btn_top
btn_nose_l = collar_bot - btn_top
btn_guide_depth = H - (collar_seat + btn_stroke)

hxf = (oled_fence_end + sk_ix) / 2
hy_r = (led_xy[1] + led_boss_r + uno_y_f) / 2
hooks = [("left", oled_cy), ("left", uno_y_f + uno_w / 2), ("back", -L / 4), ("back", L / 4),
         ("front", hxf), ("right", hy_r)]
prys = [("back", 0), ("left", (oled_cy + uno_y_f + uno_w / 2) / 2)]

peg_pos = [(sx * (oled_pcb_w / 2 - oled_hole_inset_x), sy * (oled_pcb_h / 2 - oled_hole_inset_y))
           for sx in (-1, 1) for sy in (-1, 1)]
# OLED corner posts: inside the PCB outline by 0.5 + post/2 at every corner
def oled_post_in(sx):
    return oled_hdr_keep if (oled_hdr_side == "left" and sx < 0) or (oled_hdr_side == "right" and sx > 0) else 0


oled_post_pos = [(oled_cx + sx * (oled_pcb_w / 2 - (oled_hole_inset_x if oled_pins else 0.5 + oled_post / 2) - oled_post_in(sx)),
                  oled_cy + sy * (oled_pcb_h / 2 - (oled_hole_inset_y if oled_pins else 0.5 + oled_post / 2)))
                 for sx in (-1, 1) for sy in (-1, 1)]
oled_pin_tip = oled_pin_h - oled_post_gap - oled_pcb_t
oled_hdr_sx = -1 if oled_hdr_side == "left" else 1

usb_cw = usb_plug_w + 2 * tol_window
usb_ch = usb_plug_h + 2 * tol_window

# =====================================================================
# Helpers
# =====================================================================
def box(x0, y0, z0, dx, dy, dz):
    return cq.Solid.makeBox(dx, dy, dz, V(x0, y0, z0))


def cbox(cx, cy, z0, dx, dy, dz):
    return box(cx - dx / 2, cy - dy / 2, z0, dx, dy, dz)


def cyl(d, h, x, y, z):
    return cq.Solid.makeCylinder(d / 2, h, V(x, y, z))


def rr_wire(l, w, r, z=0.0):
    """Rounded rectangle centred on the Z axis (SCAD rr())."""
    hl, hw = l / 2, w / 2
    if r <= 0:
        return cq.Wire.makePolygon([V(-hl, -hw, z), V(hl, -hw, z), V(hl, hw, z), V(-hl, hw, z)], close=True)
    n = V(0, 0, 1)
    e = [
        cq.Edge.makeLine(V(-hl + r, -hw, z), V(hl - r, -hw, z)),
        cq.Edge.makeCircle(r, V(hl - r, -hw + r, z), n, -90, 0),
        cq.Edge.makeLine(V(hl, -hw + r, z), V(hl, hw - r, z)),
        cq.Edge.makeCircle(r, V(hl - r, hw - r, z), n, 0, 90),
        cq.Edge.makeLine(V(hl - r, hw, z), V(-hl + r, hw, z)),
        cq.Edge.makeCircle(r, V(-hl + r, hw - r, z), n, 90, 180),
        cq.Edge.makeLine(V(-hl, hw - r, z), V(-hl, -hw + r, z)),
        cq.Edge.makeCircle(r, V(-hl + r, -hw + r, z), n, 180, 270),
    ]
    return cq.Wire.assembleEdges(e)


def rr_prism(l, w, r, z0, h):
    return cq.Solid.extrudeLinear(cq.Face.makeFromWires(rr_wire(l, w, r, z0)), V(0, 0, h))


def loft(w0, w1):
    return cq.Solid.makeLoft([w0, w1], ruled=True)


def yz_prism(pts, width):
    """Polygon in (Y, Z), extruded along X, centred (SCAD rotate([90,0,90]) linear_extrude(center=true))."""
    return cq.Workplane("YZ").polyline(pts).close().extrude(width / 2, both=True).val()


def revolve_z(profile, x=0.0, y=0.0, z=0.0):
    """Revolve an (r, z) profile about the Z axis and place it."""
    s = cq.Workplane("XZ").polyline(profile).close().revolve(360, (0, 0, 0), (0, 1, 0)).val()
    return s.moved(cq.Location(V(x, y, z)))


def fuse(base, *others):
    return base.fuse(*others).clean() if others else base


def cut(base, *others):
    return base.cut(*others).clean() if others else base


OFFSET_JOINS: dict = {}  # how many wires were offset with each join type


def _wire_area(w):
    return cq.Face.makeFromWires(w).Area()


def offset_face(face, d):
    """SCAD offset(delta=d) of a planar face: outer wire grows by d, holes shrink by d
    (sharp corners, GeomAbs_Intersection)."""
    def off(w, grow):
        for join in (GeomAbs_Intersection, GeomAbs_Arc):  # sharp corners; round if OCCT gives up
            cands = []
            for s in (d, -d):
                try:
                    mk = BRepOffsetAPI_MakeOffset(w.wrapped, join)
                    mk.Perform(s)
                    if not mk.IsDone() or mk.Shape().IsNull():
                        continue
                    res = cq.Shape.cast(mk.Shape())
                    ws = [res] if isinstance(res, cq.Wire) else res.Wires()
                    if ws:
                        cands.append(max(ws, key=_wire_area))
                except Exception:
                    continue
            ref = _wire_area(w)
            # keep only results on the requested side of the original
            cands = [c for c in cands if (_wire_area(c) > ref) == grow]
            if cands:
                OFFSET_JOINS[join] = OFFSET_JOINS.get(join, 0) + 1
                return cands[0]
        raise RuntimeError("offset failed")

    outer = off(face.outerWire(), d > 0)
    inners = [off(w, d < 0) for w in face.innerWires()]
    f = cq.Face.makeFromWires(outer, inners)
    if any(e.geomType() == "OFFSET" for e in f.Edges()):
        # OCCT offset curves do not survive a STEP round trip; store them as B-splines
        f = cq.Face(BRepBuilderAPI_NurbsConvert(f.wrapped, True).Shape())
    return f


def at_wall(shape, side, along):
    """SCAD at_wall(): local +Y points at the wall, origin on the hook beam's outer face."""
    o = V(0, 0, 0)
    z = V(0, 0, 1)
    if side == "back":
        return shape.moved(cq.Location(V(along, beam_fy, 0)))
    if side == "front":
        return shape.rotate(o, z, 180).moved(cq.Location(V(along, -beam_fy, 0)))
    if side == "right":
        return shape.rotate(o, z, -90).moved(cq.Location(V(beam_fx, along, 0)))
    return shape.rotate(o, z, 90).moved(cq.Location(V(-beam_fx, along, 0)))


# ---------------------------------------------------------------------
# Hook, catch window, snap tabs
# ---------------------------------------------------------------------
def hook_3d():
    n_wall = tol_snap + skirt_t + tol_fit + 0.5
    beam = yz_prism([(-hook_t, z_root), (0, z_root), (0, z_tip), (-hook_t, z_tip)], hook_w)
    lip = yz_prism([(0, z_lip - d_ret), (hook_lip, z_lip), (hook_lip, z_lip + 0.4), (0, z_tip)], hook_w)
    root = yz_prism([(-hook_t, z_root + 0.01), (-hook_t, z_root - 2),
                     (n_wall, z_root - 2 - (n_wall + hook_t)), (n_wall, z_root + 0.01)], hook_w)
    return fuse(beam, lip, root)


def catch_window():
    return box(-(hook_w + 0.6) / 2, tol_snap - 0.05, z_wb, hook_w + 0.6, skirt_t + 0.1, z_wt - z_wb)


def pcb_peg(d, h, x, y, z):
    """SCAD pcb_peg(): straight shaft with a 0.6 mm lead-in cone, base at z."""
    return revolve_z([(0, 0), (d / 2, 0), (d / 2, h - 0.6), (d / 2 - 0.4, h), (0, h)], x, y, z)


def slot_solid(x0, length, yc, zc, wy, hz):
    """SCAD slot2d() in (Y, Z), extruded along +X from x0."""
    return cq.Workplane("YZ", origin=(x0, 0, 0)).center(yc, zc).slot2D(wy, hz).extrude(length).val()


def speaker_holder():
    """SCAD speaker_holder_up(), placed under the lid (SCAD: translate z = tray_h + 0.01, mirror z)."""
    a, b, t = spk_w / 2 + spk_clear, spk_d / 2 + spk_clear, spk_wall
    zl = tray_h + 0.01

    def ubox(x0, y0, z0, dx, dy, dz):   # box given in the holder's own frame (z into the housing)
        return box(spk_cx + x0, spk_cy + y0, zl - (z0 + dz), dx, dy, dz)

    def catch(sx, y0, y1):              # SCAD spk_catch_2d(sx), extruded from y0 to y1
        pts = [(sx * (a + 0.5), spk_zb - 0.75), (sx * (a - spk_lip), spk_zb + 0.75), (sx * (a - 0.4), spk_zb + 1.35),
               (sx * (a + 0.5), spk_zb + 1.35)]
        return (cq.Workplane("XZ", origin=(0, spk_cy + y1, 0))
                .polyline([(spk_cx + x, zl - z) for x, z in pts]).close().extrude(y1 - y0).val())

    parts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(ubox(sx * (spk_w / 2 - 2) - 2, sy * (spk_d / 2 - 2) - 2, -0.01, 4, 4, spk_pad + 0.01))
            parts.append(ubox(a + t - spk_seg if sx > 0 else -a - t, b if sy > 0 else -b - t, -0.01,
                              spk_seg, t, spk_hw + 0.01))
    for sy in (-1, 1):
        parts.append(ubox(a, b + t - spk_seg if sy > 0 else -b - t, -0.01, t, spk_seg, spk_hw + 0.01))
        y1 = b + 0.5 if sy > 0 else -b + spk_seg - t - 0.5
        parts.append(catch(1, y1 - (spk_seg - t), y1))
        parts.append(ubox(-a - t, b + t - 5 if sy > 0 else -b - t, -0.01, t, 5, spk_hw + 0.01))
    parts.append(ubox(-a - spk_tongue_t, -spk_tongue_w / 2, -0.01, spk_tongue_t, spk_tongue_w, spk_hw + 0.01))
    parts.append(catch(-1, -spk_tongue_w / 2 + 0.5, spk_tongue_w / 2 - 0.5))
    return parts


def mic_snap():
    """SCAD mic_snap_up(), placed under the lid (SCAD: translate z = tray_h, mirror z)."""
    mx, my = mic_xy
    zl = tray_h
    parts = []
    # rigid cheeks on the +/-X sides, minus the pocket and the bars' flex slots
    for sx in (-1, 1):
        blk = box(mx + (mic_cheek_x0 if sx > 0 else -mic_hx), my - mic_hy, zl - mic_hold_h,
                  mic_hx - mic_cheek_x0, 2 * mic_hy, mic_hold_h + 0.01)
        cuts = [cyl(2 * mic_R, mic_hold_h + 2, mx, my, zl - mic_hold_h - 1)]
        for sy in (-1, 1):
            cuts.append(box(mx if sx > 0 else mx - mic_bar_len / 2,
                            my + mic_R - mic_slot if sy > 0 else my - mic_hy - 1,
                            zl - mic_hold_h - 1, mic_bar_len / 2, mic_bar_t + mic_slot + 1, mic_hold_h + 2))
        parts.append(cut(blk, *cuts))
    # spring bars on the +/-Y sides, each with a hook at mid-span
    hook = [(mic_R + 0.01, mic_hk_z0 - 0.01), (mic_R - mic_hook_e, mic_hk_z1), (mic_R - mic_hook_e, mic_hk_z1 + 0.1),
            (mic_R, mic_hold_h), (mic_R + 0.01, mic_hold_h)]
    for sy in (-1, 1):
        parts.append(box(mx - mic_bar_len / 2 - 0.01, my + mic_R if sy > 0 else my - mic_R - mic_bar_t,
                         zl - mic_hold_h, mic_bar_len + 0.02, mic_bar_t, mic_hold_h - mic_bar_gap))
        parts.append(yz_prism([(my + sy * y, zl - u) for y, u in hook], mic_hook_w).moved(cq.Location(V(mx, 0, 0))))
    return parts


def pry_slot(side, along):
    if side == "back":
        return box(along - pry_w / 2, in_hy - 0.1, tray_h - pry_d, pry_w, wall + 1, pry_d + 1)
    if side == "front":
        return box(along - pry_w / 2, -in_hy - wall - 0.9, tray_h - pry_d, pry_w, wall + 1, pry_d + 1)
    if side == "right":
        return box(in_hx - 0.1, along - pry_w / 2, tray_h - pry_d, wall + 1, pry_w, pry_d + 1)
    return box(-in_hx - wall - 0.9, along - pry_w / 2, tray_h - pry_d, wall + 1, pry_w, pry_d + 1)


def oled_peg(x, y, z_seat):
    """Necked peg growing downward from the seat plane (SCAD oled_peg())."""
    shaft = oled_pcb_t + 0.1
    neck = clip_t + 0.15
    cone = (oled_peg_d - peg_neck_d) / 2
    rp, rn = oled_peg_d / 2, peg_neck_d / 2
    d1, d2, d3 = shaft, shaft + neck, shaft + neck + cone
    d4, d5 = d3 + 0.39, d3 + 0.69
    prof = [(0, 0.3), (rp, 0.3), (rp, -d1), (rn, -d1), (rn, -d2), (rp, -d3), (rp, -d4),
            (rp - 0.3, -d5), (0, -d5)]
    return revolve_z(prof, x, y, z_seat)


def usb_slot_cutter(x0, length):
    """SCAD usb_slot_2d() in (Y, Z), extruded along +X from x0."""
    def slot(yc, wy, hz):
        return slot_solid(x0, length, yc, usb_z, wy, hz)

    if usb_slot_mode == "uart":
        return [slot(uart_y, usb_cw, usb_ch)]
    if usb_slot_mode == "two":
        return [slot(uart_y, usb_cw, usb_ch), slot(otg_y, usb_cw, usb_ch)]
    y0 = min(uart_y, otg_y) - usb_cw / 2
    y1 = max(uart_y, otg_y) + usb_cw / 2
    return [slot((y0 + y1) / 2, y1 - y0, usb_ch)]


# ---------------------------------------------------------------------
# Labels (engraved, offset by text_grow like the SCAD label_2d())
# ---------------------------------------------------------------------
def label_solid(txt, size, cx, cy, z0, h):
    wp = cq.Workplane("XY").text(txt, size * OPENSCAD_TEXT_EM, 1.0, font=label_font, kind=label_kind,
                                 halign="center", valign="center", combine=False)
    solid = wp.val()
    bb = solid.BoundingBox()
    dy = -(bb.ymin + bb.ymax) / 2  # SCAD valign=center centres the glyph ink box
    faces = [f for f in solid.Faces() if abs(f.Center().z) < 1e-6 and abs(f.normalAt().z) > 0.99]
    out = []
    for f in faces:
        g = offset_face(f, text_grow) if text_grow > 0 else f
        s = cq.Solid.extrudeLinear(g, V(0, 0, h))
        out.append(s.moved(cq.Location(V(cx, cy + dy, z0))))
    return out


def labels_cutters(z0, h):
    rec_y = (boot_xy[1] + btn_cap / 2 + gy - grille_span_y / 2) / 2
    return (label_solid(rec_text, rec_size, gx, rec_y, z0, h)
            + label_solid(brand_text, brand_size, gx, -W / 2 + 4.5, z0, h))


# =====================================================================
# Top plate (lid), closed position
# =====================================================================
def top():
    plate = fuse(rr_prism(L, W, corner_r, tray_h, plate_t - top_chamfer),
                 loft(rr_wire(L, W, corner_r, H - top_chamfer),
                      rr_wire(L - 2 * top_chamfer, W - 2 * top_chamfer, corner_r - top_chamfer, H)))
    adds = []
    # registration skirt
    adds.append(cut(rr_prism(2 * sk_ox, 2 * sk_oy, corner_r - wall, skirt_bot, skirt_h + 0.01),
                    rr_prism(2 * sk_ix, 2 * sk_iy, 0.5, skirt_bot - 1, skirt_h + 2)))
    # OLED seat pad + fence, clipped to the skirt outline
    z_pad = H - oled_seat - oled_fence_h
    h_pad = oled_seat + oled_fence_h - plate_t + 0.01
    pad = cbox(oled_cx, oled_cy, z_pad, oled_pocket_w + 2 * oled_fence_t, oled_pocket_h + 2 * oled_fence_t, h_pad)
    adds.append(pad.intersect(rr_prism(2 * sk_ox, 2 * sk_oy, 0.5, z_pad - 1, h_pad + 2)))
    # mic snap-in holder, LED socket (trimmed out of the mic pocket), button guide, hold-down posts
    adds += mic_snap()
    adds.append(cut(cq.Solid.makeCylinder(led_boss_r, led_boss_depth - plate_t + 0.01,
                                          V(led_xy[0], led_xy[1], H - led_boss_depth)),
                    cyl(2 * (mic_R + 0.01), led_boss_depth, mic_xy[0], mic_xy[1], H - led_boss_depth - 1)))
    adds.append(cq.Solid.makeCylinder(btn_guide_r, btn_guide_depth - plate_t + 0.01,
                                      V(gx, boot_xy[1], H - btn_guide_depth)))
    z_post = pcb_top + dev_usb_h + tol_fit
    for p in posts:
        adds.append(cyl(post_d, tray_h - z_post + 0.01, p[0], p[1], z_post))
    if spk_enable:
        adds += speaker_holder()
    # hold-down posts onto the UNO's two header rows
    for p in uno_posts:
        adds.append(cq.Solid.makeCone(uno_post_d / 2, uno_post_base / 2, tray_h - uno_post_z + 0.01,
                                      V(p[0], p[1], uno_post_z)))
    body = fuse(plate, *adds)

    cuts = []
    # OLED PCB pocket, glass window, 0.3 chamfer at the top edge
    cuts.append(cbox(oled_cx, oled_cy, H - oled_seat - oled_fence_h - 1, oled_pocket_w, oled_pocket_h, oled_fence_h + 1))
    wx, wy = oled_cx + oled_glass_dx, oled_cy + oled_glass_dy
    cuts.append(cbox(wx, wy, H - oled_seat - 1, oled_win_w, oled_win_h, oled_seat + 2))
    e = 0.1  # carry the 45 deg chamfer 0.1 above the top face so the cut is clean
    cuts.append(loft(cq.Wire.makePolygon([V(wx + sx * oled_win_w / 2, wy + sy * oled_win_h / 2, H - tol_efoot)
                                          for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))], close=True),
                     cq.Wire.makePolygon([V(wx + sx * (oled_win_w / 2 + tol_efoot + e),
                                            wy + sy * (oled_win_h / 2 + tol_efoot + e), H + e)
                                          for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))], close=True)))
    # lead-ins where the OLED enters: lower edge of the window and of the PCB pocket
    def rect(cx, cy, w, h, z):
        return cq.Wire.makePolygon([V(cx + sx * w / 2, cy + sy * h / 2, z)
                                    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))], close=True)
    za = H - oled_seat
    cuts.append(loft(rect(wx, wy, oled_win_w + 2 * oled_lead, oled_win_h + 2 * oled_lead, za),
                     rect(wx, wy, oled_win_w, oled_win_h, za + oled_lead)))
    zb = H - oled_seat - oled_fence_h
    cuts.append(loft(rect(oled_cx, oled_cy, oled_pocket_w + 2 * oled_lead, oled_pocket_h + 2 * oled_lead, zb),
                     rect(oled_cx, oled_cy, oled_pocket_w, oled_pocket_h, zb + oled_lead)))
    # blind reliefs in the seat for the tips of the tray pins
    if oled_pins:
        for px, py in oled_post_pos:
            cuts.append(cyl(hole(oled_pin_d + 1.0), oled_pin_tip + 0.6 + 0.01, px, py, H - oled_seat - 0.01))
    # relief in the seat over the header strip, from the pocket edge to the window edge
    if oled_hdr_side != "back":
        xp = oled_cx + oled_hdr_sx * oled_pocket_w / 2
        xw = wx + oled_hdr_sx * oled_win_w / 2
        cuts.append(box(min(xp, xw) - (0.01 if oled_hdr_sx > 0 else 0), oled_cy - oled_pocket_h / 2,
                        H - oled_seat - 0.01, abs(xp - xw) + 0.01, oled_pocket_h, oled_hdr_relief + 0.01))
    # grille
    for i in range(grille_cols):
        for j in range(grille_rows):
            cuts.append(cyl(grille_hole_d, plate_t + 1,
                            gx + (i - (grille_cols - 1) / 2) * grille_pitch,
                            gy + (j - (grille_rows - 1) / 2) * grille_pitch, tray_h - 0.01))
    # speaker grille
    if spk_enable:
        for qx, qy in spk_grille:
            cuts.append(cyl(grille_hole_d, plate_t + 1, spk_cx + qx, spk_cy + qy, tray_h - 0.01))
    # LED bore + window (blind, led_skin left on top in "window" mode)
    cuts.append(cyl(led_bore, led_boss_depth + 1 - led_top_gap, led_xy[0], led_xy[1], H - led_boss_depth - 1))
    cuts.append(cyl(led_win_d, led_top_gap + 1 if led_mode == "hole" else led_top_gap - led_skin + 0.01,
                    led_xy[0], led_xy[1], H - led_top_gap - 0.01))
    # button bore + 0.3 chamfer
    cuts.append(cyl(btn_bore, btn_guide_depth + 2, gx, boot_xy[1], H - btn_guide_depth - 1))
    cuts.append(cq.Solid.makeCone(btn_bore / 2, btn_bore / 2 + tol_efoot + e, tol_efoot + e,
                                  V(gx, boot_xy[1], H - tol_efoot)))
    # skirt notch over the USB-C slot
    cuts += usb_slot_cutter(sk_ix - 0.5, L)
    # catch windows
    for side, along in hooks:
        cuts.append(at_wall(catch_window(), side, along))
    # labels
    if show_text:
        cuts += labels_cutters(H - tol_text_depth, tol_text_depth + 1)
    body = cut(body, *cuts)

    if not oled_pegs:
        return body
    pegs = [oled_peg(oled_cx + p[0], oled_cy + p[1], H - oled_seat) for p in peg_pos]
    return fuse(body, *pegs)


# =====================================================================
# Tray
# =====================================================================
def imu_mount():
    """SCAD imu_mount() placed in the tray: flat pad, plus four pegs once imu_pegs is on."""
    parts = [cbox(imu_cx, imu_cy, floor_t - 0.01, imu_pad_w, imu_pad_d, imu_pad_h + 0.01)]
    if imu_pegs:
        parts += [pcb_peg(imu_peg_d, imu_peg_h, imu_cx + qx, imu_cy + qy, floor_t + imu_pad_h - 0.01)
                  for qx, qy in imu_peg_pos]
    return parts


def uno_mount():
    """SCAD uno_mount(): four standoffs at the mounting holes, each with a peg."""
    parts = []
    for u, v in uno_holes:
        x, y = uno_xy(u, v)
        parts.append(cyl(uno_pad_d, uno_standoff + 0.01, x, y, floor_t - 0.01))
        parts.append(pcb_peg(uno_peg_d, uno_peg_h, x, y, floor_t - 0.01 + uno_standoff))
    return parts


def antenna_gate():
    """SCAD antenna_gate(): solid block, a short pillar each side and a bar bridged across them."""
    x0, lx = x_tip - catch_back, catch_engage + catch_back
    parts = [box(x0, dev_cy - gate_w / 2 - gate_pillar, floor_t - 0.01,
                 lx, gate_w + 2 * gate_pillar, pcb_top - catch_dn - floor_t + 0.01)]
    for sy in (-1, 1):
        y0 = dev_cy + (gate_w / 2 if sy > 0 else -gate_w / 2 - gate_pillar)
        parts.append(box(x0, y0, floor_t - 0.01, lx, gate_pillar, gate_top - floor_t + 0.01))
    parts.append(box(x0, dev_cy - gate_w / 2 - gate_pillar, gate_top - catch_jaw_t,
                     lx, gate_w + 2 * gate_pillar, catch_jaw_t))
    return parts


def oled_post_braces():
    """SCAD oled_post_braces(): divider wall under the back posts (low tie to the left wall under the
    header strip), and a tie to the front wall for each front post."""
    post_top = H - oled_stack_t - oled_post_gap
    x0 = min(p[0] for p in oled_post_pos) - oled_post / 2
    x1 = max(p[0] for p in oled_post_pos) + oled_post / 2
    y = max(p[1] for p in oled_post_pos)
    low = H - oled_stack_t - header_spacer - jumper_h - wire_bend - 2.0
    divider = cut(box(x0, y - oled_rib_t / 2, floor_t - 0.01, x1 - x0, oled_rib_t, post_top - oled_rib_drop - floor_t + 0.01),
                  # wire crossing
                  box(x1 - oled_post - oled_rib_fin - oled_rib_gap_w, y - oled_rib_t, floor_t + oled_rib_sill,
                      oled_rib_gap_w, 2 * oled_rib_t, H))
    parts = [divider,
             box(-in_hx - 0.5, y - oled_rib_t / 2, floor_t - 0.01, x0 + in_hx + 0.5 + 0.01, oled_rib_t, low - floor_t + 0.01)]
    for px, py in oled_post_pos:
        if py < oled_cy:
            parts.append(box(px - oled_post / 2, -in_hy - 0.5, floor_t - 0.01,
                             oled_post, py - oled_post / 2 + in_hy + 0.5 + 0.01, skirt_bot - 0.6 - floor_t + 0.01))
    return parts


def usb_cradle():
    """SCAD usb_cradle(): ledge + cheeks at the USB end, run forward into the end wall."""
    x0, x1 = x_usb - cradle_v, in_hx + 0.5
    y0, y1 = dev_y_f - dev_clear - cheek_t, dev_y_f + dev_w + dev_clear + cheek_t
    block = box(x0, y0, floor_t - 0.01, x1 - x0, y1 - y0, pcb_top + cheek_up - floor_t + 0.01)
    return cut(block,
               # PCB slot between the cheeks, open upward
               box(x0 - 1, dev_y_f - dev_clear, pcb_z0, x1 - x0 + 2, dev_w + 2 * dev_clear, 50),
               # ledge drop under the middle of the strip, edges stay full height
               box(x0 - 1, dev_y_f + cradle_edge, pcb_z0 - cradle_drop,
                   x1 - x0 + 2, dev_w - 2 * cradle_edge, cradle_drop + 1),
               # end wall's inner face clear above the PCB
               box(x_usb, dev_y_f - dev_clear, pcb_z0, x1 - x_usb + 1, dev_w + 2 * dev_clear, 50))


def tray():
    shell = fuse(loft(rr_wire(L - 2 * tol_efoot, W - 2 * tol_efoot, corner_r - tol_efoot, 0),
                      rr_wire(L, W, corner_r, tol_efoot)),
                 rr_prism(L, W, corner_r, tol_efoot, tray_h - tol_efoot))
    shell = cut(shell, rr_prism(2 * in_hx, 2 * in_hy, corner_r - wall, floor_t, tray_h))

    adds = [at_wall(hook_3d(), s, a) for s, a in hooks]
    for v0, v1 in (pad_a_v, pad_b_v):
        p0 = dev_xy(pad_u0, v1)
        adds.append(box(p0[0], p0[1], floor_t - 0.01, v1 - v0, pad_u1 - pad_u0, pcb_z0 - floor_t + 0.01))
    adds.append(usb_cradle())
    for px, py in oled_post_pos:
        adds.append(box(px - oled_post / 2, py - oled_post / 2, floor_t - 0.01, oled_post, oled_post,
                        H - oled_stack_t - oled_post_gap - floor_t + 0.01))
    if oled_pins:
        adds += [pcb_peg(oled_pin_d, oled_pin_h, px, py, H - oled_stack_t - oled_post_gap - 0.01)
                 for px, py in oled_post_pos]
    adds += oled_post_braces()
    adds += antenna_gate()
    adds += uno_mount()
    adds += imu_mount()
    body = fuse(shell, *adds)

    # USB-C slot, continued 1.5 mm inside the end wall so the overmold clears the cradle cheeks
    cuts = usb_slot_cutter(x_usb - 1.5, L / 2 + 1 - (x_usb - 1.5))
    # UNO USB-C slot in the same end wall
    cuts.append(slot_solid(in_hx - 0.1, wall + 1.1, uno_usb_y, uno_usb_z, usb_cw, usb_ch))
    cuts += [pry_slot(s, a) for s, a in prys]
    for sx in (-1, 1):
        for sy in (-1, 1):
            cuts.append(cyl(hole(foot_d), foot_depth + 1, sx * (L / 2 - foot_inset), sy * (W / 2 - foot_inset), -1))
    if nfc_side == "bottom":
        s = nfc_size + 2 * tol_fit
        cuts.append(cbox(oled_cx + nfc_dx, oled_cy + nfc_dy, -1 + nfc_depth / 2 - (2 + nfc_depth) / 2, s, s, 2 + nfc_depth))
    return cut(body, *cuts)


# =====================================================================
# Button (nose-down, z = 0 at the nose tip) and OLED clip
# =====================================================================
def button():
    z_f0 = btn_flange_z - btn_flange_t - btn_cone_h
    prof = [(0, 0), (btn_nose / 2, 0), (btn_nose / 2, btn_nose_l)]
    if z_f0 - btn_nose_l > 0.05:
        prof += [(btn_shaft / 2, btn_nose_l), (btn_shaft / 2, z_f0)]
    prof += [(btn_flange / 2, z_f0), (btn_flange / 2, z_f0 + btn_flange_t), (btn_cap / 2, btn_flange_z),
             (btn_cap / 2, btn_len - 0.5), (btn_cap / 2 - 0.5, btn_len), (0, btn_len)]
    return revolve_z(prof)


def oled_clip():
    """Fork clip: x = 0 at the PCB edge, +x toward the OLED centre; ef_extrude(clip_t)."""
    pp = oled_pcb_h / 2 - oled_hole_inset_y
    slot = peg_neck_d - clip_snap
    h = 1.0
    plate = box(0, -(oled_pcb_h - 1) / 2, 0, clip_w, oled_pcb_h - 1, h)
    cuts = []
    for sy in (-1, 1):
        cx, cy = oled_hole_inset_x, sy * pp
        cuts.append(cyl(hole(peg_neck_d), h + 2, cx, cy, -1))
        cuts.append(box(cx, cy - slot / 2, -1, clip_w, slot, h + 2))
        fx = cx + clip_w - oled_hole_inset_x
        flare = [(-0.8, -slot / 2), (0.01, -slot / 2 - 0.5), (0.01, slot / 2 + 0.5), (-0.8, slot / 2)]
        cuts.append(cq.Workplane("XY", origin=(fx, cy, -1)).polyline(flare).close().extrude(h + 2).val())
        for s in (-1, 1):
            y = s * (slot / 2 + 1.0) + (-tol_min_feat if s < 0 else 0)
            cuts.append(box(cx - 1.3, cy + y, -1, clip_w, tol_min_feat, h + 2))
    face = cut(plate, *cuts).Faces()
    face = [f for f in face if abs(f.Center().z) < 1e-9 and abs(f.normalAt().z) > 0.99][0]
    first = cq.Solid.extrudeLinear(offset_face(face, -tol_efoot), V(0, 0, tol_efoot + 0.01))
    rest = cq.Solid.extrudeLinear(face, V(0, 0, clip_t - tol_efoot)).moved(cq.Location(V(0, 0, tol_efoot)))
    return fuse(first, rest)


# =====================================================================
# Assembly (closed position)
# =====================================================================
def build():
    parts = {"Tray": tray(), "Lid": top(), "Button": button()}
    if oled_pegs:  # SCAD clips_placed() is empty without the pegs
        parts["OledClip"] = oled_clip()
    return parts


def clip_locations():
    """SCAD clips_placed(): left clip as modelled, right clip mirrored in X. The clip is
    symmetric in Y, so the mirror is the same as a 180 deg turn about Z (a rigid move)."""
    z = H - oled_stack_t - 0.1 - clip_t
    return [cq.Location(V(oled_cx - oled_pcb_w / 2, oled_cy, z)),
            cq.Location(V(oled_cx + oled_pcb_w / 2, oled_cy, z), V(0, 0, 1), 180)]


def assembly(parts):
    grey = cq.Color(0.85, 0.85, 0.85)
    a = cq.Assembly(name="Slap_housing")
    a.add(parts["Tray"], name="Tray", color=grey)
    a.add(parts["Lid"], name="Lid", color=grey)
    a.add(parts["Button"], name="Button", loc=cq.Location(V(gx, boot_xy[1], btn_top)),
          color=cq.Color(1.0, 0.416, 0.0))
    if "OledClip" in parts:
        l0, l1 = clip_locations()
        a.add(parts["OledClip"], name="OledClip", loc=l0, color=grey)
        a.add(parts["OledClip"], name="OledClip_2", loc=l1, color=grey)
    return a


def placed(parts):
    """Every body of the closed assembly as a located shape (for the STL and checks)."""
    out = [parts["Tray"], parts["Lid"], parts["Button"].moved(cq.Location(V(gx, boot_xy[1], btn_top)))]
    if "OledClip" in parts:
        l0, l1 = clip_locations()
        out += [parts["OledClip"].moved(l0), parts["OledClip"].moved(l1)]
    return out


FILES = {"Tray": "Slap_tray.step", "Lid": "Slap_lid.step", "Button": "Slap_button.step",
         "OledClip": "Slap_oled_clip.step"}
# OpenSCAD STL and the move that takes our modelling frame to the STL's frame
STLS = {"Tray": ("slab_tray.stl", None), "Lid": ("slab_top.stl", "flip"),
        "Button": ("slab_button.stl", "button"), "OledClip": ("slab_oled_clip.stl", None)}
SCAD_PARTS = {"Tray": "tray", "Lid": "top", "Button": "button", "OledClip": "oled_clip"}


def export(parts):
    for name, f in FILES.items():
        if name in parts:
            cq.exporters.export(parts[name], str(HERE / f))
        elif (HERE / f).exists():
            (HERE / f).unlink()  # stale part (e.g. the OLED clip while oled_pegs is off)
    assembly(parts).export(str(HERE / "Slap_housing.step"))
    cq.exporters.export(cq.Compound.makeCompound(placed(parts)), str(HERE / "Slap_housing_cq.stl"),
                        tolerance=0.01, angularTolerance=0.1)


def to_stl_frame(shape, how):
    if how == "flip":    # SCAD top print_orient: translate([0,0,H]) rotate([180,0,0])
        return shape.rotate(V(0, 0, 0), V(1, 0, 0), 180).moved(cq.Location(V(0, 0, H)))
    if how == "button":  # SCAD button print_orient: translate([0,0,btn_len]) rotate([180,0,0])
        return shape.rotate(V(0, 0, 0), V(1, 0, 0), 180).moved(cq.Location(V(0, 0, btn_len)))
    return shape


def tight_bbox(shape):
    """Bounding box from a 0.005 mm tessellation. OCCT's BoundingBox() is padded by edge
    tolerances; tessellation vertices lie on the surface, so this is within 0.005 mm."""
    import numpy as np

    vs, _ = shape.tessellate(0.005, 0.05)
    p = np.array([v.toTuple() for v in vs])
    return np.array([p.min(axis=0), p.max(axis=0)])


def reference_stls(parts):
    """Directory holding slab_<part>.stl for every part: --ref DIR, else fresh OpenSCAD exports."""
    import shutil
    import subprocess
    import tempfile

    if "--ref" in sys.argv:
        return Path(sys.argv[sys.argv.index("--ref") + 1])
    exe = shutil.which("openscad")
    if not exe:
        print("openscad not on PATH: comparing against ../stl (may be stale)")
        return HERE.parent / "stl"
    out = Path(tempfile.mkdtemp(prefix="slab_ref_"))
    for name in parts:
        subprocess.run([exe, "--backend=Manifold", "-q", "-o", str(out / STLS[name][0]),
                        "-D", f'part="{SCAD_PARTS[name]}"', str(HERE.parent / "housing_slab.scad")], check=True)
    return out


def verify(parts):
    import numpy as np
    import trimesh

    ref_dir = reference_stls(parts)

    def mesh_of(shape):
        vs, ts = shape.tessellate(0.005, 0.05)
        m = trimesh.Trimesh(np.array([v.toTuple() for v in vs]), np.array(ts), process=True)
        m.merge_vertices()
        return m

    print(f"\n== CadQuery vs OpenSCAD STL ({ref_dir}, merged vertices) ==")
    for name in parts:
        fn, how = STLS[name]
        s = to_stl_frame(parts[name], how)
        ref = trimesh.load(ref_dir / fn, process=True)
        ref.merge_vertices()
        cqb = tight_bbox(s)
        vol = s.Volume()
        dv = (vol - ref.volume) / ref.volume * 100
        dbb = np.abs(cqb - ref.bounds).max()
        line = (f"{name:9s} vol CQ {vol:10.2f}  STL {ref.volume:10.2f}  d {dv:+.3f} %   "
                f"bbox CQ {np.round(cqb, 3).tolist()}  max|d| {dbb:.3f} mm")
        try:
            m = mesh_of(s)
            sym = m.difference(ref, engine="manifold").volume + ref.difference(m, engine="manifold").volume
            line += f"   sym-diff {sym:.2f} mm3"
            # surface deviation both ways: 20k samples on each surface to the other surface
            pa = trimesh.sample.sample_surface_even(ref, 20000, seed=1)[0]
            pb = trimesh.sample.sample_surface_even(m, 20000, seed=1)[0]
            da = np.abs(trimesh.proximity.signed_distance(m, pa))
            db = np.abs(trimesh.proximity.signed_distance(ref, pb))
            d = np.concatenate([da, db])
            line += f"   surface dev p99.9 {np.percentile(d, 99.9):.3f} max {d.max():.3f} mm"
        except Exception as ex:  # manifold3d / rtree missing or mesh not watertight
            line += f"   sym-diff n/a ({type(ex).__name__}: {ex})"
        print(line)

    print("\n== STEP read-back ==")
    for f in [FILES[n] for n in parts] + ["Slap_housing.step"]:
        w = cq.importers.importStep(str(HERE / f))
        shp = w.val() if len(w.vals()) == 1 else cq.Compound.makeCompound(w.vals())
        solids = shp.Solids()
        print(f"{f:20s} valid {shp.isValid()}  solids {len(solids)}  all solids valid "
              f"{all(x.isValid() for x in solids)}  faces {len(shp.Faces())}  vol {shp.Volume():.2f}")
    a = assembly(parts)
    print("assembly children:", [c.name for c in a.children])


def main():
    parts = build()
    print(f"SLAB v3.5 (CadQuery): outer L x W x H = {L} x {W} x {H:.2f} mm, tray_h {tray_h:.2f}")
    for name, s in parts.items():
        (x0, y0, z0), (x1, y1, z1) = tight_bbox(s)
        print(f"{name:9s} valid {s.isValid()}  solids {len(s.Solids())}  vol {s.Volume():10.2f} mm3  "
              f"bbox [{x0:.3f}, {y0:.3f}, {z0:.3f}] .. [{x1:.3f}, {y1:.3f}, {z1:.3f}]  faces {len(s.Faces())}")
    export(parts)
    if "--no-verify" not in sys.argv:
        verify(parts)


if __name__ == "__main__":
    main()
