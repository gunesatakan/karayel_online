"""Create a pastel material variant of the reviewed rig without changing geometry.

The original albedo is sampled into mesh vertex colours; no bitmap is edited.
UVs, normals, rig and footprint are preserved, with softer PBR material values.
"""
import bpy
import numpy as np
import json
import hashlib
from pathlib import Path

base = Path(__file__).resolve().parent
source_path = base / "public/game-assets/models/warrior-1-stylized.glb"
output = base / "public/game-assets/models/warrior-1-pastel.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source_path))
root = bpy.data.objects["warrior-1"]
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]

def linear(srgb):
    return np.where(srgb <= .04045, srgb / 12.92, ((srgb + .055) / 1.055) ** 2.4)

def srgb(values):
    return np.where(values <= .0031308, values * 12.92, 1.055 * np.maximum(values, 0) ** (1 / 2.4) - .055)

def hex_rgb(value):
    return np.array([int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)

palettes = {
    "peach": hex_rgb("C58E7D"),
    "mint": hex_rgb("7FA99A"),
    "sage": hex_rgb("6E8F96"),
    "cream": hex_rgb("B7A174"),
    "stone": hex_rgb("94A6A0"),
}
materials = {material for obj in meshes for material in obj.data.materials}
albedos = {}
for material in materials:
    bsdf = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    image = bsdf.inputs["Base Color"].links[0].from_node.image
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    albedos[material] = pixels.reshape(image.size[1], image.size[0], 4)[..., :3]

for obj in meshes:
    mesh = obj.data
    texture = albedos[mesh.materials[0]]
    uv = np.empty(len(mesh.loops) * 2, dtype=np.float32)
    mesh.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    height, width = texture.shape[:2]
    samples = texture[np.clip((uv[:, 1] * (height - 1)).astype(int), 0, height - 1), np.clip((uv[:, 0] * (width - 1)).astype(int), 0, width - 1)]
    original = np.clip(srgb(samples), 0, 1)
    r, g, b = original.T
    maximum = original.max(axis=1)
    copper = (r > g * 1.18) & (r > b * 1.32)
    green = (g > r * 1.04) & ~copper
    gold = (r > b * 1.15) & (g > b * 1.1) & ~copper & ~green
    target = np.tile(palettes["stone"], (len(mesh.loops), 1))
    target[copper] = palettes["peach"]
    target[green] = palettes["sage"] if obj.name == "fixed-copper-platform" else palettes["mint"]
    target[gold] = palettes["cream"]
    # Broad light colours, retaining some surface variation and dark recesses.
    tone = .32 + .68 * np.sqrt(maximum)
    colour = target * tone[:, None]
    recess = np.clip((.14 - maximum) / .14, 0, 1)[:, None]
    colour *= 1 - recess * .55
    rgba = np.ones((len(mesh.loops), 4), dtype=np.float32)
    rgba[:, :3] = linear(colour)
    attribute = mesh.color_attributes.new(name="Pastel", type="BYTE_COLOR", domain="CORNER")
    attribute.data.foreach_set("color", rgba.ravel())

for material in materials:
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    for name in ["Base Color", "Metallic", "Roughness"]:
        for link in list(bsdf.inputs[name].links):
            links.remove(link)
    vertex = nodes.new("ShaderNodeVertexColor")
    vertex.layer_name = "Pastel"
    links.new(vertex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = .22
    bsdf.inputs["Roughness"].default_value = .76
    for node in nodes:
        if node.type == "NORMAL_MAP":
            node.inputs["Strength"].default_value = .78
    material.name = "Pastel painted metal"

root["quality"] = "Pastel vertex palette / 2K normal map / 50k triangles"
root["palette"] = "peach, mint, sage, pale gold"
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_extras=True, export_materials="EXPORT", export_image_format="AUTO")
original_report = json.loads((base / "validation/takipci-stylized.json").read_text(encoding="utf-8"))
report = {
    **original_report,
    "sourceModel": str(source_path.relative_to(base)).replace("\\", "/"),
    "sourceModelSha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
    "credits": 0,
    "modelSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    "modelBytes": output.stat().st_size,
    "colour": "Per-corner mesh colours sampled from the original albedo and mapped to a pastel palette",
    "maps": ["normal 2048x2048"],
    "metallic": .22,
    "roughness": .76,
    "normalStrength": .78,
}
(base / "validation/takipci-pastel.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
print("PASTEL_EXPORT", json.dumps(report))
