/* ───────────── 기본 설정 ───────────── */
const LC = '#00a84d';                       // 노선 색
const FONT = '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo","Noto Sans CJK KR",sans-serif';
const CARS = [-20, 0, 20];                  // 객차 중심 x
const DOORS = [-7.2, -2.4, 2.4, 7.2];       // 객차 안 출입문 x
const ZC = -1.7;                            // 객차 중심 z
const doorXs = []; CARS.forEach(c => DOORS.forEach(d => doorXs.push(c + d)));
const LIGHT_K = 4.2, EXPOSURE = 0.74;         // 조명 띠 밝기(HDR), 노출

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = EXPOSURE;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030405);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 140);
camera.rotation.order = 'YXZ';
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const sG = new THREE.Group(), tG = new THREE.Group(); scene.add(sG, tG);   // 역(고정)과 열차(움직임)
const statS = new THREE.Group(), statT = new THREE.Group(); let stat = statS;   // 정적 메시(나중에 병합)
const TL = 544, TRAVEL = 704;                     // 터널 길이(한쪽), 역 사이 거리. 16m 무늬의 배수여야 이음매가 안 보인다
const dyn = new THREE.Group(); scene.add(dyn);     // 움직이는 메시(문)
const blocks = [];                                 // 충돌 상자
const block = (x1, x2, z1, z2, o = {}) => blocks.push({ x1: Math.min(x1, x2), x2: Math.max(x1, x2), z1: Math.min(z1, z2), z2: Math.max(z1, z2), ...o });

/* ───────────── 주변 반사: 실제 장면을 찍어 상자 모양 공간에 맞춰 비춘다 ───────────── */
const ZONES = { p: { min: new THREE.Vector3(-400, 0, 0), max: new THREE.Vector3(400, 3, 7.5), pos: new THREE.Vector3(0, 1.5, 3.75), mats: [] },
                t: { min: new THREE.Vector3(-400, 0, -3.16), max: new THREE.Vector3(400, 2.19, -0.24), pos: new THREE.Vector3(0, 1.35, -1.7), mats: [] } };
let ZONE = 'p';
function zoned(m) {
  const z = ZONES[ZONE]; z.mats.push(m);
  m.onBeforeCompile = sh => {
    sh.uniforms.boxMin = { value: z.min }; sh.uniforms.boxMax = { value: z.max }; sh.uniforms.probePos = { value: z.pos };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n\tvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform vec3 boxMin;\nuniform vec3 boxMax;\nuniform vec3 probePos;')
      .replace('#include <envmap_physical_pars_fragment>', THREE.ShaderChunk.envmap_physical_pars_fragment.replace('reflectVec = inverseTransformDirection( reflectVec, viewMatrix );',
        `reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			if ( all( greaterThan( vWPos, boxMin - 0.05 ) ) && all( lessThan( vWPos, boxMax + 0.05 ) ) ) {
				vec3 rb1 = ( boxMax - vWPos ) / reflectVec, rb0 = ( boxMin - vWPos ) / reflectVec;
				float fa = min( min( reflectVec.x > 0.0 ? rb1.x : rb0.x, reflectVec.y > 0.0 ? rb1.y : rb0.y ), reflectVec.z > 0.0 ? rb1.z : rb0.z );
				if ( fa > 0.0 && fa < 1000.0 ) reflectVec = normalize( vWPos + reflectVec * fa - probePos );
			}`));
  };
  m.customProgramCacheKey = () => 'box' ;
  return m;
}
function captureProbes() {
  const cap = (z, size) => { const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType }), cam = new THREE.CubeCamera(0.05, 120, rt); cam.position.copy(z.pos); cam.update(renderer, scene); const pm = pmrem.fromCubemap(rt.texture); rt.dispose(); return pm.texture; };
  const p = cap(ZONES.p, 512), t = cap(ZONES.t, 256); sG.position.x = 304; sG.updateMatrixWorld(true); const tt = cap(ZONES.t, 256); sG.position.x = 0;      // 열차는 역과 터널 두 가지 반사를 따로 찍는다
  for (const o of [ZONES.p.tex, ZONES.t.tex, ZONES.t.tun]) if (o) o.dispose();
  ZONES.p.tex = p; ZONES.t.tex = t; ZONES.t.tun = tt; ZONES.t.cur = null;
  for (const m of ZONES.p.mats) { if (!m.envMap) m.needsUpdate = true; m.envMap = p; }
  scene.environment = p; setTrainEnv(false);
}
function setTrainEnv(tun) { const z = ZONES.t, tex = tun ? z.tun : z.tex; if (!tex || z.cur === tex) return; z.cur = tex; for (const m of z.mats) { if (!m.envMap) m.needsUpdate = true; m.envMap = tex; } }

/* ───────────── 절차적 표면 재질(색·요철·거칠기) ───────────── */
const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const hash2 = (x, y, s) => { let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 974711)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const vn = (x, y, per, s) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = (a, b) => hash2(((a % per) + per) % per, ((b % per) + per) % per, s);
  return lerp(lerp(w(xi, yi), w(xi + 1, yi), u), lerp(w(xi, yi + 1), w(xi + 1, yi + 1), u), v); };
const fbm = (x, y, per, s, oct = 4) => { let a = 0, amp = 0.5, f = 1, t = 0; for (let o = 0; o < oct; o++) { a += amp * vn(x * f, y * f, per * f, s + o); t += amp; amp *= 0.5; f *= 2; } return a / t; };
function pix(size, fn, sy = size) {          // fn(u,v,x,y) → [r,g,b,높이0~1,거칠기0~1]
  const cs = [cnv(size, sy), cnv(size, sy), cnv(size, sy)], gs = cs.map(c => c.getContext('2d')), ims = gs.map(g => g.createImageData(size, sy));
  for (let y = 0; y < sy; y++) for (let x = 0; x < size; x++) { const o = fn(x / size, y / sy, x, y), i = (y * size + x) * 4;
    ims[0].data[i] = o[0]; ims[0].data[i + 1] = o[1]; ims[0].data[i + 2] = o[2]; ims[0].data[i + 3] = 255;
    const h = clamp(o[3]) * 255, r = clamp(o[4]) * 255; ims[1].data[i] = ims[1].data[i + 1] = ims[1].data[i + 2] = h; ims[1].data[i + 3] = 255; ims[2].data[i] = ims[2].data[i + 1] = ims[2].data[i + 2] = r; ims[2].data[i + 3] = 255; }
  gs.forEach((g, k) => g.putImageData(ims[k], 0, 0)); return { c: cs[0], h: cs[1], r: cs[2] };
}
function normalFrom(hc, k) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data, out = cnv(w, h), og = out.getContext('2d'), im = og.createImageData(w, h), d = im.data, H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = (H(x + 1, y) - H(x - 1, y)) * k, dy = (H(x, y + 1) - H(x, y - 1)) * k, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255; }
  og.putImageData(im, 0, 0); return out;
}
const toTex = (c, srgb, rep = true) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
function surface(set, nk) { return { map: toTex(set.c, true), normalMap: nk ? toTex(normalFrom(set.h, nk), false) : null, roughnessMap: toTex(set.r, false) }; }
function makeSurfaces() {
  const S = {};
  S.floor = surface(pix(512, (u, v, x, y) => { const tx = Math.floor(u * 2), ty = Math.floor(v * 2), fu = (u * 2) % 1, fv = (v * 2) % 1, e = Math.min(fu, 1 - fu, fv, 1 - fv) * 256, gr = e < 1.5;
    const sp = hash2(x, y, 1), sp2 = hash2(x >> 1, y >> 1, 2); let g = 184 + (hash2(tx, ty, 5) - 0.5) * 9 + (fbm(u * 8, v * 8, 8, 3) - 0.5) * 20; if (sp < 0.05) g -= 40; else if (sp > 0.955) g += 26; if (sp2 < 0.035) g -= 24;
    return gr ? [104, 100, 92, 0, 0.9] : [g + 5, g + 2, g - 8, e < 4 ? 0.7 + e / 14 : 1, clamp(0.13 + fbm(u * 6, v * 6, 6, 9) * 0.26 + (sp < 0.05 ? 0.12 : 0))]; }), 2.2);
  const blockFn = shape => (u, v, x, y) => { const e = Math.min(u, 1 - u, v, 1 - v) * 256, d = fbm(u * 6, v * 6, 6, 4), h = e < 2 ? 0 : shape(u, v), k = (0.82 + 0.18 * d) * (h > 0.45 ? 1.05 : 0.9); return [224 * k, 172 * k, 12 * k, h, 0.55 + d * 0.2]; };
  S.dot = surface(pix(256, blockFn((u, v) => { const d = Math.hypot((u * 6) % 1 - 0.5, (v * 6) % 1 - 0.5) / 0.29; return d < 1 ? 0.5 + 0.5 * Math.sqrt(1 - d * d) : 0.3; })), 3.5);
  const bar = (a, b) => (Math.abs((a * 4) % 1 - 0.5) < 0.27 && b > 0.06 && b < 0.94) ? 0.95 : 0.3;
  S.lineV = surface(pix(256, blockFn((u, v) => bar(u, v))), 3.5); S.lineH = surface(pix(256, blockFn((u, v) => bar(v, u))), 3.5);
  S.wall = surface(pix(512, (u, v, x, y) => { const ty = Math.floor(v * 2), fv = (v * 2) % 1, e = Math.min(Math.min(u, 1 - u) * 512, Math.min(fv, 1 - fv) * 256), j = e < 1.6, t = (hash2(0, ty, 7) - 0.5) * 5 + (fbm(u * 4, v * 4, 4, 2) - 0.5) * 5;
    return j ? [96, 94, 90, 0, 0.8] : [234 + t, 231 + t, 222 + t, (e < 4 ? 0.8 + e / 20 : 1) - 0.1 * fbm(u * 3, v * 3, 3, 8), 0.16 + fbm(u * 5, v * 5, 5, 6) * 0.1]; }), 1.6);
  S.dado = surface(pix(256, (u, v, x, y) => { const sp = hash2(x, y, 3); let g = 46 + (fbm(u * 8, v * 8, 8, 1) - 0.5) * 22; if (sp < 0.06) g += 50; else if (sp > 0.93) g -= 18; return [g, g, g + 3, 1, 0.14 + fbm(u * 4, v * 4, 4, 5) * 0.12]; }), 0);
  S.ceil = surface(pix(512, (u, v, x, y) => { const fu = (u * 2) % 1, fv = (v * 2) % 1, e = Math.min(fu, 1 - fu, fv, 1 - fv) * 256, j = e < 1.5, perf = e > 22 && x % 8 < 2 && y % 8 < 2, g = 206 + (fbm(u * 4, v * 4, 4, 3) - 0.5) * 6;
    return j ? [70, 72, 74, 0, 0.7] : perf ? [92, 94, 96, 0.5, 0.8] : [g, g + 1, g + 2, 1, 0.46]; }), 1.2);
  S.steel = surface(pix(256, (u, v, x, y) => { const st = vn(x * 0.5, y * 0.03, 128, 4) * 0.6 + vn(x * 0.2, y * 0.015, 64, 9) * 0.4, g = 200 + (st - 0.5) * 7; return [g, g + 2, g + 5, st, 0.24 + st * 0.12]; }), 0);
  S.tfloor = surface(pix(512, (u, v, x, y) => { const sp = hash2(x, y, 1), sp2 = hash2(x >> 1, y >> 1, 6); let c = [118, 122, 128]; if (sp < 0.07) c = [168, 172, 178]; else if (sp > 0.93) c = [78, 82, 88]; else if (sp2 < 0.04) c = [96, 108, 132];
    const d = (fbm(u * 6, v * 6, 6, 2) - 0.5) * 12; return [c[0] + d, c[1] + d, c[2] + d, hash2(x, y, 8) * 0.5, 0.36 + fbm(u * 5, v * 5, 5, 3) * 0.2]; }), 0.4);
  S.twall = surface(pix(256, (u, v) => { const d = (fbm(u * 4, v * 4, 4, 1) - 0.5) * 4; return [232 + d, 230 + d, 222 + d, fbm(u * 40, v * 40, 40, 5, 2), 0.34]; }), 0.35);
  S.fabric = surface(pix(256, (u, v, x, y) => { const p = Math.sin(x * 0.785) * Math.sin(y * 0.785), fl = hash2(x >> 1, y >> 1, 3) < 0.05 ? 26 : 0, st = ((x + y) >> 3) % 2 ? 6 : -6, g = 205 + p * 22 + fl + st; return [g, g, g, 0.5 + 0.5 * p, 0.96]; }), 2.0);
  S.tunnel = surface(pix(512, (u, v) => { const n = fbm(u * 6, v * 6, 6, 1), stn = fbm(u * 30, v * 1.5, 30, 7) > 0.6 ? 0.72 : 1, g = (30 + n * 34) * stn; return [g, g, g + 2, fbm(u * 24, v * 24, 24, 3), 0.92]; }), 3);
  S.wood = surface(pix(256, (u, v) => { const gr = fbm(u * 3, v * 42, 256, 2), k = 0.82 + 0.34 * gr; return [152 * k, 112 * k, 72 * k, gr, 0.42 + gr * 0.2]; }), 0.8);
  S.stone = surface(pix(256, (u, v, x, y) => { const sp = hash2(x, y, 2); let g = 150 + (fbm(u * 8, v * 8, 8, 4) - 0.5) * 26; if (sp < 0.08) g -= 34; else if (sp > 0.94) g += 28; return [g, g, g - 3, hash2(x, y, 5), 0.72]; }), 0.8);
  return S;
}

/* ───────────── 표지판·광고 그림 ───────────── */
let dry = true; const seen = new Set();
function cv(w, h, draw, repeat) {
  const c = cnv(w, h); draw(c.getContext('2d'), w, h);
  if (dry) return null;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function tx(g, s, x, y, size, color, o = {}) {
  for (const ch of s) seen.add(ch);
  g.font = `${o.w || 700} ${size}px ${FONT}`; g.fillStyle = color; g.textAlign = o.a || 'center'; g.textBaseline = o.b || 'middle';
  if (o.ls) { try { g.letterSpacing = o.ls + 'px'; } catch (e) {} }
  if (o.max) { const m = g.measureText(s).width; if (m > o.max) { g.font = `${o.w || 700} ${size * o.max / m}px ${FONT}`; } }
  g.fillText(s, x, y);
  if (o.ls) { try { g.letterSpacing = '0px'; } catch (e) {} }
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const circ = (g, x, y, r, f) => { g.fillStyle = f; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
const poly = (g, pts, f) => { g.fillStyle = f; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); };
const stroke = (g, pts, w, c) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); };
function arrow(g, cx, cy, len, wid, up, color) {
  g.save(); g.translate(cx, cy); if (!up) g.rotate(Math.PI); g.fillStyle = color;
  g.beginPath(); g.moveTo(0, -len / 2); g.lineTo(wid / 2, -len / 2 + wid * 0.55); g.lineTo(wid * 0.2, -len / 2 + wid * 0.55); g.lineTo(wid * 0.2, len / 2);
  g.lineTo(-wid * 0.2, len / 2); g.lineTo(-wid * 0.2, -len / 2 + wid * 0.55); g.lineTo(-wid / 2, -len / 2 + wid * 0.55); g.closePath(); g.fill(); g.restore();
}
const STN = ['잠실새내', '종합운동장', '삼성', '선릉', '역삼', '강남', '교대', '서초', '방배'];
// 광고: 모두 지어낸 브랜드이고 그림도 직접 그린다. art(g, 가운데x, 가운데y, 크기배율)
const ART = {
  bowl: (g, x, y, s) => { g.save(); g.translate(x, y); g.scale(s, s); stroke(g, [[-70, -150], [-55, -120], [-70, -92]], 9, 'rgba(255,255,255,.85)'); stroke(g, [[0, -165], [15, -132], [0, -100]], 9, 'rgba(255,255,255,.85)'); stroke(g, [[70, -150], [85, -120], [70, -92]], 9, 'rgba(255,255,255,.85)');
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, -40, 150, 34, 0, 0, 7); g.fill(); g.fillStyle = '#f6e7c9'; g.beginPath(); g.ellipse(0, -40, 132, 25, 0, 0, 7); g.fill(); circ(g, -50, -44, 20, '#e2572b'); circ(g, 8, -36, 24, '#f2b134'); circ(g, 62, -46, 17, '#4f9d4d');
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-150, -38); g.bezierCurveTo(-140, 90, 140, 90, 150, -38); g.closePath(); g.fill(); g.fillStyle = '#e2572b'; g.fillRect(-110, 18, 220, 14); rr(g, -62, 82, 124, 20, 8); g.fillStyle = '#fff'; g.fill();
    stroke(g, [[92, -150], [178, -52]], 9, '#3a2a1e'); stroke(g, [[120, -160], [196, -66]], 9, '#3a2a1e'); g.restore(); },
  card: (g, x, y, s) => { g.save(); g.translate(x, y); g.scale(s, s); g.rotate(-0.2); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 30; g.shadowOffsetY = 14; rr(g, -150, -95, 300, 190, 20); g.fillStyle = '#f4f7fb'; g.fill(); g.shadowColor = 'transparent';
    rr(g, -118, -52, 54, 40, 7); g.fillStyle = '#e2b53a'; g.fill(); g.fillStyle = '#b9c4d4'; for (let i = 0; i < 4; i++) g.fillRect(-118 + i * 62, 30, 48, 12); g.fillStyle = '#2a6df4'; g.beginPath(); g.arc(104, -50, 24, 0, 7); g.fill(); g.restore();
    circ(g, x + 150 * s, y + 96 * s, 46 * s, '#ffd45a'); circ(g, x + 150 * s, y + 96 * s, 32 * s, '#f2b61e'); circ(g, x + 96 * s, y + 132 * s, 30 * s, '#ffd45a'); },
  score: (g, x, y, s) => { g.save(); g.translate(x, y); g.scale(s, s); g.lineWidth = 22; g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(0, 0, 130, 0, 7); g.stroke(); g.strokeStyle = '#ffd23f'; g.beginPath(); g.arc(0, 0, 130, -1.57, 3.9); g.stroke();
    tx(g, '990', 0, -4, 104, '#fff', { w: 900 }); tx(g, '목표 점수', 0, 62, 26, '#ffd23f', { w: 700 }); poly(g, [[-70, -150], [0, -184], [70, -150], [0, -116]], '#ffd23f'); g.fillStyle = '#ffd23f'; g.fillRect(-34, -136, 68, 22); g.restore(); },
  scale: (g, x, y, s) => { g.save(); g.translate(x, y); g.scale(s, s); const c = '#c9a45c'; stroke(g, [[0, -150], [0, 120]], 10, c); stroke(g, [[-130, -110], [130, -110]], 8, c); circ(g, 0, -150, 14, c); g.fillStyle = c; g.fillRect(-70, 116, 140, 14);
    for (const k of [-1, 1]) { stroke(g, [[k * 130, -110], [k * 130 - 52, 0], [k * 130 + 52, 0], [k * 130, -110]], 4, c); g.fillStyle = c; g.beginPath(); g.moveTo(k * 130 - 60, 0); g.bezierCurveTo(k * 130 - 50, 46, k * 130 + 50, 46, k * 130 + 60, 0); g.closePath(); g.fill(); } g.restore(); },
  skyline: (g, x, y, s) => { g.save(); g.translate(x, y); g.scale(s, s); const r = rng(77); circ(g, 120, -150, 44, 'rgba(255,236,190,.9)');
    [[-170, 150, 62], [-104, 250, 70], [-30, 310, 78], [52, 220, 66], [122, 280, 72]].forEach(([bx, bh, bw]) => { g.fillStyle = '#1b2440'; g.fillRect(bx, 160 - bh, bw, bh); for (let j = 0; j < bh / 22 - 1; j++) for (let i = 0; i < 4; i++) { g.fillStyle = r() < 0.55 ? '#ffe39a' : '#2c3a63'; g.fillRect(bx + 8 + i * (bw - 16) / 4, 172 - bh + j * 22, (bw - 16) / 4 - 5, 12); } });
    for (let i = 0; i < 9; i++) circ(g, -190 + i * 48, 164, 30, '#2f6b47'); g.restore(); },
  bottle: (g, x, y, s) => { g.save(); g.translate(x, y); g.scale(s, s); g.shadowColor = 'rgba(0,60,20,.3)'; g.shadowBlur = 26; g.shadowOffsetX = 12; g.fillStyle = '#2f8f5a'; g.beginPath(); g.moveTo(-22, -190); g.lineTo(22, -190); g.lineTo(22, -120); g.bezierCurveTo(60, -90, 62, -60, 62, -30); g.lineTo(62, 170); g.quadraticCurveTo(62, 190, 42, 190); g.lineTo(-42, 190); g.quadraticCurveTo(-62, 190, -62, 170); g.lineTo(-62, -30); g.bezierCurveTo(-62, -60, -60, -90, -22, -120); g.closePath(); g.fill(); g.shadowColor = 'transparent';
    g.fillStyle = '#d7dadd'; g.fillRect(-24, -200, 48, 26); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(-48, -20, 14, 190); rr(g, -62, 0, 124, 110, 4); g.fillStyle = '#f6f8f4'; g.fill(); tx(g, '참맑은', 0, 40, 34, '#1f6b42', { w: 900 }); g.fillStyle = '#2f8f5a'; g.fillRect(-40, 66, 80, 3); tx(g, '16.5%', 0, 86, 18, '#1f6b42', { w: 500 }); g.restore(); },
  sword: (g, x, y, s) => { g.save(); g.translate(x, y); g.scale(s, s); for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; poly(g, [[0, 0], [Math.cos(a - 0.1) * 230, Math.sin(a - 0.1) * 230], [Math.cos(a + 0.1) * 230, Math.sin(a + 0.1) * 230]], 'rgba(255,255,255,.1)'); }
    g.rotate(0.6); poly(g, [[-18, 80], [18, 80], [18, -150], [0, -196], [-18, -150]], '#eef2f8'); poly(g, [[0, 80], [18, 80], [18, -150], [0, -196]], '#c5cfdd'); rr(g, -70, 76, 140, 26, 10); g.fillStyle = '#ffc93c'; g.fill(); rr(g, -14, 100, 28, 78, 8); g.fillStyle = '#7a4a28'; g.fill(); circ(g, 0, 188, 20, '#ffc93c'); g.restore(); },
  crest: (g, x, y, s) => { g.save(); g.translate(x, y); g.scale(s, s); circ(g, 0, 0, 150, '#1d4f9c'); circ(g, 0, 0, 128, '#fff'); circ(g, 0, 0, 116, '#1d4f9c'); poly(g, [[-70, -30], [0, -8], [0, 70], [-70, 48]], '#fff'); poly(g, [[70, -30], [0, -8], [0, 70], [70, 48]], '#dbe6f7'); poly(g, [[0, -86], [16, -52], [-16, -52]], '#ffd23f'); tx(g, 'HANBIT UNIV.', 0, 96, 17, '#fff', { w: 700, ls: 2 }); g.restore(); },
  sparkle: (g, x, y, s) => { g.save(); g.translate(x, y); g.scale(s, s); const st = (cx, cy, r, c) => poly(g, [[cx, cy - r], [cx + r * 0.22, cy - r * 0.22], [cx + r, cy], [cx + r * 0.22, cy + r * 0.22], [cx, cy + r], [cx - r * 0.22, cy + r * 0.22], [cx - r, cy], [cx - r * 0.22, cy - r * 0.22]], c);
    circ(g, 0, 10, 140, 'rgba(255,255,255,.55)'); g.fillStyle = '#f7a8b8'; g.beginPath(); g.moveTo(0, -110); g.bezierCurveTo(90, 0, 80, 110, 0, 110); g.bezierCurveTo(-80, 110, -90, 0, 0, -110); g.fill(); g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(-30, 30, 14, 34, 0.4, 0, 7); g.fill(); st(120, -90, 46, '#fff'); st(-126, -40, 30, '#fff'); st(96, 96, 26, '#ffe08a'); g.restore(); },
  plane: (g, x, y, s) => { g.save(); g.translate(x, y); g.scale(s, s); for (const [cx, cy, r] of [[-120, 90, 60], [-50, 110, 78], [40, 100, 64], [130, 120, 54], [-150, -120, 34], [-110, -112, 44]]) circ(g, cx, cy, r, 'rgba(255,255,255,.9)');
    g.rotate(-0.32); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, 170, 28, 0, 0, 7); g.fill(); poly(g, [[-20, 0], [-90, 110], [-50, 110], [50, 0]], '#e8eef6'); poly(g, [[-20, 0], [-80, -90], [-50, -90], [40, 0]], '#f4f7fb'); poly(g, [[-150, -4], [-190, -70], [-160, -70], [-110, -6]], '#ff7a45'); g.fillStyle = '#7fb7ea'; for (let i = 0; i < 7; i++) g.fillRect(-40 + i * 24, -8, 12, 9); g.restore(); },
  gap: (g, x, y, s) => { g.save(); g.translate(x, y); g.scale(s, s); poly(g, [[0, -190], [176, 110], [-176, 110]], '#111'); poly(g, [[0, -146], [138, 88], [-138, 88]], '#ffcf00'); g.fillStyle = '#111'; g.fillRect(-90, 30, 70, 34); g.fillRect(34, 30, 60, 34); g.beginPath(); g.ellipse(-8, 10, 40, 16, -0.5, 0, 7); g.fill(); g.fillRect(-16, -84, 20, 62); circ(g, -6, -4, 0, '#111'); g.restore(); },
  cup: (g, x, y, s) => { g.save(); g.translate(x, y); g.scale(s, s); stroke(g, [[-30, -170], [-14, -138], [-30, -108]], 9, 'rgba(255,255,255,.7)'); stroke(g, [[26, -176], [42, -144], [26, -114]], 9, 'rgba(255,255,255,.7)'); poly(g, [[-84, -70], [84, -70], [62, 150], [-62, 150]], '#f7f1e6'); rr(g, -96, -96, 192, 32, 10); g.fillStyle = '#3a251a'; g.fill(); poly(g, [[-78, -8], [78, -8], [70, 74], [-70, 74]], '#6b4028'); circ(g, 0, 32, 26, '#f7f1e6'); g.restore(); },
  eye: (g, x, y, s) => { g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-170, 0); g.quadraticCurveTo(0, -130, 170, 0); g.quadraticCurveTo(0, 130, -170, 0); g.fill(); circ(g, 0, 0, 70, '#16879a'); circ(g, 0, 0, 34, '#0b2e36'); circ(g, -20, -22, 14, '#fff'); stroke(g, [[-200, -70], [-150, -110]], 8, '#fff'); stroke(g, [[200, -70], [150, -110]], 8, '#fff'); stroke(g, [[0, -150], [0, -190]], 8, '#fff'); g.restore(); },
  tree: (g, x, y, s) => { g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = '#6b4a2e'; g.fillRect(-14, 20, 28, 150); circ(g, 0, -40, 110, '#fff'); circ(g, -70, 10, 66, '#fff'); circ(g, 72, 6, 70, '#fff'); for (const [cx, cy, c] of [[-40, -70, '#ff8a3c'], [30, -90, '#ffd23f'], [70, -10, '#ff8a3c'], [-74, 14, '#ffd23f'], [0, -10, '#2f8f5a']]) { circ(g, cx, cy, 22, c); poly(g, [[cx - 12, cy + 16], [cx + 12, cy + 16], [cx, cy + 40]], c); } g.restore(); },
};
const ADS = [
  { brand: '배달의 만족', en: 'BAEDAL MANJOK', c1: '#ffd23f', c2: '#ffb100', fg: '#1d1508', ac: '#e2572b', h: ['오늘 저녁,', '뭐 먹지?'], sub: '첫 주문 5,000원 할인 · 지금 앱에서', info: '앱마켓에서 「배달의 만족」을 검색하세요', art: 'bowl' },
  { brand: '토닥뱅크', en: 'TODAK BANK', c1: '#0f3fc9', c2: '#1b66ff', fg: '#ffffff', ac: '#ffd45a', h: ['이체 수수료,', '평생 0원'], sub: '토닥토닥, 내 돈을 아끼는 은행', info: '만 17세 이상 누구나 · 계좌 개설 3분', art: 'card' },
  { brand: '해적스 어학원', en: 'HAEJEOKS ACADEMY', c1: '#0b1d44', c2: '#16346f', fg: '#ffffff', ac: '#ffd23f', h: ['토익 900+', '단기 완성'], sub: '신규 수강생 전 강좌 50% 할인', info: '강남역 11번 출구 도보 1분 · 02-0000-0900', art: 'score' },
  { brand: '법무법인 든든', en: 'DEUNDEUN LAW', c1: '#141414', c2: '#262220', fg: '#f3ead6', ac: '#c9a45c', h: ['이혼 · 상속', '개인회생'], sub: '혼자 고민하지 마세요', info: '24시간 무료상담 1588-0000', art: 'scale' },
  { brand: '더 포레스트 강남', en: 'THE FOREST GANGNAM', c1: '#f2a65a', c2: '#3b2f63', fg: '#ffffff', ac: '#ffe39a', h: ['숲을 품은', '프리미엄 주거'], sub: '2호선 강남역 도보 3분 · 2027년 3월 입주', info: '분양문의 1600-0000 · 견본주택 운영 중', art: 'skyline' },
  { brand: '참맑은', en: 'CHAMMALGEUN', c1: '#eaf6ee', c2: '#bfe3cc', fg: '#14472c', ac: '#2f8f5a', h: ['깨끗함', '한 잔'], sub: '대나무 숯으로 네 번 걸렀습니다', info: '경고: 지나친 음주는 간경화나 간암을 일으킵니다', art: 'bottle' },
  { brand: '용사키우기 M', en: 'HERO RAISING M', c1: '#3a1a7a', c2: '#c2327e', fg: '#ffffff', ac: '#ffc93c', h: ['사전예약', '100만 돌파!'], sub: '지금 예약하면 전설 장비 지급', info: '11월 28일 정식 출시 · 12세 이용가', art: 'sword' },
  { brand: '한빛대학교', en: 'HANBIT UNIVERSITY', c1: '#ffffff', c2: '#e6eefb', fg: '#12305f', ac: '#1d4f9c', h: ['2027학년도', '정시모집'], sub: '원서접수 12.29(화) ~ 12.31(목)', info: '꿈을 켜는 대학 · 입학처 02-0000-2027', art: 'crest' },
  { brand: '맑은결 피부과', en: 'MALGEUNGYEOL CLINIC', c1: '#fde8ec', c2: '#f7c6d0', fg: '#5a2434', ac: '#e0607e', h: ['레이저 토닝', '1회 체험 29,000원'], sub: '강남역 10번 출구 · 평일 야간진료', info: '의료광고심의필 제000000-중-00000호', art: 'sparkle' },
  { brand: '하늘길항공', en: 'HANEULGIL AIR', c1: '#3fa9f5', c2: '#bfe6ff', fg: '#ffffff', ac: '#ff7a45', h: ['제주,', '39,900원부터'], sub: '김포 ↔ 제주 매일 12편', info: '유류할증료·공항시설사용료 포함 편도 총액', art: 'plane' },
  { brand: '안전한 지하철', en: 'SAFE SUBWAY', c1: '#ffcf00', c2: '#ffb800', fg: '#111111', ac: '#111111', h: ['잠깐!', '발빠짐 주의'], sub: '열차와 승강장 사이가 넓습니다', info: '휴대전화는 잠시 내려놓고 발밑을 확인하세요', art: 'gap' },
  { brand: '달보드레 커피', en: 'DALBODRE COFFEE', c1: '#4a2f22', c2: '#7a5038', fg: '#fbf2e2', ac: '#f2b134', h: ['아메리카노', '1,900원'], sub: '출근길 첫 잔, 강남역 지하상가 12호', info: '오전 6시 30분부터 문을 엽니다', art: 'cup' },
  { brand: '밝은빛안과', en: 'BALGEUNBIT EYE', c1: '#0e6f80', c2: '#19a3b8', fg: '#ffffff', ac: '#d7f4f8', h: ['안경 벗는 날,', '상담 예약'], sub: '시력교정 정밀검사 60여 가지', info: '강남역 12번 출구 · 02-0000-2020', art: 'eye' },
  { brand: '일자리나무', en: 'ILJARI NAMU', c1: '#1f8a55', c2: '#35b877', fg: '#ffffff', ac: '#ffd23f', h: ['내 주변 알바,', '3초 지원'], sub: '오늘 지원하면 내일부터 출근', info: '구인·구직 앱 「일자리나무」', art: 'tree' },
];
function adBg(g, w, h, a) { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, a.c1); gr.addColorStop(1, a.c2); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
function adMark(g, x, y, s, a) { rr(g, x, y, s, s, s * 0.26); g.fillStyle = a.ac; g.fill(); tx(g, a.brand[0], x + s / 2, y + s / 2 + s * 0.04, s * 0.62, a.c1 == '#ffffff' || a.ac == '#111111' ? '#fff' : a.c1, { w: 900 }); }
function adWide(a, w = 1024, h = 512) { return cv(w, h, g => { adBg(g, w, h, a); ART[a.art](g, w * 0.77, h * 0.5, h / 512);
  adMark(g, 56, 44, 52, a); tx(g, a.brand, 124, 62, 30, a.fg, { a: 'left', w: 900 }); tx(g, a.en, 124, 90, 14, a.fg, { a: 'left', w: 500, ls: 3 });
  a.h.forEach((l, i) => tx(g, l, 54, 196 + i * 104, 96, a.fg, { a: 'left', w: 900, max: w * 0.56 })); g.fillStyle = a.ac; g.fillRect(58, 196 + a.h.length * 104 - 44, 84, 7);
  tx(g, a.sub, 58, 196 + a.h.length * 104 + 6, 33, a.fg, { a: 'left', w: 700, max: w * 0.56 }); g.globalAlpha = 0.75; tx(g, a.info, 58, h - 44, 21, a.fg, { a: 'left', w: 500, max: w * 0.7 }); g.globalAlpha = 1; }); }
function adTall(a, w = 512, h = 720) { return cv(w, h, g => { adBg(g, w, h, a); ART[a.art](g, w / 2, 250, 0.82);
  a.h.forEach((l, i) => tx(g, l, w / 2, 468 + i * 68, 62, a.fg, { w: 900, max: w - 60 })); tx(g, a.sub, w / 2, 468 + a.h.length * 68 - 6, 23, a.fg, { w: 700, max: w - 50 });
  g.fillStyle = a.ac; g.fillRect(0, h - 78, w, 78); adMark(g, 26, h - 62, 46, { ...a, ac: a.c1 == '#ffffff' ? '#fff' : a.c1, c1: a.ac }); tx(g, a.brand, 86, h - 38, 30, a.c1 == '#ffffff' || a.ac == '#111111' ? '#fff' : a.c1, { a: 'left', w: 900, max: w - 110 }); }); }
function adStrip(a, w = 1024, h = 176) { return cv(w, h, g => { adBg(g, w, h, a); g.save(); g.beginPath(); g.rect(w - 260, 0, 260, h); g.clip(); ART[a.art](g, w - 130, h * 0.62, 0.52); g.restore();
  adMark(g, 26, h / 2 - 34, 68, a); tx(g, a.brand, 110, h / 2 - 16, 34, a.fg, { a: 'left', w: 900 }); tx(g, a.en, 110, h / 2 + 22, 14, a.fg, { a: 'left', w: 500, ls: 2 });
  tx(g, a.h.join(' '), 400, h / 2 - 14, 58, a.fg, { a: 'left', w: 900, max: 380 }); tx(g, a.sub, 400, h / 2 + 40, 24, a.fg, { a: 'left', w: 700, max: 380 }); }); }

function makeSigns() {
  const T = {};
  T.wide = ADS.map(a => adWide(a)); T.tall = ADS.map(a => adTall(a)); T.strip = ADS.map(a => adStrip(a));
  T.station = cv(1024, 256, (g, w, h) => {         // 역명판
    g.fillStyle = '#fbfbfa'; g.fillRect(0, 0, w, h); g.fillStyle = LC; g.fillRect(0, h - 30, w, 30);
    circ(g, 360, 100, 38, LC); tx(g, '222', 360, 102, 30, '#fff', { w: 900 });
    tx(g, '강남', 530, 92, 112, '#16181a', { w: 900 }); tx(g, 'Gangnam', 530, 184, 34, '#555', { w: 500, ls: 3 });
    tx(g, '◀ 역삼', 60, 100, 46, '#44484c', { a: 'left' }); tx(g, 'Yeoksam', 118, 150, 24, '#777', { a: 'left', w: 500 });
    tx(g, '교대 ▶', w - 60, 100, 46, '#44484c', { a: 'right' }); tx(g, 'Gyodae', w - 118, 150, 24, '#777', { a: 'right', w: 500 });
  });
  T.header = cv(1024, 154, (g, w, h) => {          // 안전문 상단 안내띠
    g.fillStyle = '#23272b'; g.fillRect(0, 0, w, h); g.fillStyle = LC; g.fillRect(0, h - 14, w, 14);
    g.fillStyle = LC; rr(g, 392, 26, 240, 90, 45); g.fill(); tx(g, '강남', 512, 73, 58, '#fff', { w: 900 });
    tx(g, '역삼', 250, 73, 46, '#cfd3d6'); tx(g, '‹', 350, 68, 60, '#8b9196'); tx(g, '교대', 774, 73, 46, '#fff'); tx(g, '›', 674, 68, 60, '#fff');
    tx(g, '교대 방면', w - 30, 73, 30, '#9fd8b7', { a: 'right', w: 500 }); tx(g, '2호선', 30, 73, 30, '#9fd8b7', { a: 'left', w: 500 });
  });
  T.col = cv(256, 256, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = LC; g.lineWidth = 16; g.strokeRect(8, 8, w - 16, h - 16); tx(g, '강남', 128, 112, 84, '#16181a', { w: 900 }); tx(g, 'Gangnam', 128, 190, 26, '#555', { w: 500 }); });
  T.nameband = cv(512, 64, (g, w, h) => { g.fillStyle = LC; g.fillRect(0, 0, w, h); tx(g, '강남', 170, 34, 40, '#fff', { w: 900 }); tx(g, 'Gangnam', 330, 35, 26, '#d9f3e4', { w: 500, ls: 2 }); });
  T.num = {}; doorXs.forEach((x, i) => { const n = `${(i / 4 | 0) + 1}-${i % 4 + 1}`; T.num[i] = cv(128, 64, (g, w, h) => { g.fillStyle = LC; rr(g, 0, 0, w, h, 12); g.fill(); tx(g, n, 64, 34, 40, '#fff', { w: 900 }); }); });
  T.lcd = cv(1024, 284, (g, w, h) => {             // 승강장 행선 안내기
    g.fillStyle = '#040506'; g.fillRect(0, 0, w, h);
    g.fillStyle = LC; rr(g, 28, 26, 150, 62, 31); g.fill(); tx(g, '2호선', 103, 59, 34, '#fff');
    tx(g, '교대 방면', 200, 59, 48, '#fff', { a: 'left' }); tx(g, '23:20', w - 32, 59, 46, '#9aa0a6', { a: 'right', w: 500 });
    g.fillStyle = '#1a1c1f'; g.fillRect(28, 110, w - 56, 2);
    tx(g, '이번 열차', 32, 160, 40, '#ffb020', { a: 'left' }); tx(g, '역삼 출발 · 곧 도착', 240, 160, 44, '#ffd27a', { a: 'left' });
    tx(g, '다음 열차', 32, 230, 40, '#3fd27f', { a: 'left' }); tx(g, '선릉 출발 · 3분 후 도착', 240, 230, 44, '#b6f0cd', { a: 'left' });
  });
  T.tlcd = cv(512, 288, (g, w, h) => {             // 객실 안내 화면
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0d2540'); gr.addColorStop(1, '#16467a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    tx(g, '이번 역', 256, 44, 28, '#9fc4ee', { w: 500 }); tx(g, '강남', 256, 124, 104, '#fff', { w: 900 }); tx(g, 'Gangnam', 256, 200, 30, '#cfe2f7', { w: 500, ls: 2 });
    g.fillStyle = LC; g.fillRect(0, h - 50, w, 50); tx(g, '내리실 문은 오른쪽입니다 ▶', 256, h - 24, 26, '#fff');
  });
  T.route = cv(1024, 158, (g, w, h) => {           // 객실 문 위 노선도
    g.fillStyle = '#fafafa'; g.fillRect(0, 0, w, h); g.fillStyle = LC; g.fillRect(60, 56, w - 120, 12);
    STN.forEach((s, i) => { const x = 60 + i * (w - 120) / 8; g.fillStyle = '#fff'; g.strokeStyle = i == 5 ? '#e0352b' : LC; g.lineWidth = 7; g.beginPath(); g.arc(x, 62, i == 5 ? 20 : 14, 0, 7); g.fill(); g.stroke();
      tx(g, s, x, 114, i == 5 ? 34 : 26, i == 5 ? '#e0352b' : '#222', { w: i == 5 ? 900 : 500 }); });
    tx(g, '2호선', 14, 24, 22, LC, { a: 'left', w: 900 });
  });
  T.exit = [0, 1].map(k => cv(1024, 232, (g, w, h) => { // 나가는 곳
    g.fillStyle = '#ffcf00'; g.fillRect(0, 0, w, h); const L = k == 0;
    tx(g, L ? '←' : '→', L ? 90 : w - 90, 110, 120, '#111', { w: 900 });
    tx(g, '나가는 곳', L ? 190 : w - 190, 92, 88, '#111', { a: L ? 'left' : 'right', w: 900 }); tx(g, 'Exit · 出口', L ? 194 : w - 194, 180, 38, '#333', { a: L ? 'left' : 'right', w: 500 });
    [1, 2, 3].forEach((n, i) => { const x = L ? w - 290 + i * 100 : 90 + i * 100; circ(g, x, 116, 40, '#111'); tx(g, String(L ? n : n + 9), x, 119, n + (L ? 0 : 9) > 9 ? 40 : 48, '#ffcf00', { w: 900 }); });
  }));
  T.exitUp = cv(1024, 232, (g, w, h) => { g.fillStyle = '#ffcf00'; g.fillRect(0, 0, w, h); tx(g, '↑', 96, 112, 130, '#111', { w: 900 }); tx(g, '나가는 곳', 200, 90, 92, '#111', { a: 'left', w: 900 }); tx(g, 'Exit · 出口 · 出口', 204, 180, 36, '#333', { a: 'left', w: 500 }); circ(g, 880, 116, 48, '#111'); tx(g, '♿', 880, 118, 0.1, '#111'); stroke(g, [[858, 116], [902, 116]], 8, '#ffcf00'); stroke(g, [[880, 94], [880, 138]], 8, '#ffcf00'); });
  T.map = cv(768, 576, (g, w, h) => {              // 주변 안내도
    g.fillStyle = '#f3f1ea'; g.fillRect(0, 0, w, h); const r = rng(42);
    for (let i = 0; i < 9; i++) for (let j = 0; j < 6; j++) { g.fillStyle = ['#e2ddd0', '#d5e6cf', '#dcd8ea', '#e9dcc9'][(r() * 4) | 0]; g.fillRect(24 + i * 81, 96 + j * 78, 68, 64); }
    g.fillStyle = '#bcd9ef'; g.fillRect(0, 380, w, 26); g.fillStyle = '#fff'; g.fillRect(372, 80, 22, h); g.fillRect(0, 236, w, 18);
    g.fillStyle = LC; g.fillRect(0, 0, w, 72); tx(g, '강남역 주변 안내도', 28, 38, 36, '#fff', { a: 'left' }); tx(g, 'Neighborhood Map', w - 24, 40, 20, '#d9f3e4', { a: 'right', w: 500 });
    for (let i = 1; i <= 12; i++) { const a = i / 12 * 6.283, x = 384 + Math.cos(a) * 92, y = 300 + Math.sin(a) * 66; circ(g, x, y, 13, '#ffcf00'); tx(g, String(i), x, y + 1, 15, '#111', { w: 900 }); }
    circ(g, 384, 300, 15, '#e0352b'); tx(g, '현위치', 384, 336, 22, '#e0352b');
  });
  T.linemap = cv(1024, 640, (g, w, h) => {          // 노선도
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h); g.fillStyle = '#23272b'; g.fillRect(0, 0, w, 76); tx(g, '수도권 전철 노선도', 30, 40, 36, '#fff', { a: 'left' }); tx(g, 'Subway Line Map', w - 30, 42, 20, '#b9c0c6', { a: 'right', w: 500 });
    const cols = ['#0052a4', '#ef7c1c', '#00a5de', '#996cac', '#cd7c2f', '#747f00', '#e6186c', '#bdb092'], r = rng(5);
    cols.forEach((c, i) => { const pts = [[40, 130 + i * 58 + (r() - 0.5) * 60]]; for (let k = 1; k <= 7; k++) pts.push([40 + k * 135, clamp(pts[k - 1][1] + (r() - 0.5) * 150, 110, h - 60)]); stroke(g, pts, 7, c); pts.forEach(p => { circ(g, p[0], p[1], 7, '#fff'); g.strokeStyle = c; g.lineWidth = 3; g.stroke(); }); });
    g.strokeStyle = LC; g.lineWidth = 12; rr(g, 250, 190, 520, 320, 150); g.stroke(); for (let k = 0; k < 22; k++) { const a = k / 22 * 6.283, x = 510 + Math.cos(a) * 258, y = 350 + Math.sin(a) * 158; circ(g, clamp(x, 252, 768), clamp(y, 192, 508), 8, '#fff'); g.strokeStyle = LC; g.lineWidth = 3; g.stroke(); }
    circ(g, 640, 508, 16, '#e0352b'); tx(g, '강남', 640, 548, 26, '#e0352b', { w: 900 }); tx(g, '현위치', 640, 576, 16, '#e0352b', { w: 500 });
  });
  T.timetable = cv(512, 640, (g, w, h) => { g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h); g.fillStyle = LC; g.fillRect(0, 0, w, 70); tx(g, '열차 시각표', 24, 37, 32, '#fff', { a: 'left' }); tx(g, '교대 방면 · 평일', w - 24, 39, 20, '#d9f3e4', { a: 'right', w: 500 });
    const r = rng(9); for (let j = 0; j < 19; j++) { const y = 96 + j * 28; g.fillStyle = j % 2 ? '#f0efe9' : '#fbfbf8'; g.fillRect(0, y - 13, w, 28); tx(g, String(5 + j).padStart(2, '0'), 44, y + 2, 20, '#111', { w: 900 }); let m = (r() * 4) | 0; for (let i = 0; i < 14 && m < 60; i++) { tx(g, String(m).padStart(2, '0'), 92 + i * 29, y + 2, 15, '#333', { w: 500 }); m += 3 + ((r() * 3) | 0); } } });
  const vend = (title, c1) => cv(256, 512, (g, w, h) => {
    g.fillStyle = '#e9ecef'; g.fillRect(0, 0, w, h); g.fillStyle = c1; g.fillRect(0, 0, w, 60); tx(g, title, 128, 32, 34, '#fff');
    g.fillStyle = '#11161c'; g.fillRect(18, 76, 176, 270); const r = rng(title.length * 7), cs = ['#e0352b', '#f08a24', '#3fb36a', '#2f7fe0', '#f2d13a', '#8a5bd6', '#f7f7f7'];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) { g.fillStyle = cs[(r() * cs.length) | 0]; rr(g, 26 + i * 33, 86 + j * 65, 24, 44, 5); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(29 + i * 33, 90 + j * 65, 5, 34); g.fillStyle = '#2bd66f'; g.fillRect(28 + i * 33, 136 + j * 65, 20, 5); }
    g.fillStyle = '#2a3038'; g.fillRect(206, 110, 34, 150); g.fillStyle = '#7fd4ff'; g.fillRect(210, 116, 26, 30); g.fillStyle = '#0c0f13'; g.fillRect(40, 400, 150, 60); tx(g, '교통카드 결제', 128, 484, 18, '#555', { w: 500 });
  });
  T.vend = vend('음료', '#1f6fd0'); T.vend2 = vend('간식', '#d0531f');
  T.cab = cv(256, 608, (g, w, h) => {              // 구호용품 보관함
    g.fillStyle = '#d7dadd'; g.fillRect(0, 0, w, h); g.fillStyle = '#f36a1f'; g.fillRect(0, 0, w, 110); tx(g, '구호용품', 128, 38, 40, '#fff', { w: 900 }); tx(g, '보관함', 128, 82, 36, '#fff', { w: 900 });
    g.fillStyle = '#31404b'; g.fillRect(18, 128, 220, 380);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) { g.fillStyle = '#c9ced2'; rr(g, 34 + i * 68, 146 + j * 90, 52, 70, 10); g.fill(); circ(g, 60 + i * 68, 186 + j * 90, 13, '#6b7780'); }
    tx(g, '비상시 사용', 128, 558, 30, '#c0392b');
  });
  T.hydrant = cv(256, 440, (g, w, h) => { g.fillStyle = '#c62f25'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8f1f18'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16); g.fillStyle = '#fff'; g.fillRect(34, 40, 188, 84); tx(g, '소 화 전', 128, 84, 46, '#c62f25', { w: 900 });
    g.fillStyle = '#e9d9d6'; g.fillRect(34, 150, 188, 200); tx(g, '사용 방법', 128, 176, 20, '#8f1f18', { w: 900 }); ['① 문을 연다', '② 호스를 꺼낸다', '③ 밸브를 돌린다', '④ 불을 향해 쏜다'].forEach((s, i) => tx(g, s, 52, 214 + i * 34, 19, '#333', { a: 'left', w: 500 })); rr(g, 196, 372, 26, 40, 5); g.fillStyle = '#d7dadd'; g.fill(); });
  T.aed = cv(256, 420, (g, w, h) => { g.fillStyle = '#f4f6f5'; g.fillRect(0, 0, w, h); g.fillStyle = '#12a05c'; g.fillRect(0, 0, w, 118); tx(g, 'AED', 128, 46, 60, '#fff', { w: 900 }); tx(g, '자동심장충격기', 128, 94, 24, '#fff', { w: 700 });
    g.fillStyle = '#12a05c'; g.beginPath(); g.moveTo(128, 320); g.bezierCurveTo(20, 240, 60, 150, 128, 200); g.bezierCurveTo(196, 150, 236, 240, 128, 320); g.fill(); poly(g, [[136, 196], [104, 258], [128, 258], [116, 306], [154, 240], [130, 240]], '#fff'); tx(g, '위급 시 문을 여세요', 128, 372, 22, '#333', { w: 700 }); });
  T.sos = cv(256, 360, (g, w, h) => { g.fillStyle = '#d2382d'; g.fillRect(0, 0, w, h); tx(g, 'SOS', 128, 60, 68, '#fff', { w: 900 }); tx(g, '비상 전화', 128, 118, 30, '#fff', { w: 700 }); rr(g, 60, 160, 136, 150, 16); g.fillStyle = '#f4f4f2'; g.fill(); circ(g, 128, 220, 34, '#d2382d'); tx(g, '누름', 128, 222, 20, '#fff', { w: 900 }); tx(g, '역무실 연결', 128, 284, 18, '#333', { w: 500 }); });
  T.bin = ['일반쓰레기', '재활용'].map((s, i) => cv(256, 128, (g, w, h) => { g.fillStyle = i ? '#1f8a55' : '#55595f'; g.fillRect(0, 0, w, h); tx(g, s, 128, 50, 38, '#fff', { w: 900 }); tx(g, i ? 'Recycle' : 'Trash', 128, 96, 22, '#e6e6e6', { w: 500 }); }));
  T.fire = cv(256, 256, (g, w, h) => { g.fillStyle = '#c62f25'; g.fillRect(0, 0, w, h); tx(g, '소화기', 128, 96, 72, '#fff', { w: 900 }); tx(g, 'Fire Extinguisher', 128, 176, 22, '#fff', { w: 500 }); });
  T.board = cv(768, 352, (g, w, h) => {            // 승차 위치 바닥 표시 (위쪽 = 문 방향)
    g.fillStyle = 'rgba(255,255,255,.9)'; [254, 510].forEach(x => g.fillRect(x, 10, 5, h - 20));
    arrow(g, 384, 176, 250, 150, false, 'rgba(245,197,0,.95)');
    [128, 640].forEach(x => arrow(g, x, 176, 250, 150, true, 'rgba(0,168,77,.95)'));
  });
  T.gap = cv(512, 128, (g, w, h) => { rr(g, 4, 4, w - 8, h - 8, 18); g.fillStyle = '#ffcf00'; g.fill(); g.strokeStyle = '#111'; g.lineWidth = 8; g.stroke(); poly(g, [[64, 24], [104, 100], [24, 100]], '#111'); tx(g, '!', 64, 72, 50, '#ffcf00', { w: 900 }); tx(g, '발빠짐 주의', 300, 50, 54, '#111', { w: 900 }); tx(g, 'Watch your step', 300, 100, 26, '#333', { w: 500 }); });
  T.band = cv(256, 64, (g, w, h) => { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 8, w, 48); g.fillStyle = LC; g.fillRect(0, 22, w, 20); });
  T.emdoor = cv(512, 128, (g, w, h) => { g.fillStyle = 'rgba(18,160,92,.94)'; rr(g, 0, 0, w, h, 14); g.fill(); tx(g, '비상문', 150, 50, 56, '#fff', { w: 900 }); tx(g, 'Emergency Exit', 150, 102, 24, '#fff', { w: 500 }); tx(g, '손잡이를 밀고 나가세요', 370, 64, 26, '#fff', { w: 700, max: 220 }); });
  T.lean = cv(256, 256, (g, w, h) => { circ(g, 128, 128, 124, '#fff'); circ(g, 128, 128, 112, '#d2382d'); circ(g, 128, 128, 88, '#fff'); stroke(g, [[66, 66], [190, 190]], 22, '#d2382d'); tx(g, '기대지', 128, 108, 34, '#111', { w: 900 }); tx(g, '마시오', 128, 150, 34, '#111', { w: 900 }); });
  T.prio = cv(512, 160, (g, w, h) => { g.fillStyle = '#ffcf00'; g.fillRect(0, 0, w, h); tx(g, '교통약자석', 180, 58, 54, '#111', { w: 900 }); tx(g, '노약자 · 임산부 · 장애인 · 영유아 동반', 180, 120, 21, '#333', { w: 700, max: 330 });
    [390, 440, 486].forEach((x, i) => { circ(g, x, 46, 14, '#111'); g.fillStyle = '#111'; rr(g, x - 13, 64, 26, 52, 8); g.fill(); if (i == 0) stroke(g, [[x + 18, 76], [x + 18, 124]], 5, '#111'); if (i == 1) circ(g, x + 8, 92, 13, '#111'); }); });
  T.preg = cv(256, 256, (g, w, h) => { g.fillStyle = '#f0669a'; g.fillRect(0, 0, w, h); tx(g, '임산부', 128, 78, 62, '#fff', { w: 900 }); tx(g, '배려석', 128, 150, 62, '#fff', { w: 900 }); tx(g, '내일의 주인공을 맞이하는 자리', 128, 214, 15, '#fff', { w: 500 }); });
  T.emer = cv(256, 256, (g, w, h) => { g.fillStyle = '#d2382d'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(14, 14, w - 28, 76); tx(g, '비상 핸들', 128, 54, 40, '#d2382d', { w: 900 }); tx(g, '비상시 덮개를 열고', 128, 132, 24, '#fff', { w: 700 }); tx(g, '핸들을 돌린 뒤', 128, 168, 24, '#fff', { w: 700 }); tx(g, '문을 손으로 여세요', 128, 204, 24, '#fff', { w: 700 }); });
  T.notice = cv(256, 256, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9322b'; g.fillRect(0, 0, w, 64); tx(g, '비상 통화 장치', 128, 34, 28, '#fff'); circ(g, 128, 150, 42, '#d9322b'); tx(g, 'SOS', 128, 153, 30, '#fff', { w: 900 }); tx(g, '위급할 때 누르세요', 128, 224, 20, '#333', { w: 500 }); });
  T.vent = cv(64, 64, (g, w, h) => { g.fillStyle = '#5c6065'; g.fillRect(0, 0, w, h); g.fillStyle = '#26282b'; for (let i = 0; i < 8; i++) g.fillRect(0, i * 8 + 1, w, 4); }, true);
  T.carno = CARS.map((c, i) => cv(256, 128, (g, w, h) => { g.fillStyle = '#f4f4f2'; rr(g, 0, 0, w, h, 14); g.fill(); tx(g, `2${i + 3}71`, 128, 46, 44, '#222', { w: 900 }); tx(g, i == 1 ? '약냉방칸' : `${i + 1}호차`, 128, 98, 26, i == 1 ? '#1f6fd0' : '#555', { w: 700 }); }));
  // 바닥과 벽에 곱해 넣는 얼룩·그늘
  T.gFloor = cv(4096, 480, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); const r = rng(31), X = x => (x + 34) / 68 * w, Z = z => z / 7.5 * h;
    const sh = (x0, z0, x1, z1, spread, a) => { g.save(); g.shadowColor = `rgba(40,34,26,${a})`; g.shadowBlur = spread; g.fillStyle = `rgba(40,34,26,${a})`; g.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0)); g.restore(); };
    for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h, rad = 30 + r() * 140; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(70,60,46,${0.02 + r() * 0.05})`); gr.addColorStop(1, 'rgba(70,60,46,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    sh(-34, -0.2, 34, 0.1, 26, 0.5); sh(-34, 7.42, 34, 7.7, 30, 0.5); sh(-34, 0.4, 34, 0.8, 8, 0.12);
    for (let x = -28; x <= 28; x += 8) sh(x - 0.36, 4.29, x + 0.36, 5.01, 22, 0.55);
    [[-18.95, -17.05, 6.98], [13.05, 14.95, 6.98], [0.2, 1.2, 6.78], [16.5, 17.5, 6.78], [-5.3, -4.5, 7.1], [3.0, 3.92, 7.06]].forEach(([a, b, z]) => sh(a, z, b, 7.5, 24, 0.5));
    for (let i = 0; i < 900; i++) { const x = r() * w, y = h * (0.1 + r() * 0.78); g.fillStyle = `rgba(30,28,26,${0.25 + r() * 0.4})`; g.beginPath(); g.ellipse(x, y, 1.2 + r() * 2.6, 1 + r() * 2, r() * 3, 0, 7); g.fill(); }
    for (let i = 0; i < 70; i++) { const x = r() * w, y = h * (0.15 + r() * 0.7); g.strokeStyle = `rgba(60,54,46,${0.05 + r() * 0.07})`; g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 40 + r() * 80, y + (r() - 0.5) * 30, x + 90 + r() * 160, y + (r() - 0.5) * 16); g.stroke(); } });
  T.gWall = cv(4096, 256, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); const r = rng(13); let gr = g.createLinearGradient(0, h, 0, h * 0.8); gr.addColorStop(0, 'rgba(50,44,36,.5)'); gr.addColorStop(1, 'rgba(50,44,36,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    gr = g.createLinearGradient(0, 0, 0, h * 0.12); gr.addColorStop(0, 'rgba(40,40,40,.4)'); gr.addColorStop(1, 'rgba(40,40,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 130; i++) { const x = r() * w, y0 = h * (0.25 + r() * 0.3), len = 20 + r() * 110; gr = g.createLinearGradient(0, y0, 0, y0 + len); gr.addColorStop(0, `rgba(70,62,50,${0.05 + r() * 0.1})`); gr.addColorStop(1, 'rgba(70,62,50,0)'); g.fillStyle = gr; g.fillRect(x, y0, 2 + r() * 7, len); }
    for (let i = 0; i < 200; i++) { const x = r() * w, y = r() * h, rad = 20 + r() * 90; gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(80,72,58,${0.02 + r() * 0.04})`); gr.addColorStop(1, 'rgba(80,72,58,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); } });
  T.gTrain = cv(2048, 320, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); const r = rng(8); for (const [y0, y1] of [[0, h * 0.2], [h, h * 0.8]]) { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, 'rgba(30,28,26,.6)'); gr.addColorStop(1, 'rgba(30,28,26,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    DOORS.forEach(d => { const x = (d + 9.75) / 19.5 * w; for (const y of [h * 0.14, h * 0.86]) { const gr = g.createRadialGradient(x, y, 4, x, y, 90); gr.addColorStop(0, 'rgba(50,44,38,.32)'); gr.addColorStop(1, 'rgba(50,44,38,0)'); g.fillStyle = gr; g.fillRect(x - 90, y - 90, 180, 180); } });
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(30,28,26,${0.1 + r() * 0.25})`; g.beginPath(); g.ellipse(r() * w, h * (0.2 + r() * 0.6), 1 + r() * 3, 1 + r() * 2, r() * 3, 0, 7); g.fill(); }
    for (let i = 0; i < 120; i++) { const x = r() * w, y = h * (0.25 + r() * 0.5); g.strokeStyle = `rgba(50,46,40,${0.05 + r() * 0.08})`; g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + r() * 120, y + (r() - 0.5) * 20); g.stroke(); } });
  return T;
}

/* ───────────── 장면 구성 ───────────── */
function build(T, S) {
  const PI = Math.PI;
  const M = (color, rough, metal, o = {}) => zoned(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...o }));
  const P = (s, rough, metal, o = {}) => zoned(new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughnessMap: s.roughnessMap, roughness: rough, metalness: metal, ...o }));
  const lit = (map, k = 1.25) => new THREE.MeshBasicMaterial({ map, color: new THREE.Color(k, k, k) });
  const printed = (map, rough = 0.45, o = {}) => zoned(new THREE.MeshStandardMaterial({ map, roughness: rough, ...o }));
  const mats = () => ({
    floor: P(S.floor, 1, 0), dot: P(S.dot, 1, 0), lineV: P(S.lineV, 1, 0), lineH: P(S.lineH, 1, 0),
    wall: P(S.wall, 1, 0), dado: P(S.dado, 1, 0.1), ceil: P(S.ceil, 1, 0.35), stone: P(S.stone, 1, 0),
    steel: P(S.steel, 1, 1), steelD: P(S.steel, 1.25, 1, { color: 0x9da1a6 }), chrome: M(0xe8eaec, 0.12, 1),
    tfloor: P(S.tfloor, 1, 0), twall: P(S.twall, 1, 0), tunnel: P(S.tunnel, 1, 0, { envMapIntensity: 0.15 }), wood: P(S.wood, 1, 0),
    seat: P(S.fabric, 1, 0, { color: 0x6670b4 }), seatP: P(S.fabric, 1, 0, { color: 0xea5a92 }), seatY: P(S.fabric, 1, 0, { color: 0xe8b93c }),
    dark: M(0x202327, 0.55, 0.3), black: M(0x0b0c0e, 0.8, 0, { envMapIntensity: 0.25 }), white: M(0xf0f0ec, 0.45, 0), plastic: M(0xdfe1e3, 0.35, 0),
    lc: M(new THREE.Color(LC), 0.4, 0), yellow: M(0xf0c000, 0.6, 0), pinkF: M(0xf07aa6, 0.6, 0), strap: M(0xe2e5e7, 0.4, 0), red: M(0xc8302a, 0.4, 0.1), rubber: M(0x131518, 0.85, 0),
    glass: zoned(new THREE.MeshStandardMaterial({ color: 0xd4ecee, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false, envMapIntensity: 1.5 })),
    glassT: zoned(new THREE.MeshStandardMaterial({ color: 0x90a8ae, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false, envMapIntensity: 1.4 })),
    light: new THREE.MeshBasicMaterial({ color: new THREE.Color(LIGHT_K, LIGHT_K * 0.985, LIGHT_K * 0.95) }), lightR: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.3, 0.2) }), lightG: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 4, 0.9) }),
    vent: printed(T.vent, 0.6, { metalness: 0.4 }),
  });
  ZONE = 'p'; const MP = mats(); ZONE = 't'; const MT = mats(); ZONE = 'p'; let mat = MP;
  function scaleUV(g, w, h, d, s, ws = 1) { const uv = g.attributes.uv, D = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]], n = 2 * (ws + 1); let k = 0; for (let f = 0; f < 6; f++) for (let i = 0, c = f < 2 ? 4 : n; i < c; i++, k++) uv.setXY(k, uv.getX(k) * D[f][0] / s, uv.getY(k) * D[f][1] / s); }
  const UVS = new Map(); for (const set of [MP, MT]) { for (const k of ['floor', 'wall', 'ceil']) UVS.set(set[k], 1.2); for (const k of ['dot', 'lineV', 'lineH']) UVS.set(set[k], 0.3); for (const k of ['dado', 'steel', 'steelD', 'twall', 'wood', 'stone']) UVS.set(set[k], 0.6); UVS.set(set.tfloor, 1); UVS.set(set.tunnel, 4); for (const k of ['seat', 'seatP', 'seatY']) UVS.set(set[k], 0.25); UVS.set(set.vent, 0.06); }
  function bb(x1, x2, y1, y2, z1, z2, m, o = {}) {
    const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1), d = Math.abs(z2 - z1);
    const ws = w > 24 ? Math.ceil(w / 12) : 1, g = new THREE.BoxGeometry(w, h, d, ws), uv = o.uv || UVS.get(m); if (uv) scaleUV(g, w, h, d, uv, ws);     // 아주 긴 면은 잘게 나눠야 눈앞을 지날 때 깨지지 않는다
    const me = new THREE.Mesh(g, m); me.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2); (o.parent || stat).add(me); return me;
  }
  function gbox(x1, x2, y1, y2, z1, z2) { const g = new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1); scaleUV(g, x2 - x1, y2 - y1, z2 - z1, 0.6); g.translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2); return g; }
  function tubeX(x1, x2, y, z, r, m) { const L = Math.abs(x2 - x1), me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, L > 24 ? 6 : 12, L > 24 ? Math.ceil(L / 12) : 1), m); me.rotation.z = PI / 2; me.position.set((x1 + x2) / 2, y, z); stat.add(me); }
  function tubeY(x, z, y1, y2, r, m, n = 12) { const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, y2 - y1, n), m); me.position.set(x, (y1 + y2) / 2, z); stat.add(me); return me; }
  function tubeZ(x, y, z1, z2, r, m) { const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.abs(z2 - z1), 12), m); me.rotation.x = PI / 2; me.position.set(x, y, (z1 + z2) / 2); stat.add(me); }
  function ball(x, y, z, r, m) { const me = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m); me.position.set(x, y, z); stat.add(me); }
  function sign(w, h, m, x, y, z, ry = 0, parent = stat) { const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); me.position.set(x, y, z); me.rotation.y = ry; parent.add(me); return me; }
  const multiply = map => { map.colorSpace = THREE.NoColorSpace; return new THREE.MeshBasicMaterial({ map, blending: THREE.MultiplyBlending, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }); };
  const wide = i => lit(T.wide[((i % ADS.length) + ADS.length) % ADS.length]), tall = i => lit(T.tall[((i % ADS.length) + ADS.length) % ADS.length]), strip = i => lit(T.strip[((i % ADS.length) + ADS.length) % ADS.length], 1.15);

  /* ── 승강장 구조 ── */
  bb(-34, 34, -1.2, 0, -0.1, 7.5, mat.floor);
  bb(-34, 34, 3.0, 3.15, -0.1, 7.5, mat.ceil);
  bb(-34, 34, 0, 3, 7.5, 7.7, mat.wall);
  bb(-34, 34, 0, 0.16, 7.468, 7.5, mat.dado);
  bb(-34, 34, 2.36, 2.5, 7.486, 7.5, mat.lc);
  for (let x = -30.5; x < 33; x += 5.5) sign(0.9, 0.11, printed(T.nameband, 0.4), x, 2.43, 7.4855, PI);
  block(-36, 36, 7.5, 9);
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(68, 7.5), multiply(T.gFloor)); m.rotation.x = -PI / 2; m.position.set(0, 0.0085, 3.75); m.renderOrder = 1; sG.add(m);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(68, 3), multiply(T.gWall)); w.rotation.y = PI; w.position.set(0, 1.5, 7.497); w.renderOrder = 1; sG.add(w); }
  // 선로부와 터널 벽
  bb(-TL, TL, -1.2, 4, -4.15, -3.95, mat.tunnel);
  bb(-TL, TL, -1.3, -1.2, -3.95, -0.1, mat.black);
  bb(-TL, TL, 3.0, 3.15, -3.95, -0.1, mat.black);
  bb(-TL, TL, -1.2, -1.05, -1.0, -0.93, mat.steelD); bb(-TL, TL, -1.2, -1.05, -2.5, -2.43, mat.steelD);
  for (const y of [0.9, 2.15, 2.5]) { bb(-TL, TL, y, y + 0.02, -3.95, -3.8, mat.dark); for (let k = 0; k < 4; k++) tubeX(-TL, TL, y + 0.04, -3.92 + k * 0.035, 0.012, mat.rubber); }
  for (let x = -TL + 4; x < TL; x += 4) bb(x - 0.02, x + 0.02, 0.86, 2.54, -3.95, -3.9, mat.dark);
  // 역 바깥 터널: 승강장 쪽에도 벽이 서고, 16m마다 등이 달린다
  for (const s of [-1, 1]) { const a = s * 34.2, b = s * TL;
    bb(a, b, -1.2, 4, 0.35, 0.6, mat.tunnel); bb(a, b, -1.3, -1.2, -0.1, 0.6, mat.black); bb(a, b, 3.0, 3.15, -0.1, 0.6, mat.black);
    bb(a, b, 1.5, 1.52, 0.2, 0.35, mat.dark); for (let k = 0; k < 3; k++) tubeX(a, b, 1.56, 0.32 - k * 0.035, 0.012, mat.rubber); bb(a, b, -0.2, -0.12, 0.05, 0.35, mat.stone); }
  for (let x = -TL + 8; x < TL; x += 16) {
    if (Math.abs(x) > 48) { bb(x - 0.32, x + 0.32, 2.74, 2.82, -3.95, -3.85, mat.dark); bb(x - 0.28, x + 0.28, 2.715, 2.74, -3.94, -3.86, mat.light); bb(x + 3.9, x + 4.1, 1.2, 1.5, -3.95, -3.94, mat.white); }
    if (Math.abs(x) > 36) { bb(x - 0.32, x + 0.32, 2.74, 2.82, 0.25, 0.35, mat.dark); bb(x - 0.28, x + 0.28, 2.715, 2.74, 0.26, 0.34, mat.light); bb(x - 4.1, x - 3.9, 1.0, 1.25, 0.34, 0.35, mat.lightG); } }
  [-24, -8, 8, 24].forEach((x, i) => { bb(x - 1.66, x + 1.66, 0.94, 2.1, -3.95, -3.9, mat.steelD); sign(3.2, 1.07, wide(i * 3 + 1), x, 1.52, -3.895, 0); });

  // 천장: 이어지는 조명 띠, 스프링클러, 감지기, 스피커, 카메라
  for (const z of [1.5, 3.3, 6.0]) { bb(-33.7, 33.7, 2.993, 3.0, z - 0.125, z + 0.125, mat.dark); for (let x = -33.6; x < 33; x += 2.4) bb(x, x + 2.32, 2.986, 2.994, z - 0.09, z + 0.09, mat.light); }
  for (let x = -32; x <= 32; x += 3.2) for (const z of [2.4, 5.15]) { tubeY(x, z, 2.965, 3.0, 0.012, mat.chrome, 8); tubeY(x, z, 2.955, 2.967, 0.028, mat.chrome, 10); }
  for (let x = -30; x <= 30; x += 7.5) { tubeY(x, 4.0, 2.968, 3.0, 0.06, mat.white, 16); tubeY(x, 4.0, 2.962, 2.969, 0.025, mat.lightR, 8); }
  for (let x = -27; x <= 27; x += 9) { tubeY(x, 2.4, 2.988, 3.0, 0.11, mat.white, 20); tubeY(x, 2.4, 2.985, 2.989, 0.085, mat.dark, 20); }
  [[-31, 3.2], [-12, 0.9], [8, 0.9], [31, 3.2], [0, 6.4]].forEach(([x, z]) => { tubeY(x, z, 2.94, 3.0, 0.07, mat.white, 16); ball(x, 2.935, z, 0.062, mat.black); });
  // 점자블록
  bb(-34, 34, 0, 0.006, 0.45, 0.75, mat.dot);
  bb(7.05, 7.35, 0, 0.006, 0.75, 3.45, mat.lineV);
  bb(7.05, 7.35, 0, 0.007, 3.45, 3.75, mat.dot);
  bb(7.35, 33.6, 0, 0.006, 3.45, 3.75, mat.lineH);
  // 승차 위치 표시와 발빠짐 주의
  const boardM = zoned(new THREE.MeshStandardMaterial({ map: T.board, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  const gapM = zoned(new THREE.MeshStandardMaterial({ map: T.gap, transparent: true, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  doorXs.forEach(x => { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.05), boardM); p.rotation.x = -PI / 2; p.position.set(x, 0.004, 1.42); stat.add(p);
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.225), gapM); q.rotation.x = -PI / 2; q.position.set(x, 0.004, 0.27); stat.add(q); });

  // 기둥: 법랑 패널, 스테인리스 모서리, 세로 광고
  const colM = printed(T.col, 0.4);
  let ci = 0;
  for (let x = -28; x <= 28; x += 8, ci++) {
    bb(x - 0.35, x + 0.35, 0.3, 3, 4.3, 5.0, mat.wall); bb(x - 0.36, x + 0.36, 0, 0.3, 4.29, 5.01, mat.steel);
    for (const dx of [-0.35, 0.35]) for (const dz of [4.3, 5.0]) bb(x + dx - 0.012, x + dx + 0.012, 0.3, 2.3, dz - 0.012, dz + 0.012, mat.steel);
    bb(x - 0.36, x + 0.36, 2.3, 2.6, 4.29, 5.01, mat.lc);
    sign(0.46, 0.46, colM, x + 0.352, 1.72, 4.65, PI / 2); sign(0.46, 0.46, colM, x - 0.352, 1.72, 4.65, -PI / 2);
    bb(x - 0.3, x + 0.3, 0.72, 1.62, 4.26, 4.3, mat.steelD); sign(0.56, 0.84, tall(ci * 2), x, 1.17, 4.258, PI);
    if (ci % 2) { bb(x - 0.3, x + 0.3, 0.72, 1.62, 5.0, 5.04, mat.steelD); sign(0.56, 0.84, tall(ci * 2 + 5), x, 1.17, 5.042, 0); }
    else { bb(x - 0.14, x + 0.14, 1.28, 1.56, 5.0, 5.012, mat.red); sign(0.26, 0.26, printed(T.fire, 0.4), x, 1.42, 5.0135, 0); tubeY(x, 5.09, 0.06, 0.56, 0.065, mat.red, 14); tubeY(x, 5.09, 0.56, 0.64, 0.03, mat.dark, 10); bb(x - 0.1, x + 0.1, 0, 0.06, 5.0, 5.18, mat.dark); }
    block(x - 0.35, x + 0.35, 4.3, ci % 2 ? 5.04 : 5.18);
  }
  // 벽면: 광고판, 역명판과 의자, 안내도, 노선도, 시각표, 설비
  const adBox = (x, w, i, h = 1.5) => { bb(x - w / 2 - 0.06, x + w / 2 + 0.06, 1.5 - h / 2 - 0.06, 1.5 + h / 2 + 0.06, 7.42, 7.5, mat.steelD); sign(w, h, wide(i), x, 1.5, 7.415, PI); };
  [[-27.6, 3.0, 0], [-10, 3.0, 2], [6, 3.0, 4], [22, 3.0, 6], [29.9, 2.4, 9]].forEach(([x, w, i]) => adBox(x, w, i, w / 2));
  const bench = x => { bb(x - 1.24, x + 1.24, 1.56, 2.2, 7.45, 7.5, mat.steelD); sign(2.4, 0.6, lit(T.station, 1.15), x, 1.88, 7.445, PI);
    for (let i = 0; i < 5; i++) bb(x - 0.95, x + 0.95, 0.42, 0.45, 6.99 + i * 0.09, 7.065 + i * 0.09, mat.wood); for (let i = 0; i < 3; i++) bb(x - 0.95, x + 0.95, 0.56 + i * 0.11, 0.645 + i * 0.11, 7.405, 7.435, mat.wood);
    [-0.85, 0, 0.85].forEach(d => { bb(x + d - 0.025, x + d + 0.025, 0, 0.42, 7.03, 7.08, mat.steelD); bb(x + d - 0.025, x + d + 0.025, 0, 0.9, 7.39, 7.44, mat.steelD); bb(x + d - 0.025, x + d + 0.025, 0.385, 0.42, 7.03, 7.44, mat.steelD); });
    [-0.95, -0.32, 0.32, 0.95].forEach(d => { bb(x + d - 0.012, x + d + 0.012, 0.45, 0.63, 7.0, 7.02, mat.steel); bb(x + d - 0.012, x + d + 0.012, 0.61, 0.63, 7.0, 7.4, mat.steel); });
    block(x - 0.95, x + 0.95, 6.98, 7.5); };
  bench(-18); bench(14);
  const board = (x, w, h, tex, k = 1.1) => { bb(x - w / 2 - 0.05, x + w / 2 + 0.05, 1.5 - h / 2 - 0.05, 1.5 + h / 2 + 0.05, 7.44, 7.5, mat.steelD); sign(w, h, lit(tex, k), x, 1.5, 7.435, PI); };
  board(-2, 1.6, 1.2, T.map); board(-22.4, 1.9, 1.19, T.linemap); board(11.2, 1.0, 1.25, T.timetable);
  const vending = (x, tex) => { bb(x - 0.5, x + 0.5, 0, 1.9, 6.78, 7.5, mat.dark); sign(0.96, 1.86, lit(tex, 1.2), x, 0.95, 6.775, PI); bb(x - 0.5, x + 0.5, 1.9, 1.94, 6.76, 7.5, mat.steelD); block(x - 0.5, x + 0.5, 6.78, 7.5); };
  vending(0.7, T.vend); vending(17, T.vend2);
  bb(-5.3, -4.5, 0, 1.9, 7.1, 7.5, mat.steelD); sign(0.78, 1.86, printed(T.cab, 0.35), -4.9, 0.95, 7.095, PI); block(-5.3, -4.5, 7.1, 7.5);
  [3.0, 3.48].forEach((x, i) => { bb(x, x + 0.44, 0, 0.9, 7.06, 7.46, mat.steel); bb(x + 0.1, x + 0.34, 0.6, 0.72, 7.052, 7.06, mat.black); bb(x - 0.005, x + 0.445, 0.9, 0.93, 7.055, 7.465, mat.steelD); sign(0.36, 0.18, printed(T.bin[i], 0.5), x + 0.22, 0.36, 7.058, PI); });
  block(3.0, 3.92, 7.06, 7.5);
  for (const x of [-31.6, 26.4]) { bb(x - 0.42, x + 0.42, 0.3, 1.74, 7.44, 7.5, mat.red); sign(0.72, 1.24, printed(T.hydrant, 0.4), x, 1.0, 7.438, PI); ball(x, 1.95, 7.46, 0.055, mat.lightR); tubeZ(x + 0.22, 1.95, 7.42, 7.5, 0.07, mat.red); }
  bb(-14.3, -13.7, 0.7, 1.7, 7.36, 7.5, mat.white); sign(0.56, 0.92, printed(T.aed, 0.35), -14, 1.2, 7.358, PI);
  bb(-13.3, -12.9, 1.0, 1.56, 7.42, 7.5, mat.red); sign(0.38, 0.53, printed(T.sos, 0.4), -13.1, 1.28, 7.418, PI);
  for (const x of [9.3, 9.62, 24.9]) { tubeY(x, 7.36, 0.06, 0.56, 0.065, mat.red, 14); tubeY(x, 7.36, 0.56, 0.64, 0.03, mat.dark, 10); }
  bb(9.12, 9.8, 0, 0.06, 7.24, 7.48, mat.dark); bb(24.72, 25.08, 0, 0.06, 7.24, 7.48, mat.dark); sign(0.3, 0.3, printed(T.fire, 0.4), 9.46, 1.0, 7.484, PI); block(9.1, 9.82, 7.24, 7.5);
  // 행선 안내기와 출구 표지
  [-20, 0, 20].forEach(x => { bb(x - 0.95, x + 0.95, 2.42, 2.98, 0.98, 1.1, mat.black); sign(1.8, 0.5, lit(T.lcd, 1.5), x, 2.7, 1.101, 0); [-0.7, 0.7].forEach(d => tubeY(x + d, 1.04, 2.98, 3.0, 0.015, mat.steelD, 8)); });
  [[-27.5, 0], [27.5, 1], [-9, 0], [9, 1]].forEach(([x, k]) => { bb(x - 1.12, x + 1.12, 2.44, 2.96, 3.57, 3.63, mat.dark); sign(2.2, 0.5, lit(T.exit[k], 1.15), x, 2.7, 3.631, 0); sign(2.2, 0.5, lit(T.exit[1 - k], 1.15), x, 2.7, 3.569, PI); [-0.9, 0.9].forEach(d => tubeY(x + d, 3.6, 2.96, 3.0, 0.012, mat.steelD, 8)); });

  // 양 끝 계단
  for (const s of [-1, 1]) {
    const X = (v) => s * v;
    bb(X(34), X(34.2), 0, 3, -0.1, 2.0, mat.wall); bb(X(34), X(34.2), 0, 3, 6.2, 7.7, mat.wall);
    bb(X(34), X(40), 0, 5.9, 1.8, 2.0, mat.wall); bb(X(34), X(40), 0, 5.9, 6.2, 6.4, mat.wall);
    bb(X(34), X(40), 5.8, 5.9, 2, 6.2, mat.ceil); bb(X(40), X(40.2), 0, 5.9, 1.8, 6.4, mat.wall);
    bb(X(34), X(34.2), 3.0, 5.9, -0.1, 7.7, mat.wall);
    for (let i = 0; i < 16; i++) { const x0 = 34.3 + i * 0.3; bb(X(x0), X(40), i * 0.17, (i + 1) * 0.17, 2.0, 6.2, mat.stone); bb(X(x0), X(x0 + 0.05), (i + 1) * 0.17, (i + 1) * 0.17 + 0.004, 2.0, 6.2, mat.yellow); }
    for (const z of [2.08, 4.1, 6.12]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 5.6, 10), mat.steel); r.position.set(X(36.9), 2.35, z); r.rotation.z = s * (Math.atan2(0.17, 0.3) - PI / 2); stat.add(r);
      for (let k = 0; k < 5; k++) { const xx = 34.9 + k * 1.0, yy = (xx - 34.3) / 0.3 * 0.17; if (z == 4.1) tubeY(X(xx), z, yy, yy + 0.92, 0.014, mat.steel, 8); else bb(X(xx - 0.02), X(xx + 0.02), yy + 0.86, yy + 0.9, Math.min(z, z < 3 ? 2.0 : 6.2), Math.max(z, z < 3 ? 2.0 : 6.2), mat.steel); } }
    for (const x of [35.5, 37.8]) bb(X(x), X(x + 1.4), 5.786, 5.8, 3.95, 4.25, mat.light);
    bb(X(33.3), X(34.0), 0, 0.006, 2.05, 6.15, mat.dot);
    bb(X(33.88), X(33.99), 2.3, 2.92, 2.7, 5.5, mat.dark); sign(2.7, 0.6, lit(T.exitUp, 1.15), X(33.875), 2.61, 4.1, -s * PI / 2);
    block(X(34), X(41), -1, 2.0); block(X(34), X(41), 6.2, 9); block(X(39.45), X(41), 1.5, 6.5);
  }

  /* ── 승강장 안전문 ── */
  bb(-34, 34, 2.05, 2.55, -0.12, 0.12, mat.steel);
  bb(-34, 34, 2.55, 3.0, -0.07, 0.07, mat.dark);
  const edges = [-34]; doorXs.forEach(x => edges.push(x - 1, x + 1)); edges.push(34);
  const emM = zoned(new THREE.MeshStandardMaterial({ map: T.emdoor, transparent: true, roughness: 0.5, side: THREE.DoubleSide }));
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i], b = edges[i + 1], L = b - a, c = (a + b) / 2;
    bb(a, a + 0.1, 0, 2.05, -0.06, 0.06, mat.steel); bb(b - 0.1, b, 0, 2.05, -0.06, 0.06, mat.steel);
    bb(a + 0.1, b - 0.1, 0, 0.28, -0.045, 0.045, mat.steel);
    bb(a + 0.1, b - 0.1, 0.28, 2.05, -0.008, 0.008, mat.glass);
    if (L > 3.2) {                                      // 객차 사이·끝 구간: 광고판
      bb(c - 1.26, c + 1.26, 0.5, 1.9, -0.03, 0.05, mat.steelD); sign(2.4, 1.2, wide(i + 5), c, 1.2, 0.052, 0);
      bb(c - 1.3, c - 1.26, 0.28, 2.05, -0.04, 0.04, mat.steel); bb(c + 1.26, c + 1.3, 0.28, 2.05, -0.04, 0.04, mat.steel);
    } else {                                            // 문 사이 구간: 비상문(밀고 나가는 손잡이)
      bb(c - 0.03, c + 0.03, 0.28, 2.05, -0.04, 0.04, mat.steel);
      for (const k of [-1, 1]) { const x0 = c + k * 0.08, x1 = c + k * (L / 2 - 0.16); tubeX(x0, x1, 1.02, -0.05, 0.016, mat.red); tubeZ(x0, 1.02, -0.05, -0.008, 0.012, mat.steelD); tubeZ(x1, 1.02, -0.05, -0.008, 0.012, mat.steelD); sign(0.56, 0.14, emM, c + k * (L / 4), 1.58, 0.0095, 0); }
    }
    bb(a, b, 2.0, 2.05, -0.05, 0.05, mat.steelD);
    block(a, b, -0.3, 0.08);
  }
  const headerM = lit(T.header, 1.2);
  doorXs.forEach((x, i) => {
    sign(1.9, 0.286, headerM, x, 2.3, 0.122, 0);
    sign(0.26, 0.13, lit(T.num[i], 1.1), x + 1.2, 2.3, 0.122, 0);
    bb(x - 0.06, x + 0.06, 2.07, 2.1, 0.12, 0.13, mat.lightG);
    bb(x - 1.0, x + 1.0, -0.02, 0.003, -0.1, 0.06, mat.steelD); bb(x - 0.98, x + 0.98, 0.003, 0.0045, 0.035, 0.055, mat.yellow);
    if (i % 4 != 3) sign(2.3, 0.3, strip(i * 2 + 1), x + 2.4, 2.3, 0.122, 0); else sign(1.5, 0.26, strip(i * 2 + 1), x + 2.3, 2.3, 0.122, 0);
    block(x - 1, x + 1, -0.3, 0.08, { door: true });
  });
  // 문짝 (공용 형상)
  const psdSteel = mergeGeometries([gbox(0, 0.05, 0, 2.05, -0.02, 0.02), gbox(0.95, 1, 0, 2.05, -0.02, 0.02), gbox(0.05, 0.95, 2.0, 2.05, -0.02, 0.02), gbox(0.05, 0.95, 0, 0.3, -0.02, 0.02)]);
  const psdGlass = gbox(0.05, 0.95, 0.3, 2.0, -0.006, 0.006), psdTape = gbox(0.05, 0.95, 0.3, 0.33, -0.0065, 0.0065);
  const bandM = new THREE.MeshBasicMaterial({ map: T.band, transparent: true, side: THREE.DoubleSide });
  const leanM = zoned(new THREE.MeshStandardMaterial({ map: T.lean, transparent: true, roughness: 0.5, side: THREE.DoubleSide }));
  const trSteel = mergeGeometries([gbox(0, 0.65, 0, 0.95, -0.015, 0.015), gbox(0, 0.65, 1.7, 1.9, -0.015, 0.015), gbox(0.012, 0.09, 0.95, 1.7, -0.015, 0.015), gbox(0.56, 0.65, 0.95, 1.7, -0.015, 0.015)]);
  const trRubber = mergeGeometries([gbox(0, 0.012, 0, 1.9, -0.017, 0.017), gbox(0.085, 0.565, 0.945, 0.955, -0.016, 0.016), gbox(0.085, 0.565, 1.695, 1.705, -0.016, 0.016), gbox(0.085, 0.095, 0.95, 1.7, -0.016, 0.016), gbox(0.555, 0.565, 0.95, 1.7, -0.016, 0.016)]), trGlass = gbox(0.09, 0.56, 0.95, 1.7, -0.006, 0.006);
  const leaves = [];
  function leaf(kind, x, z, s, parent) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.x = s;
    if (kind == 'psd') { g.add(new THREE.Mesh(psdSteel, MP.steel), new THREE.Mesh(psdGlass, MP.glass), new THREE.Mesh(psdTape, MP.yellow)); const b = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.2), bandM); b.position.set(0.5, 1.42, 0.008); g.add(b); }
    else { g.add(new THREE.Mesh(trSteel, MT.steel), new THREE.Mesh(trRubber, MT.rubber), new THREE.Mesh(trGlass, MT.glassT)); const st = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), leanM); st.position.set(0.325, 1.32, 0); st.scale.x = s; g.add(st); }
    parent.add(g); return g;
  }
  doorXs.forEach(x => { for (const s of [-1, 1]) {
    leaves.push({ g: leaf('psd', x, -0.035, s, dyn), x, s, travel: 0.97, kind: 0 });
    leaves.push({ g: leaf('tr', x, -0.19, s, dyn), x, s, travel: 0.63, kind: 1 });
    leaf('tr', x, -3.21, s, statT);                    // 반대편 문(닫힘)
  } });

  /* ── 전동차 ── */
  ZONE = 't'; mat = MT; stat = statT;
  function sideWall(c, z1, z2, m, band) {
    const cuts = []; DOORS.forEach(d => cuts.push([c + d - 0.65, c + d + 0.65, 0])); [-4.8, 0, 4.8].forEach(w => cuts.push([c + w - 1.15, c + w + 1.15, 1]));
    cuts.sort((a, b) => a[0] - b[0]); let x = c - 9.75;
    const solid = (a, b) => { if (b - a > 1e-3) { bb(a, b, 0, 2.2, z1, z2, m); if (band != null) bb(a, b, 0.58, 0.78, band - 0.004, band + 0.004, MP.lc); } };
    for (const [a, b, t] of cuts) { solid(x, a);
      if (t == 0) bb(a, b, 1.9, 2.2, z1, z2, m);
      else { bb(a, b, 0, 0.95, z1, z2, m); bb(a, b, 1.8, 2.2, z1, z2, m); if (band != null) bb(a, b, 0.58, 0.78, band - 0.004, band + 0.004, MP.lc); }
      x = b; }
    solid(x, c + 9.75);
  }
  function benchSeat(x0, x1, n, zw, s, type) {
    const w = (x1 - x0) / n, Z = (v) => zw + s * v;
    bb(x0, x1, 0.12, 0.40, Z(0), Z(0.46), mat.steelD); bb(x0 + 0.1, x1 - 0.1, 0.16, 0.34, Z(0.46), Z(0.465), mat.vent);
    for (let i = 0; i < n; i++) {
      let m = type == 'p' ? mat.seatY : mat.seat;
      if (type == 'g' && ((s < 0 && i == 0) || (s > 0 && i == n - 1))) { m = mat.seatP; bb(x0 + i * w + 0.04, x0 + (i + 1) * w - 0.04, 0, 0.003, Z(0.6), Z(0.95), mat.pinkF); sign(0.2, 0.2, printed(T.preg, 0.5), x0 + (i + 0.5) * w, 1.18, Z(0.002), s < 0 ? PI : 0); }
      bb(x0 + i * w + 0.012, x0 + (i + 1) * w - 0.012, 0.40, 0.46, Z(0.03), Z(0.5), m);
      bb(x0 + i * w + 0.012, x0 + (i + 1) * w - 0.012, 0.49, 0.93, Z(0), Z(0.07), m);
      const sx = x0 + (i + 0.5) * w;                    // 손잡이
      bb(sx - 0.014, sx + 0.014, 1.73, 1.94, Z(0.617), Z(0.623), mat.strap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.009, 8, 18), mat.strap); ring.rotation.y = PI / 2; ring.position.set(sx, 1.685, Z(0.62)); stat.add(ring);
    }
    for (const xe of [x0, x1]) {                        // 끝 칸막이
      bb(xe - 0.02, xe + 0.02, 0.12, 0.5, Z(0), Z(0.5), mat.twall); bb(xe - 0.008, xe + 0.008, 0.5, 1.45, Z(0), Z(0.5), mat.glassT);
      bb(xe - 0.015, xe + 0.015, 1.45, 1.48, Z(0), Z(0.52), mat.steel); tubeY(xe, Z(0.52), 0, 2.19, 0.018, mat.chrome);
      bb(xe - 0.01, xe + 0.01, 1.68, 1.82, Z(0), Z(0.33), mat.steel);
    }
    tubeX(x0, x1, 1.95, Z(0.62), 0.016, mat.chrome);
    bb(x0, x1, 1.795, 1.815, Z(0.3), Z(0.33), mat.steel); [0.08, 0.19].forEach(d => bb(x0, x1, 1.8, 1.81, Z(d), Z(d + 0.015), mat.steel));
    if (n > 3) [1 / 3, 2 / 3].forEach(f => { const px = x0 + (x1 - x0) * f; tubeY(px, Z(0.56), 0.46, 2.19, 0.018, mat.chrome); bb(px - 0.01, px + 0.01, 1.68, 1.82, Z(0), Z(0.33), mat.steel); });
    else { tubeY((x0 + x1) / 2, Z(0.62), 1.95, 2.19, 0.012, mat.chrome); sign(0.62, 0.19, printed(T.prio, 0.5), (x0 + x1) / 2, 1.32, Z(0.002), s < 0 ? PI : 0); }
    block(x0 - 0.02, x1 + 0.02, Z(0), Z(0.54));
  }
  const routeM = zoned(new THREE.MeshStandardMaterial({ map: T.route, roughness: 0.5, emissive: 0xffffff, emissiveMap: T.route, emissiveIntensity: 0.3 }));
  const cardM = T.strip.map(t => zoned(new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.12 })));
  const hangM = T.wide.map(t => zoned(new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.1 })));
  const ceilT = M(0xf2f2ee, 0.5, 0, { emissive: 0x6e6e6c }), tlcdM = lit(T.tlcd, 1.4), noticeM = printed(T.notice, 0.5), emerM = printed(T.emer, 0.45), gTrainM = multiply(T.gTrain);
  CARS.forEach((c, ci) => {
    const A = c - 9.75, B = c + 9.75;
    bb(A, B, -0.12, 0, -3.26, -0.14, mat.tfloor);
    { const m = new THREE.Mesh(new THREE.PlaneGeometry(19.5, 2.92), gTrainM); m.rotation.x = -PI / 2; m.position.set(c, 0.006, ZC); m.renderOrder = 1; tG.add(m); }
    bb(A, B, 2.2, 2.62, -3.26, -0.14, MP.steelD); bb(A, B, 2.185, 2.2, -3.16, -0.24, ceilT);
    bb(A + 0.2, B - 0.2, -1.1, -0.12, -3.2, -0.2, MP.black);
    sideWall(c, -0.24, -0.18, mat.twall, null); sideWall(c, -0.18, -0.14, MP.steel, -0.14);
    sideWall(c, -3.22, -3.16, mat.twall, null); sideWall(c, -3.26, -3.22, MP.steel, null);
    [-4.8, 0, 4.8].forEach((w, k) => { for (const z of [-0.19, -3.21]) { bb(c + w - 1.15, c + w + 1.15, 0.95, 1.8, z - 0.006, z + 0.006, mat.glassT); bb(c + w - 0.02, c + w + 0.02, 0.95, 1.8, z - 0.03, z + 0.03, mat.steelD);
        const zi = z > -1 ? -0.242 : -3.158; bb(c + w - 1.17, c + w + 1.17, 0.93, 0.95, zi - 0.004, zi + 0.004, mat.rubber); bb(c + w - 1.17, c + w + 1.17, 1.8, 1.82, zi - 0.004, zi + 0.004, mat.rubber); for (const e of [-1.16, 1.16]) bb(c + w + e - 0.01, c + w + e + 0.01, 0.93, 1.82, zi - 0.004, zi + 0.004, mat.rubber); }
      bb(c + w - 1.14, c + w + 1.14, 1.885, 2.155, -0.248, -0.24, mat.steelD); sign(2.2, 0.24, cardM[(ci * 3 + k) % ADS.length], c + w, 2.02, -0.2485, PI);
      bb(c + w - 1.14, c + w + 1.14, 1.885, 2.155, -3.16, -3.152, mat.steelD); sign(2.2, 0.24, cardM[(ci * 3 + k + 7) % ADS.length], c + w, 2.02, -3.1515, 0);
      benchSeat(c + w - 1.55, c + w + 1.55, 7, -0.24, -1, 'g'); benchSeat(c + w - 1.55, c + w + 1.55, 7, -3.16, 1, 'g'); });
    for (const e of [-1, 1]) { const a = c + e * 8.05, b = c + e * 9.55; benchSeat(Math.min(a, b), Math.max(a, b), 3, -0.24, -1, 'p'); benchSeat(Math.min(a, b), Math.max(a, b), 3, -3.16, 1, 'p'); }
    DOORS.forEach((d, di) => { const x = c + d;
      bb(x - 0.65, x + 0.65, 0, 0.004, -0.36, -0.24, mat.yellow); bb(x - 0.65, x + 0.65, 0, 0.004, -3.16, -3.04, mat.yellow);
      bb(x - 0.65, x + 0.65, -0.005, 0.005, -0.24, -0.14, MP.steelD); bb(x - 0.65, x + 0.65, -0.005, 0.005, -3.26, -3.16, MP.steelD);
      sign(1.3, 0.2, routeM, x, 2.04, -0.243, PI); sign(1.3, 0.2, routeM, x, 2.04, -3.157, 0);
      bb(x - 0.72, x - 0.65, 0, 1.9, -0.25, -0.24, mat.steel); bb(x + 0.65, x + 0.72, 0, 1.9, -0.25, -0.24, mat.steel);
      bb(x - 0.72, x - 0.65, 0, 1.9, -3.16, -3.15, mat.steel); bb(x + 0.65, x + 0.72, 0, 1.9, -3.16, -3.15, mat.steel);
      if (di % 2 == 0) { sign(0.15, 0.15, emerM, x + 0.795, 1.36, -0.2415, PI); sign(0.15, 0.15, emerM, x - 0.795, 1.36, -3.1585, 0); }
      bb(x - 0.2, x + 0.2, 2.178, 2.186, ZC - 0.2, ZC + 0.2, mat.dark);
    });
    // 천장: 송풍구, 이어지는 조명, 안내 화면, 걸이 광고, 스피커, 카메라
    bb(A + 0.5, B - 0.5, 2.17, 2.185, ZC - 0.22, ZC + 0.22, mat.vent);
    for (const dz of [-0.82, 0.82]) { bb(A + 0.4, B - 0.4, 2.178, 2.186, ZC + dz - 0.075, ZC + dz + 0.075, mat.steelD); for (let x = A + 0.5; x < B - 1.5; x += 1.9) bb(x, x + 1.84, 2.171, 2.179, ZC + dz - 0.05, ZC + dz + 0.05, mat.light); }
    [-4.8, 4.8].forEach(w => { const x = c + w; bb(x - 0.05, x + 0.05, 1.86, 2.185, ZC - 0.62, ZC + 0.62, mat.black);
      for (const dz of [-0.31, 0.31]) { sign(0.56, 0.3, tlcdM, x + 0.052, 2.02, ZC + dz, PI / 2); sign(0.56, 0.3, tlcdM, x - 0.052, 2.02, ZC + dz, -PI / 2); } });
    [-7.2, -2.4, 0, 2.4, 7.2].forEach((w, k) => { const x = c + w; for (const dz of [-0.2, 0.2]) tubeY(x, ZC + dz, 2.12, 2.172, 0.004, mat.steelD, 6); bb(x - 0.006, x + 0.006, 2.105, 2.125, ZC - 0.27, ZC + 0.27, mat.steelD); bb(x - 0.003, x + 0.003, 1.84, 2.11, ZC - 0.26, ZC + 0.26, mat.white);
      sign(0.5, 0.25, hangM[(ci * 5 + k * 2) % ADS.length], x + 0.0035, 1.975, ZC, PI / 2); sign(0.5, 0.25, hangM[(ci * 5 + k * 2 + 3) % ADS.length], x - 0.0035, 1.975, ZC, -PI / 2); });
    for (const w of [-6, 6]) { tubeY(c + w, ZC - 0.5, 2.176, 2.186, 0.07, mat.dark, 16); tubeY(c + w, ZC + 0.5, 2.15, 2.186, 0.045, mat.white, 14); ball(c + w, 2.148, ZC + 0.5, 0.04, mat.black); }
    // 양 끝 벽과 통로
    for (const e of [-1, 1]) { const xe = c + e * 9.71;
      bb(xe - 0.04, xe + 0.04, 0, 2.2, -3.16, ZC - 0.65, mat.twall); bb(xe - 0.04, xe + 0.04, 0, 2.2, ZC + 0.65, -0.24, mat.twall); bb(xe - 0.04, xe + 0.04, 1.95, 2.2, ZC - 0.65, ZC + 0.65, mat.twall);
      [ZC - 0.65, ZC + 0.65].forEach(z => bb(xe - 0.05, xe + 0.05, 0, 1.95, z - 0.02, z + 0.02, mat.steel));
      sign(0.3, 0.3, noticeM, xe - e * 0.042, 1.45, ZC + 1.0, -e * PI / 2); sign(0.3, 0.15, printed(T.carno[ci], 0.45), xe - e * 0.042, 1.82, ZC - 1.0, -e * PI / 2);
      tubeY(xe - e * 0.11, ZC - 1.12, 0.12, 0.56, 0.06, mat.red, 14); tubeY(xe - e * 0.11, ZC - 1.12, 0.56, 0.63, 0.028, mat.dark, 10); bb(xe - e * 0.04, xe - e * 0.05, 0.7, 0.86, ZC - 1.2, ZC - 1.04, mat.red);
      const outer = (ci == 0 && e < 0) || (ci == CARS.length - 1 && e > 0);
      if (outer) { bb(xe + e * 0.045, xe + e * 0.055, 1.0, 1.95, ZC - 1.2, ZC + 1.2, MP.black); for (const dz of [-1.0, 1.0]) bb(xe + e * 0.045, xe + e * 0.07, 0.45, 0.58, ZC + dz - 0.12, ZC + dz + 0.12, e > 0 ? MP.light : MP.lightR);
        bb(xe - 0.03, xe + 0.03, 0, 1.95, ZC - 0.65, ZC + 0.65, mat.steelD); bb(xe - e * 0.035, xe - e * 0.04, 1.0, 1.6, ZC - 0.3, ZC + 0.3, mat.black); block(xe - 0.1, xe + e * 1, -3.3, -0.2); }
      else { block(xe - 0.06, xe + e * 0.35, -3.3, ZC - 0.6); block(xe - 0.06, xe + e * 0.35, ZC + 0.6, -0.2);
        if (e > 0) { bb(B, B + 0.5, -0.1, 0.004, ZC - 0.7, ZC + 0.7, mat.steelD); bb(B, B + 0.5, 1.97, 2.03, ZC - 0.7, ZC + 0.7, mat.rubber);
          for (const dz of [-0.7, 0.7]) for (let k = 0; k < 5; k++) bb(B + k * 0.1, B + k * 0.1 + 0.1, 0, 2.0, ZC + dz - (k % 2 ? 0.03 : 0.06), ZC + dz + (k % 2 ? 0.03 : 0.06), mat.rubber); } }
    }
    { const p = new THREE.PointLight(0xf2f7ff, 5.2, 17, 2); p.position.set(c, 1.5, ZC); tG.add(p); }       // 칸마다 등 하나(나머지 밝기는 찍어 둔 반사광이 맡는다)
  });
  block(-31, 31, -4, -3.16);
  ZONE = 'p'; stat = statS;

  /* ── 조명 ── */
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4ca, 0.2));
  for (const x of [-25.5, -8.5, 8.5, 25.5]) { const p = new THREE.PointLight(0xfff7ea, 8.5, 30, 2); p.position.set(x, 2.7, 3.4); sG.add(p); }

  /* ── 정적 메시 병합(역과 열차를 따로) ── */
  for (const [src, dst] of [[statS, sG], [statT, tG]]) { src.updateMatrixWorld(true); const by = new Map();
    src.traverse(o => { if (o.isMesh) { const g = o.geometry.clone().applyMatrix4(o.matrixWorld); if (o.matrixWorld.determinant() < 0) { const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; } }
      if (!by.has(o.material.uuid)) by.set(o.material.uuid, { m: o.material, gs: [] }); by.get(o.material.uuid).gs.push(g); } });
    for (const { m, gs } of by.values()) { const me = new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m); me.renderOrder = m.transparent ? 2 : 0; me.frustumCulled = false; me.matrixAutoUpdate = false; dst.add(me); } }
  return leaves;
}

/* ───────────── 후처리: 구석 그늘, 빛 번짐, 가장자리 어둡게 ───────────── */
let composer = null, gtao = null, grade = null, hq = true;
function setupPost() {
  const pr = renderer.getPixelRatio(), w = innerWidth, h = innerHeight;
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 2 }));
  composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, w, h); gtao.normalMaterial.side = THREE.DoubleSide; gtao.blendIntensity = 0.9;
  const ss = gtao.setSize.bind(gtao); gtao.setSize = (a, b) => ss(Math.ceil(a * 0.5), Math.ceil(b * 0.5));     // 구석 그늘은 절반 해상도로 계산한다
  gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: 12 }); gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 12 });
  composer.addPass(gtao);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.16, 0.5, 1.6));
  grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); } void main(){ vec4 c = texture2D( tDiffuse, vUv ); float d = distance( vUv, vec2(0.5) ); c.rgb *= mix( 1.0, 0.72, smoothstep( 0.42, 0.95, d ) ); c.rgb *= vec3( 0.985, 1.0, 1.012 ); c.rgb *= 1.0 + ( h( vUv * 913.0 ) - 0.5 ) * 0.035; gl_FragColor = c; }' });
  composer.addPass(grade); composer.addPass(new OutputPass());
}
function resizePost() { if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); } }
const PR_MAX = Math.min(window.devicePixelRatio || 1, 1.5);
