"""Inspect and simplify the downloaded Tripo source in a separate Blender process."""
import bpy
import json
import argparse
import sys
from pathlib import Path
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument("--variant", choices=["quality", "stylized"], default="quality")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
stylized = args.variant == "stylized"
budget = 50000 if stylized else 80000
work = Path(__file__).resolve().parents[3] / "asset-work" / ("takipci-v3" if stylized else "takipci-v2")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(work / "source.glb"))
obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
original = len(obj.data.polygons)
decimate = obj.modifiers.new("Web preview triangle budget", "DECIMATE")
decimate.ratio = min(1, budget / original)
decimate.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=decimate.name)
obj.name = "takipci-detail"
if stylized:
    # Smaller texture maps keep the stylized pilot practical in the web preview.
    for image in bpy.data.images:
        if image.size[0] > 2048:
            image.scale(2048, 2048)
            image.pack()
points = [v.co for v in obj.data.vertices]
report = {
    "original_triangles": original,
    "web_triangles": len(obj.data.polygons),
    "bounds": {axis: [min(p[i] for p in points), max(p[i] for p in points)] for i, axis in enumerate("xyz")},
    "images": [{"name": im.name, "size": list(im.size)} for im in bpy.data.images],
}
(work / "inspection.json").write_text(json.dumps(report, indent=2), encoding="utf-8", newline="\n")
bpy.ops.wm.save_as_mainfile(filepath=str(work / "simplified.blend"))

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.render.resolution_x = scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.world = bpy.data.worlds.new("Neutral studio")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.2, 0.23, 0.25, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.45
scene.view_settings.view_transform = "AgX"
for position, energy, size in [((1.5, -2, 3), 150, 2.5), ((-2, 0.5, 2), 100, 2)]:
    data = bpy.data.lights.new("Softbox", "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    light = bpy.data.objects.new("Softbox", data)
    scene.collection.objects.link(light)
    light.location = position
    light.rotation_euler = (Vector((0, 0, 0.2)) - light.location).to_track_quat("-Z", "Y").to_euler()
data = bpy.data.cameras.new("Inspection")
camera = bpy.data.objects.new("Inspection", data)
scene.collection.objects.link(camera)
scene.camera = camera
data.type = "ORTHO"
data.ortho_scale = 1.4
for name, position in [("perspective", (1.3, -1.8, 1.7)), ("top", (0, 0, 3))]:
    camera.location = position
    camera.rotation_euler = (Vector((0, 0, 0.23)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(work / f"{name}.png")
    bpy.ops.render.render(write_still=True)
print("QUALITY_INSPECTION", json.dumps(report))
