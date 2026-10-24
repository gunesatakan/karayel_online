"""Normalize inspected Tripo meshes, rig the upper assembly and export preview GLBs.

Run inspect-evolution-model.py first. Raw downloads and Blender intermediates
remain in the sibling asset-work folder, outside the live game's source tree.
"""
import argparse
import bmesh
import bpy
import hashlib
import json
import math
import numpy as np
import sys
from pathlib import Path
from mathutils import Matrix, Vector

base = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--key', required=True)
parser.add_argument('--front', type=float, default=90, help='Inspected muzzle direction in Blender XY degrees')
parser.add_argument('--split', type=float, default=.18, help='Inspected bearing height in source units')
parser.add_argument('--flatten', action='store_true', help='Lay an incorrectly upright radial platform on the ground')
parser.add_argument('--level-barrel', type=float, nargs=3, metavar=('Y', 'Z', 'PITCH'),
                    help='Swing a barrel tilted up by PITCH degrees level about its joint (Y, Z in exported units, cell radius 1.90)')
parser.add_argument('--level-select', type=float, help='Axis angle used to pick the barrel faces when a muzzle block skews it (default: PITCH)')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
work = base.parents[2] / 'asset-work' / 'evolution' / args.key
tower_id = '-'.join(args.key.split('-')[:2])
tier = int(args.key[-1])
span = 2 if tower_id == 'warrior-6' else 1
static = tower_id in ['warrior-2', 'warrior-3']
bpy.ops.wm.open_mainfile(filepath=str(work / 'simplified.blend'))
source = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
for obj in list(bpy.context.scene.objects):
    if obj != source: bpy.data.objects.remove(obj, do_unlink=True)
for image in bpy.data.images:
    if 'normal' not in image.name:
        image.file_format = 'JPEG'
        image.filepath_raw = str(work / image.name)

# Real metal with a controlled highlight width; keep the original normal detail.
for material in source.data.materials:
    nodes = material.node_tree.nodes
    shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    for channel, value in [('Roughness', .48), ('Metallic', .72)]:
        for link in list(shader.inputs[channel].links): material.node_tree.links.remove(link)
        shader.inputs[channel].default_value = value
    for node in nodes:
        if node.type == 'NORMAL_MAP': node.inputs['Strength'].default_value = .42

# Bright energy regions get separate emissive materials, without lighting the metal.
original_materials = list(source.data.materials)
for material_index, material in enumerate(original_materials):
    shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    link = next(iter(shader.inputs['Base Color'].links), None)
    if not link or link.from_node.type != 'TEX_IMAGE': continue
    image = link.from_node.image
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(height, width, 4)
    # The middle tier glows in each texture's own hue (cyan, teal, violet); the outer tiers use a fixed palette.
    palette = ([(.005, .35, .8, 1), (.8, .005, .38, 1), (.01, .7, .2, 1)] if tier == 3 else [None] if tier == 2
               else [(.02, .8, 1, 1), (1, .01, .62, 1), (.02, 1, .3, 1)])
    slots = []
    for color in palette:
        luminous = material.copy()
        luminous.name = material.name + '-energy-' + str(len(slots))
        p = next(n for n in luminous.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        if color: p.inputs['Emission Color'].default_value = color
        else: luminous.node_tree.links.new(p.inputs['Base Color'].links[0].from_socket, p.inputs['Emission Color'])
        p.inputs['Emission Strength'].default_value = {1: .8, 2: 1., 3: 1.2}[tier]
        p.inputs['Roughness'].default_value = .35
        p.inputs['Metallic'].default_value = .25
        slots.append(len(source.data.materials))
        source.data.materials.append(luminous)
    uv = source.data.uv_layers.active.data
    for polygon in source.data.polygons:
        if polygon.material_index != material_index: continue
        u, v = np.mean([uv[i].uv[:] for i in polygon.loop_indices], axis=0)
        r, g, b = pixels[min(height-1, max(0, int(v*height))), min(width-1, max(0, int(u*width))), :3]
        if tier == 2:
            if max(r, g, b) > .45 and ((b > .35 and g > .32 and r < min(b,g)*.7) or (g > .45 and g > b*1.25 and r < g*.45)
                                       or (r > .35 and b > .35 and g < min(r,b)*.6)): polygon.material_index = slots[0]
            continue
        cyan = b > .35 and g > .32 and r < min(b,g)*.7 if tier == 3 else b > .4 and g > .4 and r < .075
        if cyan: polygon.material_index = slots[0]
        elif r > .45 and b > .32 and g < min(r,b)*.62: polygon.material_index = slots[1]
        elif g > .6 and r < .05 and b < .2: polygon.material_index = slots[2]

if args.flatten:
    p = np.array([v.co[:] for v in source.data.vertices])
    _, axes = np.linalg.eigh(np.cov(p.T))
    normal = axes[:, 0]
    if normal[2] < 0: normal = -normal
    source.data.transform(Vector(normal).rotation_difference(Vector((0,0,1))).to_matrix().to_4x4())
    p = np.array([v.co[:] for v in source.data.vertices])
    source.data.transform(Matrix.Translation((-(p[:,0].max()+p[:,0].min())/2, -(p[:,1].max()+p[:,1].min())/2, -p[:,2].min())))
source.data.transform(Matrix.Rotation(math.radians(-90 - args.front), 4, 'Z'))
points = np.array([v.co[:] for v in source.data.vertices])
factor = 1.90 / np.linalg.norm(points[:, :2], axis=1).max()
bottom = points[:, 2].min()
centers = np.array([p.center[:] for p in source.data.polygons])
upper = centers[:, 2] > args.split
if args.key == 'warrior-1-tier-1':
    upper = (centers[:, 2] > .31) | ((np.linalg.norm(centers[:, :2], axis=1) < .23) & (centers[:, 2] > .27))
level = None
if args.level_barrel:
    # Beams leave the muzzle level, so a barrel the reconstruction tilted upwards is swung flat about its joint.
    lifted = sorted({i for p in source.data.polygons if upper[p.index] for i in p.vertices})
    co = np.array([source.data.vertices[i].co[:] for i in lifted])
    joint_y, joint_z, degrees = args.level_barrel
    muzzle_cut = co[co[:, 1] < co[:, 1].min() + .03]
    pivot = np.array([muzzle_cut[:, 0].mean(), joint_y / factor, joint_z / factor + bottom])
    pitch = math.radians(degrees)
    select = math.radians(args.level_select if args.level_select is not None else degrees)
    direction = np.array([0, -math.cos(select), math.sin(select)])
    normal = np.array([0, math.sin(select), math.cos(select)])
    rel = co - pivot
    along, above = rel @ direction, rel @ normal
    # Everything ahead of the joint and above the barrel's underside swings with it, fins and sights included.
    underside = 1.3 * (muzzle_cut[:, 2].max() - muzzle_cut[:, 2].min()) / 2
    for i, (x, y, z), t, h in zip(lifted, co, along, above):
        if t <= 0 or h < -underside: continue
        a = pitch * min(1, t / .02)
        dy, dz = y - pivot[1], z - pivot[2]
        source.data.vertices[i].co = (x, pivot[1] + dy*math.cos(a) - dz*math.sin(a), pivot[2] + dy*math.sin(a) + dz*math.cos(a))
    points = np.array([v.co[:] for v in source.data.vertices])
    factor = 1.90 / np.linalg.norm(points[:, :2], axis=1).max()
    level = dict(jointY=joint_y, jointZ=joint_z, pitchDegrees=degrees)
    if args.level_select is not None: level['selectDegrees'] = args.level_select
source.data.transform(Matrix.Translation((0, 0, -bottom)))
source.data.transform(Matrix.Scale(factor, 4))

def empty(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    return obj

def part(name, mask, parent):
    mesh = source.data.copy()
    bm = bmesh.new(); bm.from_mesh(mesh); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not mask[f.index]], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    return obj

root = empty(tower_id)
root.scale = (.22*span,) * 3
root['assetId'] = tower_id
root['footprintCells'] = span*span
root['tier'] = tier
root['splitHeight'] = (args.split-bottom)*factor
yaw = empty('turret-yaw', root)
barrels = empty('barrels-recoil', yaw)
fixed = part('fixed-platform', ~upper, root)
moving = part('moving-assembly', upper, root if static else barrels)
socket = empty('muzzle-socket', barrels)
if not static:
    gun = np.array([v.co[:] for v in moving.data.vertices])
    tip = gun[gun[:, 1] < gun[:, 1].min() + .15]
    center_x = float((tip[:, 0].min()+tip[:, 0].max())/2)
    height = float((tip[:, 2].min()+tip[:, 2].max())/2)
    length = float(-tip[:, 1].min())
    offset = 0.
    if tower_id == 'warrior-1':
        left, right = tip[tip[:,0] < center_x], tip[tip[:,0] >= center_x]
        offset = float((right[:,0].mean()-left[:,0].mean())/2)
else:
    center_x, height, length, offset = 0., float(max(v.co.z for v in moving.data.vertices)), .1, 0.
socket.location = (center_x, -length, height)
root['muzzle'] = dict(length=length, height=height, offset=offset, centerOffset=center_x)
sources = json.loads((base/'art-direction/evolution-sources.json').read_text(encoding='utf-8-sig'))
entry = next(e for e in sources if e['key'] == args.key)
root['source'] = 'Tripo H3.1 / ' + entry['sourceId']
root['quality'] = 'Semi-matte PBR / 2K / 40k triangles'
bpy.data.objects.remove(source, do_unlink=True)
output = base/'public/game-assets/models/evolution'/f'{args.key}.glb'
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_extras=True, export_materials='EXPORT', export_image_format='AUTO')
bpy.ops.wm.save_as_mainfile(filepath=str(work/'processed.blend'))
report = dict(key=args.key, sourceId=entry['sourceId'], modelSha256=hashlib.sha256(output.read_bytes()).hexdigest(), modelBytes=output.stat().st_size,
    triangleCount=sum(len(p.data.polygons) for p in [fixed,moving]), footprintSpan=span, radiusCells=1.90*.22*span, muzzle=dict(root['muzzle']), front=args.front, split=args.split)
if level: report['levelBarrel'] = level
(base/'validation'/f'{args.key}.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print('EVOLUTION_EXPORT', json.dumps(report))
