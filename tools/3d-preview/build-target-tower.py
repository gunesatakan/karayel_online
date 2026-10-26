"""Target-style (Endless Defense look) game tower from a raw Tripo GLB.

  blender --background --python build-target-tower.py -- --key warrior-1-tier-1 --source <tripo.glb> --accent 4dffbd

Steps:
1. Weld the Tripo mesh: the glTF import splits vertices on every UV seam and a
   decimation of that shatters the surface into loose patches (the old game
   copies had ~60% open edges and ~800 pieces).
2. One collapse pass to the game budget, sharp edges kept by angle, one clean UV layout.
3. Bake normal, colour, roughness, metal and contact AO from the full Tripo mesh.
4. Colour blocks: k-means clusters snap to the shared palette (dark navy body,
   slate or plum panels, light or ivory trim); saturated bright texels become the
   tower's identity accent and glow (emissive).
5. Rig like the previous game copies: root node `<tower>` (scale 0.22 per cell span,
   extras tier / footprintCells / muzzle / splitHeight), `fixed-platform`,
   `turret-yaw` > `barrels-recoil` > `moving-assembly` + `muzzle-socket`.
   Forward is Blender -Y; the barrel direction and the neck height are measured.
"""
import argparse
import hashlib
import json
import math
import sys
import time
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix

parser = argparse.ArgumentParser()
parser.add_argument('--key', required=True, help='e.g. warrior-1-tier-2')
parser.add_argument('--source', required=True, help='raw Tripo GLB')
parser.add_argument('--accent', required=True, help='identity colour, sRGB hex')
parser.add_argument('--out', default=None, help='output GLB (default: apps/web/public/models3d/<key>.glb)')
parser.add_argument('--tris', type=int, default=6000)
parser.add_argument('--bake', type=int, default=1024)
parser.add_argument('--size', type=int, default=512)
parser.add_argument('--clusters', type=int, default=7)
parser.add_argument('--front', type=float, default=None, help='override the measured barrel direction (Blender XY degrees)')
parser.add_argument('--split', type=float, default=None, help='override the measured neck height (0-1 of the model height)')
parser.add_argument('--structure', choices=['building', 'wall'], default=None, help='supply building or wall: no turret rig, old structure contract')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])

base = Path(__file__).resolve().parent
tower_id = '-'.join(args.key.split('-')[:2])
tier = int(args.key[-1]) if args.key[-1].isdigit() else 1
zentax = tower_id.startswith('zeynep-')
span = 2 if tower_id in ('warrior-6', 'zeynep-7') else 1
edge = tower_id == 'zeynep-8'
static = tower_id in ('warrior-2', 'warrior-3', 'zeynep-2', 'zeynep-3', 'zeynep-7', 'zeynep-8')
output = Path(args.out) if args.out else base.parents[1] / 'apps/web/public/models3d' / f'{args.key}.glb'
report = dict(key=args.key, source=str(args.source), accent=args.accent)
t0 = time.time()

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
for backend in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = backend
        prefs.get_devices()
        if any(d.type == backend for d in prefs.devices):
            for d in prefs.devices: d.use = d.type == backend
            scene.cycles.device = 'GPU'
            break
    except TypeError:
        continue

bpy.ops.import_scene.gltf(filepath=str(args.source))
meshes = [o for o in scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
high = bpy.context.view_layer.objects.active
high.name = 'high'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(scene.objects):
    if o != high: bpy.data.objects.remove(o, do_unlink=True)
bm = bmesh.new(); bm.from_mesh(high.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
bm.to_mesh(high.data); bm.free()
report['highTriangles'] = len(high.data.polygons)

low = high.copy(); low.data = high.data.copy(); low.name = 'low'
scene.collection.objects.link(low)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = low; low.select_set(True)
mod = low.modifiers.new('budget', 'DECIMATE')
mod.ratio = min(1, args.tris / len(low.data.polygons)); mod.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40), keep_sharp_edges=True)
while low.data.uv_layers: low.data.uv_layers.remove(low.data.uv_layers[0])
low.data.uv_layers.new(name='UVMap')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(72), island_margin=.002, area_weight=.6, correct_aspect=True)
bpy.ops.uv.pack_islands(margin=.002, rotate=True, shape_method='CONCAVE')
bpy.ops.object.mode_set(mode='OBJECT')
report['lowTriangles'] = len(low.data.polygons)

# --- Bake ---------------------------------------------------------------
S = args.bake
size = max(high.dimensions)
low.data.materials.clear()
bake_material = bpy.data.materials.new('bake-target'); bake_material.use_nodes = True
low.data.materials.append(bake_material)
bake_node = bake_material.node_tree.nodes.new('ShaderNodeTexImage')
bake_material.node_tree.nodes.active = bake_node
high_material = high.data.materials[0]
hp = next(n for n in high_material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
sources = {name: hp.inputs[name].links[0].from_socket for name in ('Base Color', 'Roughness', 'Metallic') if hp.inputs[name].links}

def bake(kind, emit_from=None, selected=True, samples=1, constant=None):
    image = bpy.data.images.new(kind + str(len(bpy.data.images)), S, S, alpha=False, float_buffer=True, is_data=True)
    bake_node.image = image
    scene.cycles.samples = samples
    links = high_material.node_tree.links
    for link in list(hp.inputs['Emission Color'].links): links.remove(link)
    if emit_from is not None:
        links.new(emit_from, hp.inputs['Emission Color'])
    elif constant is not None:
        hp.inputs['Emission Color'].default_value = (constant, constant, constant, 1)
    hp.inputs['Emission Strength'].default_value = 1
    bpy.ops.object.select_all(action='DESELECT')
    if selected: high.select_set(True)
    low.select_set(True); bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type=kind, use_selected_to_active=selected, cage_extrusion=.012 * size, max_ray_distance=.03 * size,
                        margin=0 if not selected else 6, margin_type='EXTEND', target='IMAGE_TEXTURES', use_clear=True, normal_space='TANGENT')
    hp.inputs['Emission Strength'].default_value = 0
    pixels = np.empty(S * S * 4, dtype=np.float32); image.pixels.foreach_get(pixels)
    return pixels.reshape(S, S, 4)[..., :3].copy()

normal = bake('NORMAL')
albedo = bake('EMIT', sources.get('Base Color'))
rough = bake('EMIT', sources['Roughness'])[..., 0] if 'Roughness' in sources else np.full((S, S), .6, np.float32)
metal = bake('EMIT', sources['Metallic'])[..., 0] if 'Metallic' in sources else np.full((S, S), .2, np.float32)
for flag in ('visible_diffuse', 'visible_glossy', 'visible_shadow', 'visible_transmission'): setattr(low, flag, False)
if scene.world is None: scene.world = bpy.data.worlds.new('bake')
scene.world.light_settings.distance = .08 * size
ao = bake('AO', samples=64)[..., 0]
for flag in ('visible_diffuse', 'visible_glossy', 'visible_shadow', 'visible_transmission'): setattr(low, flag, True)
white = bake_material.node_tree.nodes.new('ShaderNodeEmission'); white.inputs['Color'].default_value = (1, 1, 1, 1)
bake_material.node_tree.links.new(white.outputs[0], bake_material.node_tree.nodes['Material Output'].inputs['Surface'])
mask = bake('EMIT', selected=False)[..., 0] > .5
report['uvCoverage'] = round(float(mask.mean()), 3)

# --- Colour blocks ------------------------------------------------------
def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= .0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - .055)

def from_hex(value):
    value = value.lstrip('#')
    s = np.array([int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)
    return np.where(s <= .04045, s / 12.92, np.power((s + .055) / 1.055, 2.4))

palette = ({'dark': from_hex('1f2633'), 'panel': from_hex('3a2f4a'), 'trim': from_hex('e8dcc4')} if zentax else
           {'dark': from_hex('1f2633'), 'panel': from_hex('3d4759'), 'trim': from_hex('b4bdc9')})
finish = {'dark': (.72, .15), 'panel': (.66, .2), 'trim': (.52, .3 if zentax else .35)}
accent = from_hex(args.accent)

srgb = to_srgb(albedo)
top, bottom = srgb.max(-1), srgb.min(-1)
saturation = (top - bottom) / np.maximum(top, 1e-4)
glow = mask & (saturation > .45) & (top > .45)
body = mask & ~glow
lum = albedo @ np.array([.2126, .7152, .0722], dtype=np.float32)
occlusion = np.clip(1 - .7 * (1 - ao), .3, 1)
lum1 = lum / occlusion
feature = np.stack([np.log(lum1 + .01)], -1)
samples_ = feature[body]
rng = np.random.default_rng(1)
pick = samples_[rng.choice(len(samples_), min(len(samples_), 120000), replace=False)]
centres = np.quantile(pick[:, 0], np.linspace(.05, .95, args.clusters))[:, None]
for _ in range(20):
    labels = np.argmin(np.abs(pick - centres.T), 1)
    centres = np.array([[pick[labels == k, 0].mean()] if np.any(labels == k) else centres[k] for k in range(args.clusters)])
label_map = np.argmin(np.abs(feature[..., 0][..., None] - centres[:, 0][None, None]), -1)
palette_lum = {role: float(colour @ np.array([.2126, .7152, .0722])) for role, colour in palette.items()}
new_albedo = albedo.copy(); rough2 = np.full((S, S), .6, np.float32); metal2 = np.full((S, S), .2, np.float32)
roles = []
for k in range(args.clusters):
    region = body & (label_map == k)
    if not region.any(): continue
    median = float(np.median(lum1[region]))
    # Nearest palette tone in log luminance: the concepts were painted in this palette.
    role = min(palette_lum, key=lambda r: abs(math.log(palette_lum[r] + .01) - math.log(median + .01)))
    shade = np.power(np.clip(lum1[region] / median, .25, 4), .12)
    new_albedo[region] = palette[role] * shade[:, None]
    rough2[region], metal2[region] = finish[role]
    roles.append(dict(share=round(float(region.sum() / body.sum()), 3), median=round(median, 3), role=role))
report['roles'] = roles
new_albedo = np.where(body[..., None], new_albedo * (.72 + .28 * np.clip(ao, 0, 1))[..., None], new_albedo)
new_albedo[glow] = accent * .6
emissive = np.where(glow[..., None], accent / accent.max(), 0).astype(np.float32)
for axis in (0, 1):
    emissive = (emissive + np.roll(emissive, 1, axis) + np.roll(emissive, -1, axis)) / 3
emissive = np.clip(emissive * 1.6, 0, 1)
rough2[glow], metal2[glow] = .4, .1
report['glowShare'] = round(float(glow.sum() / max(1, mask.sum())), 4)

def dilate(img, valid, steps=8):
    img = img.copy(); valid = valid.copy()
    for _ in range(steps):
        acc = np.zeros_like(img); cnt = np.zeros(valid.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            v = np.roll(valid, (dy, dx), (0, 1))
            acc += np.roll(img, (dy, dx), (0, 1)) * (v[..., None] if img.ndim == 3 else v)
            cnt += v
        grow = ~valid & (cnt > 0)
        img[grow] = (acc[grow] / cnt[grow][..., None]) if img.ndim == 3 else acc[grow] / cnt[grow]
        valid |= grow
    return img

new_albedo = dilate(np.clip(new_albedo, .015, .9), mask)
orm = np.stack([dilate(np.where(mask, np.clip(ao, 0, 1), 1), mask), dilate(rough2, mask), dilate(metal2, mask)], -1)

def write(name, rgb, srgb_encode):
    data = to_srgb(rgb) if srgb_encode else np.clip(rgb, 0, 1)
    image = bpy.data.images.new(name, S, S, alpha=False, float_buffer=False, is_data=not srgb_encode)
    if not srgb_encode: image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(np.concatenate([data, np.ones((S, S, 1), np.float32)], -1).astype(np.float32).ravel())
    if args.size != S: image.scale(args.size, args.size)
    image.pack()
    return image

img_albedo, img_orm = write(args.key + '-albedo', new_albedo, True), write(args.key + '-orm', orm, False)
img_normal, img_emissive = write(args.key + '-normal', normal, False), write(args.key + '-emissive', emissive, True)

material = bpy.data.materials.new(args.key + '-target'); material.use_nodes = True
nt = material.node_tree
p = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
def tex(image, non_color):
    node = nt.nodes.new('ShaderNodeTexImage'); node.image = image
    if non_color: image.colorspace_settings.name = 'Non-Color'
    return node
nt.links.new(tex(img_albedo, False).outputs['Color'], p.inputs['Base Color'])
split_node = nt.nodes.new('ShaderNodeSeparateColor')
nt.links.new(tex(img_orm, True).outputs['Color'], split_node.inputs['Color'])
nt.links.new(split_node.outputs['Green'], p.inputs['Roughness'])
nt.links.new(split_node.outputs['Blue'], p.inputs['Metallic'])
normal_map = nt.nodes.new('ShaderNodeNormalMap'); normal_map.inputs['Strength'].default_value = .55
nt.links.new(tex(img_normal, True).outputs['Color'], normal_map.inputs['Color'])
nt.links.new(normal_map.outputs['Normal'], p.inputs['Normal'])
nt.links.new(tex(img_emissive, False).outputs['Color'], p.inputs['Emission Color'])
p.inputs['Emission Strength'].default_value = 2.2
group = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
if not group.interface.items_tree: group.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
gnode = nt.nodes.new('ShaderNodeGroup'); gnode.node_tree = group
nt.links.new(split_node.outputs['Red'], gnode.inputs['Occlusion'])
low.data.materials.clear(); low.data.materials.append(material)
bpy.data.objects.remove(high, do_unlink=True)

if args.structure:
    # Supply buildings and the wall keep the old structure contract (build-structure-lods.py):
    # root `<key>` with a `<key>-body` mesh, base centred at y = 0, widest horizontal extent
    # 1 unit (the wall: long axis on X, 1 unit long). No turret rig.
    points = np.array([v.co[:] for v in low.data.vertices])
    zmin = points[:, 2].min()
    foot = points[points[:, 2] < zmin + .12 * (points[:, 2].max() - zmin)]
    centre_xy = foot[:, :2].mean(0) if len(foot) > 20 else points[:, :2].mean(0)
    low.data.transform(Matrix.Translation((-centre_xy[0], -centre_xy[1], -zmin)))
    if args.structure == 'wall':
        points = np.array([v.co[:] for v in low.data.vertices])
        _, axes = np.linalg.eigh(np.cov(points[:, :2].T))
        low.data.transform(Matrix.Rotation(-math.atan2(axes[1, 1], axes[0, 1]), 4, 'Z'))
        points = np.array([v.co[:] for v in low.data.vertices])
        low.data.transform(Matrix.Translation((-(points[:, 0].max() + points[:, 0].min()) / 2, -(points[:, 1].max() + points[:, 1].min()) / 2, 0)))
        points = np.array([v.co[:] for v in low.data.vertices])
        low.data.transform(Matrix.Scale(1 / (points[:, 0].max() - points[:, 0].min()), 4))
    else:
        points = np.array([v.co[:] for v in low.data.vertices])
        low.data.transform(Matrix.Scale(1 / max(np.ptp(points[:, 0]), np.ptp(points[:, 1])), 4))
    root = bpy.data.objects.new(args.key, None); scene.collection.objects.link(root)
    low.name = args.key + '-body'; low.parent = root
    root['style'] = 'target-endless-defense'
    root['accent'] = '#' + args.accent.lstrip('#')
    if args.structure == 'wall':
        root['kind'] = 'wall'; root['edgeCells'] = 1; root['footprintCells'] = 0
    else:
        root['kind'] = args.key.split('-')[1]; root['tier'] = tier; root['footprintCells'] = 1
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_extras=True, export_materials='EXPORT',
                              export_image_format='JPEG', export_jpeg_quality=90)
    report.update(bytes=output.stat().st_size, triangles=len(low.data.polygons), seconds=round(time.time() - t0, 1))
    print('TARGET_TOWER', json.dumps(report))
    sys.exit(0)

# --- Orientation, neck and scale ---------------------------------------
points = np.array([v.co[:] for v in low.data.vertices])
zmin, zmax = points[:, 2].min(), points[:, 2].max()
height = zmax - zmin
rel = (points[:, 2] - zmin) / max(height, 1e-6)
foot = points[rel < .12]
centre_xy = foot[:, :2].mean(0) if len(foot) > 20 else points[:, :2].mean(0)
if edge:
    _, axes = np.linalg.eigh(np.cov((points[:, :2] - centre_xy).T))
    long_axis = axes[:, 1]
    low.data.transform(Matrix.Translation((-centre_xy[0], -centre_xy[1], -zmin)))
    low.data.transform(Matrix.Rotation(-math.atan2(long_axis[1], long_axis[0]), 4, 'Z'))
    points = np.array([v.co[:] for v in low.data.vertices])
    low.data.transform(Matrix.Translation((-(points[:, 0].max() + points[:, 0].min()) / 2, -(points[:, 1].max() + points[:, 1].min()) / 2, 0)))
    points = np.array([v.co[:] for v in low.data.vertices])
    factor = (0.98 / .22) / np.abs(points[:, 0]).max()
    split = None
else:
    # Neck: the narrowest horizontal radius between 15% and 65% of the height.
    radius = np.linalg.norm(points[:, :2] - centre_xy, axis=1)
    bins = np.linspace(0, 1, 41)
    profile = np.array([np.percentile(radius[(rel >= a) & (rel < b)], 90) if np.sum((rel >= a) & (rel < b)) > 8 else np.nan for a, b in zip(bins[:-1], bins[1:])])
    centres_ = (bins[:-1] + bins[1:]) / 2
    window = (centres_ > .15) & (centres_ < .65) & ~np.isnan(profile)
    split = args.split if args.split is not None else (float(centres_[window][np.argmin(profile[window])]) if window.any() else .35)
    upper = rel > split
    # Barrel direction: the bearing of the farthest upper vertices from the axis.
    up = points[upper, :2] - centre_xy
    if args.front is not None:
        front = math.radians(args.front)
    else:
        angles = np.arctan2(up[:, 1], up[:, 0]); dist = np.linalg.norm(up, axis=1)
        far = dist > np.percentile(dist, 97)
        front = math.atan2(np.sin(angles[far]).mean(), np.cos(angles[far]).mean())
    report['front'] = round(math.degrees(front), 1); report['split'] = round(split, 3)
    low.data.transform(Matrix.Translation((-centre_xy[0], -centre_xy[1], -zmin)))
    low.data.transform(Matrix.Rotation(-math.pi / 2 - front, 4, 'Z'))
    points = np.array([v.co[:] for v in low.data.vertices])
    # The body fills the cell; a long barrel or lance may overhang by up to 35%
    # (as on the target game's plinths) instead of shrinking the whole tower.
    radial = np.linalg.norm(points[:, :2], axis=1)
    body = max(float(np.percentile(radial, 92)), float(radial.max()) / 1.35)
    factor = 1.90 / body
    report['overhang'] = round(float(radial.max()) / body, 3)
low.data.transform(Matrix.Scale(factor, 4))
points = np.array([v.co[:] for v in low.data.vertices])

def empty(name, parent=None):
    obj = bpy.data.objects.new(name, None); scene.collection.objects.link(obj); obj.parent = parent
    return obj

def part(name, keep, parent):
    mesh = low.data.copy()
    pm = bmesh.new(); pm.from_mesh(mesh); pm.faces.ensure_lookup_table()
    bmesh.ops.delete(pm, geom=[f for f in pm.faces if not keep[f.index]], context='FACES')
    bmesh.ops.delete(pm, geom=[v for v in pm.verts if not v.link_faces], context='VERTS')
    pm.to_mesh(mesh); pm.free()
    obj = bpy.data.objects.new(name, mesh); scene.collection.objects.link(obj); obj.parent = parent
    return obj

root = empty(tower_id)
root.scale = (.22 * span,) * 3
root['assetId'] = tower_id
root['footprintCells'] = 0 if edge else span * span
if edge: root['edgeCells'] = 2
root['tier'] = tier
root['style'] = 'target-endless-defense'
root['accent'] = '#' + args.accent.lstrip('#')
yaw = empty('turret-yaw', root)
barrels = empty('barrels-recoil', yaw)
centers = np.array([pp.center[:] for pp in low.data.polygons])
split_z = (split if split is not None else .5) * (points[:, 2].max())
upper_faces = centers[:, 2] > split_z
root['splitHeight'] = float(split_z)
fixed = part('fixed-platform', ~upper_faces, root)
moving = part('moving-assembly', upper_faces, root if static else barrels)
socket = empty('muzzle-socket', barrels)
if not static and upper_faces.any():
    gun = np.array([v.co[:] for v in moving.data.vertices])
    tip = gun[gun[:, 1] < gun[:, 1].min() + .15]
    center_x = float((tip[:, 0].min() + tip[:, 0].max()) / 2)
    muzzle_height = float((tip[:, 2].min() + tip[:, 2].max()) / 2)
    length = float(-tip[:, 1].min())
else:
    center_x, muzzle_height, length = 0., float(points[:, 2].max()), .1
socket.location = (center_x, -length, muzzle_height)
root['muzzle'] = dict(length=length, height=muzzle_height, offset=0., centerOffset=center_x)
bpy.data.objects.remove(low, do_unlink=True)

output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_extras=True, export_materials='EXPORT',
                          export_image_format='JPEG', export_jpeg_quality=90)
report.update(bytes=output.stat().st_size, sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
              triangles=sum(len(o.data.polygons) for o in (fixed, moving)), seconds=round(time.time() - t0, 1),
              heightCells=round(float(points[:, 2].max()) * .22 * span, 3))
print('TARGET_TOWER', json.dumps(report))
