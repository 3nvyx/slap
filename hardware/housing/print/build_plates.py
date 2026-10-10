"""Build print-ready plates for the Slap slab housing (Bambu Lab P2S, 256x256 bed).
- Verifies each STL is watertight, reports size and z-range.
- Orients parts for printing: lid face-down, tray floor-down, button on its cap, clips flat, coupons flat.
- Lays parts out with gaps and exports one 3MF per plate with named objects.
"""
import math, sys
import numpy as np, trimesh

STL = "../stl"
BED = 256.0
GAP = 8.0

def load(name):
    m = trimesh.load(f"{STL}/{name}.stl", process=False)
    m.merge_vertices()            # OpenSCAD STLs store every triangle's vertices separately
    return m

def orient(name, m):
    """Return mesh rotated into print orientation, bottom at z=0."""
    if name in ("slab_top",):                     # printed face-down: flip 180 deg about X
        m.apply_transform(trimesh.transformations.rotation_matrix(math.pi, [1, 0, 0]))
    elif name == "slab_button":                     # stand on its cap (cap faces +z in the model)
        m.apply_transform(trimesh.transformations.rotation_matrix(math.pi, [1, 0, 0]))
    # tray, clips and coupons print as modelled
    m.apply_translation(-m.bounds[0])            # move min corner to origin (z=0 on the plate)
    return m

def layout(parts):
    """Simple shelf packing on the bed, returns list of (name, mesh) translated into place."""
    x = y = 0.0; row_h = 0.0; placed = []
    for name, m in parts:
        w, d, h = m.extents
        if x + w > BED - GAP:
            x = 0.0; y += row_h + GAP; row_h = 0.0
        if y + d > BED - GAP:
            raise SystemExit(f"plate overflow at {name}")
        m.apply_translation([x - m.bounds[0][0], y - m.bounds[0][1], 0])
        placed.append((name, m)); x += w + GAP; row_h = max(row_h, d)
    # centre the whole group on the bed
    allb = np.array([p[1].bounds for p in placed])
    lo, hi = allb[:, 0, :].min(0), allb[:, 1, :].max(0)
    shift = [(BED - (hi[0] - lo[0])) / 2 - lo[0], (BED - (hi[1] - lo[1])) / 2 - lo[1], 0]
    for _, m in placed: m.apply_translation(shift)
    return placed

def report(name, m):
    w, d, h = m.extents
    ok = m.is_watertight
    print(f"  {name:22s} {w:6.1f} x {d:6.1f} x {h:5.1f} mm  watertight={ok}  faces={len(m.faces)}")
    if not ok: print(f"    WARNING: {name} is not watertight")
    return ok

def export(plate_name, specs):
    parts = []
    print(f"\nPlate: {plate_name}")
    for name, label, copies in specs:
        for i in range(copies):
            m = orient(name, load(name))
            parts.append((f"{label}{'_' + str(i+1) if copies > 1 else ''}", m))
    for n, m in parts: report(n, m)
    placed = layout(parts)
    scene = trimesh.Scene()
    for n, m in placed: scene.add_geometry(m, node_name=n, geom_name=n)
    out = f"{plate_name}.3mf"
    scene.export(out)
    # verify by reloading
    back = trimesh.load(out, process=False)
    names = list(back.geometry.keys()) if isinstance(back, trimesh.Scene) else ["<single>"]
    print(f"  -> {out}: {len(names)} objects: {', '.join(names)}")
    allb = np.array([m.bounds for _, m in placed]); print(f"  footprint {allb[:,1,0].max()-allb[:,0,0].min():.0f} x {allb[:,1,1].max()-allb[:,0,1].min():.0f} mm, tallest {allb[:,1,2].max():.1f} mm")

export("Slap_fit_tests_black_0.4", [
    ("slab_fit_snap", "fit_snap", 1), ("slab_fit_oled_ring", "fit_oled_ring", 1), ("slab_fit_mic", "fit_mic", 1),
    ("slab_fit_usb", "fit_usb", 1), ("slab_fit_boot", "fit_boot", 1), ("slab_fit_imu", "fit_imu", 1),
])
# v2.3: pegs are off until the OLED holes are measured, so no clips. The three revised
# coupons (mic pocket, USB slot, OLED ring) ride along on the housing plate.
export("Slap_housing_black_0.4", [
    ("slab_tray", "tray", 1), ("slab_top", "lid_face_down", 1), ("slab_button", "button_on_cap", 1),
    ("slab_fit_mic", "fit_mic", 1), ("slab_fit_usb", "fit_usb", 1), ("slab_fit_oled_ring", "fit_oled_ring", 1),
])
