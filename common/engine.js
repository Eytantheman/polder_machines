// Polder machines: shared viewer engine.
// Sky, reflective water bodies, lighting, control panel, metadata overlay, navigation,
// and the ambient life shared by every page (drifting debris, birds, jumping fish, a whale).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';

export { THREE };
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const ss = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
export const D2R = Math.PI / 180;

// ---------------------------------------------------------------- materials
const NOISE = `
  float h3(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ return 0.55*vn(p)+0.3*vn(p*2.3)+0.15*vn(p*5.1); }
`;
const matCache = new Map();
export function mat(color, rough = 0.8, metal = 0, grain = 0.22, scale = 7, opts = {}) {
  const key = [color, rough, metal, grain, scale, JSON.stringify(opts)].join('|');
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMapIntensity: 0.7, ...opts });
  if (grain > 0) m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWP;\n' + NOISE + sh.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
       float g = fbm(vWP*${scale.toFixed(2)}); float g2 = fbm(vWP*vec3(1.5,22.0,1.5));
       diffuseColor.rgb *= mix(1.0-${grain.toFixed(2)}, 1.0+${grain.toFixed(2)}, 0.6*g+0.4*g2);`);
  };
  m.customProgramCacheKey = () => key;
  matCache.set(key, m);
  return m;
}
export const M = {
  oak: () => mat(0x8d6c4c, 0.8, 0, 0.25),
  oldOak: () => mat(0x6f665c, 0.9, 0, 0.3),
  elm: () => mat(0x97734f, 0.72, 0, 0.22),
  cog: () => mat(0xb39a76, 0.6, 0, 0.12),
  pine: () => mat(0x9c7f5d, 0.8, 0, 0.2),
  iron: () => mat(0x1b1c1e, 0.45, 0.85, 0.08),
  brick: () => mat(0x9a4f3c, 0.9, 0, 0.35, 9),
  stone: () => mat(0xb9b2a4, 0.85, 0, 0.25, 3),
  thatch: () => mat(0x6e5a3a, 1.0, 0, 0.45, 4),
  cloth: () => mat(0xd8cdb7, 0.95, 0, 0.06, 20, { side: THREE.DoubleSide }),
  grass: () => mat(0x56693a, 0.95, 0, 0.35, 0.6),
  clay: () => mat(0x55633a, 0.95, 0, 0.35, 0.8),
  tar: () => mat(0x2a2522, 0.7, 0, 0.25),
  white: () => mat(0xeeeae2, 0.7, 0, 0.08),
  green: () => mat(0x2f5a45, 0.6, 0, 0.12),
  glass: () => mat(0x8fb3c7, 0.08, 0.6, 0.0, 1, { envMapIntensity: 1.6 }),
  dark: () => mat(0x24282b, 0.7, 0.2, 0.05),
};

// ---------------------------------------------------------------- geometry helpers
// All helpers return meshes already added to `parent` (a Group or the scene).
export function box(parent, material, x0, x1, y0, y1, z0, z1) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
export function beam(parent, material, a, b, w, h = w, up = new THREE.Vector3(0, 1, 0)) {
  a = new THREE.Vector3(...(a.isVector3 ? a.toArray() : a)); b = new THREE.Vector3(...(b.isVector3 ? b.toArray() : b));
  const d = b.clone().sub(a), L = d.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, L), material);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  const ax = d.normalize();
  if (Math.abs(ax.dot(up)) > 0.98) up = new THREE.Vector3(1, 0, 0);
  m.matrix.lookAt(new THREE.Vector3(0, 0, 0), ax.clone().negate(), up);   // +Z points from a to b
  m.quaternion.setFromRotationMatrix(m.matrix);
  m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
export function cyl(parent, material, a, b, r, seg = 16, r2 = r) {
  a = new THREE.Vector3(...(a.isVector3 ? a.toArray() : a)); b = new THREE.Vector3(...(b.isVector3 ? b.toArray() : b));
  const d = b.clone().sub(a), L = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, L, seg), material);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
export function ring(parent, material, center, axis, ri, ro, thick, seg = 48) {
  const shape = new THREE.Shape(); shape.absarc(0, 0, ro, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, ri, 0, Math.PI * 2, true); shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: seg }).translate(0, 0, -thick / 2);
  const m = new THREE.Mesh(g, material);
  m.position.copy(center);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis.clone().normalize());
  m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
export function prism(parent, material, pts2d, z0, z1, axis = 'z') {
  // extrude a polygon (x,y) between z0 and z1; axis 'x' maps the extrusion onto world X
  const s = new THREE.Shape(pts2d.map(p => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false }).translate(0, 0, z0);
  if (axis === 'x') g.rotateY(Math.PI / 2).scale(-1, 1, 1);
  const m = new THREE.Mesh(g, material); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}

// ---------------------------------------------------------------- eased speed (spin-up with inertia)
export class Eased {
  constructor(up = 0.8, down = 1.2, hard = 2.6) { this.v = 0; this.dv = 0; this.up = up; this.down = down; this.hard = hard; }
  step(target, dt, braking = false) {
    const wn = braking ? this.hard : (target > this.v ? this.up : this.down);
    const acc = wn * wn * (target - this.v) - 2 * wn * this.dv;
    this.dv += acc * dt; this.v += this.dv * dt;
    if (this.v < 0) { this.v = 0; this.dv = Math.max(0, this.dv); }
    return this.v;
  }
}

// ---------------------------------------------------------------- UI
const CSS = `
:root { --ink:#1d2124; --muted:#5d666c; --line:rgba(29,33,36,.12); --accent:#2f6f68; }
* { box-sizing: border-box; }
html, body { margin:0; height:100%; overflow:hidden; background:#9fb4c4; font-family:"IBM Plex Sans", system-ui, sans-serif; color:var(--ink); }
canvas { display:block; }
#panel { display:none !important; }
#panel { position:absolute; top:16px; left:16px; width:300px; padding:16px 18px 14px; background:rgba(250,248,243,.88);
  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border:1px solid var(--line); border-radius:12px; box-shadow:0 6px 24px rgba(20,30,40,.12); }
#panel h1 { font-size:15px; font-weight:600; margin:0 0 2px; }
#panel .sub { font-size:12px; color:var(--muted); margin:0 0 12px; }
#panel label.row { display:flex; justify-content:space-between; align-items:baseline; font-size:12px; color:var(--muted); margin:6px 0 4px; }
#panel .big { font-family:"IBM Plex Mono", monospace; font-size:20px; color:var(--ink); font-weight:500; }
#panel .unit { font-size:12px; color:var(--muted); margin-left:3px; }
#panel input[type=range] { width:100%; accent-color:var(--accent); margin:2px 0 2px; height:22px; }
#panel .hint { font-size:12px; color:var(--accent); font-weight:500; min-height:16px; margin-bottom:8px; }
#panel .stats { display:grid; grid-template-columns:1fr auto; row-gap:4px; font-size:12px; border-top:1px solid var(--line); padding-top:10px; margin-top:4px; }
#panel .stats span:nth-child(even) { font-family:"IBM Plex Mono", monospace; text-align:right; }
#panel .toggles { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
#panel .toggles button { font:inherit; font-size:12px; padding:5px 10px; border-radius:999px; cursor:pointer; border:1px solid var(--line); background:#fff; color:var(--ink); }
#panel .toggles button[aria-pressed=true] { background:var(--accent); color:#fff; border-color:var(--accent); }
#panel .toggles button.warn[aria-pressed=true] { background:#9a3b2e; border-color:#9a3b2e; }
#panel .note { font-size:11px; color:var(--muted); margin-top:12px; line-height:1.4; }
#collapse { position:absolute; top:12px; right:12px; border:none; background:none; font-size:16px; cursor:pointer; color:var(--muted); display:none; }
#nav { position:absolute; top:16px; right:16px; display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; max-width:56vw;
  font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; }
#nav a { color:#fff; text-decoration:none; font-size:13px; padding:5px 10px; border-radius:999px; background:rgba(10,20,25,.32);
  backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); border:1px solid rgba(255,255,255,.25); }
#nav a[aria-current=page] { background:rgba(255,255,255,.92); color:#1d2124; }
#metaScrim { position:absolute; left:0; bottom:0; width:75vw; height:60vh; pointer-events:none;
  background:radial-gradient(ellipse at 0% 100%, rgba(10,20,25,.42) 0%, rgba(10,20,25,.18) 45%, rgba(10,20,25,0) 72%); }
#meta { position:absolute; left:28px; bottom:26px; max-width:min(780px, 62vw); pointer-events:none;
  font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.55), 0 4px 28px rgba(0,0,0,.45); }
#meta h2 { font-size:clamp(28px, 4.2vw, 56px); font-weight:700; line-height:1.02; letter-spacing:-.015em; margin:0 0 10px; }
#meta .orig { font-size:clamp(15px, 1.5vw, 20px); font-style:italic; font-weight:400; margin:0 0 14px; opacity:.95; }
#meta dl { display:grid; grid-template-columns:auto 1fr; gap:4px 16px; margin:0 0 14px; font-size:clamp(13px, 1.2vw, 16px); font-weight:500; }
#meta dt { opacity:.8; font-weight:400; } #meta dd { margin:0; }
#meta a { pointer-events:auto; color:#fff; font-size:clamp(14px, 1.4vw, 19px); font-weight:500; text-decoration:none; border-bottom:1.5px solid rgba(255,255,255,.7); padding-bottom:1px; }
#loading { position:absolute; inset:0; display:grid; place-items:center; font-size:13px; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.4); pointer-events:none; }
@media (max-height:500px) { #meta dl { display:none; } #meta h2 { font-size:clamp(24px, 3.4vw, 40px); } }
@media (max-width:640px) {
  #panel { top:auto; bottom:10px; left:10px; right:10px; width:auto; padding:12px 14px; }
  #panel.min .hide-min { display:none; } #collapse { display:block; }
  #meta { left:14px; right:14px; top:auto; bottom:18px; max-width:none; } #meta dl { display:none; }
  #metaScrim { top:auto; bottom:0; width:100vw; height:50vh; background:linear-gradient(rgba(10,20,25,0), rgba(10,20,25,.45)); }
  #nav { left:10px; right:10px; top:10px; max-width:none; justify-content:flex-start; }
}`;

export const SITES = [
  { href: '../monnickendam-1826/', label: 'Monnickendam 1826' },
  { href: '../schermerhorn-1816/', label: 'Schermerhorn 1816' },
  { href: '../leeghwater-1843/', label: 'Leeghwater 1843' },
  { href: '../muiden-zeesluis/', label: 'Muiden zeesluis' },
  { href: '../zaandam-valdeursluis/', label: 'Zaandam valdeursluis' },
  { href: '../buitenveldert-1836/', label: 'Buitenveldert 1836' },
  { href: '../delft-1931/', label: 'Delft 1931' },
  { href: '../mijzen-1920/', label: 'Mijzen 1920' },
];
const BFT = [[0.3,'0 · Calm'],[1.6,'1 · Light air'],[3.4,'2 · Light breeze'],[5.5,'3 · Gentle breeze'],
  [8.0,'4 · Moderate breeze'],[10.8,'5 · Fresh breeze'],[13.9,'6 · Strong breeze'],[17.2,'7 · Near gale'],[20.8,'8 · Gale']];
export const beaufort = (v) => 'Beaufort ' + (BFT.find(b => v < b[0]) || BFT[BFT.length - 1])[1];

function buildUI(cfg, state) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const m = cfg.meta;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="metaScrim"></div>
    <div id="meta">
      <h2>${m.title}</h2>
      <p class="orig">${esc(m.original)}</p>
      <dl>${m.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <a href="${m.link}" ${m.link.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${m.linkText || 'View the original drawing at noord-hollandsarchief.nl'} &#8599;</a>
    </div>
    <nav id="nav">${SITES.map(s => `<a href="${s.href}"${s.href.includes(cfg.slug) ? ' aria-current="page"' : ''}>${s.label}</a>`).join('')}</nav>
    <div id="loading">Building the scene…</div>
    <div id="panel">
      <button id="collapse" aria-label="Collapse panel">▾</button>
      <h1>${esc(cfg.panel.title)}</h1>
      <p class="sub">${esc(cfg.panel.sub || 'drag to orbit, scroll to zoom')}</p>
      ${cfg.controls.map(c => `
        <label class="row" for="c_${c.key}"><span>${esc(c.label)}</span><span><span class="big" id="v_${c.key}"></span><span class="unit">${esc(c.unit || '')}</span></span></label>
        <input id="c_${c.key}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}">
        <div class="hint" id="h_${c.key}"></div>`).join('')}
      <div class="hide-min">
        <div class="stats" id="stats"></div>
        <div class="toggles">${(cfg.buttons || []).map((b, i) => `<button id="b_${i}" class="${b.warn ? 'warn' : ''}" aria-pressed="${b.pressed ? 'true' : 'false'}">${esc(b.label)}</button>`).join('')}</div>
        <p class="note">${esc(cfg.panel.note || '')}</p>
      </div>
    </div>`);
  for (const c of cfg.controls) {
    const el = document.getElementById('c_' + c.key);
    const upd = () => {
      state[c.key] = parseFloat(el.value);
      document.getElementById('v_' + c.key).textContent = c.fmt ? c.fmt(state[c.key]) : state[c.key].toFixed(1);
      document.getElementById('h_' + c.key).textContent = c.hint ? c.hint(state[c.key]) : '';
    };
    el.addEventListener('input', upd); upd();
  }
  (cfg.buttons || []).forEach((b, i) => {
    const el = document.getElementById('b_' + i);
    if (b.pressed !== undefined) state[b.key] = !!b.pressed;
    el.addEventListener('click', () => {
      if (b.pressed !== undefined) {
        const on = el.getAttribute('aria-pressed') !== 'true'; el.setAttribute('aria-pressed', on); state[b.key] = on;
        b.onToggle && b.onToggle(on);
      } else b.onClick && b.onClick();
    });
  });
  const panel = document.getElementById('panel');
  document.getElementById('collapse').addEventListener('click', (e) => {
    panel.classList.toggle('min'); e.currentTarget.textContent = panel.classList.contains('min') ? '▴' : '▾'; });
}

// ---------------------------------------------------------------- water normals
export function makeWaterNormals(N = 256) {
  const waves = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 40; i++) {
    let kx = Math.round((rnd() - 0.5) * 30), ky = Math.round((rnd() - 0.5) * 30);
    if (kx === 0 && ky === 0) kx = 1;
    waves.push({ kx, ky, a: 1 / Math.pow(Math.hypot(kx, ky), 1.3), p: rnd() * Math.PI * 2 });
  }
  const c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let dx = 0, dy = 0;
    for (const w of waves) { const cph = Math.cos(2 * Math.PI * (w.kx * x + w.ky * y) / N + w.p) * w.a * 2 * Math.PI / N; dx += cph * w.kx; dy += cph * w.ky; }
    const nx = -dx * 9, ny = -dy * 9, l = Math.hypot(nx, ny, 1), i = 4 * (y * N + x);
    img.data[i] = (nx / l * .5 + .5) * 255; img.data[i + 1] = (ny / l * .5 + .5) * 255; img.data[i + 2] = (1 / l * .5 + .5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; return t;
}

// ---------------------------------------------------------------- start
export function start(cfg) {
  const state = { wind: 6 };
  buildUI(cfg, state);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = cfg.exposure ?? 0.55;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(cfg.fov ?? 40, innerWidth / innerHeight, 0.1, 9000);
  camera.position.set(...cfg.camera.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...cfg.camera.target);
  controls.enableDamping = true; controls.minDistance = cfg.camera.min ?? 3; controls.maxDistance = cfg.camera.max ?? 140;
  controls.maxPolarAngle = Math.PI * 0.495; controls.update();

  // sky and image-based light
  const sky = cfg.sky || {};
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - (sky.elevation ?? 24)), THREE.MathUtils.degToRad(sky.azimuth ?? 215));
  const mkSky = () => { const s = new Sky(); s.scale.setScalar(20000); const u = s.material.uniforms;
    u.turbidity.value = sky.turbidity ?? 3.5; u.rayleigh.value = sky.rayleigh ?? 2.2; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82; u.sunPosition.value.copy(sun); return s; };
  const skyMesh = mkSky(); scene.add(skyMesh);
  const pmrem = new THREE.PMREMGenerator(renderer); const env = new THREE.Scene(); env.add(mkSky());
  scene.environment = pmrem.fromScene(env).texture;
  if (cfg.fog) scene.fog = new THREE.Fog(cfg.fog.color, cfg.fog.near, cfg.fog.far);

  const sunLight = new THREE.DirectionalLight(0xfff1dd, 2.6);
  const T = new THREE.Vector3(...cfg.camera.target);
  sunLight.position.copy(sun).multiplyScalar(80).add(T); sunLight.target.position.copy(T);
  sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048);
  const S = cfg.shadowSize ?? 25;
  Object.assign(sunLight.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 300 });
  sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.03;
  scene.add(sunLight, sunLight.target, new THREE.HemisphereLight(0xcfdcea, 0x3c4a3a, 0.35));

  // water bodies: {x:[x0,x1], z:[z0,z1], y, color}
  const waterNormals = makeWaterNormals();
  const waters = (cfg.waters || []).map(w => {
    const geo = new THREE.PlaneGeometry(w.x[1] - w.x[0], w.z[1] - w.z[0]);
    const water = new Water(geo, { textureWidth: 1024, textureHeight: 1024, waterNormals, sunDirection: sun.clone(),
      sunColor: 0xfff3e0, waterColor: w.color ?? 0x0f2a28, distortionScale: 0.3, fog: !!cfg.fog });
    water.rotation.x = -Math.PI / 2;
    water.position.set((w.x[0] + w.x[1]) / 2, w.y, (w.z[0] + w.z[1]) / 2);
    water.material.uniforms.size.value = w.size ?? 40;
    water.userData = { ...w };
    scene.add(water); return water;
  });
  const excl = cfg.exclusions || [];   // [x0,x1,z0,z1] boxes where nothing should float
  function waterAt(x, z, margin = 0) {
    for (const w of waters) {
      const d = w.userData;
      if (x > d.x[0] + margin && x < d.x[1] - margin && z > d.z[0] + margin && z < d.z[1] - margin) {
        for (const e of excl) if (x > e[0] - margin && x < e[1] + margin && z > e[2] - margin && z < e[3] + margin) return null;
        return w;
      }
    }
    return null;
  }

  const ctx = { THREE, scene, camera, controls, renderer, sun, sunLight, sky: skyMesh, state, waters, waterAt, updates: [], time: 0, cfg,
    add(fn) { this.updates.push(fn); return fn; } };
  ctx.splash = makeSplashes(ctx);
  ctx.smoke = makeSmokeSystem(ctx);

  // page-specific build
  const page = cfg.build(ctx) || {};

  const amb = cfg.ambient || {};
  if (amb.debris !== false) initDebris(ctx, amb.debrisMax ?? 6);
  if (amb.birds !== false) initBirds(ctx);
  if (amb.fish !== false) initFish(ctx, amb.fishCenter);
  if (amb.whale) initWhale(ctx, amb.whaleCenter);

  const stats = document.getElementById('stats');
  const clock = new THREE.Clock();
  let waterTime = 0, statT = 0;
  const SPEED = Math.max(1, Math.min(40, +(new URLSearchParams(location.search).get('speed') || 1)));   // ?speed=10 fast-forwards (testing)
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    for (let k = 0; k < SPEED; k++) {
      ctx.time += dt;
      for (const fn of ctx.updates) { try { fn(dt, ctx.time); } catch (e) { if (!fn._warned) { fn._warned = 1; console.warn(e); } } }
      page.update && page.update(dt, ctx.time);
    }
    waterTime += dt * (0.35 + state.wind * 0.07);
    for (const w of waters) {
      const u = w.material.uniforms, rough = w.userData.rough ?? 1;
      u.time.value = waterTime * (w.userData.speed ?? 1);
      u.distortionScale.value = (0.05 + state.wind * 0.045) * rough;
      u.size.value = (w.userData.size ?? 40) + state.wind * 2.5 / rough;
    }
    statT -= dt;
    if (statT <= 0 && page.readouts) { statT = 0.1; stats.innerHTML = page.readouts().map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join(''); }
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  document.getElementById('loading')?.remove();
  frame();
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  window.__ctx = ctx;
  return ctx;
}

// ---------------------------------------------------------------- splashes
function makeSplashes(ctx) {
  const splashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const RING = new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2);
  const DROP = new THREE.SphereGeometry(0.018, 5, 4);
  const list = [];
  ctx.add((dt) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]; s.t += dt;
      const r = 0.08 + s.t * 0.9 * s.size; s.ring.scale.set(r, 1, r);
      s.ring.material.opacity = Math.max(0, 0.55 * (1 - s.t / 1.6));
      for (const d of s.drops) { d.userData.v.y -= 9.81 * dt; d.position.addScaledVector(d.userData.v, dt); d.visible = d.position.y > s.y; }
      if (s.t > 1.6) { ctx.scene.remove(s.ring); s.ring.material.dispose(); for (const d of s.drops) { ctx.scene.remove(d); d.material.dispose(); } list.splice(i, 1); }
    }
  });
  return function splash(pos, size = 1, drops = 10) {
    const ring = new THREE.Mesh(RING, splashMat.clone()); ring.position.copy(pos).setY(pos.y + 0.01);
    const ds = [];
    for (let i = 0; i < drops; i++) {
      const d = new THREE.Mesh(DROP, splashMat.clone()); d.position.copy(pos); d.scale.setScalar(Math.sqrt(size));
      const a = rand(0, 6.28), sp = rand(0.4, 1.2) * size;
      d.userData.v = new THREE.Vector3(Math.cos(a) * sp, rand(1.2, 2.4) * Math.sqrt(size), Math.sin(a) * sp);
      ds.push(d); ctx.scene.add(d);
    }
    ctx.scene.add(ring); list.push({ ring, drops: ds, t: 0, y: pos.y, size });
  };
}

// ---------------------------------------------------------------- smoke / steam / spray particles
function makeSmokeSystem(ctx) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const emitters = [];
  ctx.add((dt) => {
    for (const e of emitters) {
      e.acc += dt * e.rate();
      while (e.acc > 1) {
        e.acc -= 1;
        const s = e.pool.find(p => !p.visible); if (!s) break;
        s.visible = true; s.userData.age = 0; s.position.copy(e.pos).add(new THREE.Vector3(rand(-e.jitter, e.jitter), 0, rand(-e.jitter, e.jitter)));
        s.userData.v = e.vel.clone().add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.2, 0.2), rand(-0.3, 0.3)).multiplyScalar(e.spread));
      }
      for (const s of e.pool) {
        if (!s.visible) continue;
        const u = s.userData; u.age += dt;
        const k = u.age / e.life;
        if (k >= 1) { s.visible = false; continue; }
        u.v.x += ctx.state.wind * e.drift * dt;
        u.v.y -= e.gravity * dt;
        u.v.multiplyScalar(1 - e.drag * dt);
        s.position.addScaledVector(u.v, dt);
        s.scale.setScalar(e.size0 + (e.size1 - e.size0) * k);
        s.material.opacity = e.opacity * Math.min(1, k * 8) * (1 - k);
      }
    }
  });
  return function emitter(opts) {
    const e = Object.assign({ pos: new THREE.Vector3(), vel: new THREE.Vector3(0, 2, 0), rate: () => 6, life: 6, size0: 1, size1: 6,
      color: 0x8a8a88, opacity: 0.5, drift: 0.12, gravity: 0, drag: 0.2, jitter: 0.2, spread: 1, count: 80, acc: 0 }, opts);
    e.pool = [];
    for (let i = 0; i < e.count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: e.color, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false; ctx.scene.add(s); e.pool.push(s);
    }
    emitters.push(e); return e;
  };
}

// ---------------------------------------------------------------- ambient: drifting debris
function initDebris(ctx, maxN) {
  const { scene, camera } = ctx;
  const DM = {
    glassGreen: new THREE.MeshPhysicalMaterial({ color: 0x2d6a3a, roughness: 0.06, transparent: true, opacity: 0.72, clearcoat: 1, envMapIntensity: 1.4 }),
    glassBrown: new THREE.MeshPhysicalMaterial({ color: 0x6b3a14, roughness: 0.06, transparent: true, opacity: 0.75, clearcoat: 1, envMapIntensity: 1.4 }),
    label: new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.9 }),
    bag: new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.55, transparent: true, opacity: 0.88, side: THREE.DoubleSide }),
    bagBlue: new THREE.MeshStandardMaterial({ color: 0x5b84a8, roughness: 0.5, side: THREE.DoubleSide }),
    can: new THREE.MeshStandardMaterial({ color: 0xa8231c, roughness: 0.35, metalness: 0.7 }),
    canEnd: new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.9 }),
    foam: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.95 }),
    plank: mat(0x7a6247, 0.9, 0, 0.3),
  };
  const makers = [
    () => { const g = new THREE.Group();
      const prof = [[0,0],[0.038,0],[0.042,0.01],[0.042,0.17],[0.036,0.2],[0.016,0.235],[0.014,0.28],[0.016,0.29],[0,0.29]].map(([r, y]) => new THREE.Vector2(r, y));
      g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 20), Math.random() < 0.6 ? DM.glassGreen : DM.glassBrown));
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.0435, 0.0435, 0.08, 20, 1, true), DM.label); l.position.y = 0.09; g.add(l);
      g.rotation.z = Math.PI / 2 - 0.12; const w = new THREE.Group(); g.position.x = -0.14; w.add(g); return { obj: w, sink: 0.01 }; },
    () => { const geo = new THREE.IcosahedronGeometry(0.16, 2), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i).multiplyScalar(0.7 + Math.random() * 0.55); v.y *= 0.35; p.setXYZ(i, v.x, v.y, v.z); }
      geo.computeVertexNormals(); return { obj: new THREE.Mesh(geo, Math.random() < 0.5 ? DM.bag : DM.bagBlue), sink: 0.02 }; },
    () => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.115, 20), [DM.can, DM.canEnd, DM.canEnd]); c.rotation.z = Math.PI / 2; g.add(c); return { obj: g, sink: 0.012 }; },
    () => ({ obj: new THREE.Mesh(new THREE.BoxGeometry(rand(0.18, 0.32), 0.06, rand(0.12, 0.22)), DM.foam), sink: -0.015 }),
    () => ({ obj: new THREE.Mesh(new THREE.BoxGeometry(rand(0.6, 1.1), 0.035, 0.11), DM.plank), sink: 0.005 }),
  ];
  const list = [];
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), look = new THREE.Vector3();
  function spawn(midway) {
    camera.getWorldDirection(look); fwd.copy(look).setY(0).normalize(); right.set(-fwd.z, 0, fwd.x);
    const pitch = Math.asin(-look.y), half = THREE.MathUtils.degToRad(camera.fov / 2);
    let P = null, w = null;
    for (let k = 0; k < 30 && !w; k++) {
      const dep = Math.max(THREE.MathUtils.degToRad(1.5), pitch + rand(0.12, 0.8) * half);
      const D = THREE.MathUtils.clamp(Math.max(0.5, camera.position.y - 0.5) / Math.tan(dep), 2.5, 45);
      P = camera.position.clone().addScaledVector(fwd, D).addScaledVector(right, rand(-1, 1) * D * 0.15);
      w = ctx.waterAt(P.x, P.z, 0.3);
    }
    if (!w) return;
    const D = P.distanceTo(camera.position);
    const L = D * Math.tan(THREE.MathUtils.degToRad(camera.fov * camera.aspect / 2)) * 1.25 + 3;
    const dir = right.clone().multiplyScalar(Math.random() < 0.5 ? 1 : -1).addScaledVector(fwd, rand(-0.35, 0.35)).normalize();
    const { obj, sink } = pick(makers)(); obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
    obj.scale.setScalar(0.001); scene.add(obj);
    list.push({ obj, sink, w, P, dir, L, s: midway ? rand(-0.6, 0.6) * L : -L, vis: 0, speed: rand(0.14, 0.3), ph: rand(0, 6.28), yaw: rand(0, 6.28), yr: rand(-0.08, 0.08) });
  }
  let next = 4; const tmp = new THREE.Vector3();
  ctx.add((dt, t) => {
    const wind = ctx.state.wind;
    next -= dt; if (next <= 0 && list.length < maxN) { spawn(false); next = rand(8, 20); }
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      d.s += d.speed * (1 + wind * 0.04) * dt; d.yaw += d.yr * dt;
      tmp.copy(d.P).addScaledVector(d.dir, d.s);
      const inside = ctx.waterAt(tmp.x, tmp.z, 0.2) === d.w;
      d.vis += ((inside ? 1 : 0) - d.vis) * Math.min(1, dt * 1.5);
      const y = d.w.position.y - d.sink - (1 - d.vis) * 0.08 + Math.sin(t * 1.6 + d.ph) * (0.012 + wind * 0.0016) * (d.w.userData.rough ?? 1);
      d.obj.position.set(tmp.x, y, tmp.z); d.obj.scale.setScalar(Math.max(0.001, d.vis));
      d.obj.rotation.set(Math.sin(t * 1.3 + d.ph) * (0.06 + wind * 0.008), d.yaw, Math.cos(t * 1.1 + d.ph * 1.7) * (0.05 + wind * 0.008));
      if (d.s > d.L) { scene.remove(d.obj); list.splice(i, 1); }
    }
  });
  setTimeout(() => { spawn(true); spawn(true); spawn(true); }, 50);
}

// ---------------------------------------------------------------- ambient: bird flocks
function initBirds(ctx) {
  const { scene, camera } = ctx;
  const birdMat = new THREE.MeshStandardMaterial({ color: 0x26292c, roughness: 0.9, side: THREE.DoubleSide });
  const wing = (s) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(
    [0,0,0.06, 0,0,-0.07, s*0.55,0,-0.12, 0,0,-0.07, s*0.55,0,-0.12, s*0.32,0,-0.17], 3)); g.computeVertexNormals(); return g; };
  const WL = wing(1), WR = wing(-1), BODY = new THREE.ConeGeometry(0.05, 0.38, 6).rotateX(Math.PI / 2);
  const flocks = []; const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  function spawn() {
    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); right.set(-fwd.z, 0, fwd.x);
    const D = rand(30, 80);
    const P = camera.position.clone().addScaledVector(fwd, D).addScaledVector(right, rand(-0.3, 0.3) * D);
    P.y = Math.max(7, camera.position.y + D * Math.tan(THREE.MathUtils.degToRad(rand(2, camera.fov * 0.42))));
    const dir = right.clone().multiplyScalar(Math.random() < 0.5 ? 1 : -1).addScaledVector(fwd, rand(-0.5, 0.5)).normalize();
    const start = P.clone().addScaledVector(dir, -110);
    const group = new THREE.Group(); group.position.copy(start); group.lookAt(start.clone().add(dir));
    const vee = Math.random() < 0.55, n = Math.floor(rand(5, 14)), birds = [];
    for (let i = 0; i < n; i++) {
      const b = new THREE.Group(); const l = new THREE.Mesh(WL, birdMat), r = new THREE.Mesh(WR, birdMat);
      b.add(new THREE.Mesh(BODY, birdMat), l, r);
      let off; if (vee) { const k = Math.ceil(i / 2), s = i % 2 ? 1 : -1; off = new THREE.Vector3(s * k * 1.1, rand(-0.15, 0.15), -k * 1.3); }
      else off = new THREE.Vector3(rand(-4, 4), rand(-1.5, 1.5), rand(-5, 5));
      b.userData = { l, r, off, wob: rand(0, 6.28), flap: rand(0, 6.28), rate: rand(7, 9), glide: rand(0, 6.28) };
      b.scale.setScalar(vee ? rand(1.6, 1.9) : rand(0.9, 1.2)); group.add(b); birds.push(b);
    }
    scene.add(group); flocks.push({ group, birds, dir, speed: vee ? rand(9, 12) : rand(7, 10), travelled: 0 });
  }
  let next = 6;
  ctx.add((dt, t) => {
    next -= dt; if (next <= 0) { spawn(); next = rand(18, 45); }
    for (let i = flocks.length - 1; i >= 0; i--) {
      const f = flocks[i], step = f.speed * dt; f.travelled += step;
      f.group.position.addScaledVector(f.dir, step); f.group.position.y += Math.sin(t * 0.4 + i) * 0.15 * dt;
      for (const b of f.birds) {
        const u = b.userData;
        b.position.set(u.off.x + Math.sin(t * 0.7 + u.wob) * 0.3, u.off.y + Math.sin(t * 0.9 + u.wob) * 0.25, u.off.z);
        const a = Math.sin(t * 0.35 + u.glide) > 0.55 ? 0.08 : Math.sin(t * u.rate + u.flap) * 0.65;
        u.l.rotation.z = a; u.r.rotation.z = -a;
      }
      if (f.travelled > 220) { scene.remove(f.group); flocks.splice(i, 1); }
    }
  });
}

// ---------------------------------------------------------------- ambient: jumping fish
function initFish(ctx, center) {
  const { scene, controls } = ctx;
  const fishMat = new THREE.MeshStandardMaterial({ color: 0xaab4b8, roughness: 0.25, metalness: 0.75, envMapIntensity: 1.3 });
  const finMat = new THREE.MeshStandardMaterial({ color: 0x46504a, roughness: 0.4, metalness: 0.4, side: THREE.DoubleSide });
  const BODY = new THREE.SphereGeometry(1, 14, 8).scale(0.2, 0.055, 0.045);
  const tri = (p) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g; };
  const TAIL = tri([-0.17,0,0, -0.27,0.07,0, -0.27,-0.07,0]), FIN = tri([0.04,0.05,0, -0.06,0.05,0, -0.03,0.1,0]);
  const schools = []; const axY = new THREE.Vector3(0, 1, 0);
  function spawn() {
    const C = center ? new THREE.Vector3(...center) : controls.target.clone(); C.y = 0;
    let P = null, w = null;
    for (let k = 0; k < 40 && !w; k++) {
      const r = 3.5 + Math.pow(Math.random(), 1.5) * 12, a = rand(0, 6.28);
      P = C.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); w = ctx.waterAt(P.x, P.z, 1.5);
    }
    if (!w) return;
    const hd = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2, rand(0, 6.28)), n = Math.floor(rand(3, 10)), fish = [];
    let delay = 0;
    for (let i = 0; i < n; i++) {
      const f = new THREE.Group(); f.add(new THREE.Mesh(BODY, fishMat), new THREE.Mesh(FIN, finMat));
      const tail = new THREE.Mesh(TAIL, finMat); f.add(tail); f.userData.tail = tail; f.scale.setScalar(rand(0.75, 1.25)); f.visible = false; scene.add(f);
      const st = P.clone().add(new THREE.Vector3(rand(-1.5, 1.5), 0, rand(-1.5, 1.5))).addScaledVector(hd, i * rand(0.3, 0.7)); st.y = w.position.y;
      const h = rand(0.25, 0.75);
      fish.push({ f, st, dir: hd.clone().applyAxisAngle(axY, rand(-0.35, 0.35)), len: rand(0.7, 1.6), h, dur: 2 * Math.sqrt(2 * h / 9.81), delay, t: -1, sp: false });
      delay += rand(0.08, 0.6); if (Math.random() < 0.3) delay += rand(0.6, 1.4);
    }
    schools.push({ fish, t: 0, end: delay + 2.5 });
  }
  let next = 4;
  ctx.add((dt) => {
    next -= dt; if (next <= 0) { spawn(); next = rand(9, 24); }
    for (let i = schools.length - 1; i >= 0; i--) {
      const s = schools[i]; s.t += dt;
      for (const j of s.fish) {
        const tt = s.t - j.delay; if (tt < 0) continue;
        if (j.t < 0) { j.t = 0; j.f.visible = true; ctx.splash(j.st, 0.7); }
        j.t = tt; const u = j.t / j.dur;
        if (u >= 1) { if (!j.sp) { j.sp = true; j.f.visible = false; ctx.splash(j.st.clone().addScaledVector(j.dir, j.len), 0.9); } continue; }
        const p = j.st.clone().addScaledVector(j.dir, j.len * u); p.y = j.st.y + 4 * j.h * u * (1 - u) - 0.03;
        j.f.position.copy(p); j.f.rotation.set(0, -Math.atan2(j.dir.z, j.dir.x), 0);
        j.f.rotateZ(Math.atan2(4 * j.h * (1 - 2 * u), j.len)); j.f.rotateX(Math.sin(j.t * 9) * 0.15);
        j.f.userData.tail.rotation.y = Math.sin(j.t * 30) * 0.5;
      }
      if (s.t > s.end) { for (const j of s.fish) scene.remove(j.f); schools.splice(i, 1); }
    }
  });
}

// ---------------------------------------------------------------- ambient: a whale surfacing about once a minute
function initWhale(ctx, center) {
  const { scene, controls } = ctx;
  const L = 8.5, g = new THREE.Group(), prof = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40;
    let r = Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.62))), 0.75); r = Math.max(r * (1 - 0.72 * Math.pow(t, 2.6)), 0);
    if (i === 0) r = 0; if (i === 40) r = 0.16; prof.push(new THREE.Vector2(r, L / 2 - t * L)); }
  const body = new THREE.LatheGeometry(prof, 28).rotateZ(-Math.PI / 2).scale(1, 0.82, 1);
  const pos = body.attributes.position, col = [], top = new THREE.Color(0x2b3236), belly = new THREE.Color(0xc9ccc8), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { c.copy(top).lerp(belly, THREE.MathUtils.smoothstep(-pos.getY(i), -0.15, 0.35) * (pos.getX(i) > -3 ? 0.85 : 0.35)); col.push(c.r, c.g, c.b); }
  body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b3236, roughness: 0.35, metalness: 0.08, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(body, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.08, envMapIntensity: 1.2 })));
  const ds = new THREE.Shape(); ds.moveTo(0, 0); ds.lineTo(-0.7, 0); ds.quadraticCurveTo(-0.55, 0.25, -0.75, 0.42); ds.quadraticCurveTo(-0.3, 0.3, 0, 0);
  const dorsal = new THREE.Mesh(new THREE.ExtrudeGeometry(ds, { depth: 0.06, bevelEnabled: false }).translate(0, 0, -0.03), dark); dorsal.position.set(-1.7, 0.62, 0); g.add(dorsal);
  for (const s of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 2.4).translate(0, 0, s * 1.2), dark); fin.position.set(1.7, -0.45, s * 0.65); fin.rotation.set(s * 0.45, s * 0.35, 0); g.add(fin); }
  const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.quadraticCurveTo(-0.3, 0.6, -0.9, 1.35); fs.quadraticCurveTo(-0.55, 0.7, -0.35, 0); fs.quadraticCurveTo(-0.55, -0.7, -0.9, -1.35); fs.quadraticCurveTo(-0.3, -0.6, 0, 0);
  const flukes = new THREE.Mesh(new THREE.ExtrudeGeometry(fs, { depth: 0.07, bevelEnabled: false }).translate(0, 0, -0.035).rotateX(Math.PI / 2), dark);
  flukes.position.set(-L / 2 + 0.05, 0, 0); g.add(flukes);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); g.visible = false; scene.add(g);
  const blow = ctx.smoke({ count: 220, rate: () => 0, life: 3, size0: 0.3, size1: 2.2, color: 0xffffff, opacity: 0.7, vel: new THREE.Vector3(0, 7, 0), gravity: 3.5, drag: 0.6, drift: 0.06, spread: 2.5, jitter: 0.1 });
  const W = { active: false, t: 0, dur: 14 };
  function spotOK(P, dir) {
    for (let s = -6; s <= 14; s += 1) for (const lat of [-2.5, 0, 2.5]) {
      if (ctx.waterAt(P.x + dir.x * s - dir.z * lat, P.z + dir.z * s + dir.x * lat, 0.5) !== W.w) return false;
    }
    return true;
  }
  function spawn() {
    const C = center ? new THREE.Vector3(...center) : controls.target.clone(); C.y = 0;
    for (let k = 0; k < 80; k++) {
      const r = rand(10, 24), a = rand(0, 6.28), P = C.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      const w = ctx.waterAt(P.x, P.z, 2); if (!w) continue;
      const heading = rand(0, 6.28), dir = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
      W.w = w; if (!spotOK(P, dir)) continue;
      Object.assign(W, { active: true, t: 0, P, dir, heading, y0: w.position.y, blown: false, s1: false, s2: false }); g.visible = true; return true;
    }
    return false;
  }
  let next = 15;
  ctx.add((dt) => {
    if (!W.active) { next -= dt; if (next <= 0) next = spawn() ? 60 : 5; return; }
    W.t += dt; const u = W.t / W.dur;
    if (u >= 1) { W.active = false; g.visible = false; return; }
    const pitch = (16 * (1 - ss(0, 0.3, u)) - 14 * ss(0.3, 0.6, u) - 64 * ss(0.6, 0.86, u) - 8 * ss(0.86, 1, u)) * D2R;
    const depth = 2.6 - 2.05 * ss(0, 0.3, u) + 0.15 * ss(0.3, 0.6, u) + 3.6 * ss(0.84, 1, u);
    const fwd = 7.5 * ss(0, 0.75, u) + 1.5 * ss(0.75, 1, u);
    const anchor = W.P.clone().addScaledVector(W.dir, fwd); anchor.y = W.y0 - depth;
    const cen = anchor.clone().addScaledVector(W.dir, 1.6 * Math.cos(pitch)); cen.y += 1.6 * Math.sin(pitch);
    g.position.copy(cen); g.rotation.set(0, -W.heading, 0); g.rotateZ(pitch); g.rotateX(Math.sin(W.t * 0.6) * 0.04);
    flukes.rotation.z = Math.sin(W.t * 1.3) * 0.1 - 0.35 * ss(0.62, 0.85, u);
    const hole = new THREE.Vector3(2.4, 0.75, 0).applyQuaternion(g.quaternion).add(g.position);
    const nose = new THREE.Vector3(4.25, 0, 0).applyQuaternion(g.quaternion).add(g.position);
    if (!W.s1 && nose.y > W.y0) { W.s1 = true; ctx.splash(nose.clone().setY(W.y0), 2.6); }
    if (!W.blown && hole.y > W.y0 + 0.05) { W.blown = true; blow.pos.copy(hole); blow.acc = 140; }
    if (!W.s2 && u > 0.88) { W.s2 = true; ctx.splash(anchor.clone().setY(W.y0), 3.8); }
  });
}
