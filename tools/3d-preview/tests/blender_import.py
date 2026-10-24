"""Optional headless interoperability check. Never opens or saves a user .blend."""
from pathlib import Path
import json
import math
import bpy

base = Path(__file__).resolve().parents[1]
results = []
for index in range(1, 7):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = base / "public" / "game-assets" / "models" / f"warrior-{index}.glb"
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    assert meshes, path.name
    assert bpy.data.objects.get("turret-yaw"), path.name
    assert bpy.data.objects.get("barrels-recoil"), path.name
    assert bpy.data.objects.get("muzzle-socket"), path.name
    points = [obj.matrix_world @ vertex.co for obj in meshes for vertex in obj.data.vertices]
    # Blender converts glTF Y-up into Blender Z-up; ground is now XY.
    radius = max(math.hypot(point.x, point.y) for point in points)
    span = 2 if index == 6 else 1
    assert radius <= span / 2 - 0.015, (path.name, radius)
    results.append({"asset": path.name, "meshes": len(meshes), "footprint_span": span, "ground_radius_cells": round(radius, 6), "height_cells": round(max(point.z for point in points), 6), "rig_nodes": "ok"})

output = base / "validation"
output.mkdir(exist_ok=True)
(output / "blender-import.json").write_text(json.dumps({"blender": bpy.app.version_string, "results": results}, indent=2) + "\n", encoding="utf-8", newline="\n")
print("BLENDER_IMPORT_OK: six GLBs and rig nodes verified; Ucube occupies 2x2 cells, other towers 1x1")
