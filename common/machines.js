// Polder machines: the six machines as placeable modules for the connected world.
// Each takes a site {x, y, z} (y = vertical offset so its local water levels match the world network)
// and returns { group, update(dt, t, io), ... }. io carries the live world levels and controller commands.
import { THREE, M, mat, box, beam, cyl, ring, rand, pick, Eased } from './engine.js';
import { buildSmockMill, sailOmega } from './mill.js';
import * as A from './assets.js';
import { Sequence, ease } from './lock.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import GLB64 from './molentje-glb.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function site(ctx, o) {
  const g = new THREE.Group(); g.position.set(o.x, o.y, o.z); ctx.scene.add(g);
  const P = Object.create(ctx); P.scene = g;
  P.waterAt = (x, z, m) => ctx.waterAt(x + o.x, z + o.z, m);
  const W = (x, y, z) => new THREE.Vector3(x + o.x, y + o.y, z + o.z);
  return { g, P, W, local: (wy) => wy - o.y };
}
const waterMat = () => mat(0x1a3a36, 0.06, 0.2, 0, 1, { envMapIntensity: 1.5 });
const rpm = (w) => w * 60 / (2 * Math.PI);

// ------------------------------------------------------------------ Schermerhorn scheprad mill (1816)
export function schermerhorn(ctx, o) {
  const { g, P, W, local } = site(ctx, o);
  const RACE_Z = -3.5, WHEEL_R = 3.0, AXLE_Y = 1.6;
  for (const [z0, z1] of [[-40, -6], [6, 40]]) box(g, M.clay(), -6, 6, -1.4, 1.0, z0, z1);
  for (const [x0, x1, z0, z1] of [[-6, -4.6, -6, RACE_Z - 0.9], [-6, -4.6, RACE_Z + 0.9, 6], [4.6, 6, -6, RACE_Z - 0.9], [4.6, 6, RACE_Z + 0.9, 6]]) box(g, M.clay(), x0, x1, -1.4, 1.0, z0, z1);
  box(g, mat(0x5a5048, 0.95, 0, 0.3, 2), -5, 5, -1.6, -0.9, -6, 6);
  const mill = buildSmockMill(P, { y0: 1.0, baseH: 1.6, Rb: 5.0, Rt: 3.0, H: 10.5, sailR: 11.5, sailW: 2.1, vBottom: 2.9 });
  for (const s of [-1, 1]) box(g, M.brick(), -14, 14, -2.0, 1.0, RACE_Z + s * 0.62 - 0.25, RACE_Z + s * 0.62 + 0.25);
  box(g, M.brick(), -14, 14, -2.4, -2.0, RACE_Z - 0.9, RACE_Z + 0.9);
  const rw = (x0, x1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.02, 1.0), waterMat()); m.position.set((x0 + x1) / 2, 0, RACE_Z); g.add(m); return m; };
  const raceP = rw(-14, -2.4), raceB = rw(1.2, 14);
  const axle = new THREE.Group(); axle.position.set(mill.vx, AXLE_Y, 0); g.add(axle);
  cyl(axle, M.oak(), [0, 0, 1.0], [0, 0, RACE_Z - 0.8], 0.28, 12);
  const scoop = new THREE.Group(); scoop.position.z = RACE_Z; axle.add(scoop);
  for (const s of [-0.22, 0.22]) ring(scoop, M.elm(), V(0, 0, s), V(0, 0, 1), WHEEL_R - 1.25, WHEEL_R - 1.0, 0.12, 40);
  for (let i = 0; i < 8; i++) box(scoop, M.oak(), -0.12, 0.12, -(WHEEL_R - 1.0), WHEEL_R - 1.0, -0.24, 0.24).rotation.z = i * Math.PI / 8;
  for (let i = 0; i < 32; i++) { const p = new THREE.Group(); p.rotation.z = i / 32 * Math.PI * 2; scoop.add(p); box(p, M.pine(), WHEEL_R - 1.2, WHEEL_R, -0.025, 0.025, -0.28, 0.28); }
  const WW_R = 2.1, wwZ = -0.62;
  ring(axle, M.elm(), V(0, 0, wwZ), V(0, 0, 1), WW_R - 0.35, WW_R + 0.1, 0.22, 40);
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; const c = box(axle, M.cog(), -0.06, 0.06, -0.07, 0.07, wwZ + 0.1, wwZ + 0.4); c.position.set(Math.cos(a) * (WW_R - 0.15), Math.sin(a) * (WW_R - 0.15), 0); c.rotation.z = a; }
  const LR = 0.42, ly = AXLE_Y + WW_R - 0.15;
  for (const yy of [ly - 0.22, ly + 0.22]) ring(mill.vs, M.elm(), V(0, yy, 0), V(0, 1, 0), 0.15, LR + 0.1, 0.08, 20);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; cyl(mill.vs, M.cog(), [Math.cos(a) * LR, ly - 0.22, Math.sin(a) * LR], [Math.cos(a) * LR, ly + 0.22, Math.sin(a) * LR], 0.045, 6); }
  let wheelOmega = 0;
  const spray = ctx.smoke({ pos: W(mill.vx + 1.6, 0.7, RACE_Z), count: 80, rate: () => 40 * Math.min(1, wheelOmega * 1.5), life: 1.3, size0: 0.25, size1: 1.1, color: 0xffffff, opacity: 0.55, vel: V(1.2, 1.6, 0), gravity: 4, drift: 0, spread: 1.2, jitter: 0.3 });
  const sails = new Eased(0.8, 1.2, 2.6); let angle = 0;
  return {
    group: g, name: 'Schermerhorn', mill,
    update(dt, t, io) {
      const om = sails.step(io.brake ? 0 : sailOmega(io.wind), dt, io.brake);
      angle += om * dt; mill.update(angle, dt, t);
      wheelOmega = om * mill.ratioTop * 0.2; axle.rotation.z = angle * mill.ratioTop * 0.2;
      raceP.position.y = local(io.hP); raceB.position.y = local(io.hB);
      spray.pos.y = io.hB + 0.1;
      return wheelOmega;
    },
    info: () => `sails ${rpm(sails.v).toFixed(1)} rpm · wheel ${rpm(wheelOmega).toFixed(1)} rpm`,
  };
}

// ------------------------------------------------------------------ Buitenveldert vijzel mill (1836)
export function buitenveldert(ctx, o) {
  const { g, P, W, local } = site(ctx, o);
  for (const [z0, z1] of [[-40, -5], [5, 40]]) box(g, M.clay(), -6, 6, -1.6, 1.0, z0, z1);
  for (const [z0, z1] of [[-5, -1.3], [1.3, 5]]) box(g, M.clay(), -6, 6, -1.6, 1.0, z0, z1);
  const mill = buildSmockMill(P, { y0: 1.0, baseH: 1.4, Rb: 5.0, Rt: 2.9, H: 11.0, sailR: 12, sailW: 2.2, flag: true, vBottom: 2.2 });
  const SP_R = 1.35, SP_Y = 2.7;
  ring(mill.vs, M.elm(), V(0, SP_Y, 0), V(0, 1, 0), SP_R - 0.35, SP_R + 0.1, 0.22, 40);
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; const c = box(mill.vs, M.cog(), -0.07, 0.07, SP_Y - 0.42, SP_Y - 0.1, -0.06, 0.06); c.position.set(Math.cos(a) * (SP_R - 0.15), 0, Math.sin(a) * (SP_R - 0.15)); c.rotation.y = -a; }
  const ANG = 30 * Math.PI / 180, LEN = 8.4, RS = 0.85, PITCH = 1.15;
  const top = V(mill.vx + SP_R + 0.55, SP_Y - 0.95, 0), d = V(Math.cos(ANG), -Math.sin(ANG), 0), bot = top.clone().addScaledVector(d, LEN);
  const pivot = new THREE.Group(); pivot.position.copy(top); pivot.rotation.z = -ANG; g.add(pivot);
  const screw = new THREE.Group(); pivot.add(screw);
  cyl(screw, M.oak(), [-0.6, 0, 0], [LEN + 0.3, 0, 0], 0.26, 12);
  ring(screw, M.elm(), V(-0.35, 0, 0), V(1, 0, 0), 0.45, 0.75, 0.16, 24);
  for (let k = 0; k < 3; k++) {
    const phase = k * Math.PI * 2 / 3, seg = Math.ceil(LEN / PITCH * 40), pos = [], idx = [];
    for (let i = 0; i <= seg; i++) { const x = 0.3 + (LEN - 0.5) * i / seg, a = phase + (x / PITCH) * Math.PI * 2; for (const r of [0.26, RS]) pos.push(x, Math.cos(a) * r, Math.sin(a) * r); }
    for (let i = 0; i < seg; i++) { const a = 2 * i; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat(0xb08e66, 0.75, 0, 0.2, 7, { side: THREE.DoubleSide })); m.castShadow = true; screw.add(m);
  }
  beam(g, M.brick(), top.clone().add(V(-0.3, -RS - 0.25, 0)), bot.clone().add(V(0.6, -RS - 0.25, 0)), 2.3, 0.4);
  for (const s of [-1, 1]) beam(g, M.brick(), top.clone().add(V(-0.3, -0.75, s * (RS + 0.35))), bot.clone().add(V(0.6, -0.75, s * (RS + 0.35))), 0.4, 0.9);
  box(g, M.brick(), -10, top.x, 0.2, 0.4, -1.25, 1.25);
  for (const s of [-1, 1]) box(g, M.brick(), -10, top.x, 0.2, 1.3, s * 1.25 - 0.15, s * 1.25 + 0.15);
  let screwOmega = 0;
  ctx.smoke({ pos: W(top.x - 0.6, 1.0, 0), count: 70, rate: () => 30 * Math.min(1, screwOmega / 3), life: 1.0, size0: 0.25, size1: 1.0, color: 0xffffff, opacity: 0.55, vel: V(-1.5, 0.9, 0), gravity: 4, drift: 0, spread: 1, jitter: 0.4 });
  const sails = new Eased(0.8, 1.2, 2.6); let angle = 0;
  return {
    group: g, name: 'Buitenveldert', mill,
    update(dt, t, io) {
      const om = sails.step(io.brake ? 0 : sailOmega(io.wind, 12), dt, io.brake);
      angle += om * dt; mill.update(angle, dt, t);
      screwOmega = om * mill.ratioTop * 40 / 30; screw.rotation.x = -angle * mill.ratioTop * 40 / 30;
      return screwOmega;
    },
    info: () => `sails ${rpm(sails.v).toFixed(1)} rpm · screw ${rpm(screwOmega).toFixed(1)} rpm`,
  };
}

// ------------------------------------------------------------------ De Leeghwater steam engine (1843)
export function leeghwater(ctx, o) {
  const { g, W } = site(ctx, o);
  const DIKE = 1.6, R_TOWER = 9, H_TOWER = 15, R_PIVOT = 9.3, R_PUMP = 14, R_CAP = 2.3, N = 11;
  box(g, M.clay(), -24, 24, -2, DIKE, -40, 40);
  const stone = M.stone(), iron = M.iron();
  const wallM = mat(0xb7ad9c, 0.85, 0, 0.25, 2.5, { side: THREE.DoubleSide });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R_TOWER, R_TOWER + 0.4, H_TOWER, 48, 1, true, Math.PI * 0.15, Math.PI * 1.45), wallM);
  wall.position.y = DIKE + H_TOWER / 2; wall.castShadow = wall.receiveShadow = true; g.add(wall);
  ring(g, stone, V(0, DIKE + H_TOWER + 0.4, 0), V(0, 1, 0), R_TOWER - 0.4, R_TOWER + 0.6, 0.8, 48);
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; const b = box(g, stone, -0.45, 0.45, 0, 1.0, -0.35, 0.35); b.position.set(Math.cos(a) * (R_TOWER + 0.1), DIKE + H_TOWER + 1.0, Math.sin(a) * (R_TOWER + 0.1)); b.rotation.y = -a; }
  ring(g, mat(0x5a5048, 0.8, 0, 0.2), V(0, DIKE + H_TOWER - 0.2, 0), V(0, 1, 0), R_CAP + 0.6, R_TOWER, 0.3, 48);
  cyl(g, iron, [0, DIKE, 0], [0, DIKE + 2.4, 0], 3.2, 24);
  cyl(g, mat(0x3b4247, 0.45, 0.7, 0.05), [0, DIKE + 2.4, 0], [0, DIKE + 9.4, 0], 1.95, 32);
  const capG = new THREE.Group(); g.add(capG);
  cyl(capG, mat(0xa9b0b5, 0.25, 0.9, 0.02), [0, DIKE + 9.4, 0], [0, DIKE + H_TOWER + 1.5, 0], 0.32, 12);
  cyl(capG, iron, [0, DIKE + H_TOWER + 1.5, 0], [0, DIKE + H_TOWER + 2.3, 0], R_CAP, 24);
  ring(g, stone, V(0, DIKE + 0.6, 0), V(0, 1, 0), R_PUMP + 2.0, R_PUMP + 2.6, 1.6, 64);
  const basin = new THREE.Mesh(new THREE.RingGeometry(R_TOWER + 0.7, R_PUMP + 2.0, 64).rotateX(-Math.PI / 2), waterMat()); basin.position.y = DIKE + 0.9; g.add(basin);
  const beams = [];
  for (let i = 0; i < N; i++) {
    const a = Math.PI * 0.9 + (i / (N - 1)) * Math.PI * 1.55, dir = V(Math.cos(a), 0, Math.sin(a));
    const pv = new THREE.Group(); pv.position.set(dir.x * R_PIVOT, DIKE + H_TOWER + 1.6, dir.z * R_PIVOT); pv.rotation.y = -a; g.add(pv);
    const rock = new THREE.Group(); pv.add(rock);
    for (const s of [-0.22, 0.22]) box(rock, iron, -(R_PIVOT - R_CAP - 0.2), R_PUMP - R_PIVOT + 0.4, -0.55, 0.55, s - 0.06, s + 0.06);
    cyl(g, mat(0x2e3337, 0.5, 0.7, 0.05), [dir.x * R_PUMP, -1, dir.z * R_PUMP], [dir.x * R_PUMP, DIKE + 1.4, dir.z * R_PUMP], 0.85, 20);
    const rod = new THREE.Group(); g.add(rod); cyl(rod, mat(0xa9b0b5, 0.25, 0.9, 0.02), [0, 0, 0], [0, -(H_TOWER - 0.4), 0], 0.13, 8);
    const sp = ctx.smoke({ pos: W(dir.x * R_PUMP, DIKE + 1.5, dir.z * R_PUMP), count: 28, rate: () => 0, life: 1.1, size0: 0.3, size1: 1.3, color: 0xffffff, opacity: 0.6, vel: dir.clone().multiplyScalar(0.6).setY(1.4), gravity: 4, drift: 0, spread: 1.3, jitter: 0.5 });
    beams.push({ rock, rod, dir, sp });
  }
  box(g, wallM, -8, 8, DIKE, DIKE + 7.5, -22, -10);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-8.6, 0), new THREE.Vector2(8.6, 0), new THREE.Vector2(0, 4)]), { depth: 12.6, bevelEnabled: false }).translate(0, 0, -22.3), mat(0x3a4044, 0.6, 0.3, 0.1));
  roof.position.y = DIKE + 7.5; g.add(roof);
  cyl(g, mat(0x8f5a42, 0.9, 0, 0.3, 6), [0, DIKE, -27], [0, DIKE + 34, -27], 1.8, 14, 1.1);
  const eng = new Eased(0.6, 0.9, 1.8);
  ctx.smoke({ pos: W(0, DIKE + 34, -27), count: 120, rate: () => 1 + eng.v * 2.2, life: 12, size0: 2, size1: 22, color: 0x2e2b29, opacity: 0.55, vel: V(0, 4, 0), drift: 0.18, jitter: 0.4 });
  const exhaust = ctx.smoke({ pos: W(0, DIKE + H_TOWER + 3, 0), count: 60, rate: () => 0, life: 2.4, size0: 0.8, size1: 5, color: 0xf4f4f4, opacity: 0.6, vel: V(0, 3, 0), drift: 0.12, jitter: 0.6 });
  let phase = 0, prev = 0;
  const inner = R_PIVOT - R_CAP + 0.1, outer = R_PUMP - R_PIVOT;
  return {
    group: g, name: 'Leeghwater',
    update(dt, t, io) {
      const spm = eng.step(io.spm, dt, io.spm < 0.05);
      phase += spm / 60 * dt;
      const p = phase % 1, lift = p < 0.38 ? Math.sin(p / 0.38 * Math.PI / 2) : Math.cos((p - 0.38) / 0.62 * Math.PI / 2);
      capG.position.y = lift * 3 - 1.5;
      const ang = -Math.atan2(lift * 3 - 1.5, inner);
      for (const b of beams) {
        b.rock.rotation.z = ang;
        const tip = V(outer, 0, 0).applyAxisAngle(V(0, 0, 1), ang);
        b.rod.position.set(b.dir.x * (R_PIVOT + tip.x), DIKE + H_TOWER + 1.6 + tip.y, b.dir.z * (R_PIVOT + tip.x));
        b.sp.rate = () => (p > 0.42 && p < 0.92 ? 26 * Math.min(1, spm / 3) : 0);
      }
      if (prev < 0.97 && lift >= 0.97 && spm > 0.3) exhaust.acc += 30;
      prev = lift;
      return spm;
    },
    info: () => `${eng.v.toFixed(1)} strokes/min`,
  };
}

// ------------------------------------------------------------------ Muiden sea lock (1811-1812)
export function muiden(ctx, o, hooks = {}) {
  const { g, P, W, local } = site(ctx, o);
  const TOP = 2.2, HW = 3.5, XG = 17, XB = -21.5, oak = M.oak(), old = M.oldOak(), iron = M.iron();
  for (const s of [-1, 1]) box(g, M.grass(), -30, XG + 9, -3, TOP, s > 0 ? HW + 0.3 : -40, s > 0 ? 40 : -HW - 0.3);
  for (const s of [-1, 1]) {
    box(g, mat(0x6a5a48, 0.85, 0, 0.35, 5), -XG - 6, XG + 9, -2.5, TOP, s * HW - 0.15 + s * 0.15, s * HW + 0.15 + s * 0.15);
    for (let x = -XG - 6; x <= XG + 9; x += 2) cyl(g, old, [x, -2.5, s * (HW - 0.05)], [x, TOP + 0.25, s * (HW - 0.05)], 0.17, 8);
    box(g, oak, -XG - 6, XG + 9, TOP, TOP + 0.3, s * HW - 0.25, s * HW + 0.35 * s);
  }
  box(g, old, -XG - 6, XG + 9, -2.6, -2.4, -HW, HW);
  const chamber = new THREE.Mesh(new THREE.BoxGeometry(2 * XG + 1, 0.02, 2 * HW - 0.1), waterMat()); g.add(chamber);
  function leaf(xh, side) {
    const pv = new THREE.Group(); pv.position.set(xh, 0, side * (HW - 0.2)); g.add(pv);
    const L = 3.75;
    box(pv, mat(0x5a4a38, 0.85, 0, 0.3, 5), 0, L, -2.3, TOP - 0.1, -0.14, 0.14);
    for (const y of [-1.6, -0.4, 0.8, 1.9]) box(pv, oak, 0, L, y - 0.12, y + 0.12, -0.2, 0.2);
    cyl(pv, oak, [0, -2.3, 0], [0, TOP + 0.6, 0], 0.22, 10);
    beam(pv, oak, V(0, TOP + 0.45, 0), V(-6.5, TOP + 0.9, 0), 0.3);
    const closed = side > 0 ? 65 * Math.PI / 180 : -65 * Math.PI / 180, open = side > 0 ? Math.PI - 0.06 : -Math.PI + 0.06;
    return (k) => { pv.rotation.y = closed + (open - closed) * k; };
  }
  const sea = [leaf(XG, 1), leaf(XG, -1)], inn = [leaf(-XG, 1), leaf(-XG, -1)];
  const setSea = (k) => sea.forEach(f => f(k)), setIn = (k) => inn.forEach(f => f(k));
  const bl = new THREE.Group(); bl.position.set(XB, TOP + 0.1, HW + 1.0); g.add(bl);
  const deckL = 2 * HW + 2.0;
  box(bl, mat(0x6e5a44, 0.85, 0, 0.3, 4), -1.7, 1.7, -0.15, 0.15, -deckL, 0);
  for (const sx of [-1.9, 1.9]) cyl(g, M.white(), [XB + sx, TOP, HW + 1.9], [XB + sx, TOP + 8.6, HW + 1.9], 0.22, 10);
  box(g, M.white(), XB - 2.2, XB + 2.2, TOP + 8.3, TOP + 8.8, HW + 1.7, HW + 2.1);
  const wip = new THREE.Group(); wip.position.set(XB, TOP + 8.9, HW + 1.9); g.add(wip);
  for (const sx of [-1.4, 1.4]) box(wip, M.white(), sx - 0.12, sx + 0.12, -0.15, 0.15, -deckL - 0.9, 5.5);
  box(wip, mat(0x3a3a3a, 0.8, 0.2, 0.1), -1.6, 1.6, -0.9, -0.15, 3.8, 5.6);
  const setBridge = (k) => { bl.rotation.x = wip.rotation.x = k * 1.25; };
  const boat = A.botter(P, null, 0, 0, 0x6e3420, 0.62); boat.visible = false;
  let hSea = 0, hB = 0, level = 0, allow = true, spui = false;
  const yAt = (x) => x > XG ? local(hSea) : x < -XG ? local(hB) : level;
  const pIn = new A.Path([[150, 0, 40], [70, 0, 12], [32, 0, 0], [XG + 3, 0, 0]]);
  const pOut = new A.Path([[-2, 0, 0], [-XG - 6, 0, 0], [-60, 0, 0], [-160, 0, 0]]);
  const put = (Pth, u) => { Pth.at(Pth.len * u, boat.position); const d = Pth.dir(Pth.len * u); boat.rotation.y = Math.atan2(-d.z, d.x); boat.position.y = yAt(boat.position.x); };
  const sprayIn = ctx.smoke({ pos: W(-XG + 0.6, 0, 0), count: 60, rate: () => 0, life: 1.2, size0: 0.3, size1: 1.4, color: 0xffffff, opacity: 0.6, vel: V(-2, 1, 0), gravity: 4, drift: 0, spread: 1.5, jitter: 2.5 });
  const spuiSpray = ctx.smoke({ pos: W(XG + 3, 0, 0), count: 120, rate: () => spui ? 45 : 0, life: 1.6, size0: 0.5, size1: 2.2, color: 0xffffff, opacity: 0.55, vel: V(3, 0.8, 0), gravity: 3, drift: 0, spread: 1.8, jitter: 2.5 });
  const lockedLevel = () => level;
  const seq = new Sequence([
    { label: 'botter approaching from the sea', dur: 16, start: () => { boat.visible = true; }, f: (u) => put(pIn, ease(u)) },
    { label: 'entering the chamber', dur: 9, f: (u) => { const x = XG + 3 - (XG + 3) * ease(u); boat.position.set(x, yAt(x), 0); boat.rotation.y = Math.PI; } },
    { label: 'sea gates closing', dur: 5, f: (u) => setSea(1 - ease(u)) },
    { label: 'levelling to the boezem', dur: 9, start: () => { sprayIn.rate = () => 30; this_from = level; }, f: (u) => { level = this_from + (local(hB) - this_from) * ease(u); boat.position.y = level; if (u >= 1) { sprayIn.rate = () => 0; hooks.transfer && hooks.transfer('muiden'); } } },
    { label: 'bridge up', dur: 5, f: (u) => setBridge(ease(u)) },
    { label: 'inner gates opening', dur: 5, f: (u) => setIn(ease(u)) },
    { label: 'botter leaving inland', dur: 14, f: (u) => put(pOut, ease(u)) },
    { label: 'inner gates closing, bridge down', dur: 6, start: () => { boat.visible = false; }, f: (u) => { setIn(1 - ease(u)); setBridge(1 - ease(u)); } },
    { label: 'refilling from the sea', dur: 8, start: () => { this_from = level; }, f: (u) => { level = this_from + (local(hSea) - this_from) * ease(u); } },
    { label: 'sea gates opening', dur: 5, f: (u) => setSea(ease(u)) },
  ], 18);
  let this_from = 0;
  setSea(1); setIn(0); setBridge(0);
  return {
    group: g, name: 'Muiden', seq,
    update(dt, t, io) {
      hSea = io.hSea; hB = io.hB; allow = io.allowLock; spui = io.spui;
      spuiSpray.pos.y = io.hSea + 0.2;
      // in a storm surge the sea gates stay shut: hold the cycle while idle, and close the gates
      if (!allow && seq.i < 0) { seq.wait = Math.max(seq.wait, 5); setSea(0); level += (local(hB) - level) * Math.min(1, dt * 0.5); }
      else if (seq.i < 0) { setSea(1); level += (local(hSea) - level) * Math.min(1, dt * 0.5); }
      seq.update(dt);
      chamber.position.set(0, level, 0);
      if (boat.visible) boat.position.y += Math.sin(t * 1.2) * 0.004;
    },
    info: () => (spui ? 'spui open · ' : '') + (allow ? seq.label : 'sea gates shut (surge)'),
  };
}

// ------------------------------------------------------------------ Zaandam valdeursluis
export function zaandam(ctx, o, hooks = {}) {
  const { g, P, W, local } = site(ctx, o);
  let io_allow = true;
  const TOP = 1.4, HW = 3.0, XH = 14, brick = M.brick(), stone = M.stone(), oak = M.oak(), iron = M.iron();
  for (const s of [-1, 1]) box(g, M.grass(), -XH - 2.2, XH + 2.2, -3, TOP, s > 0 ? HW + 0.5 : -30, s > 0 ? 30 : -HW - 0.5);
  for (const s of [-1, 1]) { box(g, brick, -XH - 2.2, XH + 2.2, -2.6, TOP, s * HW, s * (HW + 0.6)); box(g, stone, -XH - 2.2, XH + 2.2, TOP, TOP + 0.18, s * (HW - 0.1), s * (HW + 0.8)); }
  box(g, brick, -XH - 2.2, XH + 2.2, -2.8, -2.6, -HW, HW);
  const chamber = new THREE.Mesh(new THREE.BoxGeometry(2 * XH - 1, 0.02, 2 * HW - 0.1), waterMat()); g.add(chamber);
  function head(xc, fall) {
    for (const s of [-1, 1]) box(g, brick, xc - 1.1, xc + 1.1, TOP, 6.4, s * (HW + 0.1), s * (HW + 1.5));
    const arch = new THREE.Mesh(new THREE.TorusGeometry(HW + 0.8, 0.7, 8, 24, Math.PI), brick); arch.rotation.y = Math.PI / 2; arch.position.set(xc, 6.4, 0); arch.scale.set(1, 0.8, 1.6); g.add(arch);
    const drum = new THREE.Group(); drum.position.set(xc, 9.9, 0); g.add(drum);
    cyl(drum, oak, [0, 0, -HW - 1.2], [0, 0, HW + 1.2], 0.35, 12);
    for (const s of [-1, 1]) ring(drum, iron, V(0, 0, s * (HW + 1.3)), V(0, 0, 1), 0.85, 1.0, 0.08, 20);
    box(g, stone, xc - 1.2, xc + 1.2, 9.0, 9.25, -HW - 1.6, HW + 1.6);
    const hinge = new THREE.Group(); hinge.position.set(xc, -2.5, 0); g.add(hinge);
    const gH = TOP + 2.2;
    box(hinge, mat(0x4e4234, 0.85, 0, 0.3, 5), -0.14, 0.14, 0, gH, -HW + 0.05, HW - 0.05);
    for (const y of [0.4, gH * 0.5, gH - 0.3]) box(hinge, oak, -0.2, 0.2, y - 0.14, y + 0.14, -HW + 0.05, HW - 0.05);
    return (k) => { hinge.rotation.z = -fall * k * 1.48; drum.rotation.z = k * 9; };
  }
  const zg = [head(XH, -1), head(XH - 2.6, -1)], cg = [head(-XH, 1), head(-XH + 2.6, 1)];
  const setZ = (k) => zg.forEach(f => f(k)), setC = (k) => cg.forEach(f => f(k));
  setZ(0); setC(0);
  const boats = [A.ship(P, 'roboat', null, 0, 0, { scale: 1.3 }), A.ship(P, 'tour', null, 0, 0, { scale: 0.65 })]; boats.forEach(b => b.visible = false);
  let boat = boats[0], hZ = 0, hC = 0, level = 0, from = 0;
  const yAt = (x) => x > XH ? local(hZ) : x < -XH ? local(hC) : level;
  const pIn = new A.Path([[60, 0, 40], [36, 0, 4], [XH + 8, 0, 0]]);
  const pOut = new A.Path([[0, 0, 0], [-XH - 8, 0, 0], [-80, 0, 0], [-150, 0, 0]]);
  const put = (Pth, u) => { Pth.at(Pth.len * u, boat.position); const d = Pth.dir(Pth.len * u); boat.rotation.y = Math.atan2(-d.z, d.x); boat.position.y = yAt(boat.position.x) + 0.05; };
  const spray = ctx.smoke({ pos: W(-XH - 0.5, 0, 0), count: 60, rate: () => 0, life: 1.2, size0: 0.3, size1: 1.4, color: 0xffffff, opacity: 0.6, vel: V(-2, 1, 0), gravity: 4, drift: 0, spread: 1.5, jitter: 2.2 });
  const seq = new Sequence([
    { label: 'autonomous vessel arriving', dur: 12, start: () => { boat = pick(boats); boat.visible = true; level = local(hZ); }, f: (u) => put(pIn, ease(u)) },
    { label: 'Zaan valdeuren down', dur: 6, f: (u) => setZ(ease(u)) },
    { label: 'entering', dur: 8, f: (u) => { const x = (XH + 8) * (1 - ease(u)); boat.position.set(x, yAt(x) + 0.05, 0); boat.rotation.y = Math.PI; } },
    { label: 'winding gates up', dur: 6, f: (u) => setZ(1 - ease(u)) },
    { label: 'levelling to the polder', dur: 8, start: () => { spray.rate = () => 30; from = level; }, f: (u) => { level = from + (local(hC) - from) * ease(u); boat.position.y = level + 0.05; if (u >= 1) { spray.rate = () => 0; hooks.transfer && hooks.transfer('zaandam'); } } },
    { label: 'polder valdeuren down', dur: 6, f: (u) => setC(ease(u)) },
    { label: 'leaving into the polder', dur: 12, f: (u) => put(pOut, ease(u)) },
    { label: 'winding gates up', dur: 6, start: () => { boat.visible = false; }, f: (u) => setC(1 - ease(u)) },
    { label: 'refilling from the Zaan', dur: 8, start: () => { from = level; }, f: (u) => { level = from + (local(hZ) - from) * ease(u); } },
  ], 16);
  return {
    group: g, name: 'Zaandam', seq,
    update(dt, t, io) {
      hZ = io.hB; hC = io.hP; io_allow = io.allowLock;
      if (!io.allowLock && seq.i < 0) seq.wait = Math.max(seq.wait, 5);
      if (seq.i < 0) level += (local(hZ) - level) * Math.min(1, dt * 0.5);
      seq.update(dt); chamber.position.set(0, level, 0);
    },
    info: () => io_allow ? seq.label : 'held: polder too high',
  };
}

// ------------------------------------------------------------------ Monnickendam vijzel-staartmolentje (Blender model)
const MON_MATS = () => ({
  'Weathered oak (trestle)': mat(0x6f665c, 0.9, 0, 0.3), 'Wrought iron': M.iron(), 'Painted boards (cap)': mat(0x3c5a4f, 0.65, 0, 0.12),
  'Tarred boards (vane)': mat(0x4a4038, 0.7, 0, 0.25, 7, { side: THREE.DoubleSide }), 'Hemp rope': mat(0x9a8566, 0.9, 0, 0.1), 'Oak (cap frame)': M.oak(),
  'Hornbeam (cogs)': M.cog(), 'Elm (wheels)': M.elm(), 'Pine (sail lattice)': M.pine(), 'Sailcloth': M.cloth(), 'Pine (screw blade)': mat(0xb08e66, 0.75, 0, 0.2),
});
export function monnickendam(ctx, o) {
  const { g } = site(ctx, o);
  const nodes = {}, MM = MON_MATS();
  const bytes = Uint8Array.from(atob(GLB64), c => c.charCodeAt(0));
  new GLTFLoader().parse(bytes.buffer, '', (gltf) => {
    gltf.scene.traverse((n) => { if (n.isMesh) { const m = MM[n.material.name]; if (m) n.material = m; n.castShadow = n.receiveShadow = true; } nodes[n.name] = n; });
    if (nodes['Terrein.earth']) nodes['Terrein.earth'].visible = false;
    for (const k of ['Rotor_spin', 'Koningsspil_spin', 'Vijzel_spin']) if (nodes[k]) nodes[k].userData.q0 = nodes[k].quaternion.clone();
    g.add(gltf.scene);
  });
  const ax = V(1, 0, 0), ay = V(0, 1, 0), q = new THREE.Quaternion();
  const spin = (n, axis, a) => { if (n && n.userData.q0) n.quaternion.copy(n.userData.q0).multiply(q.setFromAxisAngle(axis, a)); };
  const sails = new Eased(0.8, 1.2, 2.6); let angle = 0;
  return {
    group: g, name: 'Monnickendam',
    update(dt, t, io) {
      const om = sails.step(io.brake ? 0 : sailOmega(io.wind, 2.65) * 0.55, dt, io.brake);
      angle += om * dt;
      spin(nodes.Rotor_spin, ax, -angle); spin(nodes.Koningsspil_spin, ay, angle * 4 / 3); spin(nodes.Vijzel_spin, ax, angle * 17 / 15);
      return om * 17 / 15;
    },
    info: () => `sails ${rpm(sails.v).toFixed(1)} rpm`,
  };
}
