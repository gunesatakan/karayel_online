"""Assemble the middle visual tier from the inspected early base and late core."""
import bpy
import hashlib
import json
import sys
from pathlib import Path
from mathutils import Matrix

base = Path(__file__).resolve().parent
work = base.parents[2] / 'asset-work/evolution'
for number in range(1, 7):
    tower_id = f'warrior-{number}'
    key = tower_id + '-tier-2'
    bpy.ops.wm.open_mainfile(filepath=str(work/f'{tower_id}-tier-1/processed.blend'))
    early = bpy.data.objects[tower_id]
    early_height = float(early['splitHeight'])
    span = 2 if number == 6 else 1
    fixed = bpy.data.objects['fixed-platform']
    fixed.parent = None
    early_detail = bpy.data.objects['moving-assembly'] if number in [2,3] else None
    if early_detail:
        early_detail.parent = None
        early_detail.name = 'steampunk-outer-mechanism'
        early_height = max(early_height, max(v.co.z for v in early_detail.data.vertices)*.72)
    for obj in list(bpy.context.scene.objects):
        if obj not in [fixed, early_detail]: bpy.data.objects.remove(obj, do_unlink=True)
    with bpy.data.libraries.load(str(work/f'{tower_id}-tier-3/processed.blend'), link=False) as (source, target):
        target.objects = ['moving-assembly']
    moving = target.objects[0]
    late_root = moving.parent
    while late_root.parent: late_root = late_root.parent
    core_scale = .82 if early_detail else 1.
    delta = early_height - float(late_root['splitHeight'])*core_scale
    muzzle = dict(late_root['muzzle'])
    muzzle = {k:v*core_scale for k,v in muzzle.items()}
    muzzle['height'] += delta
    bpy.context.scene.collection.objects.link(moving)
    moving.parent = None
    moving.data.transform(Matrix.Scale(core_scale,4))
    moving.data.transform(Matrix.Translation((0,0,delta)))
    for obj in list(bpy.data.objects):
        if obj not in [fixed, moving, early_detail]: bpy.data.objects.remove(obj, do_unlink=True)

    def empty(name, parent=None):
        obj = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = parent
        return obj

    root = empty(tower_id)
    root.scale = (.22*span,) * 3
    root['assetId'] = tower_id
    root['tier'] = 2
    root['footprintCells'] = span*span
    root['muzzle'] = muzzle
    root['source'] = 'Hybrid: steampunk base + advanced core'
    yaw = empty('turret-yaw', root)
    barrels = empty('barrels-recoil', yaw)
    socket = empty('muzzle-socket', barrels)
    socket.location = (muzzle['centerOffset'], -muzzle['length'], muzzle['height'])
    fixed.parent = root
    if early_detail: early_detail.parent = root
    moving.parent = root if number in [2,3] else barrels
    # A short machined adapter closes the two independently reconstructed cuts.
    near = [v.co for v in moving.data.vertices if abs(v.co.z-early_height)<.08]
    radius = min(.76, max((v.xy.length for v in near), default=.7))
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=.04, location=(0,0,early_height-.07))
    adapter = bpy.context.object
    adapter.name = 'brass-transition-bearing'
    adapter.parent = root
    material = bpy.data.materials.new('Semi-matte brass adapter')
    material.diffuse_color = (.045,.035,.02,1)
    material.use_nodes = True
    p = material.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (.045,.035,.02,1)
    p.inputs['Metallic'].default_value = .72
    p.inputs['Roughness'].default_value = .48
    adapter.data.materials.append(material)
    bevel = adapter.modifiers.new('Machined edge', 'BEVEL'); bevel.width=.025; bevel.segments=2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    bpy.ops.object.modifier_add(type='TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=adapter.modifiers[-1].name)
    output = base/'public/game-assets/models/evolution'/f'{key}.glb'
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_extras=True, export_image_format='AUTO')
    folder = work/key; folder.mkdir(exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(folder/'processed.blend'))
    report = dict(key=key, sources=[f'{tower_id}-tier-1',f'{tower_id}-tier-3'], modelSha256=hashlib.sha256(output.read_bytes()).hexdigest(), modelBytes=output.stat().st_size,
        triangleCount=sum(len(o.data.polygons) for o in [fixed,moving,adapter,early_detail] if o is not None), footprintSpan=span, radiusCells=.418*span, muzzle=muzzle, jointHeight=early_height)
    (base/'validation'/f'{key}.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('HYBRID_EXPORT', json.dumps(report))
