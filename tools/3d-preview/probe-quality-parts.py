import bpy
import numpy as np
from pathlib import Path
work = Path(__file__).resolve().parents[3] / "asset-work" / "takipci-v2"
bpy.ops.wm.open_mainfile(filepath=str(work / "simplified.blend"))
obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
mesh = obj.data
xyz = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
mesh.vertices.foreach_get("co", xyz)
xyz = xyz.reshape(-1, 3)
loops = np.empty(len(mesh.loops), dtype=np.int32)
mesh.loops.foreach_get("vertex_index", loops)
centers = xyz[loops].reshape(-1, 3, 3).mean(axis=1)
uv = np.empty(len(mesh.loops) * 2, dtype=np.float32)
mesh.uv_layers.active.data.foreach_get("uv", uv)
uv = uv.reshape(-1, 3, 2).mean(axis=1)
im = next(im for im in bpy.data.images if "basecolor" in im.name)
pixels = np.empty(len(im.pixels), dtype=np.float32)
im.pixels.foreach_get(pixels)
pixels = pixels.reshape(im.size[1], im.size[0], 4)
colors = pixels[(uv[:,1] * (im.size[1]-1)).astype(int), (uv[:,0] * (im.size[0]-1)).astype(int), :3]
green = (colors[:,1] > colors[:,0] * 1.04) & (centers[:,2] > 0.2)
copper = (colors[:,0] > colors[:,1] * 1.5) & (colors[:,1] > colors[:,2] * 1.2)
for name, mask in [("green", green), ("copper", copper)]:
    points = centers[mask]
    print(name, len(points), "bounds", points.min(axis=0), points.max(axis=0))
    for r in [0.15, 0.22, 0.26, 0.3, 0.4, 0.5]:
        band = points[(np.linalg.norm(points[:,:2], axis=1) < r) & (np.linalg.norm(points[:,:2],axis=1) > r-0.05)]
        if len(band): print("radial", r, "z percentiles", np.percentile(band[:,2], [0,10,50,90,100]))
np.savez(work / "mesh-probe.npz", centers=centers, colors=colors)
