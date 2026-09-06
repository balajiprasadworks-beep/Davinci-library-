"""
Convert a high-poly sculpt (ZBrush OBJ, or anything trimesh reads) into a
web-ready GLB for the homepage figure.

    pip install trimesh fast-simplification numpy scipy
    python3 tools/obj-to-glb.py

The source mesh used here was 705k vertices / 1.4M triangles at 46 MB —
far too heavy for a phone. This decimates it, stands it upright with its
feet on y=0, and normalises its height to 1.0 so js/anatomy.js can scale
it predictably.

Note: the exporter writes POSITION only, no NORMAL. That is deliberate —
it keeps the file ~35% smaller, and anatomy.js calls computeVertexNormals()
on load when normals are absent.
"""

import numpy as np, trimesh, fast_simplification, time

t0 = time.time()
mesh = trimesh.load("Male.OBJ", process=False, force="mesh")
print(f"loaded in {time.time()-t0:.1f}s")
print("triangles:", len(mesh.faces), "vertices:", len(mesh.vertices))

ext = mesh.bounds[1] - mesh.bounds[0]
print("bounds:", mesh.bounds.tolist())
print("extent x/y/z:", ext.tolist())

# Weld duplicate vertices first — ZBrush OBJ exports are often unwelded,
# which both bloats the file and breaks smooth shading across seams.
mesh.merge_vertices()
print("after weld -> triangles:", len(mesh.faces), "vertices:", len(mesh.vertices))

for target in (80_000, 45_000):
    v, f = fast_simplification.simplify(
        mesh.vertices.astype(np.float32), mesh.faces.astype(np.uint32),
        target_count=target
    )
    m = trimesh.Trimesh(vertices=v, faces=f, process=False)

    # Stand it up: Y-up, feet on y=0, centred on x/z.
    b = m.bounds
    m.apply_translation([-(b[0][0]+b[1][0])/2, -b[0][1], -(b[0][2]+b[1][2])/2])
    # Normalise height to 1.0 so the site can scale it predictably.
    m.apply_scale(1.0 / (m.bounds[1][1] - m.bounds[0][1]))

    m.fix_normals()
    out = f"male-{target//1000}k.glb"
    m.export(out)
    import os
    print(f"{out}: {len(m.faces)} tris, {os.path.getsize(out)/1e6:.2f} MB, "
          f"bounds {np.round(m.bounds,3).tolist()}")
