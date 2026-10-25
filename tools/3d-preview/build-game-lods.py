"""Game-ready light copies of the preview tower GLBs for apps/web (3D tower layer).

  blender --background --python build-game-lods.py

A tower is drawn about one 34-unit cell wide in the game, so ~6k triangles and
512 px textures are enough. Node names (root, turret-yaw, barrels-recoil,
muzzle-socket) and root extras (tier, footprint, muzzle, edgeCells) are kept,
so the game layer reads the same rig the preview tests verify.
"""
import bpy
import hashlib
import json
from pathlib import Path

base = Path(__file__).resolve().parent
source_dir = base / 'public/game-assets/models/evolution'
output_dir = base.parents[1] / 'apps/web/public/models3d'
output_dir.mkdir(parents=True, exist_ok=True)
TARGET_TRIANGLES = 6000
TEXTURE_SIZE = 512
TOWERS = [f'warrior-{n}' for n in range(1, 7)] + [f'zeynep-{n}' for n in (1, 2, 3, 6, 7, 8)]

manifest = []
for tower in TOWERS:
    for tier in (1, 2, 3):
        key = f'{tower}-tier-{tier}'
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(source_dir / f'{key}.glb'))
        meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        total = sum(len(o.data.polygons) for o in meshes)
        ratio = min(1, TARGET_TRIANGLES / total)
        for obj in meshes:
            bpy.context.view_layer.objects.active = obj
            modifier = obj.modifiers.new('Game triangle budget', 'DECIMATE')
            modifier.ratio = ratio
            modifier.use_collapse_triangulate = True
            with bpy.context.temp_override(object=obj, active_object=obj):
                bpy.ops.object.modifier_apply(modifier=modifier.name)
        for image in bpy.data.images:
            if image.size[0] > TEXTURE_SIZE:
                image.scale(TEXTURE_SIZE, TEXTURE_SIZE)
                image.pack()
        output = output_dir / f'{key}.glb'
        bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_extras=True, export_materials='EXPORT',
                                  export_image_format='JPEG', export_jpeg_quality=85)
        triangles = sum(len(o.data.polygons) for o in meshes)
        manifest.append(dict(key=key, bytes=output.stat().st_size, triangles=triangles,
                             sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
                             source=f'tools/3d-preview/public/game-assets/models/evolution/{key}.glb'))
        print('LOD', key, triangles, output.stat().st_size)

(output_dir / 'manifest.json').write_text(json.dumps(dict(
    note='Game copies of the 3D preview towers (tools/3d-preview/build-game-lods.py). Not included in the itch.io package.',
    targetTriangles=TARGET_TRIANGLES, textureSize=TEXTURE_SIZE, models=manifest), indent=2) + '\n', encoding='utf-8')
print('LOD_DONE', len(manifest))
