"""Game-ready mine (resource node) GLBs for the angled 3D view.

  blender --background --python build-mine-lods.py -- <decoded-source-dir> [<check-dir>]

Sources are the Tripo H3.1 models generated from the GPT Image 2.5 mine
concepts (art-direction/mines/), decoded to plain GLB (meshopt and
quantization removed) as `<kind>.glb`. They are ~2M triangles and ~20 MB, so
they stay outside the repository.

Each mine is normalised for the game: transforms applied, parts joined, the
base levelled (a plane fitted to the lowest points of its outer rim), the
base centred on the origin with its bottom at y = 0 and its widest horizontal
extent scaled to 1 (the game scales it to the cell). Then ~8k triangles and
512 px JPEG textures, root node `mine-<kind>`. With a check dir, a Workbench
side and three-quarter render of every result is written there.
"""
import bpy
import hashlib
import math
import numpy as np
import json
import sys
from mathutils import Matrix, Vector
from pathlib import Path

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not args:
    raise SystemExit('usage: blender -b -P build-mine-lods.py -- <decoded-source-dir> [<check-dir>]')
source_dir = Path(args[0])
check_dir = Path(args[1]) if len(args) > 1 else None
base = Path(__file__).resolve().parent
output_dir = base.parents[1] / 'apps/web/public/models3d'
output_dir.mkdir(parents=True, exist_ok=True)
TARGET_TRIANGLES = 8000
TEXTURE_SIZE = 512
KINDS = ['energy', 'gunpowder', 'iron', 'mystic', 'plasma']


def level_base(body):
    """Tabanin dis kenarina duzlem oturt, egikse duzelt (derece). Tripo bazen tabani egik kuruyor."""
    count = len(body.data.vertices)
    co = np.empty(count * 3, dtype=np.float64)
    body.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
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
for kind in KINDS:
    key = f'mine-{kind}'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source_dir / f'{kind}.glb'))
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
    tilt = level_base(body)
    # Blender Z yukari; glTF disa aktarim Y yukariya ceviriyor.
    # Kutu koselerden: `bound_box` duzeltmeden sonra hemen tazelenmiyor.
    co = np.empty(len(body.data.vertices) * 3, dtype=np.float64)
    body.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    lo, hi = Vector(co.min(axis=0)), Vector(co.max(axis=0))
    width = max(hi.x - lo.x, hi.y - lo.y)
    body.location -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    bpy.ops.object.transform_apply(location=True)
    body.scale = (1 / width, 1 / width, 1 / width)
    bpy.ops.object.transform_apply(scale=True)
    height = (hi.z - lo.z) / width

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

    root = bpy.data.objects.new(key, None)
    bpy.context.scene.collection.objects.link(root)
    body.parent = root
    body.name = f'{key}-body'
    root['kind'] = kind
    root['height'] = round(height, 4)

    output = output_dir / f'{key}.glb'
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_extras=True, export_materials='EXPORT',
                              export_image_format='JPEG', export_jpeg_quality=85)
    triangles = len(body.data.polygons)
    manifest.append(dict(key=key, bytes=output.stat().st_size, triangles=triangles, height=round(height, 4), leveledDegrees=round(tilt, 2),
                         sha256=hashlib.sha256(output.read_bytes()).hexdigest(), source=f'Tripo H3.1 / art-direction/mines/{kind}.png'))
    print('MINE', key, triangles, round(height, 3), output.stat().st_size, 'tilt', round(tilt, 2))
    if check_dir:
        check_dir.mkdir(parents=True, exist_ok=True)
        render_check(key)

(output_dir / 'mines-manifest.json').write_text(json.dumps(dict(
    note='Game copies of the Tripo mine models (tools/3d-preview/build-mine-lods.py). Not included in the itch.io package.',
    targetTriangles=TARGET_TRIANGLES, textureSize=TEXTURE_SIZE, models=manifest), indent=2) + '\n', encoding='utf-8')
print('MINES_DONE', len(manifest))
