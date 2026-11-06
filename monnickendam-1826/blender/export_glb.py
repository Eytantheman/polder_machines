import bpy, sys, os
src, out = sys.argv[1], sys.argv[2]
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(src))
# freeze rig at rest: drop drivers, zero the spins
for o in bpy.data.objects:
    if o.animation_data:
        for fc in list(o.animation_data.drivers):
            o.driver_remove(fc.data_path, fc.array_index)
bpy.data.objects["Rotor_spin"].rotation_euler[0] = 0
bpy.data.objects["Koningsspil_spin"].rotation_euler[2] = 0
bpy.data.objects["Vijzel_spin"].rotation_euler[0] = 0
bpy.context.scene.frame_set(0)
# drop reference sheet, water, bed; keep and lengthen the clay dike
for o in list(bpy.data.objects):
    if o.name.startswith("Reference") or o.name in ("Terrein.water", "Terrein.mud") or o.type in ("CAMERA", "LIGHT"):
        bpy.data.objects.remove(o)
dike = bpy.data.objects["Terrein.earth"]
for v in dike.data.vertices:
    if abs(v.co.y) > 29: v.co.y *= 20
bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=os.path.abspath(out), export_format='GLB', export_yup=True,
                          export_apply=True, export_animations=False, export_cameras=False,
                          export_lights=False, export_extras=False)
print("exported", out, os.path.getsize(out))
