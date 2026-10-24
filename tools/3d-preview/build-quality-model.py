"""Split and fit the inspected Takipci H3.1 asset; preserve its original PBR maps."""
import bpy
import bmesh
import numpy as np
import math
import json
import hashlib
from pathlib import Path
from mathutils import Matrix

base = Path(__file__).resolve().parent
work = base.parents[1].parent / "asset-work" / "takipci-v2"
bpy.ops.wm.open_mainfile(filepath=str(work / "simplified.blend"))
source = next(o for o in bpy.context.scene.objects if o.type == "MESH")
xyz = np.array([v.co[:] for v in source.data.vertices])
# The inspected top view shows both muzzles pointing +X/-Y. Fit the shared axis,
# then align it to Blender -Y (glTF +Z), as used by the preview's aiming code.
high = xyz[xyz[:, 2] > 0.4, :2]
_, axes = np.linalg.eigh(np.cov(high.T))
axis = axes[:, -1]
if axis[0] < 0: axis = -axis
angle = -math.pi / 2 - math.atan2(axis[1], axis[0])
rotation = Matrix.Rotation(angle, 4, "Z")
source.data.transform(rotation)
centers = np.array([p.center[:] for p in source.data.polygons])
# The central bearing begins above the roof at z=.285. The paired cannon
# assembly is above .375. Retain the fixed outer gear ring as a bearing cover.
gun_mask = centers[:, 2] > 0.375
yaw_mask = (np.linalg.norm(centers[:, :2], axis=1) < 0.235) & (centers[:, 2] > 0.285) & ~gun_mask
base_mask = ~(gun_mask | yaw_mask)
points = np.array([v.co[:] for v in source.data.vertices])
radius = np.linalg.norm(points[:, :2], axis=1).max()
factor = 1.94 / radius
bottom = points[:, 2].min()
source.data.transform(Matrix.Translation((0, 0, -bottom)))
source.data.transform(Matrix.Scale(factor, 4))

def empty(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    return obj

root = empty("warrior-1")
root.scale = (0.22, 0.22, 0.22)
root["assetId"] = "warrior-1"
root["footprintCells"] = 1
root["source"] = "Tripo H3.1 / fd539154-0126-4a07-9903-46741858eed5"
yaw = empty("turret-yaw", root)
barrels = empty("barrels-recoil", yaw)

def part(name, mask, parent):
    mesh = source.data.copy()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not mask[f.index]], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    return obj

parts = [part("fixed-copper-platform", base_mask, root), part("rotating-bearing", yaw_mask, yaw), part("twin-cannons", gun_mask, barrels)]
bpy.data.objects.remove(source, do_unlink=True)
# Infer the centre of the two muzzle openings from the frontmost gun vertices.
gun_points = np.array([v.co[:] for v in parts[2].data.vertices])
tip = gun_points[gun_points[:, 1] < gun_points[:, 1].min() + 0.20]
center_x = (tip[:, 0].min() + tip[:, 0].max()) / 2
height = (tip[:, 2].min() + tip[:, 2].max()) / 2
length = -float(tip[:, 1].mean())
# Source barrel spacing is measured from the gap between left and right tips.
left = tip[tip[:, 0] < center_x]
right = tip[tip[:, 0] >= center_x]
offset = float((right[:, 0].mean() - left[:, 0].mean()) / 2)
socket = empty("muzzle-socket", barrels)
socket.location = (float(center_x), -length, float(height))
root["muzzle"] = {"length": length, "height": float(height), "offset": offset, "centerOffset": float(center_x)}
root["quality"] = "H3.1 PBR / 4K / 80k triangles"

bpy.ops.object.select_all(action="DESELECT")
for obj in [root, yaw, barrels, socket, *parts]: obj.select_set(True)
output = base / "public" / "game-assets" / "models" / "warrior-1-quality.glb"
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True, export_extras=True, export_materials="EXPORT", export_image_format="AUTO")
root["processingNote"] = "Bearing and cannon assembly separated by the inspected geometry; verify through rotation."
bpy.ops.wm.save_as_mainfile(filepath=str(work / "processed.blend"))
report = {
    "source": "https://studio.tripo3d.ai/tr/workspace/generate/circular-artillery-turret-with-copper-roof-weathered-green-cannons-a-fd539154-0126-4a07-9903-46741858eed5",
    "credits": 55,
    "sourceSha256": hashlib.sha256((work / "source.glb").read_bytes()).hexdigest(),
    "modelSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    "modelBytes": output.stat().st_size,
    "triangleCount": sum(len(p.data.polygons) for p in parts),
    "parts": {p.name: len(p.data.polygons) for p in parts},
    "muzzle": dict(root["muzzle"]),
    "groundRadiusCells": float(radius * factor * .22),
    "maps": ["base color 4096x4096", "metallic/roughness 4096x4096", "normal 4096x4096"],
}
(base / "validation" / "takipci-quality.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
print("QUALITY_EXPORT", json.dumps(report))
