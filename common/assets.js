// Polder machines: procedural props that move around and behind the machines.
// Nature, pollution, and a deliberate mix of 19th-century and contemporary technology.
import { THREE, mat, M, box, beam, cyl, rand, pick, ss } from './engine.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const shadow = (o, cast = true, recv = true) => { o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = recv; } }); return o; };

// ------------------------------------------------------------------ path helper
export class Path {
  constructor(pts, loop = false) {
    this.p = pts.map(q => q.isVector3 ? q.clone() : V3(q[0], q[1] ?? 0, q[2] ?? 0)); this.loop = loop;
    if (loop) this.p.push(this.p[0].clone());
    this.L = [0]; for (let i = 1; i < this.p.length; i++) this.L.push(this.L[i - 1] + this.p[i].distanceTo(this.p[i - 1]));
    this.len = this.L[this.L.length - 1];
  }
  at(s, out = V3()) {
    s = this.loop ? ((s % this.len) + this.len) % this.len : THREE.MathUtils.clamp(s, 0, this.len);
    let i = 1; while (i < this.L.length - 1 && this.L[i] < s) i++;
    const k = (s - this.L[i - 1]) / Math.max(1e-6, this.L[i] - this.L[i - 1]);
    return out.copy(this.p[i - 1]).lerp(this.p[i], k);
  }
  dir(s) { const a = this.at(s - 0.5), b = this.at(s + 0.5); return b.sub(a).normalize(); }
}
// p = [[x,y,z],...] helper for flat paths at height y
export const flat = (y, pts) => pts.map(([x, z]) => [x, y, z]);

// ------------------------------------------------------------------ scenery
export function field(ctx, x0, x1, z0, z1, y, color = 0x5d7340, h = 0.6) {
  return box(ctx.scene, mat(color, 0.95, 0, 0.35, 0.5), x0, x1, y - h, y, z0, z1);
}

export function trees(ctx, list, kind = 'willow') {
  // list: [[x,z,y,scale]]
  const g = new THREE.Group();
  const trunk = mat(0x4a3b2e, 0.9, 0, 0.3), leafA = mat(0x4f6b35, 0.9, 0, 0.35, 2), leafB = mat(0x6d7f3e, 0.9, 0, 0.35, 2);
  for (const [x, z, y = 0, s = 1] of list) {
    const t = new THREE.Group(); t.position.set(x, y, z); t.scale.setScalar(s * rand(0.85, 1.15));
    if (kind === 'poplar') {
      cyl(t, trunk, [0, 0, 0], [0, 3, 0], 0.2, 6, 0.15);
      const c = new THREE.Mesh(new THREE.ConeGeometry(1.4, 11, 7), pick([leafA, leafB])); c.position.y = 8; c.castShadow = true; t.add(c);
    } else if (kind === 'pollard') {           // knotwilg: pollarded willow along ditches
      cyl(t, trunk, [0, 0, 0], [0, 2.2, 0], 0.35, 7, 0.45);
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), pick([leafA, leafB])); c.position.y = 3.1; c.scale.set(1, 0.8, 1); c.castShadow = true; t.add(c);
    } else {
      cyl(t, trunk, [0, 0, 0], [0, 3.5, 0], 0.3, 7, 0.22);
      for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(1.8, 2.6), 1), pick([leafA, leafB]));
        c.position.set(rand(-1, 1), 4.5 + rand(0, 1.5), rand(-1, 1)); c.castShadow = true; t.add(c); }
    }
    g.add(t);
  }
  ctx.scene.add(shadow(g)); return g;
}

export function reeds(ctx, segs, y = 0) {
  // segs: [[x0,z0,x1,z1]] lines of reed clumps that sway with the wind
  const geo = new THREE.ConeGeometry(0.02, 1.6, 3).translate(0, 0.8, 0);
  let n = 0; for (const s of segs) n += Math.floor(Math.hypot(s[2] - s[0], s[3] - s[1]) * 6);
  const im = new THREE.InstancedMesh(geo, mat(0x8a8a4a, 0.9, 0, 0.2), n);
  const base = []; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let k = 0;
  for (const s of segs) { const c = Math.floor(Math.hypot(s[2] - s[0], s[3] - s[1]) * 6);
    for (let i = 0; i < c; i++) { const u = Math.random(); base.push([s[0] + (s[2] - s[0]) * u + rand(-0.4, 0.4), s[1] + (s[3] - s[1]) * u + rand(-0.4, 0.4), rand(0.7, 1.4), rand(0, 6.28)]); k++; } }
  ctx.scene.add(im);
  ctx.add((dt, t) => {
    const w = ctx.state.wind;
    base.forEach(([x, z, h, ph], i) => {
      e.set(0, 0, -0.04 - w * 0.012 - Math.sin(t * (1.2 + w * 0.1) + ph + x * 0.3) * (0.03 + w * 0.01));
      q.setFromEuler(e); m4.compose(V3(x, y, z), q, V3(1, h, 1)); im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
  });
  return im;
}

export function zaanHouse(ctx, x, z, rot = 0, w = 6, d = 8, h = 4.5, color = 0x2f5a45, y = 0) {
  // green clapboard house with white trim and a steep gable (Zaanse huisje)
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot;
  box(g, mat(color, 0.6, 0, 0.12), -w / 2, w / 2, 0, h, -d / 2, d / 2);
  const roof = new THREE.Shape([V3(-w / 2 - 0.3, 0).clone(), V3(w / 2 + 0.3, 0), V3(0, w * 0.75)].map(v => new THREE.Vector2(v.x, v.y)));
  const r = new THREE.Mesh(new THREE.ExtrudeGeometry(roof, { depth: d + 0.4, bevelEnabled: false }).translate(0, 0, -d / 2 - 0.2), mat(0x3a2c26, 0.8, 0, 0.3, 4));
  r.position.y = h; g.add(r);
  const white = M.white();
  for (const s of [-1, 1]) { box(g, white, -w / 2 - 0.05, w / 2 + 0.05, h - 0.15, h, s * d / 2 - 0.05, s * d / 2 + 0.05); }
  for (const xx of [-w / 4, w / 4]) { box(g, mat(0x1d2a33, 0.1, 0.5, 0), xx - 0.5, xx + 0.5, h * 0.35, h * 0.75, d / 2, d / 2 + 0.06);
    box(g, white, xx - 0.6, xx + 0.6, h * 0.33, h * 0.36, d / 2, d / 2 + 0.08); }
  ctx.scene.add(shadow(g)); return g;
}

// ------------------------------------------------------------------ old technology
export function smallMill(ctx, x, z, y = 0, s = 1, kind = 'polder', face = 0) {
  // background windmill (polder mill, paltrok sawmill or oil mill) whose sails follow the wind
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); g.rotation.y = face;
  if (kind === 'paltrok') {
    box(g, mat(0x3f4d47, 0.7, 0, 0.2), -3, 3, 0.6, 7, -3.5, 3.5);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 7, 16, 1, false, 0, Math.PI), mat(0x2c3a35, 0.7, 0, 0.2));
    r.rotation.z = Math.PI / 2; r.rotation.y = Math.PI / 2; r.position.set(0, 7, 0); r.scale.set(1, 1, 0.55); g.add(r);
    box(g, M.oak(), -6, 6, 0, 0.5, -2, 2);          // saw floor / gallery
  } else {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.8, 10, 8), kind === 'oil' ? mat(0x3a4a3f, 0.7, 0, 0.2) : M.thatch());
    body.position.y = 5; g.add(body);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(2.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x3a2c26, 0.8, 0, 0.2));
    cap.position.y = 10; cap.scale.set(1.15, 0.7, 1); g.add(cap);
    if (kind === 'oil') box(g, M.oak(), -4.5, 4.5, 4, 4.3, -4.5, 4.5);        // stage
  }
  const hub = new THREE.Group(); hub.position.set(-3.4, kind === 'paltrok' ? 8.2 : 10.6, 0); hub.rotation.z = 0.12; g.add(hub);
  const rotor = new THREE.Group(); hub.add(rotor);
  const sw = mat(0x9c7f5d, 0.8, 0, 0.2), cl = M.cloth();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, arm = new THREE.Group(); arm.rotation.x = a; rotor.add(arm);
    box(arm, sw, -0.12, 0.12, 0.3, 11, -0.12, 0.12);
    box(arm, cl, -0.04, 0.04, 2, 10.8, 0.15, 1.9);
  }
  ctx.scene.add(shadow(g));
  let ang = rand(0, 6), om = 0;
  ctx.add((dt) => { const tgt = Math.max(0, ctx.state.wind - 1.5) * 0.11; om += (tgt - om) * Math.min(1, dt * 0.6); ang -= om * dt; rotor.rotation.x = ang; });
  return g;
}

export function botter(ctx, path, y, speed = 1.2, sail = 0x7a3b22, s = 1) {
  // traditional Zuiderzee fishing boat with tanned sail and leeboards
  const g = new THREE.Group(); g.scale.setScalar(s);
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0x3b2a1f, 0.7, 0, 0.3));
  hull.scale.set(6, 1.4, 2.2); hull.position.y = 0.9; g.add(hull);
  box(g, mat(0x5a4330, 0.8, 0, 0.3), -5.2, 5.2, 0.85, 0.95, -1.9, 1.9);
  cyl(g, M.oak(), [0.8, 0.9, 0], [0.8, 11, 0], 0.12, 8);
  const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-5.5, 0), new THREE.Vector2(-4.5, 7.5), new THREE.Vector2(0, 9.6)]);
  const sailM = new THREE.Mesh(new THREE.ShapeGeometry(sh), mat(sail, 0.95, 0, 0.12, 6, { side: THREE.DoubleSide })); sailM.position.set(0.6, 1.5, 0); g.add(sailM);
  const jib = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(4.5, 0), new THREE.Vector2(0, 8)])), mat(sail, 0.95, 0, 0.12, 6, { side: THREE.DoubleSide }));
  jib.position.set(1, 1.6, 0); g.add(jib);
  for (const sgn of [-1, 1]) { const lb = box(g, M.oak(), -0.9, 0.9, -1.6, 1.2, sgn * 2.15, sgn * 2.25); lb.rotation.z = 0.1; }
  ctx.scene.add(shadow(g));
  g.userData.sails = [sailM, jib];
  if (!path) return g;                              // caller drives the boat
  const P = new Path(path, true); let s0 = rand(0, P.len);
  ctx.add((dt, t) => {
    s0 += speed * (0.5 + ctx.state.wind * 0.1) * dt;
    P.at(s0, g.position); g.position.y = y + Math.sin(t * 1.3) * 0.08;
    const d = P.dir(s0); g.rotation.set(Math.sin(t * 0.9) * 0.04, Math.atan2(-d.z, d.x), 0.06 + ctx.state.wind * 0.008);
    sailM.rotation.y = jib.rotation.y = 0.35;
  });
  return g;
}

export function trekschuit(ctx, path, y, towY, towOffset = 4, speed = 1.4) {
  // horse-drawn passenger barge on a towpath
  const boat = new THREE.Group();
  box(boat, mat(0x3b2a1f, 0.8, 0, 0.3), -6, 6, -0.4, 0.4, -1.2, 1.2);
  box(boat, mat(0x6b4a2e, 0.8, 0, 0.25), -3.5, 4.5, 0.4, 2.0, -1.0, 1.0);
  const roofG = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 8.2, 12, 1, false, 0, Math.PI), mat(0x3a2c26, 0.8, 0, 0.3));
  roofG.rotation.z = Math.PI / 2; roofG.position.set(0.5, 2, 0); roofG.scale.set(1, 1, 0.4); boat.add(roofG);
  cyl(boat, M.oak(), [-3, 0.4, 0], [-3, 6, 0], 0.08);
  const horse = new THREE.Group();
  const brown = mat(0x5a3a22, 0.7, 0, 0.15);
  box(horse, brown, -0.9, 0.9, 1.0, 1.6, -0.3, 0.3);
  const neck = box(horse, brown, 0.7, 1.3, 1.3, 2.1, -0.15, 0.15); neck.rotation.z = -0.5;
  const legs = [];
  for (const [lx, lz] of [[-0.7, -0.2], [-0.7, 0.2], [0.7, -0.2], [0.7, 0.2]]) { const l = box(horse, brown, -0.07, 0.07, -0.95, 0, -0.07, 0.07); l.position.set(lx, 1.0, lz); l.geometry.translate(0, -0.475 + 0.475, 0); legs.push(l); }
  const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(), V3()]), new THREE.LineBasicMaterial({ color: 0x4a3a2a }));
  ctx.scene.add(shadow(boat), shadow(horse), rope);
  const P = new Path(path, true); let s0 = rand(0, P.len);
  ctx.add((dt, t) => {
    s0 += speed * dt;
    P.at(s0, boat.position); boat.position.y = y + Math.sin(t * 1.1) * 0.03;
    const d = P.dir(s0), n = V3(-d.z, 0, d.x);
    boat.rotation.y = Math.atan2(-d.z, d.x);
    P.at(s0 + 22, horse.position); horse.position.addScaledVector(n, towOffset); horse.position.y = towY; horse.rotation.y = boat.rotation.y;
    legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 6 + i * Math.PI / 2) * 0.35; });
    const a = boat.localToWorld(V3(-3, 5.5, 0)), b = horse.localToWorld(V3(-0.9, 1.4, 0));
    rope.geometry.setFromPoints([a, b]);
  });
}

export function horseCart(ctx, path, y, speed = 1.3) {
  const g = new THREE.Group();
  box(g, mat(0x7a5a3a, 0.8, 0, 0.3), -1.6, 1.0, 0.6, 1.3, -0.7, 0.7);
  for (const [wx, wz] of [[-1.2, -0.8], [-1.2, 0.8], [0.6, -0.8], [0.6, 0.8]]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 16), M.oak()); w.position.set(wx, 0.45, wz); g.add(w); }
  const brown = mat(0x3d2a1a, 0.7, 0, 0.15); box(g, brown, 1.6, 3.2, 1.0, 1.6, -0.3, 0.3); box(g, brown, 3.0, 3.5, 1.3, 2.0, -0.15, 0.15);
  const legs = []; for (const lx of [1.75, 3.05]) for (const lz of [-0.2, 0.2]) legs.push(box(g, brown, lx - 0.07, lx + 0.07, 0, 1.0, lz - 0.07, lz + 0.07));
  ctx.scene.add(shadow(g));
  const P = new Path(path, true); let s0 = rand(0, P.len);
  ctx.add((dt, t) => { s0 += speed * dt; P.at(s0, g.position); g.position.y = y; const d = P.dir(s0); g.rotation.y = Math.atan2(-d.z, d.x);
    legs.forEach((l, i) => l.rotation.z = Math.sin(t * 6 + i * 1.6) * 0.25); });
}

// ------------------------------------------------------------------ contemporary technology
export function windTurbines(ctx, list, opts = {}) {
  // list: [[x,z,y]]; tower h, rotor r; offshore turbines get a yellow transition piece
  const h = opts.h ?? 90, r = opts.r ?? 45, white = mat(0xe9ecee, 0.5, 0.1, 0.03), rotors = [];
  for (const [x, z, y = 0] of list) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    cyl(g, white, [0, 0, 0], [0, h, 0], 2.2, 14, 1.4);
    if (opts.offshore) cyl(g, mat(0xe0b528, 0.6, 0.2, 0.05), [0, -2, 0], [0, 14, 0], 2.8, 14);
    box(g, white, -3, 6, h - 1.6, h + 1.6, -1.6, 1.6);
    const rotor = new THREE.Group(); rotor.position.set(-3.6, h, 0); g.add(rotor);
    const blade = new THREE.CylinderGeometry(0.35, 1.3, r, 6).translate(0, r / 2, 0).scale(1, 1, 0.35);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(blade, white); b.rotation.x = i * 2 * Math.PI / 3; rotor.add(b); }
    const hub = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), white); hub.scale.set(1.6, 1, 1); rotor.add(hub);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); lamp.position.set(2, h + 2, 0); g.add(lamp);
    g.rotation.y = opts.face ?? 0;
    ctx.scene.add(g); rotors.push({ rotor, lamp, ph: rand(0, 6), om: 0 });
  }
  ctx.add((dt, t) => {
    const w = ctx.state.wind, tgt = w < 3 ? 0 : Math.min(w, 13) * 0.11;
    for (const R of rotors) { R.om += (tgt - R.om) * dt * 0.3; R.ph += R.om * dt; R.rotor.rotation.x = R.ph; R.lamp.visible = (t % 2) < 1; }
  });
}

export function airplane(ctx, opts = {}) {
  // passes overhead now and then; landing aircraft fly low with gear down (Schiphol), others leave contrails
  const g = new THREE.Group(), white = mat(0xf2f3f5, 0.35, 0.3, 0.02), blue = mat(0x1b3d7a, 0.4, 0.3, 0.02);
  const s = opts.size ?? 1;
  cyl(g, white, [-18, 0, 0], [18, 0, 0], 2.0, 14);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 8), white); nose.position.x = 18; nose.scale.set(2, 1, 1); g.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(2, 7, 12), white); tail.rotation.z = Math.PI / 2; tail.position.x = -21.5; g.add(tail);
  box(g, white, -6, 4, -0.4, 0.2, -17, 17);
  box(g, blue, -24, -18, 0, 8, -0.3, 0.3);
  box(g, white, -24, -20, 0.5, 0.9, -6, 6);
  for (const sz of [-7, 7]) cyl(g, mat(0x9aa0a6, 0.4, 0.7, 0.02), [-3, -1.6, sz], [3, -1.6, sz], 1.2, 12);
  const gear = new THREE.Group(); g.add(gear);
  for (const gz of [-3, 3]) box(gear, M.dark(), 1, 1.6, -4.5, -1.5, gz - 0.3, gz + 0.3);
  box(gear, M.dark(), 13, 13.6, -4, -1.5, -0.3, 0.3);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); strobe.position.set(-1, 0.2, 17); g.add(strobe);
  g.scale.setScalar(s); g.visible = false; ctx.scene.add(g);
  const trail = ctx.smoke({ count: 160, rate: () => (g.visible && !opts.landing ? 22 : 0), life: 9, size0: 3, size1: 14, color: 0xffffff, opacity: 0.55, vel: V3(0, 0, 0), drift: 0.05, drag: 0, spread: 0.2, jitter: 0.5 });
  const A = { t: -1, dur: 1 };
  let next = rand(...(opts.first ?? [8, 20]));
  ctx.add((dt, t) => {
    if (A.t < 0) { next -= dt; if (next > 0) return;
      const ang = opts.heading ?? rand(0, 6.28), dir = V3(Math.cos(ang), 0, Math.sin(ang)), side = V3(-dir.z, 0, dir.x);
      const C = ctx.controls.target.clone().addScaledVector(side, rand(...(opts.offset ?? [-300, 300])));
      A.from = C.clone().addScaledVector(dir, -1800); A.to = C.clone().addScaledVector(dir, 1800);
      A.alt0 = opts.landing ? opts.alt0 ?? 380 : rand(...(opts.alt ?? [700, 1100])); A.alt1 = opts.landing ? opts.alt1 ?? 40 : A.alt0;
      A.dur = 3600 / (opts.speed ?? 75); A.t = 0; g.visible = true; gear.visible = !!opts.landing;
      g.rotation.set(0, Math.atan2(-dir.z, dir.x), 0);
    }
    A.t += dt; const u = A.t / A.dur;
    g.position.lerpVectors(A.from, A.to, u); g.position.y = A.alt0 + (A.alt1 - A.alt0) * u;
    if (opts.landing) g.rotation.z = -0.05;
    trail.pos.copy(g.position).add(V3(-25, 0, 0).applyQuaternion(g.quaternion).multiplyScalar(s));
    strobe.visible = (t % 1.2) < 0.1;
    if (u >= 1) { A.t = -1; g.visible = false; next = rand(...(opts.every ?? [25, 50])); }
  });
}

export function drone(ctx, opts = {}) {
  // quadcopter surveying the site, sometimes carrying a parcel
  const g = new THREE.Group(), dark = M.dark(), props = [];
  box(g, dark, -0.25, 0.25, -0.08, 0.08, -0.25, 0.25);
  for (const [x, z] of [[0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]]) {
    beam(g, dark, [0, 0, 0], [x, 0.05, z], 0.05);
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.01, 0.05), mat(0x9aa0a6, 0.5, 0.3, 0)); p.position.set(x, 0.12, z); g.add(p); props.push(p);
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0x29ff6a })); led.position.set(0.3, 0, 0); g.add(led);
  if (opts.parcel) box(g, mat(0xc49a5c, 0.9, 0, 0.1), -0.18, 0.18, -0.55, -0.25, -0.18, 0.18);
  g.scale.setScalar(opts.scale ?? 1.6); ctx.scene.add(shadow(g, true, false));
  const C = V3(...(opts.center ?? [0, 0, 0])), R = opts.radius ?? 18, H = opts.h ?? 14;
  ctx.add((dt, t) => {
    const a = t * (opts.speed ?? 0.12);
    g.position.set(C.x + Math.cos(a) * R + Math.sin(t * 0.37) * 3, H + Math.sin(t * 0.8) * 1.2, C.z + Math.sin(a * 1.3) * R * 0.6);
    g.rotation.set(Math.sin(t * 0.9) * 0.08, -a, Math.cos(t * 0.7) * 0.08 + ctx.state.wind * 0.01);
    props.forEach((p, i) => p.rotation.y = t * 60 + i); led.visible = (t % 1) < 0.5;
  });
}

export function ship(ctx, kind, path, y, speed = 3, opts = {}) {
  // 'container' cargo ship, 'tour' glass-roof canal boat, 'roboat' autonomous platform, 'jetski', 'tjalk'
  const g = new THREE.Group(); let extra = null;
  if (kind === 'container') {
    box(g, mat(0x23324a, 0.6, 0.2, 0.05), -60, 60, -6, 4, -9, 9);
    box(g, mat(0x8a2a22, 0.7, 0.1, 0.05), -60, 60, -6, -3, -9.05, 9.05);
    const cc = [0xb03a2e, 0x1f6aa5, 0xd9a521, 0x3e8e41, 0x6b6b6b, 0xe8e8e8];
    for (let x = -50; x < 40; x += 6.3) for (let z = -7; z < 7; z += 2.6) { const hgt = 2.6 * Math.floor(rand(1, 5)); box(g, mat(pick(cc), 0.7, 0.2, 0.05), x, x + 6, 4, 4 + hgt, z, z + 2.4); }
    box(g, M.white(), 42, 54, 4, 20, -8, 8); box(g, mat(0x2d2d2d, 0.6, 0.3, 0.02), 46, 50, 20, 26, -2, 2);
    extra = ctx.smoke({ count: 120, rate: () => 6, life: 10, size0: 3, size1: 18, color: 0x55524f, opacity: 0.45, vel: V3(0, 4, 0), drift: 0.15, jitter: 0.5 });
  } else if (kind === 'tour') {
    box(g, mat(0x1f3550, 0.5, 0.2, 0.05), -10, 10, -0.6, 0.8, -1.9, 1.9);
    box(g, M.glass(), -8, 8.5, 0.8, 2.3, -1.7, 1.7);
    box(g, M.white(), -8.2, 8.7, 2.3, 2.45, -1.8, 1.8);
  } else if (kind === 'roboat') {                 // autonomous floating platform (Amsterdam roboat research)
    box(g, mat(0x2b2f33, 0.5, 0.3, 0.02), -2, 2, -0.3, 0.3, -1, 1);
    box(g, mat(0xe7e9ea, 0.5, 0.1, 0.02), -1.9, 1.9, 0.3, 0.38, -0.95, 0.95);
    const lidar = cyl(g, mat(0x111111, 0.3, 0.7, 0), [0, 0.38, 0], [0, 0.75, 0], 0.12, 12); extra = lidar;
    const led = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x29d0ff })); led.position.set(0, 0.32, 1); g.add(led);
  } else if (kind === 'jetski') {
    box(g, mat(0xe23b2e, 0.4, 0.2, 0.02), -1.5, 1.5, -0.2, 0.4, -0.5, 0.5);
    box(g, M.dark(), -0.6, 0.4, 0.4, 0.7, -0.3, 0.3);
    box(g, mat(0x1b2a6a, 0.8, 0, 0.05), -0.6, -0.2, 0.7, 1.5, -0.2, 0.2);
    extra = ctx.smoke({ count: 120, rate: () => 30, life: 1.4, size0: 0.3, size1: 1.2, color: 0xffffff, opacity: 0.6, vel: V3(0, 1.5, 0), gravity: 4, drift: 0, jitter: 0.2 });
  } else {                                         // tjalk: flat-bottomed sailing barge
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0x2c2620, 0.7, 0, 0.25));
    hull.scale.set(9, 1.6, 2.6); hull.position.y = 1; g.add(hull);
    cyl(g, M.oak(), [1.5, 1, 0], [1.5, 13, 0], 0.15);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-7, 0.5), new THREE.Vector2(-6, 9), new THREE.Vector2(0, 11.5)])),
      mat(0x8a4a2a, 0.95, 0, 0.12, 6, { side: THREE.DoubleSide })); sail.position.set(1.3, 1.8, 0); sail.rotation.y = 0.3; g.add(sail);
  }
  if (opts.scale) g.scale.setScalar(opts.scale);
  ctx.scene.add(shadow(g));
  if (!path) { if (kind === 'roboat' && extra) ctx.add((dt, t) => { extra.rotation.y = t * 8; }); return g; }
  const P = new Path(path, opts.loop ?? true); let s0 = opts.loop === false ? 0 : rand(0, P.len);
  ctx.add((dt, t) => {
    s0 += speed * dt; if (opts.loop === false && s0 > P.len) s0 = 0;
    P.at(s0, g.position); g.position.y = y + Math.sin(t * (kind === 'jetski' ? 4 : 0.8)) * (kind === 'jetski' ? 0.08 : 0.05);
    const d = P.dir(s0); g.rotation.set(Math.sin(t * 0.7) * 0.01, Math.atan2(-d.z, d.x), kind === 'jetski' ? Math.sin(t * 3) * 0.08 : 0);
    if (kind === 'container' && extra) extra.pos.copy(g.localToWorld(V3(48, 27, 0)));
    if (kind === 'jetski' && extra) extra.pos.copy(g.localToWorld(V3(-1.6, 0.1, 0)));
    if (kind === 'roboat' && extra) extra.rotation.y = t * 8;
  });
  return g;
}

export function traffic(ctx, path, y, n = 8, speed = 22, opts = {}) {
  // cars, vans and buses on a road or viaduct, with headlights
  const cols = [0xd8d8d8, 0x2a2a2a, 0x8a1d1d, 0x1d3a6a, 0xb8b8b8, 0x4a5a4a, 0xe0c020];
  const P = new Path(path, true); const cars = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(), big = Math.random() < 0.18, L = big ? 11 : 4.4, H = big ? 3.2 : 1.45;
    box(g, mat(big ? 0xd6dde2 : pick(cols), 0.35, 0.4, 0.02), -L / 2, L / 2, 0.3, H, -0.9, 0.9);
    if (!big) box(g, M.glass(), -1.0, 1.2, H, H + 0.45, -0.8, 0.8);
    else box(g, M.glass(), -L / 2 + 0.3, L / 2 - 0.3, H - 1.2, H - 0.4, -0.92, 0.92);
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 1.4), new THREE.MeshBasicMaterial({ color: 0xfff6d0 })); hl.position.set(L / 2, 0.8, 0); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 1.4), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); tl.position.set(-L / 2, 0.8, 0); g.add(tl);
    ctx.scene.add(shadow(g, true, false)); cars.push({ g, s: (i / n) * P.len + rand(0, 8), v: speed * rand(0.8, 1.15), lane: opts.lanes ? pick(opts.lanes) : 0 });
  }
  ctx.add((dt) => {
    for (const c of cars) { c.s += c.v * dt; P.at(c.s, c.g.position); const d = P.dir(c.s);
      c.g.position.addScaledVector(V3(-d.z, 0, d.x), c.lane); c.g.position.y = y; c.g.rotation.y = Math.atan2(-d.z, d.x); }
  });
}

export function cyclists(ctx, path, y, n = 4, speed = 4.5, opts = {}) {
  const P = new Path(path, true); const list = [];
  const jackets = [0x2b4f8a, 0xd34a2a, 0x2a2a2a, 0xe0c020, 0x6a8a4a, 0xc23a7a];
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(), frame = M.dark();
    const w1 = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 6, 16), frame); w1.position.set(0.55, 0.33, 0);
    const w2 = w1.clone(); w2.position.x = -0.55; g.add(w1, w2);
    beam(g, frame, [-0.55, 0.33, 0], [0.1, 0.8, 0], 0.04); beam(g, frame, [0.55, 0.33, 0], [0.35, 0.95, 0], 0.04); beam(g, frame, [-0.1, 0.4, 0], [0.35, 0.85, 0], 0.04);
    const body = box(g, mat(pick(jackets), 0.8, 0, 0.05), -0.25, 0.15, 0.95, 1.6, -0.18, 0.18); body.rotation.z = -0.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat(0xd9b49a, 0.8, 0, 0)); head.position.set(0.05, 1.75, 0); g.add(head);
    if (opts.cargo && i % 2 === 0) box(g, mat(0x2a6a5a, 0.7, 0, 0.1), 0.7, 1.4, 0.3, 0.8, -0.4, 0.4);   // bakfiets
    const legL = box(g, M.dark(), -0.06, 0.06, -0.45, 0, -0.06, 0.06), legR = legL.clone(); legL.position.set(-0.05, 0.95, 0.12); legR.position.set(-0.05, 0.95, -0.12); g.add(legR);
    ctx.scene.add(shadow(g, true, false));
    list.push({ g, legL, legR, s: (i / n) * P.len, v: speed * rand(0.8, 1.2), dir: i % 2 ? 1 : -1, lane: (i % 2 ? 1 : -1) * 0.8 });
  }
  ctx.add((dt, t) => {
    for (const c of list) { c.s += c.v * c.dir * dt; P.at(c.s, c.g.position); const d = P.dir(c.s).multiplyScalar(c.dir);
      c.g.position.addScaledVector(V3(-d.z, 0, d.x), c.lane); c.g.position.y = y; c.g.rotation.y = Math.atan2(-d.z, d.x);
      c.legL.rotation.z = Math.sin(t * 6 + c.s) * 0.6; c.legR.rotation.z = -Math.sin(t * 6 + c.s) * 0.6; }
  });
}

export function solarField(ctx, x0, x1, z0, z1, y = 0, rows = 8) {
  const geo = new THREE.BoxGeometry(2, 0.06, 4.2), n = rows * Math.floor((z1 - z0) / 4.6);
  const im = new THREE.InstancedMesh(geo, mat(0x1c2c4a, 0.15, 0.6, 0.02), n * Math.floor((x1 - x0) / 6));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.45)); let k = 0;
  for (let x = x0; x < x1 - 2; x += 6) for (let z = z0; z < z1 - 2; z += 4.6) { if (k >= im.count) break; m4.compose(V3(x, y + 1.2, z), q, V3(1, 1, 1)); im.setMatrixAt(k++, m4); }
  im.count = k; im.castShadow = true; ctx.scene.add(im); return im;
}

export function towers(ctx, list) {
  // glass office towers with aviation lights: [[x,z,w,d,h,color]]
  const lamps = [];
  for (const [x, z, w, d, h, color = 0x8fa9b8] of list) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    box(g, mat(color, 0.12, 0.65, 0.02, 1, { envMapIntensity: 1.5 }), -w / 2, w / 2, 0, h, -d / 2, d / 2);
    for (let yy = 4; yy < h; yy += 3.6) box(g, mat(0xd8dde0, 0.6, 0.2, 0.02), -w / 2 - 0.05, w / 2 + 0.05, yy, yy + 0.3, -d / 2 - 0.05, d / 2 + 0.05);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); l.position.set(0, h + 0.6, 0); g.add(l); lamps.push(l);
    ctx.scene.add(shadow(g));
  }
  ctx.add((dt, t) => lamps.forEach((l, i) => l.visible = ((t + i * 0.3) % 2) < 1));
}

export function crane(ctx, x, z, h = 60, jib = 45) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const yel = mat(0xe0b528, 0.6, 0.3, 0.05);
  for (let yy = 0; yy < h; yy += 4) { box(g, yel, -1, 1, yy, yy + 0.25, -1, 1); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(g, yel, a - 0.12, a + 0.12, yy, yy + 4, b - 0.12, b + 0.12); }
  const top = new THREE.Group(); top.position.y = h; g.add(top);
  box(top, yel, -12, jib, 0, 1.6, -0.9, 0.9); box(top, mat(0x6b6b6b, 0.8, 0, 0.1), -12, -6, -2.5, 0, -1.2, 1.2); box(top, yel, -1.5, 1.5, 1.6, 6, -0.5, 0.5);
  const cable = cyl(top, M.dark(), [30, 0, 0], [30, -25, 0], 0.05); const hook = box(top, M.dark(), 29.5, 30.5, -26, -25, -0.5, 0.5);
  ctx.scene.add(shadow(g));
  ctx.add((dt, t) => { top.rotation.y = Math.sin(t * 0.05) * 1.2; const L = 20 + Math.sin(t * 0.13) * 12; cable.scale.y = L / 25; cable.position.y = -L / 2; hook.position.y = -L; });
}

export function dataCenter(ctx, x, z, w = 60, d = 30, rot = 0) {
  // windowless hall with spinning rooftop coolers (the Haarlemmermeer hosts many)
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot;
  box(g, mat(0x9ea6ad, 0.6, 0.2, 0.05), -w / 2, w / 2, 0, 12, -d / 2, d / 2);
  box(g, mat(0x2a6a9a, 0.5, 0.2, 0.02), -w / 2, w / 2, 10.5, 11, d / 2, d / 2 + 0.05);
  const fans = [];
  for (let xx = -w / 2 + 4; xx < w / 2 - 2; xx += 6) for (const zz of [-d / 4, d / 4]) {
    cyl(g, mat(0x5a5f63, 0.5, 0.5, 0.02), [xx, 12, zz], [xx, 13.2, zz], 1.8, 16);
    const f = box(g, M.dark(), xx - 1.6, xx + 1.6, 13.25, 13.3, zz - 0.2, zz + 0.2); fans.push(f);
  }
  ctx.scene.add(shadow(g));
  ctx.add((dt, t) => fans.forEach((f, i) => f.rotation.y = t * 9 + i));
}

export function pylons(ctx, pts, h = 40) {
  const steel = mat(0x8c9196, 0.5, 0.6, 0.02), tops = [];
  for (const [x, z] of pts) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    for (const [a, b] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) beam(g, steel, [a, 0, b], [a * 0.25, h, b * 0.25], 0.35);
    for (const yy of [h * 0.55, h * 0.75, h * 0.95]) box(g, steel, -0.3, 0.3, yy, yy + 0.5, -9, 9);
    ctx.scene.add(g); tops.push([x, z]);
  }
  const lm = new THREE.LineBasicMaterial({ color: 0x3a3d40 });
  for (let i = 1; i < tops.length; i++) for (const yy of [h * 0.55, h * 0.75, h * 0.95]) for (const zz of [-8.5, 8.5]) {
    const a = V3(tops[i - 1][0], yy, tops[i - 1][1] + zz), b = V3(tops[i][0], yy, tops[i][1] + zz), pts2 = [];
    for (let k = 0; k <= 16; k++) { const p = a.clone().lerp(b, k / 16); p.y -= Math.sin(Math.PI * k / 16) * 6; pts2.push(p); }
    ctx.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), lm));
  }
}

export function chimney(ctx, x, z, h, opts = {}) {
  const g = new THREE.Group(); g.position.set(x, opts.y ?? 0, z);
  cyl(g, opts.mat ?? M.brick(), [0, 0, 0], [0, h, 0], opts.r ?? 2.2, 14, (opts.r ?? 2.2) * 0.6);
  ctx.scene.add(shadow(g));
  const e = ctx.smoke({ pos: V3(x, (opts.y ?? 0) + h, z), count: opts.count ?? 120, rate: opts.rate ?? (() => 5), life: opts.life ?? 12, size0: 2, size1: opts.size ?? 16,
    color: opts.color ?? 0x4a4744, opacity: opts.opacity ?? 0.5, vel: V3(0, opts.rise ?? 3, 0), drift: 0.18, jitter: 0.4 });
  return { g, e };
}

export function balloon(ctx, opts = {}) {
  const g = new THREE.Group();
  const env = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 12), mat(opts.color ?? 0xd2452a, 0.8, 0, 0.05)); env.scale.set(1, 1.2, 1); g.add(env);
  const stripe = new THREE.Mesh(new THREE.SphereGeometry(8.05, 16, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.12), mat(0xf4e3a1, 0.8, 0, 0.05)); stripe.scale.set(1, 1.2, 1); g.add(stripe);
  box(g, mat(0x7a5a3a, 0.9, 0, 0.3), -1, 1, -14, -12.5, -1, 1);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) beam(g, M.dark(), [a, -12.5, b], [a * 4, -8, b * 4], 0.05);
  ctx.scene.add(g);
  const C = V3(...(opts.center ?? [0, 0, 0]));
  ctx.add((dt, t) => { g.position.set(C.x - 200 + ((t * (2 + ctx.state.wind * 0.6)) % 400), (opts.h ?? 120) + Math.sin(t * 0.1) * 8, C.z + (opts.z ?? -150)); });
}

export function train(ctx, path, y, cars = 6, speed = 25, every = [30, 60]) {
  // double-deck intercity (yellow-blue) appearing every so often
  const g = new THREE.Group(), yel = mat(0xf2c414, 0.4, 0.2, 0.02), blu = mat(0x1f3c8a, 0.4, 0.2, 0.02);
  for (let i = 0; i < cars; i++) { const x0 = -i * 27; box(g, yel, x0 - 26, x0, 0.8, 5, -1.45, 1.45); box(g, blu, x0 - 26, x0, 0.8, 1.6, -1.47, 1.47); box(g, M.glass(), x0 - 25, x0 - 1, 2.0, 3.0, -1.48, 1.48); box(g, M.glass(), x0 - 25, x0 - 1, 3.4, 4.3, -1.48, 1.48); }
  ctx.scene.add(shadow(g)); g.visible = false;
  const P = new Path(path); let s0 = -1, wait = rand(...every);
  ctx.add((dt) => {
    if (s0 < 0) { wait -= dt; if (wait <= 0) { s0 = 0; g.visible = true; } return; }
    s0 += speed * dt; P.at(s0, g.position); g.position.y = y; const d = P.dir(s0); g.rotation.y = Math.atan2(-d.z, d.x);
    if (s0 > P.len + cars * 27) { s0 = -1; g.visible = false; wait = rand(...every); }
  });
}

// ------------------------------------------------------------------ nature
export function cows(ctx, area, y, n = 8) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(), white = mat(0xf0ece4, 0.8, 0, 0.05), black = mat(0x1e1e1e, 0.8, 0, 0.05);
    const bodyM = Math.random() < 0.7 ? white : mat(0x7a4a2a, 0.8, 0, 0.1);
    box(g, bodyM, -0.9, 0.9, 0.75, 1.45, -0.38, 0.38);
    for (let k = 0; k < 3; k++) { const sx = rand(-0.7, 0.5); box(g, black, sx, sx + rand(0.3, 0.5), 0.9 + rand(0, 0.3), 1.47, -0.39, 0.39); }
    const head = new THREE.Group(); head.position.set(0.95, 1.25, 0); g.add(head);
    box(head, black, 0, 0.5, -0.35, 0.05, -0.18, 0.18);
    for (const [lx, lz] of [[-0.7, -0.25], [-0.7, 0.25], [0.65, -0.25], [0.65, 0.25]]) box(g, black, lx - 0.07, lx + 0.07, 0, 0.78, lz - 0.07, lz + 0.07);
    g.position.set(rand(area[0], area[1]), y, rand(area[2], area[3])); g.rotation.y = rand(0, 6.28);
    ctx.scene.add(shadow(g)); list.push({ g, head, ph: rand(0, 6), tx: g.position.x, tz: g.position.z });
  }
  ctx.add((dt, t) => {
    for (const c of list) {
      const grazing = Math.sin(t * 0.15 + c.ph) > -0.3;
      c.head.rotation.z = grazing ? -0.9 + Math.sin(t * 2 + c.ph) * 0.08 : 0;
      if (!grazing) { if (Math.random() < 0.002) { c.tx = THREE.MathUtils.clamp(c.g.position.x + rand(-4, 4), area[0], area[1]); c.tz = THREE.MathUtils.clamp(c.g.position.z + rand(-4, 4), area[2], area[3]); }
        const dx = c.tx - c.g.position.x, dz = c.tz - c.g.position.z, d = Math.hypot(dx, dz);
        if (d > 0.1) { c.g.position.x += dx / d * 0.4 * dt; c.g.position.z += dz / d * 0.4 * dt; c.g.rotation.y = Math.atan2(-dz, dx); } }
    }
  });
}

export function heron(ctx, x, z, y, rot = 0) {
  // grey heron standing in the shallows; now and then it strikes at a fish
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot;
  const grey = mat(0x9aa0a4, 0.8, 0, 0.05), dark = mat(0x3a3d40, 0.8, 0, 0.05);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), grey); body.scale.set(1.6, 1, 0.9); body.position.y = 0.95; g.add(body);
  for (const lz of [-0.06, 0.06]) cyl(g, mat(0xa58b5a, 0.8, 0, 0), [0, 0, lz], [0, 0.85, lz], 0.015, 5);
  const neck = new THREE.Group(); neck.position.set(0.25, 1.05, 0); g.add(neck);
  cyl(neck, grey, [0, 0, 0], [0.1, 0.45, 0], 0.04, 6);
  const head = new THREE.Group(); head.position.set(0.1, 0.45, 0); neck.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), M.white()));
  const bill = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.25, 6), mat(0xd8b040, 0.6, 0, 0)); bill.rotation.z = -Math.PI / 2; bill.position.x = 0.15; head.add(bill);
  const tail = box(g, dark, -0.5, -0.25, 0.85, 0.95, -0.08, 0.08);
  ctx.scene.add(shadow(g));
  let strike = -1;
  ctx.add((dt, t) => {
    if (strike < 0 && Math.random() < dt / 9) strike = 0;
    if (strike >= 0) { strike += dt; const k = strike < 0.25 ? strike / 0.25 : Math.max(0, 1 - (strike - 0.25) / 0.6);
      neck.rotation.z = -1.4 * k; if (strike > 0.24 && strike < 0.27) ctx.splash(g.localToWorld(V3(0.75, 0, 0)).setY(y), 0.4, 4); if (strike > 0.9) strike = -1; }
    else neck.rotation.z = Math.sin(t * 0.6) * 0.06;
  });
}

export function waterfowl(ctx, area, y, n = 6, kind = 'duck') {
  // swans, mallards, coots or geese paddling about, with a small V-wake
  const list = [];
  const C = { swan: [0xf6f4ef, 0xe08a2a, 1.7], duck: [0x6b5a44, 0xe0b040, 0.8], coot: [0x1e1f20, 0xf0f0f0, 0.7], goose: [0x8a8478, 0xe08a2a, 1.2] }[kind];
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(), body = mat(C[0], 0.8, 0, 0.05);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), body); b.scale.set(1.7, 0.8, 1); b.position.y = 0.08; g.add(b);
    const nk = kind === 'swan' ? cyl(g, body, [0.25, 0.1, 0], [0.32, 0.55, 0], 0.045, 6) : null;
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), kind === 'duck' && i % 2 ? mat(0x1f5a3a, 0.4, 0.2, 0) : body);
    hd.position.set(kind === 'swan' ? 0.36 : 0.3, kind === 'swan' ? 0.58 : 0.25, 0); g.add(hd);
    const bl = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5), mat(C[1], 0.6, 0, 0)); bl.rotation.z = -Math.PI / 2; bl.position.set(hd.position.x + 0.1, hd.position.y - 0.02, 0); g.add(bl);
    const wake = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 16, 1, Math.PI * 0.7, Math.PI * 0.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
    wake.position.set(-0.3, 0.01, 0); g.add(wake);
    g.scale.setScalar(C[2]);
    const cx = rand(area[0], area[1]), cz = rand(area[2], area[3]);
    g.position.set(cx, y, cz); ctx.scene.add(shadow(g, true, false));
    list.push({ g, cx, cz, r: rand(2, 6), w: rand(0.05, 0.12) * (Math.random() < 0.5 ? 1 : -1), ph: rand(0, 6), dabble: hd });
  }
  ctx.add((dt, t) => {
    for (const d of list) {
      const a = t * d.w + d.ph; const x = d.cx + Math.cos(a) * d.r, z = d.cz + Math.sin(a) * d.r * 0.7;
      if (!ctx.waterAt(x, z, 0.3)) { d.w = -d.w; d.ph += 0.2; continue; }
      d.g.position.set(x, y + Math.sin(t * 1.5 + d.ph) * 0.02, z);
      d.g.rotation.y = Math.atan2(-(Math.cos(a) * d.r * 0.7 * d.w), -Math.sin(a) * d.r * d.w);
      d.g.rotation.z = (kind !== 'swan' && Math.sin(t * 0.3 + d.ph) > 0.92) ? 1.2 : 0;     // dabbling, tail up
    }
  });
}

export function seals(ctx, area, y, n = 3) {
  const list = [], skin = mat(0x6f6a62, 0.35, 0.1, 0.12);
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(); const h = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), skin); h.scale.set(1.2, 1, 1); g.add(h);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), skin); snout.position.set(0.24, -0.04, 0); g.add(snout);
    for (const ez of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), M.dark()); e.position.set(0.2, 0.08, ez); g.add(e); }
    g.visible = false; ctx.scene.add(g); list.push({ g, t: rand(-20, 0), dur: rand(6, 12) });
  }
  ctx.add((dt) => {
    for (const s of list) {
      s.t += dt;
      if (s.t < 0) continue;
      if (!s.g.visible) { for (let k = 0; k < 20; k++) { const x = rand(area[0], area[1]), z = rand(area[2], area[3]); if (ctx.waterAt(x, z, 1)) { s.g.position.set(x, y, z); s.g.rotation.y = rand(0, 6.28); s.g.visible = true; ctx.splash(s.g.position.clone(), 0.5, 4); break; } } }
      const u = s.t / s.dur; s.g.position.y = y - 0.3 + 0.38 * ss(0, 0.1, u) * (1 - ss(0.9, 1, u)); s.g.rotation.z = Math.sin(s.t * 0.8) * 0.15;
      if (u >= 1) { s.g.visible = false; s.t = -rand(8, 25); s.dur = rand(6, 12); }
    }
  });
}

export function storkNest(ctx, x, z, y = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  cyl(g, M.oldOak(), [0, 0, 0], [0, 7, 0], 0.15, 8);
  const nest = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.6, 0.5, 12), mat(0x5a4a32, 1, 0, 0.5, 6)); nest.position.y = 7.2; g.add(nest);
  const bird = new THREE.Group(); bird.position.y = 7.5; g.add(bird);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M.white()); b.scale.set(1.5, 1, 0.9); b.position.y = 0.6; bird.add(b);
  box(bird, M.dark(), -0.45, -0.1, 0.5, 0.7, -0.2, 0.2);
  cyl(bird, M.white(), [0.25, 0.65, 0], [0.32, 1.0, 0], 0.04, 6);
  const bill = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.3, 6), mat(0xd23a1a, 0.6, 0, 0)); bill.position.set(0.48, 1.0, 0); bill.rotation.z = -Math.PI / 2 - 0.3; bird.add(bill);
  for (const lz of [-0.06, 0.06]) cyl(bird, mat(0xd23a1a, 0.6, 0, 0), [0, 0, lz], [0, 0.5, lz], 0.015, 5);
  ctx.scene.add(shadow(g));
  ctx.add((dt, t) => { bird.rotation.y = Math.sin(t * 0.2) * 1.2; bill.rotation.z = -Math.PI / 2 - 0.3 + ((t % 9) < 1.2 ? Math.sin(t * 30) * 0.4 + 1.0 : 0); });   // bill-clattering
}

export function beaver(ctx, path, y) {
  // the beaver is back in the Netherlands: a head and a long V-wake
  const g = new THREE.Group(), fur = mat(0x5a3d26, 0.7, 0, 0.2);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), fur); h.scale.set(1.5, 0.7, 1); g.add(h);
  const wake = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.75, 20, 1, Math.PI * 0.8, Math.PI * 0.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }));
  wake.scale.set(3, 1, 1); wake.position.x = -0.6; g.add(wake);
  ctx.scene.add(g); const P = new Path(path, true); let s0 = 0;
  ctx.add((dt) => { s0 += 0.5 * dt; P.at(s0, g.position); g.position.y = y + 0.03; const d = P.dir(s0); g.rotation.y = Math.atan2(-d.z, d.x); });
}

// ------------------------------------------------------------------ pollution
export function oilSlick(ctx, x, z, y, r = 4) {
  // iridescent film that drifts slowly and breathes
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec2 vUv; uniform float t;
      void main(){ vec2 p=vUv-.5; float d=length(p*vec2(1.,1.3));
        float wob = .38 + .05*sin(atan(p.y,p.x)*5.+t*.4) + .03*sin(atan(p.y,p.x)*11.-t*.3);
        float a = smoothstep(wob, wob-.12, d);
        float ph = d*30. + sin(p.x*18.+t*.5)*2. + t*.3;
        vec3 c = .5 + .5*cos(ph + vec3(0.,2.1,4.2));
        gl_FragColor = vec4(mix(vec3(.12,.1,.08), c, .55), a*.42); }` });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * r, 2 * r).rotateX(-Math.PI / 2), m);
  mesh.position.set(x, y + 0.012, z); ctx.scene.add(mesh);
  ctx.add((dt, t) => { m.uniforms.t.value = t; mesh.position.x = x + Math.sin(t * 0.03) * r * 0.6; mesh.position.z = z + Math.cos(t * 0.025) * r * 0.4; mesh.rotation.y = t * 0.01; });
  return mesh;
}

export function foam(ctx, x, z, y, r = 3, color = 0xf2efe6) {
  // persistent foam (PFAS, phosphate) collecting along a bank
  const g = new THREE.Group(), m = mat(color, 0.95, 0, 0.1, 3);
  for (let i = 0; i < 26; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(rand(0.15, 0.5), 8, 6), m); b.scale.y = 0.35; b.position.set(rand(-r, r), 0, rand(-r * 0.4, r * 0.4)); g.add(b); }
  g.position.set(x, y, z); ctx.scene.add(g);
  ctx.add((dt, t) => { g.children.forEach((b, i) => b.position.y = Math.sin(t * 1.2 + i) * 0.02); });
}

export function plasticRaft(ctx, x, z, y, r = 3) {
  const g = new THREE.Group(), cols = [0xdfe6ea, 0x5b84a8, 0xe0c020, 0xd23a2a, 0x3a8a4a, 0xf2f0ea];
  for (let i = 0; i < 40; i++) {
    const s = rand(0.08, 0.35), m = new THREE.Mesh(Math.random() < 0.5 ? new THREE.BoxGeometry(s, s * 0.3, s * 0.7) : new THREE.CylinderGeometry(s * 0.3, s * 0.3, s, 8), mat(pick(cols), 0.5, 0, 0.05));
    m.position.set(rand(-r, r), 0, rand(-r, r) * 0.6); m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3)); g.add(m);
  }
  g.position.set(x, y, z); ctx.scene.add(g);
  ctx.add((dt, t) => { g.position.y = y + Math.sin(t * 1.1) * 0.03; g.rotation.y = t * 0.01; });
  return g;
}

export function sunkenScooter(ctx, x, z, y, rot = 0) {
  // a rental e-scooter tipped into the water, handlebar and a wheel sticking out
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(0.5, rot, 0.9);
  const body = mat(0x1fb36b, 0.5, 0.2, 0.02);
  box(g, M.dark(), -0.5, 0.5, -0.05, 0.05, -0.1, 0.1);
  beam(g, body, [0.45, 0, 0], [0.55, 1.1, 0], 0.06);
  box(g, M.dark(), 0.5, 0.6, 1.08, 1.14, -0.3, 0.3);
  const w = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 6, 14), M.dark()); w.position.set(-0.5, 0, 0); g.add(w);
  ctx.scene.add(g); return g;
}

export function rubberDuck(ctx, path, y, scale = 6) {
  // a giant inflatable rubber duck drifting by: art installation or escaped advertising
  const g = new THREE.Group(), yel = mat(0xf6cf1e, 0.35, 0, 0.03);
  const b = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), yel); b.scale.set(1.3, 0.75, 1); b.position.y = 0.35; g.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12), yel); h.position.set(0.7, 1.3, 0); g.add(h);
  const beak = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), mat(0xf07a12, 0.4, 0, 0.02)); beak.scale.set(1.2, 0.4, 1); beak.position.set(1.2, 1.2, 0); g.add(beak);
  for (const ez of [-0.25, 0.25]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), M.dark()); e.position.set(1.12, 1.45, ez); g.add(e); }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 10), yel); tail.rotation.z = Math.PI / 2 + 0.6; tail.position.set(-1.3, 0.7, 0); g.add(tail);
  g.scale.setScalar(scale); ctx.scene.add(shadow(g));
  const P = new Path(path, true); let s0 = rand(0, P.len);
  ctx.add((dt, t) => { s0 += (0.3 + ctx.state.wind * 0.05) * dt; P.at(s0, g.position); g.position.y = y + Math.sin(t * 0.9) * 0.1;
    const d = P.dir(s0); g.rotation.set(Math.sin(t * 0.7) * 0.04, Math.atan2(-d.z, d.x) + Math.sin(t * 0.2) * 0.4, Math.sin(t * 0.9) * 0.03); });
}

export function tractor(ctx, area, y) {
  // tractor driving across a field, spraying slurry (mest): nitrogen at work
  const g = new THREE.Group(), grn = mat(0x2e7a3a, 0.5, 0.2, 0.02);
  box(g, grn, -1.2, 1.2, 0.8, 1.8, -0.8, 0.8); box(g, M.glass(), -1.2, 0.2, 1.8, 3.0, -0.8, 0.8); box(g, grn, -1.25, 0.25, 3.0, 3.1, -0.85, 0.85);
  for (const [wx, r] of [[-0.8, 0.85], [1.0, 0.55]]) for (const wz of [-0.95, 0.95]) { const w = cyl(g, M.dark(), [wx, r, wz - 0.2], [wx, r, wz + 0.2], r, 14); }
  box(g, mat(0x7a7f84, 0.5, 0.5, 0.02), -7.5, -1.6, 0.8, 2.6, -1.1, 1.1);   // slurry tanker
  ctx.scene.add(shadow(g));
  const spray = ctx.smoke({ count: 140, rate: () => 26, life: 1.6, size0: 0.4, size1: 1.8, color: 0x5a4024, opacity: 0.55, vel: V3(0, 1.2, 0), gravity: 3, drift: 0.05, spread: 2.5, jitter: 0.6 });
  let s = 0, dir = 1, lane = 0; const lanes = Math.floor((area[3] - area[2]) / 8);
  ctx.add((dt, t) => {
    s += dir * 2.2 * dt;
    const L = area[1] - area[0];
    if (s > L || s < 0) { dir = -dir; s = THREE.MathUtils.clamp(s, 0, L); lane = (lane + 1) % Math.max(1, lanes); }
    g.position.set(area[0] + s, y, area[2] + 4 + lane * 8); g.rotation.y = dir > 0 ? 0 : Math.PI;
    spray.pos.copy(g.localToWorld(V3(-7.8, 1.2, 0)));
  });
}

export function kitesurfer(ctx, area, y) {
  const g = new THREE.Group();
  box(g, mat(0xf2f2f2, 0.5, 0, 0.02), -0.7, 0.7, 0, 0.06, -0.22, 0.22);
  const p = new THREE.Group(); p.position.y = 0.06; g.add(p);
  box(p, mat(0x1a1a1a, 0.6, 0, 0.02), -0.15, 0.15, 0, 1.0, -0.15, 0.15);
  box(p, mat(0x1a1a1a, 0.6, 0, 0.02), -0.15, 0.15, 1.0, 1.55, -0.2, 0.2);
  const kite = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 2.4, 16, 1, true, -1.1, 2.2), mat(0xe2412a, 0.6, 0, 0.02, 1, { side: THREE.DoubleSide }));
  kite.rotation.x = Math.PI / 2; ctx.scene.add(g, kite);
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([V3(), V3(), V3(), V3()]), new THREE.LineBasicMaterial({ color: 0x222222 })); ctx.scene.add(lines);
  const spray = ctx.smoke({ count: 80, rate: () => 25, life: 0.9, size0: 0.2, size1: 0.9, color: 0xffffff, opacity: 0.6, vel: V3(0, 1, 0), gravity: 4, drift: 0, jitter: 0.1 });
  const cx = (area[0] + area[1]) / 2, cz = (area[2] + area[3]) / 2, rx = (area[1] - area[0]) / 2, rz = (area[3] - area[2]) / 2;
  let a = 0;
  ctx.add((dt, t) => {
    a += dt * (0.04 + ctx.state.wind * 0.006);
    const x = cx + Math.sin(a) * rx, z = cz + Math.sin(a * 2.1) * rz;
    const vx = Math.cos(a) * rx, vz = 2.1 * Math.cos(a * 2.1) * rz;
    g.position.set(x, y + 0.05, z); g.rotation.set(0, Math.atan2(-vz, vx), -0.25);
    kite.position.set(x + 14, y + 18 + Math.sin(t * 0.5) * 2, z + Math.sin(t * 0.3) * 6); kite.lookAt(g.position);
    lines.geometry.setFromPoints([g.localToWorld(V3(0, 1.3, 0.1)), kite.localToWorld(V3(5.5, 0, 0)), g.localToWorld(V3(0, 1.3, -0.1)), kite.localToWorld(V3(-5.5, 0, 0))]);
    spray.pos.copy(g.position);
  });
}

export function castle(ctx, x, z, rot = 0, y = 0) {
  // Muiderslot: square brick castle with four round corner towers and a gatehouse
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot;
  const br = M.brick(), roof = mat(0x2e3438, 0.6, 0.3, 0.1);
  for (const [a, b] of [[-1, 0], [1, 0]]) box(g, br, -16, 16, 0, 11, a * 15 - 0.9, a * 15 + 0.9);
  for (const a of [-1, 1]) box(g, br, a * 16 - 0.9, a * 16 + 0.9, 0, 11, -15, 15);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    cyl(g, br, [a * 16, 0, b * 15], [a * 16, 15, b * 15], 3.2, 16);
    const c = new THREE.Mesh(new THREE.ConeGeometry(3.6, 6, 16), roof); c.position.set(a * 16, 18, b * 15); g.add(c);
  }
  box(g, br, -4, 4, 0, 16, 13.5, 17.5); const gc = new THREE.Mesh(new THREE.ConeGeometry(4.5, 7, 4), roof); gc.position.set(0, 19.5, 15.5); gc.rotation.y = Math.PI / 4; g.add(gc);
  ctx.scene.add(shadow(g)); return g;
}
