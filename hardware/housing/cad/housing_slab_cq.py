"""SLAP desk housing v2.3 "slab" rebuilt in CadQuery for a Fusion-openable STEP.

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
L_min = 104
W_min = 50
corner_r = 3
top_chamfer = 0.8
wall = 2.0
plate_t = 2.0
skirt_h = 3.0
skirt_t = 1.2
floor_t = 2.0

# Snap hooks / catches
hook_w = 5.0
hook_t = 1.2
hook_len = 9.0
hook_lip = 0.8
hook_return = 35
skirt_strip = 1.2
pry_w = 3
pry_d = 1

# Height budget
floor_clear = 0.5
wire_bend = 2.0
jumper_h = 14.0
jumper_w = 2.54
jumper_grip = 6.0
header_spacer = 2.5
dev_pin_below = 9.0
dev_pcb_t = 1.6
dev_pin_above = 2.5
top_clear = 0.5
oled_back_keep = 1.0

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
oled_glass_dx = 0
oled_glass_dy = 0
oled_hole_inset_x = 3.0
oled_hole_inset_y = 3.0
oled_hole_d = 2.2
oled_fence_h = 1.0
oled_fence_t = 0.8
oled_proud = 0
peg_neck_d = 1.2
clip_t = 1.2
clip_w = 6.0
clip_snap = 0.2

# Mic INMP441 + grille
mic_d = 14.0
mic_clear = 0.45
mic_ring_t = 1.2
mic_ring_h = 1.2
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
led_dy = 1.1

# Record button
btn_cap = 12.0
btn_proud = 1.0
btn_guide_wall = 1.2
btn_stroke = 1.0
btn_flange = 13.6
btn_flange_t = 0.8
btn_shaft = 6.0
btn_nose = 3.5
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
tab_v, tab_w, tab_t, tab_lip = 3.5, 4.0, 1.6, 0.8  # snap tabs (IMU only since v2.3)
# v2.3 USB-end cradle fused to the end wall (replaces the board snap tabs)
cradle_v = 6.3
cradle_edge = 1.2
cradle_drop = 1.2
cheek_t = 2.0
cheek_up = 2.0

# IMU (GY-87 style, all ASSUMED)
imu_enable = True
imu_w = 22.0
imu_d = 17.0
imu_pcb_t = 1.6
imu_spacer = 2.5
imu_holes = [(-8.5, 5.5), (8.5, 5.5)]
imu_hole_d = 3.0
imu_cy = 8.0
imu_strip = 3.4
imu_fence_h = 1.0
imu_peg_h = 1.4
catch_engage, catch_back, catch_w, catch_jaw_t = 2.0, 2.0, 10, 1.5

# USB-C slot
usb_slot_mode = "uart"  # uart | both | two
usb_plug_w = 12.0
usb_plug_h = 6.5

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
nfc_cx = -28.5
nfc_cy = 0
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
mic_pocket_dia = hole(mic_d + 2 * mic_clear)
mic_ring_r = mic_pocket_dia / 2 + mic_ring_t
led_bore = hole(led_d)
led_boss_r = led_bore / 2 + tol_min_wall
led_win_d = hole(led_win)
btn_bore = hole(btn_cap + tol_shaft)
btn_guide_r = btn_bore / 2 + btn_guide_wall
grille_hole_d = min(hole(grille_hole), grille_pitch - tol_min_feat)
grille_span_x = (grille_cols - 1) * grille_pitch + grille_hole_d
grille_span_y = (grille_rows - 1) * grille_pitch + grille_hole_d

oled_left_k = wall + tol_fit + skirt_t + tol_snap + hook_t + 0.3 + oled_fence_t
k_boot = wall + dev_usb_gap + dev_usb_overhang + dev_boot_v
L_req = k_boot - mic_dx + mic_ring_r + oled_left_k + oled_pocket_w + oled_fence_t + 0.3
W_req = oled_pocket_h + 2 * (0.2 + skirt_t + tol_fit + wall)
L = max(L_min, math.ceil(L_req * 2) / 2)
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
H = max(H_oled, H_btn, H_usb)
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
oled_cy = 0
oled_fence_end = oled_cx + oled_pocket_w / 2 + oled_fence_t

x_usb = L / 2 - wall - dev_usb_gap - dev_usb_overhang
mic_reach = 2.54 + jumper_w / 2
dev_y_f = grille_cy - mic_reach - 0.2 - dev_w


def dev_xy(u, v):
    return (x_usb - v, dev_y_f + u)


boot_xy = dev_xy(dev_boot_u, dev_boot_v)
btn_top = pcb_top + dev_btn_h
uart_y = dev_y_f + dev_usb_uart_u
otg_y = dev_y_f + dev_usb_otg_u
usb_z = pcb_top + dev_usb_h / 2
gx = boot_xy[0]
gy = grille_cy
mic_xy = (gx + mic_dx, gy)
led_xy = (sk_ix - 0.2 - led_boss_r, gy + led_dy)
posts = [(x_usb - 3.5, uart_y), (x_usb - 3.5, otg_y)]

btn_len = H + btn_proud - btn_top
btn_cone_h = (btn_flange - btn_cap) / 2
btn_flange_z = collar_bot + btn_flange_t + btn_cone_h - btn_top
btn_nose_l = collar_bot - btn_top
btn_guide_depth = H - (collar_seat + btn_stroke)

hx1 = oled_fence_end + 0.3 + hook_w / 2
hx2 = sk_ix - 0.3 - hook_w / 2
hooks = [("left", 0), ("back", hx1), ("back", hx2), ("front", hx1), ("front", hx2)]

imu_z0 = floor_t + floor_clear + wire_bend + jumper_h + imu_spacer
imu_top = imu_z0 + imu_pcb_t
imu_x_l = -in_hx + 1.0
imu_x_r = x_usb - dev_pcb_len - dev_ant_overhang - 0.5
imu_cx = (imu_x_l + imu_x_r) / 2
imu_y0 = imu_cy - imu_d / 2

peg_pos = [(sx * (oled_pcb_w / 2 - oled_hole_inset_x), sy * (oled_pcb_h / 2 - oled_hole_inset_y))
           for sx in (-1, 1) for sy in (-1, 1)]
# OLED corner posts: inside the PCB outline by 0.5 + post/2 at every corner
oled_post_pos = [(oled_cx + sx * (oled_pcb_w / 2 - 0.5 - oled_post / 2),
                  oled_cy + sy * (oled_pcb_h / 2 - 0.5 - oled_post / 2))
                 for sx in (-1, 1) for sy in (-1, 1)]

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


def snap_tab_3d(z_pcb_top):
    """SCAD snap_tab_2d() extruded tab_w along X: PCB edge at y = 0, PCB toward +y, z = 0 at the floor top."""
    g = tol_fit
    zc = z_pcb_top - floor_t + 0.01 + tol_fit
    zt = zc + 0.6 + tab_lip + g
    return yz_prism([(-g - tab_t, 0), (-g, 0), (-g, zc), (tab_lip, zc), (tab_lip, zc + 0.6),
                     (-g, zt), (-g - tab_t, zt)], tab_w)


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
        return (cq.Workplane("YZ", origin=(x0, 0, 0)).center(yc, usb_z)
                .slot2D(wy, hz).extrude(length).val())

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
    # mic ring, LED socket, button guide, hold-down posts
    adds.append(cq.Solid.makeCylinder(mic_ring_r, mic_ring_h + 0.01, V(mic_xy[0], mic_xy[1], tray_h - mic_ring_h)))
    adds.append(cq.Solid.makeCylinder(led_boss_r, led_boss_depth - plate_t + 0.01,
                                      V(led_xy[0], led_xy[1], H - led_boss_depth)))
    adds.append(cq.Solid.makeCylinder(btn_guide_r, btn_guide_depth - plate_t + 0.01,
                                      V(gx, boot_xy[1], H - btn_guide_depth)))
    z_post = pcb_top + dev_usb_h + tol_fit
    for p in posts:
        adds.append(cyl(post_d, tray_h - z_post + 0.01, p[0], p[1], z_post))
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
    # grille
    for i in range(grille_cols):
        for j in range(grille_rows):
            cuts.append(cyl(grille_hole_d, plate_t + 1,
                            gx + (i - (grille_cols - 1) / 2) * grille_pitch,
                            gy + (j - (grille_rows - 1) / 2) * grille_pitch, tray_h - 0.01))
    # mic pocket
    cuts.append(cyl(mic_pocket_dia, mic_ring_h + 1, mic_xy[0], mic_xy[1], tray_h - mic_ring_h - 1))
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
    """SCAD imu_mount() at the origin (PCB centre), z = 0 at the floor top."""
    y0 = -imu_d / 2
    ph = imu_z0 - floor_t
    parts = [
        box(-imu_w / 2 + 0.5, y0 + imu_strip, -0.01, imu_w - 1, imu_d - imu_strip + tol_fit + tab_t, ph + 0.01),
        box(-imu_w / 2 + 0.5, imu_d / 2 + tol_fit, ph - 0.01, imu_w - 1, tab_t, imu_pcb_t + imu_fence_h + 0.01),
    ]
    dp = imu_hole_d - 2 * tol_fit
    for hx, hy in imu_holes:
        parts.append(cyl(dp, imu_pcb_t + 0.01, hx, hy, ph - 0.01))
        h_tip = imu_peg_h - imu_pcb_t + 0.01
        if h_tip > 0:  # negative in the SCAD defaults (imu_peg_h < imu_pcb_t): OpenSCAD renders nothing
            parts.append(cq.Solid.makeCone(dp / 2, dp / 2 - 0.3, h_tip, V(hx, hy, ph - 0.01 + imu_pcb_t)))
    for sx in (-1, 1):
        t = snap_tab_3d(imu_top).rotate(V(0, 0, 0), V(0, 0, 1), 90 if sx > 0 else -90)
        parts.append(t.moved(cq.Location(V(sx * imu_w / 2, (y0 + imu_strip + imu_d / 2) / 2, 0))))
    return parts


def usb_cradle():
    """SCAD usb_cradle(): ledge + cheeks at the USB end, run forward into the end wall."""
    x0, x1 = x_usb - cradle_v, in_hx + 0.5
    y0, y1 = dev_y_f - tol_fit - cheek_t, dev_y_f + dev_w + tol_fit + cheek_t
    block = box(x0, y0, floor_t - 0.01, x1 - x0, y1 - y0, pcb_top + cheek_up - floor_t + 0.01)
    return cut(block,
               # PCB slot between the cheeks, open upward
               box(x0 - 1, dev_y_f - tol_fit, pcb_z0, x1 - x0 + 2, dev_w + 2 * tol_fit, 50),
               # ledge drop under the middle of the strip, edges stay full height
               box(x0 - 1, dev_y_f + cradle_edge, pcb_z0 - cradle_drop,
                   x1 - x0 + 2, dev_w - 2 * cradle_edge, cradle_drop + 1),
               # end wall's inner face clear above the PCB
               box(x_usb, dev_y_f - tol_fit, pcb_z0, x1 - x_usb + 1, dev_w + 2 * tol_fit, 50))


def tray():
    x_tip = x_usb - dev_pcb_len - dev_ant_overhang
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
    if imu_enable:
        adds += [p.moved(cq.Location(V(imu_cx, imu_cy, floor_t))) for p in imu_mount()]
    adds.append(box(x_tip - catch_back, dev_y_f + dev_w / 2 - catch_w / 2, floor_t - 0.01,
                    catch_engage + catch_back, catch_w,
                    pcb_top + dev_mod_pcb_t + 2 * tol_fit + catch_jaw_t - floor_t + 0.01))
    body = fuse(shell, *adds)

    cuts = [
        box(x_tip - 0.5, dev_y_f + dev_w / 2 - catch_w / 2 - 1, pcb_top - tol_fit,
            catch_engage + 1.5, catch_w + 2, dev_mod_pcb_t + 3 * tol_fit),       # antenna slot
        box(gx - pry_w / 2, in_hy - 0.1, tray_h - pry_d, pry_w, wall + 1, pry_d + 1),  # pry slot
    ]
    # USB-C slot, continued 1.5 mm inside the end wall so the overmold clears the cradle cheeks
    cuts += usb_slot_cutter(x_usb - 1.5, L / 2 + 1 - (x_usb - 1.5))
    for sx in (-1, 1):
        for sy in (-1, 1):
            cuts.append(cyl(hole(foot_d), foot_depth + 1, sx * (L / 2 - foot_inset), sy * (W / 2 - foot_inset), -1))
    if nfc_side == "bottom":
        s = nfc_size + 2 * tol_fit
        cuts.append(cbox(nfc_cx, nfc_cy, -1 + nfc_depth / 2 - (2 + nfc_depth) / 2, s, s, 2 + nfc_depth))
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
    print(f"SLAB v2.3 (CadQuery): outer L x W x H = {L} x {W} x {H:.2f} mm, tray_h {tray_h:.2f}")
    for name, s in parts.items():
        (x0, y0, z0), (x1, y1, z1) = tight_bbox(s)
        print(f"{name:9s} valid {s.isValid()}  solids {len(s.Solids())}  vol {s.Volume():10.2f} mm3  "
              f"bbox [{x0:.3f}, {y0:.3f}, {z0:.3f}] .. [{x1:.3f}, {y1:.3f}, {z1:.3f}]  faces {len(s.Faces())}")
    export(parts)
    if "--no-verify" not in sys.argv:
        verify(parts)


if __name__ == "__main__":
    main()
