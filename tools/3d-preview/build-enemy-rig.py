"""Game enemy with a walk: the Tripo rig of our built model + Tripo's walk preset, one GLB.

  blender -b --factory-startup --python build-enemy-rig.py -- --key enemy-golem-grunt \
      --base out-enemies/enemy-golem-grunt.glb --rig rig.glb --walk walk.glb --out enemy-golem-grunt.glb

The rig file is our uploaded game model (build-target-tower.py --structure unit --palette native)
with Tripo's skeleton and skin weights; the walk file is only that skeleton with a `walk` action.
Here:
  - the walk is put on the rig (same bone names) and its root motion removed (in place); the
    stride speed (model units per second) goes to the root extras as `walkSpeed`, so the game can
    play it at the speed the enemy really moves,
  - finger, twist, eye and end bones are folded into their parent (weights summed): fewer joints and tracks,
  - the root keeps the base model's extras (kind, accent, height) under the key name.
"""
import argparse
import json
import math
import re
import sys
import time
from pathlib import Path

import bpy
from bpy_extras import anim_utils
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--key', required=True)
parser.add_argument('--base', required=True, help='built game model (root extras)')
parser.add_argument('--rig', required=True, help='Tripo rigging GLB of the base model')
parser.add_argument('--walk', required=True, help='Tripo retarget GLB (walk preset)')
parser.add_argument('--out', required=True)
args = parser.parse_args(argv)
t0 = time.time()

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [o for o in bpy.data.objects if o not in before]


# Root extras of the built model.
base = import_glb(args.base)
base_root = next(o for o in base if o.name == args.key)
extras = {k: base_root[k] for k in base_root.keys() if not k.startswith('_')}
for o in base: bpy.data.objects.remove(o, do_unlink=True)

rig_objects = import_glb(args.rig)
arm = next(o for o in rig_objects if o.type == 'ARMATURE')
body = next(o for o in rig_objects if o.type == 'MESH' and o.parent == arm and len(o.vertex_groups) > 0)
for o in rig_objects:
    if o not in (arm, body): bpy.data.objects.remove(o, do_unlink=True)

walk_objects = import_glb(args.walk)
walk_arm = next(o for o in walk_objects if o.type == 'ARMATURE')
action = walk_arm.animation_data.action
slot_name = walk_arm.animation_data.action_slot.name_display if walk_arm.animation_data.action_slot else None
for o in walk_objects: bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):
    if a != action: bpy.data.actions.remove(a)
action.name = 'walk'

arm.animation_data_create()
arm.animation_data.action = action
if action.slots:
    arm.animation_data.action_slot = action.slots[0]
channelbag = anim_utils.action_get_channelbag_for_slot(action, arm.animation_data.action_slot)
bone_names = {b.name for b in arm.data.bones}
animated = {m.group(1) for fc in channelbag.fcurves if (m := re.match(r'pose\.bones\["(.+?)"\]', fc.data_path))}
matched = len(animated & bone_names) / max(1, len(animated))
if matched < .9: raise SystemExit(f'walk does not fit the rig: {matched:.0%} of animated bones found')

# --- Fold finger and end bones into their parent --------------------------
# Mixamo fingers and end bones; Tripo's own biped: fingers, twist and share bones, eyes, face.
FOLD = re.compile(r'(Hand(Thumb|Index|Middle|Ring|Pinky)\d|_End$|HeadTop_End|ToeBase$|^[LR]_(Pinky|Ring|Mid|Index|Thumb)\d$|Twist0\d$|ShareBone$|_Eye$|^FacialBone$)')
folded = [b.name for b in arm.data.bones if FOLD.search(b.name)]
keep_of = {}
for name in folded:
    parent = arm.data.bones[name].parent
    while parent and parent.name in folded: parent = parent.parent
    keep_of[name] = parent.name if parent else None
groups = body.vertex_groups
for name, target in keep_of.items():
    source = groups.get(name)
    if source is None or target is None: continue
    dest = groups.get(target) or groups.new(name=target)
    for v in body.data.vertices:
        for g in v.groups:
            if g.group == source.index and g.weight > 0:
                dest.add([v.index], g.weight, 'ADD')
    groups.remove(source)
for fc in list(channelbag.fcurves):
    m = re.match(r'pose\.bones\["(.+?)"\]', fc.data_path)
    if m and m.group(1) in keep_of: channelbag.fcurves.remove(fc)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name in folded:
    bone = arm.data.edit_bones.get(name)
    if bone: arm.data.edit_bones.remove(bone)
bpy.ops.object.mode_set(mode='OBJECT')

# --- Walk in place ---------------------------------------------------------
f0, f1 = (int(round(v)) for v in action.frame_range)
fps = scene.render.fps / scene.render.fps_base


def world_head(pb, frame):
    scene.frame_set(frame)
    return arm.matrix_world @ pb.matrix.translation


order = []
queue = [b for b in arm.pose.bones if b.parent is None]
while queue:
    pb = queue.pop(0); order.append(pb); queue.extend(pb.children)
def pose(pb, frame):
    scene.frame_set(frame)
    return pb.matrix.copy()


# The moving root: the top-most bone that drifts over the cycle, or whose first frame is far from its
# rest pose (Tripo's own biped walk comes in another axis convention: hips 2 units up, walking along Z).
# It is put back on its rest pose at the first frame (rotation only when off by more than 30 degrees)
# and its linear drift is removed, all in armature space.
drifter = None
for pb in order:
    m0, m1 = pose(pb, f0), pose(pb, f1)
    rest = pb.bone.matrix_local
    turned = m0.to_quaternion().rotation_difference(rest.to_quaternion()).angle > math.radians(30)
    if (m1.translation - m0.translation).length > .02 or (m0.translation - rest.translation).length > .05 or turned:
        drifter = pb
        break
walk_speed = 0.0
if drifter:
    m0, m1 = pose(drifter, f0), pose(drifter, f1)
    rest = drifter.bone.matrix_local
    drift = m1.translation - m0.translation
    walk_speed = drift.length / max(1e-3, (f1 - f0) / fps)
    turn = rest.to_quaternion() @ m0.to_quaternion().inverted()
    # Mixamo walks lean on purpose; Tripo's own skeleton comes turned, so it is always set back.
    if turn.angle <= math.radians(30) and drifter.name.startswith('mixamorig:'): turn.identity()
    turn_m = turn.to_matrix().to_4x4()
    start = m0.translation.copy()
    target = rest.translation.copy() if (start - rest.translation).length > .05 else start
    fix = Matrix.Translation(target) @ turn_m @ Matrix.Translation(-start)
    drift_fixed = turn.to_matrix() @ drift
    poses = {}
    for f in range(f0, f1 + 1):
        m = fix @ pose(drifter, f)
        m.translation -= drift_fixed * ((f - f0) / max(1, f1 - f0))
        poses[f] = m
    paths = {f'pose.bones["{drifter.name}"].{channel}' for channel in ('location', 'rotation_quaternion', 'rotation_euler')}
    for fc in list(channelbag.fcurves):
        if fc.data_path in paths: channelbag.fcurves.remove(fc)
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        drifter.matrix = poses[f]
        drifter.keyframe_insert('location', frame=f)
        drifter.keyframe_insert('rotation_quaternion' if drifter.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=f)
    scene.frame_set(f0)
if walk_speed < .05:
    # In-place walk (Tripo's quadruped / hexapod / octopod presets): one stride per cycle is how far a
    # foot sweeps along the walking axis (+X); feet are the low leaf bones.
    scene.frame_set(f0)
    zs = [(arm.matrix_world @ pb.matrix.translation).z for pb in arm.pose.bones]
    low = min(zs) + .3 * (max(zs) - min(zs))
    feet = [pb for pb in arm.pose.bones if not pb.children and (arm.matrix_world @ pb.matrix.translation).z <= low]
    sweeps = []
    for pb in feet:
        xs = [world_head(pb, f).x for f in range(f0, f1 + 1)]
        sweeps.append(max(xs) - min(xs))
    sweeps.sort()
    stride = sweeps[len(sweeps) // 2] if sweeps else .3
    walk_speed = max(.05, stride / max(1e-3, (f1 - f0) / fps))
    scene.frame_set(f0)

# --- Root, extras, export --------------------------------------------------
root = bpy.data.objects.new(args.key, None)
scene.collection.objects.link(root)
for k, v in extras.items(): root[k] = v
root['rig'] = 'tripo'
root['walkSpeed'] = round(walk_speed, 4)
root['walkSeconds'] = round((f1 - f0) / fps, 4)
arm.parent = root
arm.name = args.key + '-rig'
body.name = args.key + '-body'
# The mesh keeps its shadow flags in the game; Tripo's material came back with our textures.
out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', export_extras=True, export_materials='EXPORT',
                          export_image_format='JPEG', export_jpeg_quality=90, export_skins=True, export_animations=True,
                          export_animation_mode='ACTIONS', export_force_sampling=True, export_optimize_animation_size=True,
                          export_def_bones=False, export_rest_position_armature=True)
report = dict(key=args.key, bones=len(arm.data.bones), folded=len(folded), drifter=drifter.name if drifter else None,
              walkSpeed=round(walk_speed, 4), walkSeconds=round((f1 - f0) / fps, 3), frames=[f0, f1], fps=fps,
              bytes=out.stat().st_size, seconds=round(time.time() - t0, 1))
print('ENEMY_RIG', json.dumps(report))
