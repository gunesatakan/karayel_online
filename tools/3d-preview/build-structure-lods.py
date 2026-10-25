"""Game-ready GLBs of the Tripo structures for the angled 3D view: mines, supply buildings and the wall.

  blender --background --python build-structure-lods.py -- <set> <decoded-source-dir> [<check-dir>]

  <set>: mines | buildings | wall | workers

Sources are the Tripo H3.1 models generated from the GPT Image 2.5 concepts
(art-direction/mines/, art-direction/buildings/), decoded to plain GLB
(meshopt and quantization removed) as `<key>.glb`. They are ~2M triangles and
~20 MB, so they stay outside the repository.

Each model is normalised for the game: transforms applied, parts joined, the
base levelled (a plane fitted to the lowest points of its outer rim), the base
centred on the origin with its bottom at y = 0 and scaled to 1 unit: the widest
horizontal extent for mines and buildings, the length for the wall (whose long
axis is first turned onto X). Then ~8k triangles and 512 px JPEG textures. With
a check dir, a Workbench side and three-quarter render of every result is
written there.
"""
import bpy
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(args) < 2:
    raise SystemExit('usage: blender -b -P build-structure-lods.py -- <mines|buildings|wall|workers> <decoded-source-dir> [<check-dir>]')
model_set, source_dir = args[0], Path(args[1])
check_dir = Path(args[2]) if len(args) > 2 else None
base = Path(__file__).resolve().parent
output_dir = base.parents[1] / 'apps/web/public/models3d'
output_dir.mkdir(parents=True, exist_ok=True)
TARGET_TRIANGLES = 8000
TEXTURE_SIZE = 512

# key (kaynak dosya adi) -> cikti adi ve kok dugumun ek bilgisi
SETS = {
    'mines': {kind: (f'mine-{kind}', {'kind': kind}) for kind in ['energy', 'gunpowder', 'iron', 'mystic', 'plasma']},
    'buildings': {f'{kind}-t{tier}': (f'building-{kind}-tier-{tier}', {'kind': kind, 'tier': tier})
                  for kind in ['energy', 'ammunition', 'warehouse', 'repair'] for tier in (1, 2)},
    'wall': {'wall': ('wall-1', {'kind': 'wall', 'edgeCells': 1})},
    'workers': {'worker': ('worker-drone', {'kind': 'worker'})},
}
ART = {'mines': 'mines', 'buildings': 'buildings', 'wall': 'buildings', 'workers': 'workers'}


def vertex_array(body):
    co = np.empty(len(body.data.vertices) * 3, dtype=np.float64)
    body.data.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def level_base(body):
    """Tabanin dis kenarina duzlem oturt, egikse duzelt (derece). Tripo bazen tabani egik kuruyor."""
    co = vertex_array(body)
    center = (co[:, :2].max(axis=0) + co[:, :2].min(axis=0)) / 2
    rel = co[:, :2] - center
    radius = np.hypot(rel[:, 0], rel[:, 1])
    angle = np.arctan2(rel[:, 1], rel[:, 0])
    outer = radius > radius.max() * 0.7
    points = []
    for sector in range(36):
        lo, hi = -math.pi + sector * math.pi / 18, -math.pi + (sector + 1) * math.pi / 18
        mask = outer & (angle >= lo) & (angle < hi)
        if mask.any():
            points.append(co[mask][np.argmin(co[mask][:, 2])])
    points = np.array(points)
    a = np.c_[points[:, 0], points[:, 1], np.ones(len(points))]
    (gx, gy, _), *_ = np.linalg.lstsq(a, points[:, 2], rcond=None)
    normal = Vector((-gx, -gy, 1)).normalized()
    tilt = math.degrees(normal.angle(Vector((0, 0, 1))))
    if tilt > 0.5:
        body.data.transform(normal.rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4())
        body.data.update()
    return tilt


def align_long_axis(body):
    """Duvarin uzun eksenini X'e cevir (zemin duzleminde ana eksen)."""
    co = vertex_array(body)
    xy = co[:, :2] - co[:, :2].mean(axis=0)
    _, vectors = np.linalg.eigh(np.cov(xy.T))
    major = vectors[:, -1]
    turn = -math.atan2(major[1], major[0])
    body.data.transform(Matrix.Rotation(turn, 4, 'Z'))
    body.data.update()
    return math.degrees(turn)


def render_check(path_stem):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x, scene.render.resolution_y = 500, 500
    scene.world = bpy.data.worlds.new('check')
    cam_data = bpy.data.cameras.new('check')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 1.5
    cam = bpy.data.objects.new('check', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    for index, location in enumerate([(0, -3, 0.25), (2.0, -2.0, 2.0)]):
        cam.location = location
        cam.rotation_euler = (Vector((0, 0, 0.2)) - Vector(location)).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(check_dir / f'{path_stem}-{index}.png')
        bpy.ops.render.render(write_still=True)


manifest = []
for source_key, (name, extras) in SETS[model_set].items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source_dir / f'{source_key}.glb'))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    # Ebeveyn donusumleri dahil uygula, parcalari tek govdeye birlestir.
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    for obj in list(bpy.context.scene.objects):
        if obj is not body:
            bpy.data.objects.remove(obj, do_unlink=True)
    # Suzulen dronun tabani yok: duzeltme yalnizca yere oturan yapilarda.
    tilt = level_base(body) if model_set != 'workers' else 0
    turned = align_long_axis(body) if model_set == 'wall' else 0
    # Blender Z yukari; glTF disa aktarim Y yukariya ceviriyor. Kutu koselerden:
    # `bound_box` duzeltmeden sonra hemen tazelenmiyor.
    co = vertex_array(body)
    lo, hi = Vector(co.min(axis=0)), Vector(co.max(axis=0))
    size = (hi.x - lo.x) if model_set == 'wall' else max(hi.x - lo.x, hi.y - lo.y)
    body.location -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    bpy.ops.object.transform_apply(location=True)
    body.scale = (1 / size, 1 / size, 1 / size)
    bpy.ops.object.transform_apply(scale=True)
    height = (hi.z - lo.z) / size
    depth = (hi.y - lo.y) / size

    total = len(body.data.polygons)
    modifier = body.modifiers.new('Game triangle budget', 'DECIMATE')
    modifier.ratio = min(1, TARGET_TRIANGLES / total)
    modifier.use_collapse_triangulate = True
    with bpy.context.temp_override(object=body, active_object=body):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for image in bpy.data.images:
        if image.size[0] > TEXTURE_SIZE:
            image.scale(TEXTURE_SIZE, TEXTURE_SIZE)
            image.pack()

    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    body.parent = root
    body.name = f'{name}-body'
    for key, value in extras.items():
        root[key] = value
    root['height'] = round(height, 4)
    if model_set == 'wall':
        root['depth'] = round(depth, 4)

    output = output_dir / f'{name}.glb'
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_extras=True, export_materials='EXPORT',
                              export_image_format='JPEG', export_jpeg_quality=85)
    triangles = len(body.data.polygons)
    manifest.append(dict(key=name, bytes=output.stat().st_size, triangles=triangles, height=round(height, 4), leveledDegrees=round(tilt, 2),
                         turnedDegrees=round(turned, 2), sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
                         source=f'Tripo H3.1 / art-direction/{ART[model_set]}/{source_key}.png'))
    print('MODEL', name, triangles, 'h', round(height, 3), 'd', round(depth, 3), output.stat().st_size, 'tilt', round(tilt, 2), 'turn', round(turned, 1))
    if check_dir:
        check_dir.mkdir(parents=True, exist_ok=True)
        render_check(name)

(output_dir / f'{model_set}-manifest.json').write_text(json.dumps(dict(
    note=f'Game copies of the Tripo {model_set} models (tools/3d-preview/build-structure-lods.py). Not included in the itch.io package.',
    targetTriangles=TARGET_TRIANGLES, textureSize=TEXTURE_SIZE, models=manifest), indent=2) + '\n', encoding='utf-8')
print('SET_DONE', model_set, len(manifest))
