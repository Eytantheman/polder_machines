// Octagonal smock drainage mill (achtkante bovenkruier), built procedurally.
// Sails face -X (wind from the west/left). The cap is fixed in this view.
// Returns pivots for the rotor and the vertical shaft so a page can drive them.
import { THREE, mat, M, box, beam, cyl, ring } from './engine.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildSmockMill(ctx, o) {
  const P = Object.assign({
    y0: 1.0,          // top of brick base (voeting)
    baseH: 1.0,       // brick base height
    Rb: 5.0, Rt: 3.0, // octagon radius (to corners) at bottom / top of the body
    H: 10.5,          // body height
    sailR: 11.5, sailW: 2.1, tilt: 10, // sail radius, lattice width, windshaft tilt (deg)
    flag: false, thatch: true,
  }, o);
  const g = new THREE.Group(); ctx.scene.add(g);
  const yTop = P.y0 + P.H;
  const oak = M.oak(), old = M.oldOak(), iron = M.iron();

  // brick base (voeting)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(P.Rb + 0.25, P.Rb + 0.45, P.baseH, 8, 1, true), mat(0x9a4f3c, 0.9, 0, 0.35, 9, { side: THREE.DoubleSide }));
  base.rotation.y = Math.PI / 8; base.position.y = P.y0 - P.baseH / 2; base.castShadow = base.receiveShadow = true; g.add(base);

  // timber frame: 8 corner posts (stijlen), horizontal rings (legeringen), crossed braces
  const corner = (i, y) => { const k = (y - P.y0) / P.H, R = P.Rb + (P.Rt - P.Rb) * k, a = (i + 0.5) * Math.PI / 4; return V3(Math.cos(a) * R, y, Math.sin(a) * R); };
  for (let i = 0; i < 8; i++) beam(g, oak, corner(i, P.y0), corner(i, yTop), 0.32);
  const levels = [P.y0 + 0.15, P.y0 + P.H * 0.33, P.y0 + P.H * 0.66, yTop - 0.15];
  for (const y of levels) for (let i = 0; i < 8; i++) beam(g, oak, corner(i, y), corner((i + 1) % 8, y), 0.24);
  for (let l = 0; l < levels.length - 1; l++) for (let i = 0; i < 8; i++) {
    beam(g, old, corner(i, levels[l]), corner((i + 1) % 8, levels[l + 1]), 0.16);
    if (i % 2 === 0) beam(g, old, corner((i + 1) % 8, levels[l]), corner(i, levels[l + 1]), 0.16);
  }
  // floors (zolders) with a hatch for the shaft
  for (const y of [levels[1], levels[2]]) {
    const k = (y - P.y0) / P.H, R = (P.Rb + (P.Rt - P.Rb) * k) * 0.92;
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.08, 8, 1, false), M.pine()); fl.rotation.y = Math.PI / 8; fl.position.y = y; fl.receiveShadow = true; g.add(fl);
  }

  // thatch skin on the 8 faces; faces turned toward +Z are left open as a cutaway
  const thatchFaces = [];
  if (P.thatch) for (let i = 0; i < 8; i++) {
    const a0 = corner(i, P.y0), a1 = corner((i + 1) % 8, P.y0), b0 = corner(i, yTop), b1 = corner((i + 1) % 8, yTop);
    const out = a0.clone().add(a1).multiplyScalar(0.5).setY(0).normalize().multiplyScalar(0.22);
    const geo = new THREE.BufferGeometry().setFromPoints([a0, a1, b1, a0, b1, b0].map(p => p.clone().add(out)));
    geo.computeVertexNormals();
    const f = new THREE.Mesh(geo, mat(0x6e5a3a, 1.0, 0, 0.45, 4, { side: THREE.DoubleSide })); f.castShadow = f.receiveShadow = true; g.add(f);
    f.userData.facing = out.z; thatchFaces.push(f);
  }
  const setCutaway = (on) => thatchFaces.forEach(f => f.visible = !(on && f.userData.facing > 0.02));
  setCutaway(true);

  // cap (kap): boat-shaped boarded roof on a curb ring
  const cap = new THREE.Group(); cap.position.y = yTop; g.add(cap);
  ring(cap, oak, V3(0, 0.15, 0), V3(0, 1, 0), P.Rt - 0.3, P.Rt + 0.2, 0.3, 24);
  const capLen = P.Rt * 2 + 1.6, capR = P.Rt * 0.95;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(capR, capR, capLen, 20, 1, true, -Math.PI / 2, Math.PI), mat(0x3a2c26, 0.8, 0, 0.25, 5, { side: THREE.DoubleSide }));
  roof.rotation.z = Math.PI / 2; roof.position.y = 0.3; roof.scale.set(1, 1, 0.95); roof.castShadow = true; cap.add(roof);
  for (const s of [-1, 1]) { const end = new THREE.Mesh(new THREE.CircleGeometry(capR, 20, 0, Math.PI), mat(0x3a2c26, 0.8, 0, 0.25, 5, { side: THREE.DoubleSide }));
    end.rotation.y = s * Math.PI / 2; end.position.set(s * capLen / 2, 0.3, 0); cap.add(end); }
  // windshaft
  const t = THREE.MathUtils.degToRad(P.tilt);
  const dW = V3(Math.cos(t), -Math.sin(t), 0);                  // shaft axis, front (-X, up) to back
  const hub = V3(-P.Rt - 1.0, yTop + 1.2, 0);
  const rotorPivot = new THREE.Group(); rotorPivot.position.copy(hub); rotorPivot.rotation.z = -t; g.add(rotorPivot);
  const rotor = new THREE.Group(); rotorPivot.add(rotor);
  // in rotor local frame: X = shaft axis (towards the rear), Y/Z = sail plane
  cyl(rotor, oak, V3(-0.6, 0, 0), V3(P.Rt * 2 + 0.6, 0, 0), 0.28, 12);
  box(rotor, iron, -0.55, 0.35, -0.45, 0.45, -0.45, 0.45);        // cast-iron head (askop)
  // brake wheel (bovenwiel) with face cogs
  const bw = V3(P.Rt * 0.95 + 0.4, 0, 0), bwR = 1.55;
  ring(rotor, M.elm(), bw, V3(1, 0, 0), bwR - 0.35, bwR + 0.1, 0.28, 40);
  for (const a of [0, Math.PI / 2]) { box(rotor, M.elm(), bw.x - 0.12, bw.x + 0.12, -bwR, bwR, -0.12, 0.12).rotation.x = a; }
  for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2;
    const c = box(rotor, M.cog(), bw.x + 0.12, bw.x + 0.42, -0.06, 0.06, -0.08, 0.08); c.position.set(bw.x + 0.27, Math.cos(a) * (bwR - 0.15), Math.sin(a) * (bwR - 0.15)); c.rotation.x = a; }
  // sails: two stocks, lattice on the trailing side, cloth on the windward face
  const sailWood = M.pine(), cloth = M.cloth();
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group(); arm.rotation.x = k * Math.PI / 2; rotor.add(arm);
    const off = k % 2 ? 0.18 : -0.18;
    beam(arm, oak, V3(off, 0, 0), V3(off, P.sailR, 0), 0.34, 0.3);
    const n = Math.round((P.sailR - 1.6) / 0.42);
    for (let j = 0; j <= n; j++) { const r = 1.6 + j * 0.42; box(arm, sailWood, off - 0.05, off + 0.05, r - 0.04, r + 0.04, -0.25, P.sailW); }
    for (const z of [P.sailW * 0.35, P.sailW * 0.7, P.sailW]) box(arm, sailWood, off - 0.1, off, 1.6, P.sailR, z - 0.05, z + 0.05);
    const c = box(arm, cloth, off - 0.16, off - 0.14, 1.7, P.sailR - 0.1, 0.05, P.sailW); c.castShadow = true;
  }
  // tail strut (staart) and winch wheel (kruirad) for turning the cap
  beam(g, oak, V3(P.Rt + 0.3, yTop + 0.3, 0), V3(P.Rt + 6.5, P.y0 - 0.2, 0), 0.3);
  beam(g, oak, V3(P.Rt + 0.3, yTop + 0.3, 0.9), V3(P.Rt + 5.2, P.y0 + 1.5, 0), 0.18);
  beam(g, oak, V3(P.Rt + 0.3, yTop + 0.3, -0.9), V3(P.Rt + 5.2, P.y0 + 1.5, 0), 0.18);
  const kr = ring(g, oak, V3(P.Rt + 6.6, P.y0 + 0.6, 0), V3(1, 0, 0), 0.75, 0.85, 0.08, 20);

  // vertical shaft (koningsspil) with the upper lantern (bonkelaar) meshing with the brake wheel
  const lanternR = 0.85;
  // lowest face cog of the brake wheel, in world space; the lantern's near staves sit there
  const xCog = hub.x + (bw.x + 0.27) * Math.cos(t) + (bwR - 0.15) * Math.sin(t);
  const yCog = hub.y - (bw.x + 0.27) * Math.sin(t) - (bwR - 0.15) * Math.cos(t);
  const ly = yCog, shaftTop = ly + 0.35;
  const vPivot = new THREE.Group(); vPivot.position.set(xCog + lanternR, 0, 0); g.add(vPivot);
  const vx = vPivot.position.x;
  const vs = new THREE.Group(); vPivot.add(vs);
  cyl(vs, oak, V3(0, P.vBottom ?? (P.y0 - 0.8), 0), V3(0, shaftTop + 0.1, 0), 0.22, 8);
  ring(vs, M.elm(), V3(0, ly - 0.25, 0), V3(0, 1, 0), 0.2, lanternR + 0.12, 0.1, 24);
  ring(vs, M.elm(), V3(0, ly + 0.25, 0), V3(0, 1, 0), 0.2, lanternR + 0.12, 0.1, 24);
  for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; cyl(vs, M.cog(), V3(Math.cos(a) * lanternR, ly - 0.25, Math.sin(a) * lanternR), V3(Math.cos(a) * lanternR, ly + 0.25, Math.sin(a) * lanternR), 0.05, 6); }

  // optional flag on the cap
  let flag = null;
  if (P.flag) {
    cyl(g, M.white(), V3(P.Rt - 0.3, yTop + 1.5, 0), V3(P.Rt - 0.3, yTop + 5.5, 0), 0.05, 6);
    const fg = new THREE.PlaneGeometry(2.4, 1.5, 12, 3), cols = [];
    const pos = fg.attributes.position;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const c = new THREE.Color(y > 0.25 ? 0xae1c28 : y < -0.25 ? 0x21468b : 0xffffff); cols.push(c.r, c.g, c.b); }
    fg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); fg.translate(1.2, 0, 0);
    flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(P.Rt - 0.3, yTop + 4.7, 0); g.add(flag);
  }

  const RATIO_TOP = 48 / 26;      // brake wheel cogs : lantern staves
  return {
    group: g, rotor, vs, vx, yTop, hub, setCutaway, ratioTop: RATIO_TOP,
    update(angle, dt, time) {
      rotor.rotation.x = -angle;                         // anticlockwise seen from the front (-X)
      vs.rotation.y = angle * RATIO_TOP;
      if (flag) { const p = flag.geometry.attributes.position; const w = ctx.state.wind;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 2.2 - time * (3 + w * 0.6)) * 0.08 * x * (0.4 + w * 0.06)); }
        p.needsUpdate = true; flag.rotation.y = Math.PI + Math.sin(time * 0.5) * 0.1; }
    },
  };
}

// standard wind -> sail speed with reefing above 11 m/s (rad/s)
export function sailOmega(v, R = 11.5) {
  if (v <= 2.0) return 0;
  const vEff = v > 11 ? 11 + (v - 11) * 0.25 : v;
  return 1.6 * (vEff - 2.0) / R;
}
