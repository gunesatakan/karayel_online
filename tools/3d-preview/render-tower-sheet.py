"""Contact sheet of game tower GLBs from the angled game view (one row per tower, tiers 1-3).

  blender -b --python render-tower-sheet.py -- <out.png> <models-dir> [tower ...]

Each model is shown on a dark tile with a red arrow along its forward axis (+Z in
glTF, the barrel direction the game aims with) and its turret part tinted, so
orientation and the fixed/moving split can be checked at a glance.
"""
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
out, models_dir = Path(args[0]), Path(args[1])
towers = args[2:] or [f'warrior-{n}' for n in range(1, 7)] + [f'zeynep-{n}' for n in (1, 2, 3, 6, 7, 8)]
cell = 220

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.resolution_x = scene.render.resolution_y = cell
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.62, 0.7, 0.78, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.9
sun_data = bpy.data.lights.new('sun', 'SUN'); sun_data.energy = 3.2
sun = bpy.data.objects.new('sun', sun_data); scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 1.35
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
cam.location = (0, -2.2, 2.2 + 0.25); cam.rotation_euler = (math.radians(45), 0, 0)
bpy.ops.mesh.primitive_plane_add(size=1.0); tile = bpy.context.object
tile_mat = bpy.data.materials.new('tile'); tile_mat.use_nodes = True
tile_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.03, 0.035, 0.045, 1)
tile.data.materials.append(tile_mat)
bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.04, depth=0.18); arrow = bpy.context.object
arrow.rotation_euler = (math.radians(90), 0, 0); arrow.location = (0, -0.62, 0.02)
red = bpy.data.materials.new('red'); red.use_nodes = True
red.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (1, 0.05, 0.05, 1)
red.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 4
arrow.data.materials.append(red)

frames = []
for tower in towers:
    row = []
    for tier in (1, 2, 3):
        path = models_dir / f'{tower}-tier-{tier}.glb'
        if not path.exists():
            row.append(np.full((cell, cell, 4), .2, np.float32)); continue
        before = set(scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(path))
        imported = [o for o in scene.objects if o not in before]
        meshes = [o for o in imported if o.type == 'MESH']
        # Fit: whole tower inside the frame regardless of its cell span.
        corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
        xs, ys, zs = [c.x for c in corners], [c.y for c in corners], [c.z for c in corners]
        size = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs), 1e-3)
        root = next(o for o in imported if o.parent is None)
        root.scale = root.scale * (1.0 / size)
        bpy.context.view_layer.update()
        tile.scale = (1.0 / size * 0.22 * 4.2,) * 3
        scene.render.filepath = str(out.with_suffix(f'.{tower}-{tier}.png'))
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(scene.render.filepath)
        px = np.empty(cell * cell * 4, np.float32); img.pixels.foreach_get(px)
        row.append(px.reshape(cell, cell, 4))
        bpy.data.images.remove(img)
        Path(scene.render.filepath).unlink(missing_ok=True)
        for o in imported: bpy.data.objects.remove(o, do_unlink=True)
    frames.append(row)
rows = len(frames)
sheet = np.zeros((rows * cell, 3 * cell, 4), np.float32)
for r, row in enumerate(frames):
    for c, px in enumerate(row):
        y0 = (rows - 1 - r) * cell
        sheet[y0:y0 + cell, c * cell:(c + 1) * cell] = px
result = bpy.data.images.new('sheet', 3 * cell, rows * cell, alpha=True)
result.pixels.foreach_set(sheet.ravel())
result.filepath_raw = str(out); result.file_format = 'PNG'; result.save()
print('SHEET_DONE', out)
