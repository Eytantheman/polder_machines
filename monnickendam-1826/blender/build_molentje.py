"""
Vijzel-Staartmolentje, Monnickendam 1826 -- procedural Blender model.

Built from the drawing "Teekening van een Vijzel-Staart-Molentje gebouwd by
Monnickendam, 1826" (scale bar: 6 Rhijnlandsche voeten, 80.5 px per foot on the
scanned sheet, i.e. 0.0039 m per px). Units are metres.

Coordinate system
    X : along the drawn elevation, left (sails) -> right (tail vane / screw)
    Y : depth (perpendicular to the sheet)
    Z : up; Z = 0 is the "Waterlyn" (lower water level) of the drawing
Sheet pixel (x, y) maps to X = (x - 1005) * 0.0039, Z = (2240 - y) * 0.0039.

Kinematics (drivers, play the timeline):
    Rotor (sails + windshaft + 20-cog head wheel) turns counter-clockwise seen
    from the front, 18 rpm at 24 fps.
    Vertical shaft (15-stave lantern + 17-cog crown wheel)  = rotor * 20/15
    Screw (20-cog wheel + Archimedes screw)                 = vertical * 17/20
    Empty "Kruiwerk_yaw" turns cap, body, tail and rotor together about the
    vertical shaft (the gearing stays engaged because the lantern is coaxial).

Run:  blender --background --python build_molentje.py -- out.blend [drawing.jpg]
  or  python3 build_molentje.py out.blend [drawing.jpg]   (with the bpy module)
"""
import sys, math, os
import bpy, bmesh
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
OUT = argv[0] if argv else "molentje.blend"
DRAWING = argv[1] if len(argv) > 1 else None

V = Vector
PX = 0.0039
def sx(x): return (x - 1005) * PX
def sz(y): return (2240 - y) * PX

# --------------------------------------------------------------------------
# key dimensions (derived from the drawing; see notes in the summary)
# --------------------------------------------------------------------------
Z_PEIL = 0.81          # Amsterdamsche Peil (upper water)
Z_LOW = 0.0            # Waterlyn (lower water)

# upper gearing
ALPHA = math.radians(16.0)                  # windshaft tilt
D_W = V((math.cos(ALPHA), 0, -math.sin(ALPHA)))   # windshaft axis, towards rear
U_W = V((math.sin(ALPHA), 0, math.cos(ALPHA)))    # "up" in head-wheel plane
R_HEAD = 0.22          # pitch radius of head-wheel cogs (20)
R_LANT = 0.17          # pitch radius of lantern staves (15)  -> 20/15
Z_LANT = 4.00
COG_C = 0.08           # centre of cog engagement, measured from wheel centre plane
E = V((-R_LANT, 0, Z_LANT))
WC = E + R_HEAD * U_W - COG_C * D_W          # head-wheel centre on the windshaft
def shaft_pt(x):       # point on windshaft centre line at given X
    s = (x - WC.x) / D_W.x
    return WC + s * D_W
HUB = shaft_pt(-1.01)                         # where the sail stocks pass through

# lower gearing
Z_CROWN = 1.28         # crown wheel centre plane
R_CROWN_COG = 0.27     # base radius of the slanted crown cogs (17)
THETA = math.radians(34.5)                   # screw inclination
D_S = V((math.cos(THETA), 0, -math.sin(THETA)))  # screw axis, pointing down-slope
N_S = V((math.sin(THETA), 0, math.cos(THETA)))   # perpendicular, "up"
B_S = V((0, 1, 0))
W_S = V((0.527, 0, 1.49))                     # screw-wheel centre (on screw axis)
R_SW = 0.25            # screw wheel outer radius, face cogs at 0.20
T0, T1 = 0.55, 2.50    # screw blade extent along axis from W_S
def screw_pt(t, pn=0.0, pb=0.0):
    return W_S + t * D_S + pn * N_S + pb * B_S

# trestle
LEG = 0.85             # legs at X,Y = +-LEG
Z_A_BOT, Z_A_TOP = 2.92, 3.04

# --------------------------------------------------------------------------
# mesh builder
# --------------------------------------------------------------------------
class MB:
    def __init__(self): self.v, self.f = [], []
    def add(self, verts, faces):
        o = len(self.v)
        self.v += [tuple(p) for p in verts]
        self.f += [[i + o for i in fc] for fc in faces]

PARTS = {}   # (part, material) -> MB
def mb(part, mat):
    return PARTS.setdefault((part, mat), MB())

BOX_F = [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]]

_K = [0]
def obox(part, mat, c, ax, ay, az, sx_, sy_, sz_):
    # tiny per-box inflation so touching timbers never share an exactly coincident face
    _K[0] += 1; eps = 0.0007*(1 + _K[0] % 5)
    sx_, sy_, sz_ = sx_ + eps, sy_ + eps, sz_ + eps
    ax, ay, az = ax.normalized(), ay.normalized(), az.normalized()
    vs = []
    for i in (-1, 1):
        for j in (-1, 1):
            for k in (-1, 1):
                vs.append(c + ax*(i*sx_/2) + ay*(j*sy_/2) + az*(k*sz_/2))
    mb(part, mat).add(vs, BOX_F)

def aabb(part, mat, x0, x1, y0, y1, z0, z1):
    obox(part, mat, V(((x0+x1)/2, (y0+y1)/2, (z0+z1)/2)), V((1,0,0)), V((0,1,0)), V((0,0,1)),
         x1-x0, y1-y0, z1-z0)

def beam(part, mat, p1, p2, w, h, up=V((0,0,1)), w2=None, h2=None):
    """Square timber from p1 to p2 (optionally tapering to w2 x h2)."""
    p1, p2 = V(p1), V(p2)
    ax = (p2 - p1).normalized()
    if abs(ax.dot(up)) > 0.98: up = V((1,0,0)) if abs(ax.x) < 0.9 else V((0,1,0))
    ay = up.cross(ax).normalized(); az = ax.cross(ay).normalized()
    w2 = w if w2 is None else w2; h2 = h if h2 is None else h2
    _K[0] += 1; eps = 0.0007*(1 + _K[0] % 5)
    w, h, w2, h2 = w + eps, h + eps, w2 + eps, h2 + eps
    vs = []
    for p, ww, hh in ((p1, w, h), (p2, w2, h2)):
        for j in (-1, 1):
            for k in (-1, 1):
                vs.append(p + ay*(j*ww/2) + az*(k*hh/2))
    # order: p1 (0..3), p2 (4..7) with (j,k) = (-,-),(-,+),(+,-),(+,+)
    faces = [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]]
    mb(part, mat).add(vs, faces)

def frame(axis):
    axis = axis.normalized()
    t = V((0,0,1)) if abs(axis.z) < 0.9 else V((1,0,0))
    e1 = t.cross(axis).normalized(); e2 = axis.cross(e1).normalized()
    return e1, e2

def cyl(part, mat, p1, p2, r, n=16, r2=None):
    p1, p2 = V(p1), V(p2); r2 = r if r2 is None else r2
    e1, e2 = frame(p2 - p1)
    vs = []
    for p, rr in ((p1, r), (p2, r2)):
        for i in range(n):
            a = 2*math.pi*i/n
            vs.append(p + rr*(math.cos(a)*e1 + math.sin(a)*e2))
    faces = [[i, (i+1)%n, n+(i+1)%n, n+i] for i in range(n)]
    faces += [list(range(n))[::-1], list(range(n, 2*n))]
    mb(part, mat).add(vs, faces)

def annulus(part, mat, c, axis, ri, ro, thick, n=48, e1=None):
    """Flat ring (wheel rim) centred at c, normal = axis."""
    axis = axis.normalized()
    if e1 is None: e1, e2 = frame(axis)
    else: e2 = axis.cross(e1).normalized()
    vs = []
    for h in (-thick/2, thick/2):
        for r in (ri, ro):
            for i in range(n):
                a = 2*math.pi*i/n
                vs.append(c + axis*h + r*(math.cos(a)*e1 + math.sin(a)*e2))
    def idx(hi, ri_, i): return hi*2*n + ri_*n + (i % n)
    faces = []
    for i in range(n):
        faces.append([idx(0,0,i), idx(0,1,i), idx(0,1,i+1), idx(0,0,i+1)])  # bottom
        faces.append([idx(1,0,i), idx(1,0,i+1), idx(1,1,i+1), idx(1,1,i)])  # top
        faces.append([idx(0,1,i), idx(1,1,i), idx(1,1,i+1), idx(0,1,i+1)])  # outer
        faces.append([idx(0,0,i), idx(0,0,i+1), idx(1,0,i+1), idx(1,0,i)])  # inner
    mb(part, mat).add(vs, faces)

def disc(part, mat, c, axis, r, thick, n=40):
    cyl(part, mat, c - axis.normalized()*thick/2, c + axis.normalized()*thick/2, r, n)

# --------------------------------------------------------------------------
# 1. LOWER TRESTLE (onderstel, "B") + "A" bearing frame -- static
# --------------------------------------------------------------------------
P, WD = "Onderstel", "timber_old"
for xs in (-1, 1):
    for ys in (-1, 1):
        aabb(P, WD, xs*LEG-0.085, xs*LEG+0.085, ys*LEG-0.085, ys*LEG+0.085, -0.45, 1.46)
# side plates on the legs (along Y), then B beams (along X) and the two inner beams
for xs in (-1, 1):
    aabb(P, WD, xs*LEG-0.09, xs*LEG+0.09, -0.95, 0.95, 1.46, 1.59)
for ys in (-1, 1):
    aabb(P, WD, -0.95, 0.95, ys*LEG-0.09, ys*LEG+0.09, 1.59, 1.72)
for xs in (-1, 1):
    aabb(P, WD, xs*0.17-0.05, xs*0.17+0.05, -LEG, LEG, 1.59, 1.72)
for ys in (-1, 1):                                   # bearing blocks for the shaft
    aabb(P, WD, -0.12, 0.12, ys*0.095-0.035, ys*0.095+0.035, 1.60, 1.70)
aabb(P, WD, 0.34, 0.46, -LEG, LEG, 1.60, 1.72)       # cross beam carrying screw-axle bearing
# rails at Peil level (front, back, left) + centre beam with the pivot block
for ys in (-1, 1):
    aabb(P, WD, -LEG, LEG, ys*LEG-0.06, ys*LEG+0.06, 0.91, 1.01)
aabb(P, WD, -LEG-0.06, -LEG+0.06, -LEG, LEG, 0.91, 1.01)
aabb(P, WD, -0.07, 0.07, -LEG, LEG, 0.91, 1.01)
aabb(P, WD, sx(928), sx(1082), -0.10, 0.10, 1.01, 1.09)   # pivot block (taats)
# diagonal struts B -> A (pyramid)
for xs in (-1, 1):
    for ys in (-1, 1):
        beam(P, WD, (xs*0.86, ys*0.86, 1.72), (xs*0.195, ys*0.195, Z_A_BOT), 0.11, 0.11)
# A frame (two layers of crossing beams)
for xs in (-1, 1):
    aabb(P, WD, xs*0.195-0.05, xs*0.195+0.05, -0.37, 0.37, Z_A_BOT, 2.98)
for ys in (-1, 1):
    aabb(P, WD, -0.37, 0.37, ys*0.195-0.05, ys*0.195+0.05, 2.98, Z_A_TOP)
# screw-axle upper bearing (iron) hanging from the cross beam
pa = screw_pt(-0.15)
aabb(P, "iron", pa.x-0.06, pa.x+0.06, -0.07, 0.07, pa.z-0.05, 1.60)
# iron pivot under the vertical shaft
cyl(P, "iron", (0, 0, 1.09), (0, 0, 1.16), 0.035, 12, 0.012)

# --------------------------------------------------------------------------
# 2. VERTICAL SHAFT (koningsspil) with 15-stave lantern and 17-cog crown wheel
# --------------------------------------------------------------------------
P = "Koningsspil"
cyl(P, "gearwood", (0, 0, 1.16), (0, 0, 4.06), 0.062, 8)
cyl(P, "iron", (0, 0, 1.14), (0, 0, 1.20), 0.07, 12)
# lantern (bonkelaar / schijfloop), 15 staves
for z in (3.949, 4.051):
    disc(P, "gearwood", V((0, 0, z)), V((0, 0, 1)), 0.185, 0.012)
for i in range(15):
    a = 2*math.pi*(i + 0.5)/15
    p = V((R_LANT*math.cos(a), R_LANT*math.sin(a), 0))
    cyl(P, "cogwood", p + V((0, 0, 3.955)), p + V((0, 0, 4.045)), 0.015, 8)
# crown wheel (17 kammen): rim, arms, slanted cogs
annulus(P, "gearwood", V((0, 0, Z_CROWN)), V((0, 0, 1)), 0.20, 0.33, 0.07)
for a in (0, math.pi/2):
    d = V((math.cos(a), math.sin(a), 0))
    beam(P, "gearwood", -0.27*d + V((0,0,Z_CROWN)), 0.27*d + V((0,0,Z_CROWN)), 0.07, 0.06)
for i in range(17):
    a = 2*math.pi*i/17
    rad = V((math.cos(a), math.sin(a), 0))
    base = rad*R_CROWN_COG + V((0, 0, Z_CROWN + 0.035))
    tip = base + (rad*0.55 + V((0, 0, 0.83))).normalized()*0.10
    beam(P, "cogwood", base - (tip-base)*0.25, tip, 0.032, 0.028, up=rad)

# --------------------------------------------------------------------------
# 3. SCREW (vijzel) with 20-cog wheel -- rotates about D_S through W_S
# --------------------------------------------------------------------------
P = "Vijzel"
cyl(P, "iron", screw_pt(-0.15), screw_pt(T0 - 0.05), 0.04, 12)          # iron axle
cyl(P, "gearwood", screw_pt(T0 - 0.06), screw_pt(T1 + 0.06), 0.10, 16)  # wooden core
for t in (T0 - 0.03, (T0+T1)/2, T1 + 0.03):                             # iron bands
    cyl(P, "iron", screw_pt(t - 0.015), screw_pt(t + 0.015), 0.106, 16)
# screw wheel (20 kammen): rim + arms + face cogs pointing up-slope (-D_S)
e1 = N_S
annulus(P, "gearwood", W_S, D_S, 0.14, R_SW, 0.05, 40, e1=e1)
for a in (0, math.pi/2):
    d = math.cos(a)*N_S + math.sin(a)*B_S
    beam(P, "gearwood", W_S - 0.20*d, W_S + 0.20*d, 0.06, 0.05, up=D_S)
for i in range(20):
    a = 2*math.pi*(i + 0.5)/20 + math.pi      # half-pitch offset so cogs interleave
    rad = math.cos(a)*N_S + math.sin(a)*B_S
    base = W_S + 0.20*rad - 0.025*D_S
    beam(P, "cogwood", base + 0.01*D_S, base - 0.085*D_S, 0.03, 0.026, up=rad)
# helical blade, single flight, wound so that positive rotation about D_S lifts water
PITCH = 0.36
r_in, r_out, th = 0.10, 0.40, 0.028
e1, e2 = N_S, D_S.cross(N_S).normalized()
nseg = int((T1 - T0)/PITCH*48)
vs, faces = [], []
for i in range(nseg + 1):
    t = T0 + (T1 - T0)*i/nseg
    a = 2*math.pi*(t - T0)/PITCH
    rad = math.cos(a)*e1 + math.sin(a)*e2
    c = W_S + t*D_S
    for h in (-th/2, th/2):
        for r in (r_in, r_out):
            vs.append(c + rad*r + D_S*h)
for i in range(nseg):
    b0, b1 = 4*i, 4*(i+1)
    faces += [[b0+0, b0+1, b1+1, b1+0], [b0+2, b1+2, b1+3, b0+3],
              [b0+1, b0+3, b1+3, b1+1], [b0+0, b1+0, b1+2, b0+2]]
faces += [[0, 2, 3, 1], [4*nseg+0, 4*nseg+1, 4*nseg+3, 4*nseg+2]]
mb(P, "bladewood").add(vs, faces)

# --------------------------------------------------------------------------
# 4. TROUGH (vijzelbak) and its supports -- static
# --------------------------------------------------------------------------
P = "Vijzelbak"
RI, RO, HW = 0.43, 0.48, 0.22
# simpler, explicit semicircle: pn = -r*sin(phi), pb = -r*cos(phi), phi 0..pi
def u_prof(r, n=16):
    pts = [(HW, -r)]
    for i in range(n + 1):
        phi = math.pi*i/n
        pts.append((-r*math.sin(phi), -r*math.cos(phi)))
    pts.append((HW, r))
    return pts
outer, inner = u_prof(RO), u_prof(RI)
ta, tb = T0 - 0.03, T1 + 0.12
m = len(outer)
vs, faces = [], []
for t in (ta, tb):
    for (pn, pb) in outer: vs.append(screw_pt(t, pn, pb))
    for (pn, pb) in inner: vs.append(screw_pt(t, pn, pb))
def vi(end, ring, i): return end*2*m + ring*m + i
for i in range(m - 1):
    faces.append([vi(0,0,i), vi(0,0,i+1), vi(1,0,i+1), vi(1,0,i)])     # outer skin
    faces.append([vi(0,1,i), vi(1,1,i), vi(1,1,i+1), vi(0,1,i+1)])     # inner skin
    faces.append([vi(0,0,i), vi(0,1,i), vi(0,1,i+1), vi(0,0,i+1)])     # end cap a
    faces.append([vi(1,0,i), vi(1,0,i+1), vi(1,1,i+1), vi(1,1,i)])     # end cap b
for i in (0, m-1):                                                      # top edges
    faces.append([vi(0,0,i), vi(1,0,i), vi(1,1,i), vi(0,1,i)])
mb(P, "timber_old").add(vs, faces)
# supports: cross beams under the trough on posts
for t, zbot in ((T0 + 0.12, -0.45), (2.25, -0.85)):
    pbot = screw_pt(t, -RO - 0.05, 0)
    aabb(P, "timber_old", pbot.x-0.06, pbot.x+0.06, -0.62, 0.62, pbot.z-0.10, pbot.z)
    for ys in (-1, 1):
        aabb(P, "timber_old", pbot.x-0.06, pbot.x+0.06, ys*0.56-0.06, ys*0.56+0.06, zbot, pbot.z-0.10)
# lower axle bearing (stoel) at the foot of the screw
pe = screw_pt(T1 + 0.20)
cyl("Vijzel", "iron", screw_pt(T1 + 0.06), pe, 0.04, 12)
aabb(P, "timber_old", pe.x-0.07, pe.x+0.07, -0.08, 0.08, -0.85, pe.z-0.04)
aabb(P, "iron", pe.x-0.08, pe.x+0.08, -0.09, 0.09, pe.z-0.06, pe.z+0.06)

# --------------------------------------------------------------------------
# 5. BODY (kast) on the A frame, tail vane, brake lever -- yaws as one unit
# --------------------------------------------------------------------------
P, WD = "Kast_en_staart", "timber"
XF, XR, YB = -0.51, 0.48, 0.40
for x in (XF, XR):
    for ys in (-1, 1):
        aabb(P, WD, x-0.045, x+0.045, ys*YB-0.045, ys*YB+0.045, 3.00, 4.08)
for ys in (-1, 1):                     # top plates with shaped ends, rails along X
    aabb(P, WD, -0.74, 0.70, ys*YB-0.05, ys*YB+0.05, 4.08, 4.17)
    aabb(P, WD, XF, XR, ys*YB-0.035, ys*YB+0.035, 3.65, 3.72)
    aabb(P, WD, XF, XR, ys*YB-0.035, ys*YB+0.035, 3.12, 3.20)
    aabb(P, WD, XF, XR, ys*0.195-0.045, ys*0.195+0.045, Z_A_TOP, 3.12)   # sills on A
for x in (XF, XR):                     # cross beams along Y
    for z0, z1 in ((3.78, 3.86), (3.22, 3.30), (Z_A_TOP, 3.12)):
        aabb(P, WD, x-0.045, x+0.045, -YB-0.045, YB+0.045, z0, z1)
aabb(P, WD, -0.04, 0.04, -YB, YB, 3.80, 3.88)                    # upper bearing of vertical shaft
aabb(P, WD, -0.69, -0.61, -YB, YB, 4.08, 4.17)                   # front cross beam
zb = shaft_pt(-0.65).z - 0.07
aabb(P, WD, -0.74, -0.56, -0.09, 0.09, 4.17, zb)                 # neck bearing block (hals)
aabb(P, "iron", -0.70, -0.60, -0.08, 0.08, zb - 0.015, zb)
zr = shaft_pt(0.40).z - 0.065
aabb(P, WD, 0.36, 0.44, -YB, YB, zr - 0.08, zr)                  # rear bearing beam (staartlager)
# tail beam, vane frame and boards
apex, vtop, vbot = V((sx(1290), 0, sz(1300))), V((2.83, 0, 4.51)), V((2.81, 0, 2.70))
beam(P, WD, (XR - 0.04, 0, 3.685), (2.92, 0, 3.685), 0.08, 0.08)
for a, b in ((apex, vtop), (apex, vbot), (vbot, vtop)):
    beam(P, WD, a, b, 0.06, 0.05, up=V((0, 1, 0)))
for xv in (1.70, 2.30):
    k1 = (xv - apex.x)/(vtop.x - apex.x); k2 = (xv - apex.x)/(vbot.x - apex.x)
    beam(P, WD, apex.lerp(vbot, k2), apex.lerp(vtop, k1), 0.045, 0.04, up=V((0, 1, 0)))
mb(P, "boards").add([apex + V((0,-0.012,0)), vtop + V((0,-0.012,0)), vbot + V((0,-0.012,0)),
                     apex + V((0, 0.012,0)), vtop + V((0, 0.012,0)), vbot + V((0, 0.012,0))],
                    [[0,2,1],[3,4,5],[0,1,4,3],[1,2,5,4],[2,0,3,5]])
# the long diagonal strut (to turn the cap by hand) and its brace
s_top, s_bot = V((XR + 0.05, 0, 3.66)), V((sx(1322), 0, sz(1752)))
beam(P, WD, s_top, s_bot, 0.08, 0.08)
k = (3.20 - s_top.z)/(s_bot.z - s_top.z)
beam(P, WD, (XR, 0, 3.20), s_top.lerp(s_bot, k), 0.06, 0.06)
# brake lever (vangbalk) and rope
vb0, vb1 = V((0.25, 0.15, 4.22)), V((1.32, 0.15, 4.42))
beam(P, WD, vb0, vb1, 0.07, 0.07)
aabb(P, WD, 0.21, 0.29, 0.11, 0.19, 4.17, 4.19)
cyl(P, "rope", vb1 + V((-0.03, 0, -0.03)), V((vb1.x - 0.03, 0.15, 1.92)), 0.012, 8)

# --------------------------------------------------------------------------
# 6. ROTOR: windshaft, head wheel (20 kammen), stocks and sails
# --------------------------------------------------------------------------
P = "Rotor"
s_front = (-1.27 - WC.x)/D_W.x; s_rear = (0.45 - WC.x)/D_W.x
beam(P, "timber", WC + s_front*D_W, WC + s_rear*D_W, 0.13, 0.13, up=U_W)
sh = (HUB.x - WC.x)/D_W.x
beam(P, "timber", WC + (sh - 0.17)*D_W, WC + (sh + 0.17)*D_W, 0.21, 0.21, up=U_W)   # as-kop
for s in (sh - 0.19, sh + 0.19, (-0.65 - WC.x)/D_W.x):
    cyl(P, "iron", WC + (s - 0.02)*D_W, WC + (s + 0.02)*D_W, 0.115 if abs(s-sh) < 0.3 else 0.08, 8)
# head wheel
annulus(P, "gearwood", WC, D_W, 0.18, 0.30, 0.06, 48, e1=U_W)
for d in (U_W, V((0, 1, 0))):
    beam(P, "gearwood", WC - 0.25*d, WC + 0.25*d, 0.06, 0.055, up=D_W)
for i in range(20):
    a = 2*math.pi*i/20
    rad = math.cos(a)*U_W + math.sin(a)*V((0, 1, 0))
    base = WC + R_HEAD*rad + 0.02*D_W
    beam(P, "cogwood", base, base + 0.11*D_W, 0.03, 0.03, up=rad)
# brake band (vang) around the head-wheel rim, slightly open at the top
for i in range(40):
    a0 = 2*math.pi*i/40; a1 = 2*math.pi*(i+1)/40
    if i in (0, 39): continue
    p0 = WC + 0.315*(math.cos(a0)*U_W + math.sin(a0)*V((0,1,0)))
    p1 = WC + 0.315*(math.cos(a1)*U_W + math.sin(a1)*V((0,1,0)))
    beam("Kast_en_staart", "timber_old", p0, p1, 0.05, 0.03, up=(p0 - WC))
# stocks (roeden) and sail lattice (hekwerk) -- two stocks through the as-kop
R_SAIL = 2.65
SAIL_DIRS = [U_W, V((0, 1, 0)), -U_W, V((0, -1, 0))]
for k, er in enumerate(SAIL_DIRS):
    off = -0.07 if k % 2 == 0 else 0.07             # the two stocks sit one behind the other
    c = HUB + off*D_W
    tip = c + R_SAIL*er
    beam(P, "timber", c + 0.08*er*0 , tip, 0.13, 0.12, up=D_W, w2=0.07, h2=0.065)
    trail = D_W.cross(er).normalized()                # rotation is CCW seen from the front
    front = -D_W                                      # windward side
    nb = 13
    for j in range(nb):
        r = 0.62 + (R_SAIL - 0.10 - 0.62)*j/(nb - 1)
        p = c + r*er
        beam(P, "sailwood", p - 0.07*trail, p + 0.50*trail, 0.03, 0.03, up=er)  # hekspijlen
    for o in (0.17, 0.33, 0.49):                        # heklatten
        beam(P, "sailwood", c + 0.58*er + o*trail + 0.03*front,
             c + (R_SAIL - 0.06)*er + o*trail + 0.03*front, 0.03, 0.025, up=front)
    # sailcloth spread on the windward face of the lattice
    q = [c + 0.58*er + 0.0*trail + 0.05*front, c + (R_SAIL-0.06)*er + 0.0*trail + 0.05*front,
         c + (R_SAIL-0.06)*er + 0.50*trail + 0.05*front, c + 0.58*er + 0.50*trail + 0.05*front]
    mb("Zeilen", "cloth").add(q, [[0, 1, 2, 3]])

# --------------------------------------------------------------------------
# 7. CAP (kap) -- separate object so it can be hidden to see the gearing
# --------------------------------------------------------------------------
def cap_profile(x):
    t = (x + 0.68)/(0.74 + 0.68)
    ztop = 4.86 + (4.70 - 4.86)*t
    zw = ztop - 0.22
    return [(-0.47, 4.17), (-0.47, zw), (-0.20, ztop), (0.20, ztop), (0.47, zw), (0.47, 4.17)]
pf, pr = cap_profile(-0.68), cap_profile(0.74)
vs = [V((-0.68, y, z)) for y, z in pf] + [V((0.74, y, z)) for y, z in pr]
n = len(pf)
faces = [[i, i+1, n+i+1, n+i] for i in range(n-1)]
faces += [list(range(n))[::-1], list(range(n, 2*n))]
mb("Kap", "capboards").add(vs, faces)

# --------------------------------------------------------------------------
# 8. SITE: upper water (Peil), dam with screw notch, lower water, bed
# --------------------------------------------------------------------------
P = "Terrein"
aabb(P, "mud", -30, 1.40, -30, 30, -0.75, -0.45)
aabb(P, "mud", 1.40, 30, -30, 30, -1.15, -0.85)
prof = [(0.70, -0.50), (1.35, 1.00), (1.70, 1.00), (2.50, -0.90)]   # clay dike between the waters
vs = [V((x, y, z)) for y in (-30, 30) for (x, z) in prof]
mb(P, "earth").add(vs, [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]])
aabb(P, "water", -30, 1.05, -30, 30, -0.45, Z_PEIL)
aabb(P, "water", 2.0, 30, -30, 30, -0.85, Z_LOW)

# --------------------------------------------------------------------------
# build objects
# --------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'

def make_mat(name, color, rough=0.8, metal=0.0, noise=0.25, scale=6.0, transmission=0.0,
             ior=1.45, alpha=1.0):
    mt = bpy.data.materials.new(name)
    mt.use_nodes = True
    nt = mt.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if transmission:
        bsdf.inputs["Transmission Weight"].default_value = transmission
        bsdf.inputs["IOR"].default_value = ior
    if noise > 0:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (scale, scale, scale*4)
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 4.0
        nz.inputs["Detail"].default_value = 8.0
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        c0 = [max(0, v*(1-noise)) for v in color] + [1]
        c1 = [min(1, v*(1+noise)) for v in color] + [1]
        ramp.color_ramp.elements[0].color = c0
        ramp.color_ramp.elements[1].color = c1
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.15
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
        nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        nt.links.new(nz.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        bsdf.inputs["Base Color"].default_value = list(color) + [1]
    mt.diffuse_color = list(color) + [alpha]
    return mt

MATS = {
    "timber":     make_mat("Oak (cap frame)", (0.36, 0.25, 0.15)),
    "timber_old": make_mat("Weathered oak (trestle)", (0.30, 0.26, 0.21), 0.85, noise=0.35),
    "gearwood":   make_mat("Elm (wheels)", (0.46, 0.33, 0.20), 0.7),
    "cogwood":    make_mat("Hornbeam (cogs)", (0.62, 0.50, 0.34), 0.6, noise=0.1),
    "bladewood":  make_mat("Pine (screw blade)", (0.55, 0.42, 0.27), 0.75),
    "sailwood":   make_mat("Pine (sail lattice)", (0.42, 0.31, 0.19), 0.8),
    "boards":     make_mat("Tarred boards (vane)", (0.12, 0.10, 0.08), 0.7, noise=0.3),
    "capboards":  make_mat("Painted boards (cap)", (0.16, 0.24, 0.20), 0.65, noise=0.15),
    "iron":       make_mat("Wrought iron", (0.07, 0.07, 0.075), 0.45, 0.9, noise=0.1),
    "cloth":      make_mat("Sailcloth", (0.72, 0.64, 0.50), 0.95, noise=0.08, scale=20),
    "rope":       make_mat("Hemp rope", (0.50, 0.42, 0.30), 0.9, noise=0.1),
    "earth":      make_mat("Clay dam", (0.22, 0.24, 0.12), 0.95, noise=0.3, scale=1),
    "mud":        make_mat("Bed", (0.24, 0.21, 0.15), 0.95, noise=0.3, scale=1),
    "water":      make_mat("Water", (0.55, 0.68, 0.64), 0.04, noise=0, transmission=1.0, ior=1.33,
                           alpha=0.4),
}

COLL_NAMES = {
    "Onderstel": "Lower trestle (onderstel, A & B)",
    "Koningsspil": "Vertical shaft (koningsspil)",
    "Vijzel": "Screw (vijzel)",
    "Vijzelbak": "Screw trough (vijzelbak)",
    "Kast_en_staart": "Body & tail (kast, staart)",
    "Rotor": "Rotor (as, bovenwiel, roeden)",
    "Zeilen": "Sailcloth (zeilen)",
    "Kap": "Cap (kap) - hide to see gearing",
    "Terrein": "Site (water, dam)",
}
root = scene.collection
colls = {}
for key, name in COLL_NAMES.items():
    c = bpy.data.collections.new(name); root.children.link(c); colls[key] = c
rig = bpy.data.collections.new("Rig (drivers)"); root.children.link(rig)

OBJ = {}
for (part, mat), b in PARTS.items():
    me = bpy.data.meshes.new(f"{part}_{mat}")
    me.from_pydata([tuple(v) for v in b.v], [], b.f)
    me.validate(); me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    me.materials.append(MATS[mat])
    ob = bpy.data.objects.new(f"{part}.{mat}", me)
    colls[part].objects.link(ob)
    OBJ.setdefault(part, []).append(ob)
    if mat in ("gearwood", "cogwood", "bladewood", "cloth", "rope", "iron"):
        for p in me.polygons: p.use_smooth = False

bpy.context.view_layer.update()

# cap: thickness + holes for windshaft (front) and brake lever (rear)
cap = OBJ["Kap"][0]
mod = cap.modifiers.new("thickness", "SOLIDIFY"); mod.thickness = 0.025; mod.offset = -1
def cutter(name, verts_fn):
    me = bpy.data.meshes.new(name); verts, faces = verts_fn(); me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new(name, me); root.objects.link(o); return o
def cyl_cutter(name, p1, p2, r, n=24):
    tmp = MB(); e1, e2 = frame(p2 - p1)
    vs = []
    for p in (p1, p2):
        for i in range(n):
            a = 2*math.pi*i/n; vs.append(tuple(p + r*(math.cos(a)*e1 + math.sin(a)*e2)))
    fs = [[i, (i+1)%n, n+(i+1)%n, n+i] for i in range(n)] + [list(range(n))[::-1], list(range(n, 2*n))]
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); root.objects.link(o); return o
c1 = cyl_cutter("cut_shaft", shaft_pt(-0.80), shaft_pt(-0.55), 0.115)
vbx = 0.74; vbz = vb0.z + (vbx - vb0.x)/(vb1.x - vb0.x)*(vb1.z - vb0.z)
c2 = cyl_cutter("cut_vang", V((0.65, 0.15, vbz)), V((0.85, 0.15, vbz)), 0.07, 4)
for cobj in (c1, c2):
    bm_ = cap.modifiers.new("hole", "BOOLEAN"); bm_.object = cobj; bm_.operation = 'DIFFERENCE'
    bm_.solver = 'EXACT'
bpy.context.view_layer.objects.active = cap
for mname in [m.name for m in cap.modifiers]:
    with bpy.context.temp_override(object=cap, active_object=cap):
        bpy.ops.object.modifier_apply(modifier=mname)
for cobj in (c1, c2): bpy.data.objects.remove(cobj)

# dam: notch for the trough
dam = [o for o in OBJ["Terrein"] if o.name.endswith("earth")][0]
nc = MB()
def notch_verts():
    vs = []
    for t in (0.5, 1.9):
        for pn in (-RO - 0.02, 1.6):
            for pb in (-RO - 0.02, RO + 0.02):
                vs.append(tuple(screw_pt(t, pn, pb)))
    return vs, [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]]
c3 = cutter("cut_notch", notch_verts)
me3 = c3.data; bm = bmesh.new(); bm.from_mesh(me3); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me3); bm.free()
bm_ = dam.modifiers.new("notch", "BOOLEAN"); bm_.object = c3; bm_.operation = 'DIFFERENCE'; bm_.solver = 'EXACT'
with bpy.context.temp_override(object=dam, active_object=dam):
    bpy.ops.object.modifier_apply(modifier="notch")
bpy.data.objects.remove(c3)

# bevel-ish softening on timbers is skipped to keep the file light

# --------------------------------------------------------------------------
# rig: empties + drivers
# --------------------------------------------------------------------------
def empty(name, loc, rot=(0, 0, 0), size=0.4, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS'; e.empty_display_size = size
    e.location = loc; e.rotation_euler = rot
    rig.objects.link(e)
    if parent: e.parent = parent
    return e

yaw = empty("Kruiwerk_yaw (turn cap into the wind)", (0, 0, Z_A_TOP), size=0.8)
rotor = empty("Rotor_spin", WC, (0, ALPHA, 0), size=0.5)
vsh = empty("Koningsspil_spin", (0, 0, Z_CROWN), size=0.5)
scr = empty("Vijzel_spin", W_S, (0, THETA, 0), size=0.5)
bpy.context.view_layer.update()
rotor.parent = yaw
rotor.matrix_parent_inverse = yaw.matrix_world.inverted()
bpy.context.view_layer.update()

def parent_all(objs, par):
    for o in objs:
        o.parent = par
        o.matrix_parent_inverse = par.matrix_world.inverted()
parent_all(OBJ["Rotor"] + OBJ["Zeilen"], rotor)
parent_all(OBJ["Kast_en_staart"] + OBJ["Kap"], yaw)
parent_all(OBJ["Koningsspil"], vsh)
parent_all(OBJ["Vijzel"], scr)

def add_driver(obj, idx, expr, src=None, src_path=None):
    fc = obj.driver_add("rotation_euler", idx)
    drv = fc.driver; drv.type = 'SCRIPTED'
    if src is not None:
        v = drv.variables.new(); v.name = "var"; v.type = 'SINGLE_PROP'
        v.targets[0].id = src; v.targets[0].data_path = src_path
    drv.expression = expr
    return fc
add_driver(rotor, 0, "-frame*pi/40")                                   # 18 rpm @ 24 fps, CCW from front
add_driver(vsh, 2, "-var*20/15", rotor, "rotation_euler[0]")
add_driver(scr, 0, "var*17/20", vsh, "rotation_euler[2]")

# --------------------------------------------------------------------------
# reference drawing plane (aligned 1:1 with the model, behind it at Y = +3.2)
# --------------------------------------------------------------------------
if DRAWING and os.path.exists(DRAWING):
    img = bpy.data.images.load(os.path.abspath(DRAWING)); img.pack()
    w, h = img.size
    x0, x1, z1, z0 = sx(0), sx(w), sz(0), sz(h)
    me = bpy.data.meshes.new("Reference_drawing")
    me.from_pydata([(x0, 3.2, z0), (x1, 3.2, z0), (x1, 3.2, z1), (x0, 3.2, z1)], [], [[0, 1, 2, 3]])
    uv = me.uv_layers.new();
    for li, (u_, v_) in zip(range(4), [(0, 0), (1, 0), (1, 1), (0, 1)]): uv.data[li].uv = (u_, v_)
    mt = bpy.data.materials.new("Reference drawing"); mt.use_nodes = True
    nt = mt.node_tree; bs = nt.nodes.get("Principled BSDF"); nt.nodes.remove(bs)
    out = nt.nodes.get("Material Output")
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(tex.outputs["Color"], em.inputs["Color"]); nt.links.new(em.outputs[0], out.inputs[0])
    me.materials.append(mt)
    ref = bpy.data.objects.new("Reference drawing (1826 sheet, to scale)", me)
    rc = bpy.data.collections.new("Reference drawing"); root.children.link(rc); rc.objects.link(ref)
    ref.hide_render = True

# --------------------------------------------------------------------------
# lights, world, cameras, render settings
# --------------------------------------------------------------------------
world = bpy.data.worlds.new("World"); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs["Color"].default_value = (0.62, 0.70, 0.80, 1); bg.inputs["Strength"].default_value = 0.9
sun_d = bpy.data.lights.new("Sun", 'SUN'); sun_d.energy = 3.5; sun_d.angle = math.radians(3)
sun = bpy.data.objects.new("Sun", sun_d); root.objects.link(sun)
sun.rotation_euler = (math.radians(50), math.radians(-12), math.radians(-35))

def camera(name, loc, target, lens=35, ortho=None):
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.clip_end = 300
    if ortho: cd.type = 'ORTHO'; cd.ortho_scale = ortho
    c = bpy.data.objects.new(name, cd); root.objects.link(c)
    c.location = loc
    d = V(target) - V(loc)
    c.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return c
cam_over = camera("Cam_overview", (-4.6, -9.6, 4.3), (0.55, 0, 2.15), 35)
camera("Cam_gearing_top", (1.55, -2.0, 5.15), (-0.17, 0, 4.05), 30)
camera("Cam_gearing_low", (0.25, -2.55, 1.42), (0.30, 0, 1.33), 26)
camera("Cam_mechanism", (-1.9, -4.6, 3.55), (0.35, 0, 2.55), 24)
camera("Cam_screw", (3.9, -3.6, 2.6), (1.5, 0, 0.75), 30)
camera("Cam_elevation_ortho", (sx(970), -25, sz(1288)), (sx(970), 0, sz(1288)), 50, ortho=2576*PX)
scene.camera = cam_over

scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1600, 1100
scene.frame_start, scene.frame_end = 1, 240
scene.render.fps = 24
scene.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in
    scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'

bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT), compress=True)
print("saved", OUT)
print("WC", tuple(round(c, 3) for c in WC), "HUB", tuple(round(c, 3) for c in HUB))
