import sys, bpy
argv = sys.argv[1:]
blend, cam, out = argv[0], argv[1], argv[2]
opts = argv[3:]
import os; bpy.ops.wm.open_mainfile(filepath=os.path.abspath(blend))
sc = bpy.context.scene
sc.camera = bpy.data.objects[cam]
frame = 1
res = None
for o in opts:
    k, _, v = o.partition("=")
    if k == "hide":
        for name in v.split(","):
            for c in bpy.data.collections:
                if c.name.startswith(name):
                    c.hide_render = True
    elif k == "frame": frame = int(v)
    elif k == "samples": sc.cycles.samples = int(v)
    elif k == "res":
        w, h = v.split("x"); sc.render.resolution_x, sc.render.resolution_y = int(w), int(h)
    elif k == "transparent": sc.render.film_transparent = True
    elif k == "frames":
        a, b = v.split("-"); sc.frame_start, sc.frame_end = int(a), int(b)
sc.frame_set(frame)
sc.cycles.device = 'CPU'
import os; sc.render.filepath = os.path.abspath(out) if not out.startswith("//") else out
if "anim" in opts:
    sc.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(animation=True)
else:
    bpy.ops.render.render(write_still=True)
