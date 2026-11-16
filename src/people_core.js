/* ───────────── 수학 도구 ───────────── */
const PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const gauss = x => Math.exp(-x * x);
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], vlen = a => Math.hypot(a[0], a[1], a[2]);
const vnorm = a => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vlerp = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const _c = new THREE.Color();
const C = h => { _c.set(h); return [_c.r, _c.g, _c.b]; };
const cmix = (a, b, t) => vlerp(a, b, t), cmul = (a, f) => [a[0] * f, a[1] * f, a[2] * f];

/* ───────────── 뼈 번호 ───────────── */
const ROOT = 0, HIPS = 1, SPINE = 2, CHEST = 3, NECK = 4, HEAD = 5, SHL = 6, ELL = 7, WRL = 8, FL1 = 9, FL2 = 10, THL = 11, SHR = 12, ELR = 13, WRR = 14, FR1 = 15, FR2 = 16, THR = 17, LEGL = 18, KNL = 19, FTL = 20, LEGR = 21, KNR = 22, FTR = 23;
const BONE_NAMES = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'shL', 'elL', 'wrL', 'fL1', 'fL2', 'thL', 'shR', 'elR', 'wrR', 'fR1', 'fR2', 'thR', 'legL', 'knL', 'ftL', 'legR', 'knR', 'ftR'];
const BONE_PARENT = [-1, 0, 1, 2, 3, 4, 3, 6, 7, 8, 9, 8, 3, 12, 13, 14, 15, 14, 1, 18, 19, 1, 21, 22];

/* ───────────── 메시 빌더: 사람 한 명을 하나의 이어진 표면으로 만든다 ───────────── */
class MB {
  constructor(q = 1) { this.q = q; this.pos = []; this.col = []; this.si = []; this.sw = []; this.idx = []; }
  v(p, c, rough, w) {
    const i = this.pos.length / 3; this.pos.push(p[0], p[1], p[2]); this.col.push(c[0], c[1], c[2], rough);
    const e = []; for (const k in w) if (w[k] > 1e-4) e.push([+k, w[k]]); e.sort((a, b) => b[1] - a[1]); e.length = Math.min(e.length, 4);
    let s = 0; for (const a of e) s += a[1];
    for (let k = 0; k < 4; k++) { this.si.push(e[k] ? e[k][0] : 0); this.sw.push(e[k] ? e[k][1] / s : 0); }
    return i;
  }
  stitch(rows, wrap, oks) {
    for (let j = 0; j < rows.length - 1; j++) { const n = rows[j].length, m = wrap ? n : n - 1;
      for (let i = 0; i < m; i++) { const i2 = (i + 1) % n; const q = [[j, i], [j, i2], [j + 1, i2], [j + 1, i]];
        const ok = oks ? q.filter(([a, b]) => oks[a][b]) : q; const id = ok.map(([a, b]) => rows[a][b]);
        if (id.length == 4) this.idx.push(id[0], id[1], id[2], id[0], id[2], id[3]); else if (id.length == 3) this.idx.push(id[0], id[1], id[2]); } }
  }
}
// 기준 단면(station)들 사이를 매끄럽게 이어 주는 보간기
function sampler(st) {
  const n = st.length, T = st.map(s => s.t), K = ['rx', 'rf', 'rb', 'n'];
  const get = (i, k) => k < 3 ? st[i].c[k] : st[i][K[k - 3]];
  const M = [];
  for (let k = 0; k < 7; k++) { const m = []; for (let i = 0; i < n; i++) {
    const d0 = i > 0 ? (get(i, k) - get(i - 1, k)) / (T[i] - T[i - 1]) : null, d1 = i < n - 1 ? (get(i + 1, k) - get(i, k)) / (T[i + 1] - T[i]) : null;
    m.push(d0 == null ? d1 : d1 == null ? d0 : (d0 * d1 <= 0 ? 0 : (d0 + d1) / 2)); } M.push(m); }
  const hasF = !!st[0].B;
  return t => { let i = 0; while (i < n - 2 && t > T[i + 1]) i++;
    const h = T[i + 1] - T[i], u = clamp((t - T[i]) / h), u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2, o = [];
    for (let k = 0; k < 7; k++) o.push(h00 * get(i, k) + h10 * h * M[k][i] + h01 * get(i + 1, k) + h11 * h * M[k][i + 1]);
    const R = { c: [o[0], o[1], o[2]], rx: Math.max(5e-4, o[3]), rf: Math.max(5e-4, o[4]), rb: Math.max(5e-4, o[5]), n: Math.max(1.5, o[6]) };
    if (hasF) { R.B = vnorm(vlerp(st[i].B, st[i + 1].B, u)); R.N = vnorm(vlerp(st[i].N, st[i + 1].N, u)); }
    return R; };
}
// 단면을 따라 표면을 뽑아낸다(loft). 단면은 둥근 사각형에 가까운 초타원이고 앞뒤 두께를 따로 줄 수 있다.
function loft(mb, st, o) {
  const seg = o.seg || 16, B0 = o.B || [1, 0, 0], N0 = o.N || [0, 0, 1], f = sampler(st), T0 = st[0].t, T1 = st[st.length - 1].t;
  const ts = []; for (let i = 0; i < st.length - 1; i++) { const n = Math.max(1, Math.ceil(Math.abs(st[i + 1].t - st[i].t) * mb.q / (o.ds || 0.03))); for (let k = 0; k < n; k++) ts.push(lerp(st[i].t, st[i + 1].t, k / n)); } ts.push(T1);
  const rows = [], oks = [], edges = { L: [], R: [] };
  const ringPt = (R, phi, t) => { const Bv = R.B || B0, Nv = R.N || N0, s = Math.sin(phi), c = Math.cos(phi), e = 2 / R.n, rv = c >= 0 ? R.rf : R.rb;
    let u = R.rx * Math.sign(s) * Math.pow(Math.abs(s), e), v = rv * Math.sign(c) * Math.pow(Math.abs(c), e);
    let gu = u / (R.rx * R.rx), gv = v / (rv * rv); const gl = Math.hypot(gu, gv) || 1; gu /= gl; gv /= gl;
    const a = o.add ? o.add(t, phi) * (R.sc ?? 1) : 0; u += gu * a; v += gv * a;
    return { p: [R.c[0] + Bv[0] * u + Nv[0] * v, R.c[1] + Bv[1] * u + Nv[1] * v, R.c[2] + Bv[2] * u + Nv[2] * v], n: [Bv[0] * gu + Nv[0] * gv, Bv[1] * gu + Nv[1] * gv, Bv[2] * gu + Nv[2] * gv] }; };
  const emit = (R, t, sc, main) => { const row = [], ok = []; let i1 = 0, pe = 0;
    const RR = sc == 1 ? R : { ...R, rx: R.rx * sc, rf: R.rf * sc, rb: R.rb * sc, sc };
    if (main && o.open) { const g = o.open(t); if (g > 0) { pe = Math.asin(Math.min(1, Math.pow(Math.min(1, g / RR.rx), RR.n / 2))); i1 = Math.max(1, Math.round(pe / (TAU / seg))); } }
    for (let i = 0; i < seg; i++) { let phi = TAU * i / seg; if (i1) { if (i == i1) phi = pe; else if (i == seg - i1) phi = -pe; }
      let { p, n } = ringPt(RR, phi, t); if (o.warp) p = o.warp(p, phi, t);
      row.push(mb.v(p, o.colFn ? o.colFn(p, t, phi) : o.col, o.rough ?? 0.85, o.wFn ? o.wFn(p, t, phi) : o.w)); ok.push(!i1 || (i >= i1 && i <= seg - i1));
      if (i1 && i == i1) edges.L.push({ p, n, t }); if (i1 && i == seg - i1) edges.R.push({ p, n, t }); }
    rows.push(row); oks.push(ok); };
  const cap = (t, te, type, first) => { if (!type) return; const R = f(t), ax = vnorm(vsub(R.c, f(te).c)), L = o.capLen ?? 0.75 * Math.min(R.rx, (R.rf + R.rb) / 2), list = [];
    if (type == 'round') for (let k = 1; k <= 4; k++) { const a = k / 4 * PI / 2; list.push([{ ...R, c: vadd(R.c, vmul(ax, L * Math.sin(a))) }, Math.max(0.03, Math.cos(a))]); }
    if (type == 'flat') list.push([R, 0.03]);
    if (type == 'lip') list.push([{ ...R, c: vadd(R.c, vmul(ax, -0.012)) }, 0.9]);
    if (first) list.reverse(); for (const [r2, sc] of list) emit(r2, t, sc, false); };
  cap(T0, T0 + (T1 - T0) * 0.03, o.cap0, true);
  for (const t of ts) emit(f(t), t, 1, true);
  cap(T1, T1 - (T1 - T0) * 0.03, o.cap1, false);
  mb.stitch(rows, true, o.open ? oks : null);
  return { edges, surf: (t, phi, off = 0) => { const q = ringPt(f(t), phi, t); return { p: vadd(q.p, vmul(q.n, off)), n: q.n }; } };
}
// 임의의 경로를 따라가는 관(끈, 눈썹, 안경테 등). up 방향이 두께 방향이 된다.
function tube(mb, pts, o) {
  let len = 0; const st = pts.map((q, i) => { if (i) len += vlen(vsub(q.p, pts[i - 1].p));
    const T = vnorm(vsub(pts[Math.min(i + 1, pts.length - 1)].p, pts[Math.max(i - 1, 0)].p)), up = q.up || o.up || [0, 0, 1];
    const Bv = vnorm(vcross(up, T)), Nv = vnorm(vcross(T, Bv)), rx = q.rx ?? o.rx, ry = q.ry ?? o.ry ?? rx;
    return { t: len + i * 1e-6, c: q.p, rx, rf: ry, rb: ry, n: o.n || 2, B: Bv, N: Nv }; });
  return loft(mb, st, { seg: 8, ds: 0.02, ...o });
}
function ellipsoid(mb, c, ax, rad, col, rough, w, nu = 12, nv = 8) {
  const rows = [];
  for (let j = 0; j <= nv; j++) { const th = PI * j / nv, row = [];
    for (let i = 0; i < nu; i++) { const ph = TAU * i / nu, a = Math.sin(th) * Math.cos(ph) * rad[0], b = Math.cos(th) * rad[1], d = Math.sin(th) * Math.sin(ph) * rad[2];
      row.push(mb.v([c[0] + ax[0][0] * a + ax[1][0] * b + ax[2][0] * d, c[1] + ax[0][1] * a + ax[1][1] * b + ax[2][1] * d, c[2] + ax[0][2] * a + ax[1][2] * b + ax[2][2] * d], col, rough, w)); }
    rows.push(row); }
  mb.stitch(rows, true);
}
const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/* ───────────── 색 ───────────── */
const SKIN = [0xf0c8a4, 0xe9bd95, 0xf3d0b1, 0xdcab84, 0xecc09e, 0xf0c6a6];
const HAIR = [0x17130f, 0x1c1713, 0x17130f, 0x2b1e15, 0x3b2a1c, 0x513824];
const GRAY = [0xb4b4b4, 0x8a8a8a, 0xd6d6d6];
const NEUT = [0x17181a, 0x17181a, 0x17181a, 0x2a2c30, 0x3b3f45, 0x6a6f77, 0xc6c2b8, 0xe6e3dc, 0x1e2942, 0x47392d, 0x87775f, 0xf0eee9, 0x5a6048];
const ACCENT = [0x862e2e, 0x2e5c86, 0x3d6848, 0xc48728, 0x67488a, 0xd49eab, 0x98b3d2, 0xb0462e];
const DENIM = [0x2b4875, 0x1c2e50, 0x5a7ca5, 0x15171b, 0x8fa9c6];
const BOTC = [0x17181a, 0x17181a, 0x2a2c30, 0x484c53, 0x87775f, 0xc6bca5, 0x1e2942];

/* ───────────── 머리 형태 ───────────── */
function headFn(hp) {
  return (th, ph) => {
    const st = Math.sin(th), sx = st * Math.sin(ph), sy = Math.cos(th), sz = st * Math.cos(ph), dn = Math.max(0, -sy), up = Math.max(0, sy);
    let x = hp.a * Math.sign(sx) * Math.pow(Math.abs(sx), 0.9), y = hp.b * sy, z = sz > 0 ? hp.cf * Math.pow(sz, 0.8) : -hp.cb * Math.pow(-sz, 0.92);
    x *= 1 + 0.035 * up * (sz < 0 ? 1 : 0.4);                         // 뒤통수 쪽이 조금 더 넓다
    x *= 1 - hp.jaw * Math.pow(dn, 1.45);                            // 턱으로 갈수록 좁아진다
    if (sz > 0) z *= 1 - 0.13 * Math.pow(dn, 2.4); else z *= 1 - 0.55 * smooth(dn, 0.15, 0.95);   // 목덜미는 안으로 들어간다
    if (y < 0) y *= 1 - 0.07 * (1 - Math.abs(sx));
    if (sz > 0) { const g = (a, b) => Math.exp(-(a * a + b * b)), ax = Math.abs(x);
      z += 0.019 * g(x / 0.0125, (y + 0.027) / 0.016);                // 코끝
      z += 0.0075 * g(x / 0.0095, (y + 0.004) / 0.026);               // 콧대
      z += 0.0032 * g(x / 0.02, (y + 0.061) / 0.008);                 // 입술
      z += 0.0055 * g(x / 0.028, (y + 0.1) / 0.016);                  // 턱끝
      z -= 0.0055 * g((ax - 0.034) / 0.017, (y + 0.001) / 0.011);     // 눈두덩
      z += 0.0028 * g((ax - 0.03) / 0.03, (y - 0.029) / 0.01);        // 눈썹뼈
      z += 0.0035 * g((ax - 0.046) / 0.022, (y + 0.032) / 0.03); }    // 광대
    return [x, y, z];
  };
}
function makeSurf(HP) {
  const G = [], N = 64; for (let a = 0; a <= N; a++) for (let b = 0; b <= N; b++) { const th = 0.25 + a / N * 2.5, ph = -1.45 + b / N * 2.9; G.push([th, ph, ...HP(th, ph)]); }
  return (x, y) => { let best = null, bd = 1e9; for (const g of G) { const d = (g[2] - x) ** 2 + (g[3] - y) ** 2; if (d < bd) { bd = d; best = g; } }
    let th = best[0], ph = best[1], st = 2.5 / N, sp = 2.9 / N;
    for (let it = 0; it < 3; it++) { let b2 = null; bd = 1e9; for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) { const t2 = th + a * st / 4, p2 = ph + b * sp / 4, q = HP(t2, p2), d = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (d < bd) { bd = d; b2 = [t2, p2]; } } th = b2[0]; ph = b2[1]; st /= 4; sp /= 4; }
    const p = HP(th, ph), e = 0.004; let n = vnorm(vcross(vsub(HP(th, ph + e), p), vsub(HP(th + e, ph), p))); if (n[2] < 0) n = vmul(n, -1); return { p, n }; };
}

/* ───────────── 사람 한 명 만들기 ───────────── */
function makePerson(seed, q = 1, opt = {}) {
  const r = rng(seed), pick = a => a[(r() * a.length) | 0], ch = p => r() < p, rr = (a, b) => a + (b - a) * r();
  const fem = ch(0.5), old = ch(0.16), H = fem ? rr(1.56, 1.68) : rr(1.68, 1.82), s = H / 1.735;
  const bulk = (fem ? 0.93 : 0.98) + r() * 0.15 + (old ? 0.04 : 0);
  const B = { fem, old, bulk, sw: (fem ? 0.176 : 0.2) * rr(0.97, 1.03), hip: (fem ? 0.168 : 0.160) * bulk, waist: (fem ? 0.124 : 0.144) * bulk, chestW: (fem ? 0.142 : 0.156) * (0.5 + 0.5 * bulk), chestF: (fem ? 0.106 : 0.11) * bulk,
    dep: 0.7 + 0.3 * bulk, belly: Math.max(0, bulk - 1.03) * 0.4 + (old ? 0.012 : 0), limb: (fem ? 0.86 : 1) * (0.7 + 0.3 * bulk), neckR: fem ? 0.042 : 0.05 };
  B.sx = B.sw - 0.016;
  const SEG = n => Math.max(6, Math.round(n * q)), mb = new MB(q);

  /* 차림 고르기 */
  const skinC = C(pick(SKIN)), hairC = C(old ? pick(GRAY) : pick(HAIR));
  const topT = (() => { const x = r(); return x < 0.07 ? 'tee' : x < 0.17 ? 'shirt' : x < 0.31 ? 'knit' : x < 0.46 ? 'hoodie' : x < 0.58 ? 'jacket' : x < 0.66 ? (fem ? 'coat' : 'suit') : x < 0.8 ? 'coat' : x < 0.9 ? 'puffer' : 'longpuffer'; })();
  const TOPS = { tee: { e: 0.012, k: 0.5, hem: 0.935, sl: 'short', neck: 'crew', rough: 0.93 }, shirt: { e: 0.012, k: 0.45, hem: 0.925, sl: 'long', cuff: 'shirt', neck: 'shirt', rough: 0.8 },
    knit: { e: 0.02, k: 0.7, hem: 0.93, band: 1, sl: 'long', cuff: 'rib', neck: 'crew', rough: 0.97 }, hoodie: { e: 0.025, k: 0.8, hem: 0.915, band: 1, sl: 'long', cuff: 'rib', neck: 'crew', hood: 1, rough: 0.97 },
    jacket: { e: 0.025, k: 0.75, hem: 0.925, sl: 'long', cuff: 'plain', neck: 'open', open: 'straight', rough: 0.86 }, suit: { e: 0.018, k: 0.5, hem: 0.865, sl: 'long', cuff: 'suit', neck: 'open', open: 'v', rough: 0.74 },
    coat: { e: 0.028, k: 0.75, hem: 0.5, flare: 0.045, sl: 'long', cuff: 'plain', neck: 'open', open: 'v2', rough: 0.92 }, puffer: { e: 0.038, k: 0.9, hem: 0.9, quilt: 1, sl: 'long', cuff: 'rib', neck: 'stand', rough: 0.42 },
    longpuffer: { e: 0.038, k: 0.9, hem: 0.4, quilt: 1, sl: 'long', cuff: 'rib', neck: 'stand', hood: 1, rough: 0.46 } };
  const g = { flare: 0, dip: 0.016, ...TOPS[topT] };
  g.color = C(topT == 'suit' ? pick([0x17181a, 0x1e2942, 0x3b3f45, 0x2a2c30]) : topT == 'shirt' ? pick([0xf0eee9, 0xdde6f0, 0xb7c9de, 0xf0eee9, 0xe7d9d9]) : topT.includes('puffer') ? pick([0x17181a, 0x17181a, 0x17181a, 0xe6e3dc, 0x47392d, 0x3d6848, 0x1e2942, 0x6a6f77, 0xc6c2b8]) : ch(0.72) ? pick(NEUT) : pick(ACCENT));
  const botT = topT == 'suit' ? 'slacks' : pick(fem ? ['slim', 'straight', 'wide', 'skirt', 'skirt', 'slacks', 'wide'] : (topT == 'tee' ? ['slim', 'straight', 'shorts', 'wide'] : ['slim', 'straight', 'straight', 'wide', 'slacks', 'jogger']));
  const denim = (botT == 'slim' || botT == 'straight' || botT == 'wide') && ch(0.6);
  const botC = C(topT == 'suit' ? 0 : denim ? pick(DENIM) : pick(BOTC)); if (topT == 'suit') botC.splice(0, 3, ...g.color);
  const shoeT = topT == 'suit' ? 'dress' : pick(['sneaker', 'sneaker', 'sneaker', 'boot', fem ? 'sneaker' : 'dress']);
  const shoeC = C(shoeT == 'dress' ? pick([0x17130f, 0x3a2416]) : shoeT == 'boot' ? pick([0x17181a, 0x47392d, 0x2a2c30]) : pick([0xf2f2f0, 0xf2f2f0, 0x17181a, 0x55595f, 0xd9d2c4]));
  const hairT = old ? (fem ? pick(['perm', 'perm', 'bob']) : pick(['short', 'bald', 'buzz'])) : pick(fem ? ['bob', 'bob', 'long', 'long', 'longpart', 'ponytail', 'bun', 'beanieL', 'capL'] : ['short', 'twoblock', 'twoblock', 'part', 'part', 'buzz', 'cap', 'beanie']);
  const mask = ch(0.24), glasses = ch(old ? 0.5 : 0.26), ear = r() < 0.3 ? 'buds' : r() < 0.1 ? 'phones' : '', budT = ch(0.6) ? 'stem' : 'bean';
  const bag = r() < 0.3 ? 'back' : r() < 0.28 ? 'cross' : '', scarf = (topT == 'coat' || topT == 'jacket') && ch(0.35);

  /* 몸 치수: 높이에 따른 몸통 너비·앞뒤 두께 */
  const bodyAt = y => { const T = [[0.80, B.hip * 0.93, 0.100, 0.108], [0.86, B.hip * 0.99, 0.104, 0.118], [0.92, B.hip, 0.106, 0.122], [1.0, B.hip * 0.4 + B.waist * 0.6 + 0.004, 0.100 + B.belly * 0.5, 0.104],
      [1.08, B.waist, 0.098 + B.belly, 0.090], [1.18, B.waist + 0.012, 0.102 + B.belly * 0.7, 0.094], [1.28, B.chestW, B.chestF / B.dep, 0.104], [1.34, B.chestW + 0.006, B.chestF / B.dep - 0.004, 0.106]];
    y = clamp(y, 0.80, 1.34); let i = 0; while (i < T.length - 2 && y > T[i + 1][0]) i++; const u = (y - T[i][0]) / (T[i + 1][0] - T[i][0]);
    return { rx: lerp(T[i][1], T[i + 1][1], u), rf: lerp(T[i][2], T[i + 1][2], u) * B.dep + (fem ? 0.013 * gauss((y - 1.262) / 0.05) : 0), rb: lerp(T[i][3], T[i + 1][3], u) * B.dep }; };
  const ARM = [[0, 0.043, 0.045], [0.06, 0.049, 0.053], [0.13, 0.045, 0.051], [0.22, 0.039, 0.043], [0.285, 0.036, 0.039], [0.33, 0.038, 0.042], [0.40, 0.034, 0.037], [0.48, 0.027, 0.031], [0.545, 0.021, 0.027]];
  const armAt = d => { d = clamp(d, 0, 0.545); let i = 0; while (i < ARM.length - 2 && d > ARM[i + 1][0]) i++; const u = (d - ARM[i][0]) / (ARM[i + 1][0] - ARM[i][0]); return [lerp(ARM[i][1], ARM[i + 1][1], u) * B.limb, lerp(ARM[i][2], ARM[i + 1][2], u) * B.limb]; };
  const LEG = [[0.06, 0.032, 0.036, 0.036], [0.10, 0.031, 0.033, 0.034], [0.20, 0.036, 0.036, 0.040], [0.34, 0.048, 0.044, 0.062], [0.43, 0.050, 0.048, 0.056], [0.49, 0.050, 0.054, 0.050], [0.54, 0.052, 0.055, 0.054], [0.68, 0.066, 0.070, 0.072], [0.82, 0.079, 0.086, 0.1], [0.93, 0.09, 0.094, 0.11], [0.98, 0.084, 0.088, 0.098]];
  const legAt = y => { y = clamp(y, 0.06, 0.98); let i = 0; while (i < LEG.length - 2 && y > LEG[i + 1][0]) i++; const u = (y - LEG[i][0]) / (LEG[i + 1][0] - LEG[i][0]), m = B.limb * (fem ? 1.05 : 1); return [lerp(LEG[i][1], LEG[i + 1][1], u) * m, lerp(LEG[i][2], LEG[i + 1][2], u) * m, lerp(LEG[i][3], LEG[i + 1][3], u) * m]; };

  /* 뼈에 붙는 정도(가중치) */
  const wTorso = p => { const y = p[1], w = {}, a = smooth(y, 0.95, 1.08), b = smooth(y, 1.15, 1.29);
    w[HIPS] = 1 - a; w[SPINE] = a * (1 - b); w[CHEST] = a * b;
    const f = smooth(Math.abs(p[0]), B.sw - 0.08, B.sw - 0.005) * smooth(y, 1.30, 1.38) * 0.7;
    if (f > 0) { for (const k in w) w[k] *= 1 - f; w[p[0] > 0 ? SHL : SHR] = f; }
    const n = smooth(y, 1.462, 1.51); if (n > 0) { for (const k in w) w[k] *= 1 - n; w[NECK] = n; }
    if (y < 0.9) { const f2 = smooth(0.93 - y, 0, 0.2) * 0.92, g2 = smooth(0.54 - y, 0, 0.12), l = clamp(0.5 + p[0] / 0.16);
      for (const k in w) w[k] *= 1 - f2; w[LEGL] = f2 * l * (1 - g2); w[LEGR] = f2 * (1 - l) * (1 - g2); w[KNL] = f2 * l * g2; w[KNR] = f2 * (1 - l) * g2; }
    return w; };
  const wLeg = side => p => { const y = p[1], hip = smooth(y, 0.8, 0.94) * 0.75, k = smooth(0.55 - y, 0, 0.12), a = smooth(0.115 - y, 0, 0.05), L = side > 0 ? LEGL : LEGR, K = side > 0 ? KNL : KNR, F = side > 0 ? FTL : FTR;
    return { [HIPS]: hip * (1 - k), [L]: (1 - hip) * (1 - k), [K]: k * (1 - a), [F]: k * a }; };
  const wArm = side => (p, d) => { const s0 = 1 - smooth(d, 0, 0.06), el = smooth(d, 0.225, 0.345), wr = smooth(d, 0.515, 0.555), S = side > 0 ? SHL : SHR, E = side > 0 ? ELL : ELR, W = side > 0 ? WRL : WRR;
    return { [CHEST]: 0.45 * s0, [S]: (1 - 0.45 * s0) * (1 - el), [E]: el * (1 - wr), [W]: el * wr }; };

  const PANT = { slim: y => 0.008, straight: y => 0.013 + 0.02 * smooth(0.5 - y, 0, 0.35), slacks: y => 0.014 + 0.024 * smooth(0.5 - y, 0, 0.38), wide: y => 0.02 + 0.062 * smooth(0.8 - y, 0, 0.62), jogger: y => (0.018 + 0.012 * smooth(0.5 - y, 0, 0.3)) * (1 - 0.8 * smooth(0.16 - y, 0, 0.05)), shorts: y => 0.02, skirt: y => 0 };
  const legOut = y => { const L = legAt(y), pe = PANT[botT](y); return { rx: 0.088 + L[0] + pe, rf: L[1] + pe, rb: L[2] + pe }; };
  /* ── 상의 몸통 ── */
  const QP = 0.088;
  function torso(gm) {
    const st = [], chb = bodyAt(1.28), add = (y, rx, rf, rb, n = 2.5) => st.push({ t: y, c: [0, y, 0], rx, rf, rb, n });
    const ys = []; for (let y = gm.hem; y < 1.33; y += 0.045) ys.push(y); ys.push(1.34);
    for (const y of ys) { const b = bodyAt(Math.max(y, 0.86)), dr = gm.k * smooth(1.28 - y, 0, 0.14);
      let rx = lerp(b.rx, Math.max(b.rx, chb.rx - 0.008), dr) + gm.e, rf = lerp(b.rf, Math.max(b.rf, chb.rf - 0.012), dr) + gm.e, rb = lerp(b.rb, Math.max(b.rb, chb.rb - 0.006), dr) + gm.e * 0.9;
      if (y < 0.86) { const f = 0.86 - y; rx += f * gm.flare; rf += f * gm.flare * 0.5; rb += f * gm.flare * 0.5; }
      if (gm.band && y < gm.hem + 0.04) { rx *= 0.955; rf *= 0.955; rb *= 0.955; }
      if (y < 1.0 && y > 0.8) { const lo = legOut(y), m = gm === g ? 0.007 : 0.002; rx = Math.max(rx, lo.rx + m); rf = Math.max(rf, lo.rf + m); rb = Math.max(rb, lo.rb + m); }
      add(y, rx, rf, rb, 2.6); }
    const e = gm.e, cr = gm.cr;
    add(1.375, B.sw + 0.002 + e * 0.6, chb.rf - 0.016 + e, 0.103 * B.dep + e * 0.9, 2.4);
    add(1.405, B.sw + 0.006 + e * 0.6, 0.08 + e * 0.8, 0.09 + e * 0.8, 2.15);
    add(1.428, B.sw - 0.034 + e * 0.4, 0.069 + e * 0.6, 0.082 + e * 0.6, 2.05);
    add(1.446, 0.118 + e * 0.25, 0.062 + e * 0.4, 0.075 + e * 0.4, 2);
    add(1.46, 0.084, 0.06 + e * 0.15, 0.066, 2);
    add(1.47, cr, cr, cr * 0.96, 2);
    if (gm.neck == 'stand') { add(1.482, cr + 0.012, cr + 0.012, cr + 0.008, 2); add(1.5, cr + 0.012, cr + 0.012, cr + 0.008, 2); }
    if (gm.neck == 'turtle') { add(1.482, cr - 0.004, cr - 0.004, cr - 0.006, 2); add(1.502, cr - 0.004, cr - 0.004, cr - 0.006, 2); }
    const qf = y => Math.sqrt(Math.abs(Math.sin(PI * (y - gm.hem) / QP)));
    return loft(mb, st, { seg: SEG(32), ds: gm.quilt ? 0.011 : 0.022, rough: gm.rough,
      add: gm.quilt ? (t => t < 1.46 ? (qf(t) - 0.35) * 0.013 : 0) : null,
      colFn: (p, t) => { let c = gm.color; if (gm.quilt && t < 1.46) c = cmul(c, 0.7 + 0.3 * qf(t)); if (gm.band && t < gm.hem + 0.04) c = cmul(c, 0.9); return c; },
      wFn: wTorso, warp: (p, phi, t) => { const d = gm.dip * smooth(t, 1.43, 1.47) * Math.cos(phi); return d ? [p[0], p[1] - d, p[2]] : p; },
      open: gm.open, cap0: 'lip', cap1: (gm.open || gm.neck == 'stand' || gm.neck == 'turtle') ? null : 'flat' });
  }
  g.cr = B.neckR + (g.neck == 'stand' ? 0.022 : 0.014);
  const openFn = { straight: y => y > 1.38 ? lerp(0.028, 0.06, smooth(y, 1.38, 1.46)) : 0.028, v: y => y < 1.19 ? 0 : (y - 1.19) / 0.26 * 0.06, v2: y => y < 1.12 ? 0 : (y - 1.12) / 0.34 * 0.066 };
  if (g.open) g.open = openFn[g.open];
  // 속에 입는 옷(겉옷이 열려 있을 때 보인다)
  let inner = null;
  if (g.open) { const it = topT == 'suit' ? 'shirt' : topT == 'coat' ? pick(['turtle', 'crew', 'crew']) : 'crew';
    inner = { flare: 0, dip: it == 'shirt' ? 0.012 : it == 'turtle' ? 0 : 0.02, e: g.e - 0.009, k: g.k, hem: topT == 'jacket' ? g.hem - 0.03 : 0.9, neck: it, rough: 0.93, cr: B.neckR + 0.012,
      color: C(it == 'shirt' ? pick([0xf0eee9, 0xf0eee9, 0xdde6f0]) : ch(0.5) ? pick([0xf0eee9, 0x17181a, 0xc6c2b8, 0x6a6f77]) : pick(ACCENT)) };
    inner.G = torso(inner); }
  const TG = torso(g), IN = inner ? inner.G : TG;
  const dipOf = (gm, y, phi) => gm.dip * smooth(y, 1.43, 1.47) * Math.cos(phi);

  // 목둘레 장식
  const ring = (gm, G, y, rad, ry, col, rough, off = 0.002) => { const pts = []; for (let i = 0; i <= 20; i++) { const phi = TAU * i / 20, q = G.surf(y, phi, off); pts.push({ p: [q.p[0], q.p[1] - dipOf(gm, y, phi), q.p[2]], up: q.n }); }
    tube(mb, pts, { rx: rad, ry, col, rough, wFn: wTorso, seg: 8 }); };
  const necks = [[g, TG]]; if (inner) necks.push([inner, IN]);
  for (const [gm, G] of necks) {
    if (gm.neck == 'crew') ring(gm, G, 1.468, 0.0085, 0.0055, cmul(gm.color, 0.88), gm.rough);
    if (gm.neck == 'turtle') ring(gm, G, 1.5, 0.006, 0.005, cmul(gm.color, 0.9), gm.rough);
    if (gm.neck == 'shirt') for (const sd of [1, -1]) { const pts = []; for (let i = 0; i <= 10; i++) { const a = i / 10, phi = sd * lerp(PI, 0.16, a), q = G.surf(1.468, phi, 0.006 + 0.004 * a);
        pts.push({ p: [q.p[0], q.p[1] + 0.012 - 0.03 * a * a - dipOf(gm, 1.468, phi), q.p[2]], up: q.n, rx: 0.016 + 0.006 * a }); }
      tube(mb, pts, { ry: 0.0035, col: gm.color, rough: gm.rough, wFn: wTorso, seg: 8, cap0: 'round', cap1: 'round', capLen: 0.01 }); }
  }
  // 깃, 지퍼, 단추, 넥타이
  const front = (G, y, off) => G.surf(y, 0, off);
  if (g.open) for (const [E, sd] of [[TG.edges.L, 1], [TG.edges.R, -1]]) { const wf = topT == 'suit' ? (y => 0.034 * smooth(y, 1.19, 1.31) * (1 - 0.35 * smooth(y, 1.4, 1.46))) : topT == 'coat' ? (y => 0.042 * smooth(y, 1.12, 1.3) * (1 - 0.3 * smooth(y, 1.4, 1.46))) : (() => 0.013);
    const pts = E.filter(e => e.t <= 1.462).map(e => { const w = Math.max(0.004, wf(e.t)); return { p: vadd(vadd(e.p, vmul(e.n, 0.005)), [sd * w * 0.42, 0, 0]), up: e.n, rx: w * 0.5 }; });
    if (pts.length > 2) tube(mb, pts, { ry: 0.0045, col: cmul(g.color, 0.93), rough: g.rough, wFn: wTorso, seg: 8, ds: 0.03 }); }
  if (g.quilt || topT == 'hoodie' && ch(0.4)) { const pts = []; for (let y = g.hem + 0.01; y < 1.47; y += 0.02) pts.push({ p: front(TG, y, 0.001).p, up: [0, 0, 1] }); tube(mb, pts, { rx: 0.004, ry: 0.003, col: C(0x1d1e21), rough: 0.4, wFn: wTorso, seg: 6, ds: 0.03 }); }
  if (topT == 'shirt' || inner && inner.neck == 'shirt') { const G = topT == 'shirt' ? TG : IN, y0 = topT == 'shirt' ? g.hem + 0.05 : 1.22; for (let y = 1.42; y > y0; y -= 0.085) { const q = front(G, y, 0.0015); ellipsoid(mb, q.p, AX, [0.0055, 0.0055, 0.002], C(0xdad8d2), 0.4, wTorso(q.p), 8, 4); } }
  if (topT == 'coat') for (let y = 1.08; y > 0.72; y -= 0.16) { const q = TG.surf(y, 0.12, 0.002); ellipsoid(mb, q.p, AX, [0.011, 0.011, 0.004], cmul(g.color, 0.55), 0.4, wTorso(q.p), 10, 4); }
  if (topT == 'suit') { const tc = C(pick([0x862e2e, 0x1e2942, 0x3d6848, 0x55595f, 0x67488a])), pts = [];
    for (let y = 1.448; y > 1.17; y -= 0.03) { const q = front(IN, y, 0.004); pts.push({ p: q.p, up: q.n, rx: y > 1.43 ? 0.016 : lerp(0.013, 0.027, smooth(1.43 - y, 0, 0.26)) }); }
    tube(mb, pts, { ry: 0.003, col: tc, rough: 0.6, wFn: wTorso, seg: 8, cap1: 'round', capLen: 0.03 }); }
  if (topT == 'hoodie') for (const sd of [1, -1]) { const q = TG.surf(1.445, sd * 0.3, 0.004); tube(mb, [{ p: q.p }, { p: vadd(q.p, [sd * 0.004, -0.06, 0.004]) }, { p: vadd(q.p, [sd * 0.006, -0.12, 0.0]) }], { rx: 0.003, col: C(0xe9e7e0), rough: 0.9, w: { [CHEST]: 1 }, seg: 6, cap1: 'round' }); }
  if (g.hood) { const st = []; for (const [y, rx, d] of [[1.325, 0.07, 0.022], [1.36, 0.118, 0.034], [1.42, 0.122, 0.038], [1.465, 0.095, 0.034], [1.487, 0.06, 0.024]]) { const zb = TG.surf(Math.min(y, 1.44), PI).p[2]; st.push({ t: y, c: [0, y, zb - d * 0.75], rx, rf: d, rb: d, n: 2.5 }); }
    loft(mb, st, { seg: SEG(18), ds: 0.02, colFn: (p, t) => cmul(g.color, g.quilt ? 0.72 + 0.28 * Math.sqrt(Math.abs(Math.sin(PI * (t - 1.3) / 0.075))) : 0.94), rough: g.rough, wFn: p => ({ [CHEST]: 1 }), cap0: 'round', cap1: 'round', capLen: 0.02,
      add: g.quilt ? (t => (Math.sqrt(Math.abs(Math.sin(PI * (t - 1.3) / 0.075))) - 0.4) * 0.008) : null }); }
  if (scarf) { const sc = C(pick([0x862e2e, 0xc6c2b8, 0x3b3f45, 0xc48728, 0x1e2942, 0x87775f])), pts = [], cr = g.cr + 0.014;
    for (let i = 0; i <= 24; i++) { const a = TAU * i / 24; pts.push({ p: [cr * Math.sin(a), 1.472 - 0.016 * Math.cos(a) + 0.005 * Math.sin(a * 3), (cr + 0.004) * Math.cos(a) - 0.006], up: [Math.sin(a), 0.25, Math.cos(a)] }); }
    tube(mb, pts, { rx: 0.031, ry: 0.021, col: sc, rough: 0.98, w: { [NECK]: 0.5, [CHEST]: 0.5 }, seg: 10, ds: 0.02 });
    const tl = []; for (let y = 1.45; y > 1.2; y -= 0.03) { const qq = TG.surf(y, 0.38, 0.016); tl.push({ p: qq.p, up: qq.n }); }
    tube(mb, tl, { rx: 0.034, ry: 0.008, colFn: (p, t) => t > 0.19 && t < 0.215 ? cmul(sc, 0.6) : sc, rough: 0.98, wFn: wTorso, seg: 10, ds: 0.012, cap1: 'flat', n: 3 }); }

  /* ── 목과 머리 ── */
  const nst = [[1.4, -0.012, 0.058], [1.455, -0.006, B.neckR + 0.004], [1.49, 0.002, B.neckR], [1.53, 0.008, B.neckR * 0.98]].map(([y, z, rad]) => ({ t: y, c: [0, y, z], rx: rad, rf: rad, rb: rad * 0.98, n: 2 }));
  loft(mb, nst, { seg: SEG(16), ds: 0.02, rough: 0.6, colFn: (p, t, phi) => cmul(skinC, 1 - 0.3 * smooth(t, 1.445, 1.5) * (0.45 + 0.55 * Math.max(0, Math.cos(phi)))),
    wFn: p => { const n1 = smooth(p[1], 1.43, 1.47), n2 = smooth(p[1], 1.485, 1.52); return { [CHEST]: 1 - n1, [NECK]: n1 * (1 - n2), [HEAD]: n1 * n2 }; } });
  const hs = 1.085, Hc = [0, 1.598, 0.012], hp = { a: (fem ? 0.074 : 0.0775) * rr(0.975, 1.035), b: 0.122, cf: 0.093, cb: 0.103, jaw: fem ? rr(0.34, 0.42) : rr(0.24, 0.32) };
  const HP = headFn(hp), HW = l => [Hc[0] + hs * l[0], Hc[1] + hs * l[1], Hc[2] + hs * l[2]], hsurf = makeSurf(HP), wH = { [HEAD]: 1 };
  const lipC = cmix(skinC, C(0xa84a48), fem ? 0.55 : 0.3), blush = C(0xe58f86);
  { const nu = SEG(52), nv = SEG(38), rows = [];
    for (let j = 0; j <= nv; j++) { const th = lerp(0.002, PI - 0.002, j / nv), row = [];
      for (let i = 0; i < nu; i++) { const l = HP(th, TAU * i / nu), ax = Math.abs(l[0]); let c = skinC;
        if (l[2] > 0) { c = cmix(c, lipC, 0.75 * gauss(l[0] / 0.02) * gauss((l[1] + 0.0615) / 0.006));
          c = cmix(c, blush, (fem ? 0.2 : 0.1) * gauss((ax - 0.046) / 0.02) * gauss((l[1] + 0.03) / 0.022));
          c = cmul(c, 1 - 0.1 * gauss((ax - 0.034) / 0.018) * gauss((l[1] + 0.0) / 0.012));
          c = cmul(c, 1 - 0.1 * gauss(l[0] / 0.016) * gauss((l[1] + 0.041) / 0.006)); }
        c = cmul(c, 1 - 0.22 * smooth(-l[1], 0.085, 0.118));
        row.push(mb.v(HW(l), c, 0.58, wH)); }
      rows.push(row); }
    mb.stitch(rows, true); }
  // 이목구비
  const eyeC = C(0x1a1410), lashC = C(0x120f0d), feat = (x, y, off = 0) => { const q = hsurf(x, y); return { p: HW(vadd(q.p, vmul(q.n, off))), n: q.n }; };
  for (const sd of [1, -1]) {
    const q = feat(sd * 0.0335, -0.002, 0.0003), N = q.n, Bx = vnorm(vcross([0, 1, 0], N)), Uy = vcross(N, Bx), at = (x, y, z) => vadd(vadd(vadd(q.p, vmul(Bx, x)), vmul(Uy, y)), vmul(N, z));
    ellipsoid(mb, q.p, [Bx, Uy, N], [0.0114, 0.0088, 0.0032], eyeC, 0.22, wH, 14, 8);
    ellipsoid(mb, at(sd * 0.0032, 0.003, 0.003), [Bx, Uy, N], [0.0019, 0.0019, 0.001], [1, 1, 1], 0.1, wH, 8, 4);
    const lid = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * 2 - 1; lid.push({ p: at(a * 0.0128, 0.0064 * (1 - a * a) + 0.0012 - (a * sd > 0.7 ? 0 : 0), 0.0022 - 0.002 * a * a), up: N }); }
    tube(mb, lid, { rx: fem ? 0.0019 : 0.0015, ry: 0.0012, col: lashC, rough: 0.5, w: wH, seg: 6, cap0: 'round', cap1: 'round' });
    const brow = [], by = 0.0275 + (old ? -0.002 : 0); for (let i = 0; i <= 6; i++) { const a = i / 6, f = feat(sd * (0.0165 + 0.037 * a), by + 0.0055 * Math.sin(a * 2.3) - (a > 0.72 ? (a - 0.72) * 0.016 : 0), 0.0008); brow.push({ p: f.p, up: f.n, rx: (fem ? 0.0024 : 0.0034) * (1 - 0.5 * a * a) }); }
    tube(mb, brow, { ry: 0.0011, col: cmul(hairC, 0.75), rough: 0.7, w: wH, seg: 6, cap0: 'round', cap1: 'round' });
    const eq = HW([sd * (hp.a - 0.0005), -0.014, -0.004]);
    ellipsoid(mb, eq, [[Math.cos(0.3), 0, -sd * Math.sin(0.3)], [0, 1, 0], [sd * Math.sin(0.3), 0, Math.cos(0.3)]], [0.009, 0.03, 0.017], cmix(skinC, blush, 0.12), 0.6, wH, 10, 8);
  }
  if (!mask) { const m = [], sm = rr(-0.0012, 0.002); for (let i = 0; i <= 6; i++) { const a = i / 6 * 2 - 1, f = feat(a * 0.0185, -0.0612 + sm * a * a, 0.0004); m.push({ p: f.p, up: f.n }); } tube(mb, m, { rx: 0.0013, ry: 0.001, col: cmix(lipC, C(0x5a2a28), 0.6), rough: 0.5, w: wH, seg: 6, cap0: 'round', cap1: 'round' }); }

  /* ── 머리카락 ── */
  const HL = [[0, fem ? 48 : 50], [35, 53], [60, 64], [82, 88], [100, 100], [130, 108], [180, 116]];
  const hairline = sp => { const d = Math.abs(sp) / DEG; let i = 0; while (i < HL.length - 2 && d > HL[i + 1][0]) i++; return lerp(HL[i][1], HL[i + 1][1], smooth(d, HL[i][0], HL[i + 1][0])) * DEG; };
  const streak = (c, sp, v) => cmul(c, 1 + 0.1 * Math.sin(sp * 23 + v * 2) * Math.sin(sp * 7.3 + 1));
  function shell(o) {
    const nu = SEG(o.nu || 48), nv = Math.max(8, Math.round((o.nv || 14) * q)), rows = [], oks = [], le = [];
    const put = (th, ph, sp, off, v, u) => { const l = HP(th, ph), d = vnorm(l), ll = vadd(l, vmul(d, off)); return [ll, mb.v(HW(ll), o.col(sp, v, u, th), o.rough ?? 0.5, wH)]; };
    for (let j = 0; j <= nv; j++) { const v = j / nv, row = [], ok = [];
      for (let i = 0; i < nu; i++) { const ph = TAU * i / nu, sp = ph > PI ? ph - TAU : ph, th = Math.max(0.002, v * o.thMax(sp)), [ll, id] = put(th, ph, sp, o.off(th, sp, v), v, 0);
        row.push(id); ok.push(!(o.skip && o.skip(th, sp))); if (j == nv) le.push(ll); }
      rows.push(row); oks.push(ok); }
    if (o.rim) for (const [dt, f] of [[0.014, 0.5], [0.022, 0.06]]) { const row = [], ok = []; for (let i = 0; i < nu; i++) { const ph = TAU * i / nu, sp = ph > PI ? ph - TAU : ph, th = o.thMax(sp) + dt; row.push(put(th, ph, sp, o.off(th - dt, sp, 1) * f, 1, 0)[1]); ok.push(true); } rows.push(row); oks.push(ok); }
    if (o.drop) { const nd = Math.max(5, Math.round((o.nd || 10) * q)); for (let k = 1; k <= nd; k++) { const u = k / nd, row = [], ok = [];
      for (let i = 0; i < nu; i++) { const ph = TAU * i / nu, sp = ph > PI ? ph - TAU : ph, len = o.drop(sp), l0 = le[i], bul = 1 + (o.bulge ?? 0.09) * Math.sin(u * 2.4) - (o.curl ?? 0.12) * u * u * u;
        const sw = o.sweep ? o.sweep(sp, u, len) : 0, l = [l0[0] * bul * (1 - sw * 2.2), l0[1] - u * len, l0[2] * bul - sw], wp = HW(l), fw = smooth(1.5 - wp[1], 0, 0.13) * 0.8;
        row.push(mb.v(wp, o.col(sp, 1, u, 2), o.rough ?? 0.5, { [HEAD]: 1 - fw, [CHEST]: fw })); ok.push(true); }
      rows.push(row); oks.push(ok); } }
    mb.stitch(rows, true, oks);
  }
  const hcol = (sp, v, u) => cmul(streak(hairC, sp, v + u * 3), 1 - 0.25 * u);
  const under = (f = 0.4) => shell({ thMax: hairline, off: () => 0.0042, col: (sp, v) => cmix(hairC, skinC, f), rough: 0.7 });
  const edgeT = v => lerp(0.22, 1, smooth(1 - v, 0, 0.16));
  const longHair = (kind, flat) => { const bangs = kind != 'longpart', L = kind == 'bob' ? rr(0.118, 0.15) : rr(0.26, 0.34), fk = flat ? 0.3 : 1;
    shell({ nv: 16, nd: kind == 'bob' ? 9 : 14, curl: kind == 'bob' ? 0.2 : 0.1, bulge: kind == 'bob' ? 0.1 : 0.05,
      thMax: sp => { const a = Math.abs(sp); return bangs ? lerp(72 * DEG + 0.03 * Math.sin(sp * 15), 84 * DEG, smooth(a, 0.8, 1.15)) : lerp(hairline(sp), 84 * DEG, smooth(a, 0.8, 1.15)); },
      off: (th, sp, v) => (flat ? 0.0035 + 0.007 * smooth(th, 1.05, 1.4) : 0.008 + 0.012 * smooth(1.3 - th, 0, 0.9) + 0.006 * smooth(th, 0.7, 1.4) + 0.0018 * Math.sin(sp * 21)) * (bangs ? 1 : lerp(0.35, 1, smooth(Math.abs(sp), 0.05, 0.4) + (1 - smooth(v, 0.8, 1)))),
      drop: sp => { const a = Math.abs(sp); return kind == 'bob' ? L * smooth(a, 0.85, 1.15) : lerp(0.125 * smooth(a, 0.85, 1.15), L, smooth(a, 1.4, 1.95)); },
      sweep: kind == 'bob' ? null : ((sp, u, len) => 0.05 * smooth(Math.abs(sp), 1.0, 1.5) * (1 - smooth(Math.abs(sp), 2.0, 2.6)) * smooth(u * len, 0.04, 0.16)),
      col: hcol }); };
  const hatUnder = () => (fem ? longHair(pick(['bob', 'long']), true) : under(0.15));
  if (hairT == 'buzz') under(0.25);
  if (hairT == 'short') shell({ thMax: hairline, off: (th, sp, v) => (0.006 + 0.014 * smooth(1.25 - th, 0, 0.9) + 0.009 * gauss((th - 0.75) / 0.3) * gauss(sp / 0.7)) * edgeT(v) + 0.0014 * Math.sin(sp * 11 + th * 9), col: hcol });
  if (hairT == 'bald') shell({ thMax: hairline, off: (th, sp, v) => 0.006 * edgeT(v), col: hcol, skip: (th, sp) => Math.abs(sp) < 0.95 || th < 1.05 - 0.3 * smooth(Math.abs(sp), 1.3, 2.8) });
  if (hairT == 'perm') shell({ nv: 18, thMax: sp => hairline(sp) + 0.06, off: (th, sp, v) => (0.02 + 0.007 * Math.sin(sp * 9 + 1) * Math.sin(th * 9)) * lerp(0.5, 1, smooth(1 - v, 0, 0.12)), col: hcol, rim: true });
  if (hairT == 'twoblock' || hairT == 'part') { under(0.3); const sd = ch(0.5) ? 1 : -1;
    shell({ nv: 16, rim: true, thMax: sp => { const a = Math.abs(sp), fr = hairT == 'part' ? (66 + 9 * clamp(sp * sd / 0.6, -1, 1)) * DEG : 74 * DEG + 0.035 * Math.sin(sp * 13); return lerp(lerp(fr, 62 * DEG, smooth(a, 0.5, 1.0)), 84 * DEG, smooth(a, 1.9, 2.7)); },
      off: (th, sp) => 0.013 + 0.009 * smooth(1.2 - th, 0, 0.8) + 0.002 * Math.sin(sp * 17) + (hairT == 'part' ? 0.01 * gauss((th - 0.8) / 0.28) * gauss(sp / 0.6) : 0), col: hcol }); }
  if (hairT == 'bob' || hairT == 'long' || hairT == 'longpart') longHair(hairT, false);
  if (hairT == 'ponytail' || hairT == 'bun') { shell({ thMax: hairline, off: (th, sp, v) => (0.006 + 0.004 * smooth(1.2 - th, 0, 0.8) + 0.0012 * Math.sin(sp * 30)) * edgeT(v), col: hcol });
    const b = HP(hairT == 'bun' ? 1.05 : 1.45, PI), d = vnorm(b);
    if (hairT == 'bun') ellipsoid(mb, HW(vadd(b, vmul(d, 0.03))), AX, [0.043, 0.04, 0.04], hairC, 0.5, wH, 14, 10);
    else { ellipsoid(mb, HW(vadd(b, vmul(d, 0.012))), AX, [0.026, 0.026, 0.022], cmul(hairC, 0.8), 0.5, wH, 10, 6); const pts = [], L = rr(0.16, 0.26);
      for (let i = 0; i <= 8; i++) { const a = i / 8, l = [0, b[1] + 0.01 - L * a * a - 0.02 * a, b[2] - 0.022 - 0.045 * Math.sin(a * 2.2)]; pts.push({ p: HW(l), up: [0, 0.3, -1], rx: 0.027 * (1 - 0.55 * a * a) + 0.004, ry: 0.02 * (1 - 0.6 * a * a) + 0.003 }); }
      tube(mb, pts, { col: hairC, rough: 0.5, wFn: p => { const f = smooth(1.5 - p[1], 0, 0.14) * 0.6; return { [HEAD]: 1 - f, [CHEST]: f }; }, seg: 10, cap1: 'round', ds: 0.015 }); } }
  if (hairT == 'cap' || hairT == 'capL') { hatUnder(); const cc = C(pick([0x17181a, 0x1e2942, 0xe6e3dc, 0x3d6848, 0x862e2e, 0x87775f])), tm = sp => lerp(60 * DEG, 80 * DEG, smooth(Math.abs(sp), 0.5, 1.7));
    shell({ rim: true, thMax: tm, off: (th, sp) => 0.011 + 0.004 * gauss((th - 0.5) / 0.4), col: (sp) => cmul(cc, 1 - 0.07 * Math.abs(Math.sin(sp * 3))), rough: 0.88 });
    const b0 = HP(60 * DEG, 0), st = [[0, 0.07], [0.03, 0.078], [0.06, 0.07]].map(([t, rx]) => ({ t, c: HW([0, b0[1] - 0.004 - t * 0.22, b0[2] + 0.004 + t]), rx: rx * hs, rf: 0.0035, rb: 0.0035, n: 2.4 }));
    loft(mb, st, { B: [1, 0, 0], N: [0, 1, 0], seg: 16, ds: 0.012, col: cmul(cc, 0.92), rough: 0.88, w: wH, cap1: 'round', capLen: 0.034, warp: p => [p[0], p[1] - p[0] * p[0] * 1.9, p[2]] }); }
  if (hairT == 'beanie' || hairT == 'beanieL') { hatUnder(); const cc = C(pick([0x17181a, 0x3b3f45, 0x862e2e, 0xc48728, 0x1e2942, 0xe6e3dc, 0x5a6048])), tm = sp => lerp(72 * DEG, 95 * DEG, smooth(Math.abs(sp), 0.5, 1.6));
    shell({ nv: 18, rim: true, thMax: tm, off: (th, sp, v) => 0.009 + (v > 0.7 ? 0.007 : 0) + 0.014 * gauss(th / 0.55) + 0.0011 * Math.sin(sp * 40), col: (sp, v) => cmul(cc, (v > 0.7 ? 0.9 : 1) * (1 + 0.06 * Math.sin(sp * 40))), rough: 0.97 }); }

  /* ── 얼굴 소품 ── */
  if (mask) { const mc = C(pick([0xf2f2f0, 0xf2f2f0, 0x1b1c1f, 0xa6c1d9, 0xd9d6cf])), rows = [], nu = 18, nv = 10, corners = [];
    for (let j = 0; j <= nv; j++) { const v = j / nv, th = lerp(92 * DEG, 163 * DEG, v), row = [];
      for (let i = 0; i <= nu; i++) { const u = i / nu * 2 - 1, ph = u * 1.12, l = HP(th, ph), d = vnorm(l), edge = Math.min(1, (1 - Math.abs(u)) * 5, (1 - Math.abs(v * 2 - 1)) * 4);
        const off = 0.0015 + edge * (0.004 + 0.011 * gauss(ph / 0.32) * Math.sin(PI * clamp(v * 1.15)));
        const p = HW(vadd(l, vmul(d, off))); row.push(mb.v(p, cmul(mc, 1 - 0.1 * gauss(ph / 0.05) * (v > 0.25 ? 1 : 0)), 0.9, wH)); if ((i == 0 || i == nu) && (j == 2 || j == nv - 2)) corners.push([p, i == 0 ? -1 : 1]); }
      rows.push(row); }
    mb.stitch(rows, false);
    for (const [p, sd] of corners) tube(mb, [{ p }, { p: HW([sd * (hp.a + 0.004), -0.012, -0.012]) }, { p: HW([sd * (hp.a + 0.002), -0.016, -0.024]) }], { rx: 0.0012, col: mc, rough: 0.9, w: wH, seg: 5 }); }
  if (glasses) { const fc = C(pick([0x141414, 0x141414, 0x654628, 0x8a8e94, 0x2a2c30])), wide = rr(0.021, 0.025), tall = rr(0.016, 0.02), cen = [];
    for (const sd of [1, -1]) { const q = feat(sd * 0.0335, -0.003, 0.011), N = q.n, Bx = vnorm(vcross([0, 1, 0], N)), Uy = vcross(N, Bx), pts = []; cen.push([q, Bx]);
      for (let i = 0; i <= 20; i++) { const a = TAU * i / 20, e = 2 / 2.8, c = Math.cos(a), s2 = Math.sin(a); pts.push({ p: vadd(vadd(q.p, vmul(Bx, wide * hs * Math.sign(c) * Math.pow(Math.abs(c), e))), vmul(Uy, tall * hs * Math.sign(s2) * Math.pow(Math.abs(s2), e))), up: N }); }
      tube(mb, pts, { rx: 0.0016, col: fc, rough: 0.35, w: wH, seg: 6, ds: 0.01 });
      const o2 = vadd(q.p, vmul(Bx, sd * wide * hs)); tube(mb, [{ p: o2 }, { p: HW([sd * (hp.a + 0.006), 0.0, 0.03]) }, { p: HW([sd * (hp.a + 0.004), 0.002, -0.012]) }], { rx: 0.0014, col: fc, rough: 0.35, w: wH, seg: 5 }); }
    tube(mb, [{ p: vadd(cen[0][0].p, vmul(cen[0][1], -wide * hs)) }, { p: feat(0, 0.002, 0.014).p }, { p: vadd(cen[1][0].p, vmul(cen[1][1], wide * hs)) }], { rx: 0.0015, col: fc, rough: 0.35, w: wH, seg: 5 }); }
  if (ear == 'buds') for (const sd of [1, -1]) {      // 무선 이어폰: 기둥이 있는 형태와 콩 모양 두 가지
    const wc = C(budT == 'stem' ? 0xf7f7f7 : pick([0x151618, 0xf2f2f0, 0x151618, 0xd8c7b8])), p = HW([sd * (hp.a + 0.0075), -0.0155, 0.0075]);
    if (budT == 'stem') { ellipsoid(mb, p, [[Math.cos(0.5), 0, -sd * Math.sin(0.5)], [0, 1, 0], [sd * Math.sin(0.5), 0, Math.cos(0.5)]], [0.0062, 0.0078, 0.0086], wc, 0.25, wH, 12, 8);
      tube(mb, [{ p: vadd(p, [sd * 0.002, -0.003, 0.004]) }, { p: vadd(p, [sd * 0.003, -0.018, 0.0085]) }, { p: vadd(p, [sd * 0.003, -0.034, 0.011]) }], { rx: 0.0031, col: wc, rough: 0.25, w: wH, seg: 8, cap0: 'round', cap1: 'round' });
      ellipsoid(mb, vadd(p, [sd * 0.003, -0.0365, 0.0114]), AX, [0.0024, 0.0012, 0.0024], C(0xb9bcc0), 0.3, wH, 8, 4); }
    else { ellipsoid(mb, vadd(p, [sd * 0.002, 0.001, -0.002]), [[Math.cos(0.4), 0, -sd * Math.sin(0.4)], [0, 1, 0], [sd * Math.sin(0.4), 0, Math.cos(0.4)]], [0.0066, 0.0098, 0.0118], wc, 0.3, wH, 12, 8);
      ellipsoid(mb, vadd(p, [sd * 0.0075, 0.002, -0.002]), AX, [0.0016, 0.0052, 0.0064], cmul(wc, 0.8), 0.2, wH, 8, 6); } }
  if (ear == 'phones') { const pc = C(pick([0x17181a, 0xeeeeec, 0x98b3d2, 0xd9d2c4])), pts = []; for (let i = 0; i <= 14; i++) { const a = lerp(-1.42, 1.42, i / 14), l = HP(Math.abs(a), a > 0 ? PI / 2 : -PI / 2), d = vnorm(l); pts.push({ p: HW(vadd([l[0], l[1], -0.004], vmul(d, 0.03))), up: d }); }
    tube(mb, pts, { rx: 0.011, ry: 0.004, col: pc, rough: 0.45, w: wH, seg: 8, ds: 0.02 });
    for (const sd of [1, -1]) ellipsoid(mb, HW([sd * (hp.a + 0.02), -0.012, -0.004]), AX, [0.02, 0.038, 0.033], pc, 0.45, wH, 14, 8); }

  /* ── 소매·팔·손 ── */
  for (const sd of [1, -1]) {
    const ax = sd * B.sx, wA = wArm(sd), e = g.e * (g.quilt ? 0.85 : 0.9), short = g.sl == 'short';
    const ds = short ? [0, 0.05, 0.11, 0.165] : [0, 0.06, 0.13, 0.22, 0.285, 0.33, 0.40, 0.47, g.cuff == 'suit' ? 0.5 : 0.525];
    const st = ds.map((d, i) => { let [rx, rz] = armAt(d); const last = i == ds.length - 1; let ee = e * (d < 0.02 ? 0.5 : 1);
      if (short && last) ee += 0.008; if (!short) { if (g.cuff == 'rib') ee = last ? 0.006 : i == ds.length - 2 ? e * 1.25 : ee; if (g.cuff == 'shirt' && last) ee = 0.008; if (g.cuff == 'suit' && last) ee = e + 0.004; }
      return { t: d, c: [ax, 1.385 - d, 0], rx: rx + ee, rf: rz + ee, rb: rz + ee, n: 2.2 }; });
    const sq = d => Math.sqrt(Math.abs(Math.sin(PI * (d - 0.03) / 0.082)));
    loft(mb, st, { seg: SEG(16), ds: g.quilt ? 0.011 : 0.02, rough: g.rough, wFn: wA, cap0: 'round', capLen: 0.028, cap1: 'flat',
      add: g.quilt ? (d => d < 0.5 ? (sq(d) - 0.35) * 0.011 : 0) : (d => 0.0028 * Math.sin((d - 0.2) * 75) * gauss((d - 0.285) / 0.06)),
      colFn: (p, d) => { let c = g.color; if (g.quilt && d < 0.5) c = cmul(c, 0.7 + 0.3 * sq(d)); if (g.cuff == 'rib' && d > 0.5) c = cmul(c, 0.9); return c; } });
    if (g.cuff == 'suit') loft(mb, [0.47, 0.527].map(d => { const [rx, rz] = armAt(d); return { t: d, c: [ax, 1.385 - d, 0], rx: rx + 0.007, rf: rz + 0.007, rb: rz + 0.007, n: 2.2 }; }), { seg: SEG(14), col: C(0xf0eee9), rough: 0.8, wFn: wA, cap1: 'flat' });
    // 맨팔(짧은 소매)과 손목
    loft(mb, (short ? [0.1, 0.16, 0.22, 0.285, 0.33, 0.4, 0.48, 0.545, 0.57] : [0.44, 0.5, 0.545, 0.57]).map(d => { const [rx, rz] = armAt(d); return { t: d, c: [ax, 1.385 - d, d > 0.5 ? 0.002 : 0], rx, rf: rz, rb: rz, n: 2.2 }; }), { seg: SEG(14), ds: 0.025, col: skinC, rough: 0.6, wFn: wA });
    // 손: 손바닥이 몸 쪽을 본다
    const ps = -sd, W = [ax, 0.84, 0.002], hm = B.limb * (fem ? 0.97 : 1), WR = sd > 0 ? WRL : WRR, F1 = sd > 0 ? FL1 : FR1, F2 = sd > 0 ? FL2 : FR2, TH = sd > 0 ? THL : THR;
    loft(mb, [[0, 0.019, 0.026], [0.028, 0.0155, 0.037], [0.065, 0.0135, 0.041], [0.092, 0.0115, 0.039]].map(([d, rx, rz]) => ({ t: d, c: [W[0] + ps * 0.003, W[1] - d * hm, W[2] + 0.002], rx: rx * hm, rf: rz * hm, rb: rz * hm, n: 2.25 })),
      { seg: SEG(12), ds: 0.015, col: skinC, rough: 0.6, w: { [WR]: 1 }, cap1: 'round', capLen: 0.006 });
    [[0.0295, 0.066, 0.0088], [0.0098, 0.074, 0.0092], [-0.0098, 0.069, 0.0088], [-0.0285, 0.054, 0.0078]].forEach(([z, L, rad]) => { L *= hm; rad *= hm; const y0 = W[1] - 0.084 * hm;
      loft(mb, [[-0.004, 1], [L * 0.5, 0.97], [L - rad, 0.86]].map(([t, k]) => ({ t, c: [W[0] + ps * 0.004, y0 - t, W[2] + 0.002 + z * hm], rx: rad * k * 0.92, rf: rad * k, rb: rad * k, n: 2.1 })),
        { seg: SEG(8), ds: 0.012, colFn: (p, t) => cmul(skinC, 1 - 0.07 * gauss((t - L * 0.5) / 0.004)), rough: 0.6, wFn: (p, t) => { const f = smooth(t, L * 0.4, L * 0.6), b = 1 - smooth(t, 0, 0.012); return { [WR]: b * 0.5, [F1]: (1 - f) * (1 - b * 0.5), [F2]: f }; }, cap1: 'round' }); });
    const Tb = [W[0] + ps * 0.008, W[1] - 0.026 * hm, W[2] + 0.027 * hm], td = vnorm([ps * 0.3, -0.82, 0.48]), tN = vnorm(vcross(td, [1, 0, 0])), tB = vcross(tN, td);
    loft(mb, [[0, 0.0125], [0.03, 0.0112], [0.052, 0.0095]].map(([t, rad]) => ({ t, c: vadd(Tb, vmul(td, t * hm)), rx: rad * hm, rf: rad * hm, rb: rad * hm, n: 2.1, B: tB, N: tN })), { seg: SEG(8), ds: 0.012, col: skinC, rough: 0.6, wFn: (p, t) => { const b = 1 - smooth(t, 0, 0.014); return { [WR]: b * 0.6, [TH]: 1 - b * 0.6 }; }, cap0: 'round', cap1: 'round' });
  }

  /* ── 하의·다리·신발 ── */
  const skirt = botT == 'skirt', bare = skirt || botT == 'shorts', tights = skirt && ch(0.6), legC = tights ? C(pick([0x1a1a1d, 0x1a1a1d, 0x3b3530])) : skinC;
  const skirtC = C(ch(0.6) ? pick(BOTC) : pick([0x862e2e, 0x87775f, 0xc6bca5, 0x47392d, 0x5a6048]));
  const belt = y => y > 1.035 && topT == 'shirt' ? 0.5 : 1;
  { const st = [0.9, 0.94, 1.0, 1.07].map((y, i) => { const b = bodyAt(y), e = 0.007, k = i == 0 ? 0.5 : i == 1 ? 0.96 : 1; return { t: y, c: [0, y, 0], rx: (b.rx + e) * k, rf: (b.rf + e) * (i == 0 ? 0.6 : i == 1 ? 0.88 : 1), rb: (b.rb + e) * (i == 0 ? 0.6 : i == 1 ? 0.88 : 1), n: 2.5 }; });
    loft(mb, st, { seg: SEG(26), ds: 0.02, colFn: (p, t) => cmul(skirt ? skirtC : botC, belt(t)), rough: denim ? 0.95 : 0.88, cap0: 'round', capLen: 0.015, cap1: 'flat',
      wFn: p => { const w = wTorso([p[0] * 0.3, Math.max(p[1], 0.9), p[2]]), f = smooth(0.9 - p[1], 0, 0.1) * 0.55, l = clamp(0.5 + p[0] / 0.1); for (const k in w) w[k] *= 1 - f; w[LEGL] = f * l; w[LEGR] = f * (1 - l); return w; } }); }
  const hemY = { slim: 0.095, straight: 0.075, slacks: 0.07, wide: 0.06, jogger: 0.11, shorts: rr(0.52, 0.6) }[botT];
  for (const sd of [1, -1]) {
    const wL = wLeg(sd), cx = y => sd * lerp(0.084, 0.088, smooth(y, 0.1, 0.9)), cz = y => -0.006 * gauss((y - 0.34) / 0.12);
    const mk = (ys, ef) => ys.map(y => { const [rx, rf, rb] = legAt(y), e = ef(y); return { t: y, c: [cx(y), y, cz(y)], rx: rx + e, rf: rf + e, rb: rb + e, n: 2.2 }; });
    if (bare) loft(mb, mk([0.06, 0.1, 0.2, 0.34, 0.43, 0.49, 0.54, 0.68, 0.82, 0.93, 0.98], () => 0), { seg: SEG(16), ds: 0.03, colFn: (p, t) => cmul(legC, 1 - 0.1 * gauss((t - 0.49) / 0.03) * (p[2] < 0 ? 1 : 0.3)), rough: tights ? 0.8 : 0.6, wFn: wL });
    if (!skirt) { const ys = [0.06, 0.1, 0.2, 0.34, 0.43, 0.49, 0.54, 0.68, 0.82, 0.93, 0.98].filter(y => y > hemY + 0.02); ys.unshift(hemY);
      loft(mb, mk(ys, PANT[botT]), { seg: SEG(16), ds: 0.02, rough: denim ? 0.95 : 0.88, wFn: wL, cap0: 'lip', cap1: 'flat',
        add: (t, phi) => 0.0028 * Math.sin(t * 95) * (botT == 'slim' ? smooth(0.26 - t, 0, 0.14) : 0.4 * gauss((t - 0.47) / 0.06)) + 0.002 * gauss((t - 0.49) / 0.05) * Math.max(0, Math.cos(phi)),
        colFn: (p, t) => cmul(botC, (1 - 0.1 * smooth(Math.abs(p[0]), 0.05, 0.0) * smooth(t, 0.55, 0.8)) * (denim ? 1 + 0.12 * gauss((t - 0.62) / 0.14) * Math.max(0, p[2] * 14) : 1)) }); }
    // 신발: 발끝이 살짝 바깥을 향한다
    const A = [sd * 0.084, 0.075, 0], ca = Math.cos(sd * 0.1), sa = Math.sin(sd * 0.1), FT = sd > 0 ? FTL : FTR, wF = { [FT]: 1 };
    const fp = (x, y, z) => [A[0] + x * ca + z * sa, y, A[2] - x * sa + z * ca], fB = [ca, 0, -sa];
    const SH = { sneaker: [[-0.068, 0.047, 0.03, 0.046, 0.03], [-0.03, 0.047, 0.036, 0.056, 0.03], [0.02, 0.043, 0.041, 0.046, 0.028], [0.08, 0.037, 0.047, 0.029, 0.022], [0.14, 0.033, 0.045, 0.021, 0.019], [0.172, 0.031, 0.036, 0.017, 0.017]],
      dress: [[-0.066, 0.04, 0.029, 0.036, 0.026], [-0.03, 0.04, 0.034, 0.042, 0.026], [0.02, 0.037, 0.039, 0.034, 0.024], [0.08, 0.031, 0.044, 0.023, 0.019], [0.15, 0.026, 0.039, 0.015, 0.014], [0.19, 0.024, 0.027, 0.012, 0.012]],
      boot: [[-0.07, 0.06, 0.031, 0.085, 0.045], [-0.03, 0.06, 0.037, 0.09, 0.045], [0.02, 0.05, 0.042, 0.07, 0.036], [0.08, 0.04, 0.047, 0.033, 0.026], [0.14, 0.035, 0.045, 0.024, 0.022], [0.176, 0.033, 0.036, 0.02, 0.02]] }[shoeT];
    const sk = fem ? 0.93 : 1.02, white = C(0xf0f0ee);
    loft(mb, SH.map(([z, cy, rx, up, dn]) => ({ t: z, c: fp(0, cy, z * sk), rx: rx * sk, rf: up, rb: dn, n: 2.5 })), { B: fB, N: [0, 1, 0], seg: SEG(16), ds: 0.015, rough: shoeT == 'sneaker' ? 0.75 : 0.35, w: wF, cap0: 'round', cap1: 'round', capLen: 0.016,
      colFn: (p, t) => shoeT == 'sneaker' && t > 0.135 ? cmix(shoeC, white, 0.85) : shoeC });
    const sc = shoeT == 'sneaker' ? white : C(0x141312), sh = shoeT == 'sneaker' ? 0.014 : shoeT == 'boot' ? 0.013 : 0.008;
    loft(mb, SH.map(([z, cy, rx], i) => ({ t: z, c: fp(0, sh, z * sk), rx: rx * sk + 0.003, rf: sh + (shoeT != 'sneaker' && i < 2 ? 0.006 : 0), rb: sh, n: 4 })), { B: fB, N: [0, 1, 0], seg: SEG(16), ds: 0.015, col: sc, rough: 0.8, w: wF, cap0: 'round', cap1: 'round', capLen: 0.014 });
  }
  if (skirt) { const hem = rr(0.36, 0.6), fl = hem < 0.48 ? 0.11 : 0.2, sc = skirtC, pl = ch(0.5), ys = [];
    for (let y = hem; y < 1.05; y += 0.05) ys.push(y); ys.push(1.06);
    loft(mb, ys.map(y => { const b = bodyAt(Math.max(y, 0.9)), f = Math.max(0, 0.9 - y) * fl; return { t: y, c: [0, y, 0], rx: b.rx + 0.02 + f, rf: b.rf + 0.02 + f * 0.75, rb: b.rb + 0.018 + f * 0.75, n: 2.4 }; }),
      { seg: SEG(36), ds: 0.02, rough: 0.9, wFn: wTorso, cap0: 'lip', cap1: 'flat', add: pl ? ((t, phi) => 0.0045 * Math.sin(phi * 20) * smooth(0.95 - t, 0, 0.2)) : null, colFn: (p, t, phi) => cmul(sc, pl ? 1 + 0.08 * Math.sin(phi * 20) * smooth(0.95 - t, 0, 0.2) : 1) }); }

  /* ── 가방 ── */
  if (bag == 'back') { const bc = C(pick([0x17181a, 0x2a2c30, 0x1e2942, 0x87775f, 0x3d6848, 0x6a6f77])), wB = () => ({ [CHEST]: 0.65, [SPINE]: 0.35 }), zb = y => TG.surf(clamp(y, g.hem, 1.42), PI).p[2];
    loft(mb, [[1.0, 0.1], [1.06, 0.122], [1.2, 0.126], [1.33, 0.118], [1.4, 0.095]].map(([y, rx]) => ({ t: y, c: [0, y, Math.min(zb(1.1), zb(1.3)) - 0.058], rx, rf: 0.06, rb: 0.065, n: 3 })), { seg: SEG(20), ds: 0.03, col: bc, rough: 0.88, wFn: wB, cap0: 'round', cap1: 'round', capLen: 0.035 });
    loft(mb, [[1.04, 0.08], [1.1, 0.095], [1.2, 0.09]].map(([y, rx]) => ({ t: y, c: [0, y, Math.min(zb(1.1), zb(1.3)) - 0.115], rx, rf: 0.025, rb: 0.03, n: 3 })), { seg: SEG(16), col: cmul(bc, 0.9), rough: 0.88, wFn: wB, cap0: 'round', cap1: 'round', capLen: 0.02 });
    for (const sd of [1, -1]) { const pts = [[1.1, 1.05], [1.2, 0.7], [1.31, 0.58], [1.39, 0.52], [1.438, 0.75], [1.41, PI - 0.6], [1.33, PI - 0.5]].map(([y, a]) => { const qq = TG.surf(y, sd * a, 0.007); return { p: qq.p, up: qq.n }; });
      tube(mb, pts, { rx: 0.014, ry: 0.005, col: cmul(bc, 0.85), rough: 0.88, wFn: wTorso, seg: 8, ds: 0.02, n: 3 }); } }
  if (bag == 'cross') { const bc = C(pick([0x17181a, 0x47392d, 0x87775f, 0x2a2c30, 0xc6bca5])), pts = [];
    for (let i = 0; i <= 28; i++) { const a = TAU * i / 28, y = Math.min(1.436, 1.21 - 0.225 * Math.sin(a)), qq = TG.surf(Math.max(y, g.hem + 0.02), a, 0.006); pts.push({ p: qq.p, up: qq.n }); }
    tube(mb, pts, { rx: 0.012, ry: 0.004, col: bc, rough: 0.8, wFn: wTorso, seg: 8, ds: 0.03, n: 3 });
    const q0 = TG.surf(Math.max(0.99, g.hem + 0.02), 1.15, 0.0), c0 = [q0.p[0] + 0.03, 0, q0.p[2] + 0.02];
    loft(mb, [[0.93, 0.03], [0.96, 0.036], [1.02, 0.036], [1.045, 0.03]].map(([y, rx]) => ({ t: y, c: [c0[0], y, c0[2]], rx, rf: 0.085, rb: 0.085, n: 3.4 })), { seg: SEG(16), col: bc, rough: 0.7, wFn: p => ({ [HIPS]: 0.5, [SPINE]: 0.5 }), cap0: 'round', cap1: 'round', capLen: 0.012 }); }

  /* ── 마무리: 그늘 지는 곳을 살짝 어둡게 칠한다 ── */
  for (let i = 0; i < mb.pos.length / 3; i++) { const x = Math.abs(mb.pos[i * 3]), y = mb.pos[i * 3 + 1]; let f = 1;
    f -= 0.2 * gauss((x - (B.sw - 0.06)) / 0.03) * smooth(y, 0.95, 1.12) * (1 - smooth(y, 1.3, 1.37));
    f -= 0.0 * gauss(x / 0.03) * smooth(0.88 - y, 0, 0.08) * (1 - 0.6 * smooth(0.6 - y, 0, 0.3));
    f *= 0.93 + 0.07 * smooth(y, 0, 0.5);
    for (let k = 0; k < 3; k++) mb.col[i * 4 + k] *= f; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(mb.pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(mb.col, 4));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(mb.si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(mb.sw, 4));
  geo.setIndex(mb.idx); geo.computeVertexNormals();
  const BP = [[0, 0, 0], [0, 0.92, 0], [0, 1.04, 0], [0, 1.22, 0], [0, 1.455, -0.005], [0, 1.5, 0.004]];
  for (const sd of [1, -1]) { const ax = sd * B.sx, hm = B.limb * (fem ? 0.97 : 1); BP.push([ax, 1.385, 0], [ax, 1.1, 0], [ax, 0.84, 0.002], [ax - sd * 0.004, 0.84 - 0.088 * hm, 0.004], [ax - sd * 0.004, 0.84 - 0.122 * hm, 0.004], [ax - sd * 0.008, 0.84 - 0.026 * hm, 0.029 * hm]); }
  for (const sd of [1, -1]) BP.push([sd * 0.088, 0.9, 0], [sd * 0.086, 0.49, 0], [sd * 0.084, 0.075, 0]);
  const bones = BP.map(() => new THREE.Bone());
  bones.forEach((b, i) => { const pa = BONE_PARENT[i]; if (pa < 0) b.position.set(...BP[i]); else { b.position.set(BP[i][0] - BP[pa][0], BP[i][1] - BP[pa][1], BP[i][2] - BP[pa][2]); bones[pa].add(b); } });
  const mesh = new THREE.SkinnedMesh(geo, personMat); mesh.add(bones[0]); mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const grp = new THREE.Group(); grp.scale.setScalar(s); grp.add(mesh);
  const J = {}; BONE_NAMES.forEach((n, i) => J[n] = bones[i]);
  return { g: grp, J, s, B, tags: { hat: hairT.includes('cap') ? 'cap' : hairT.includes('beanie') ? 'beanie' : '', mask, glasses, bag, ear, top: topT, old, fem }, items: makeItems(J.wrR), lean: old ? 0.1 : rr(0.0, 0.03), ph: r() * 6.28, verts: mb.pos.length / 3 };
}
const personMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0, envMapIntensity: 0.55 });
personMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = clamp( vColor.a, 0.05, 1.0 );'); };

/* ───────────── 손에 드는 물건(오른손) ───────────── */
const matCache = new Map();
function M(color, rough = 0.8, metal = 0, extra) { const k = color + '|' + rough + '|' + metal; if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMapIntensity: 0.9, ...extra })); return matCache.get(k); }
const GEO = { box: new THREE.BoxGeometry(1, 1, 1) };
function part(parent, geo, mat, p, r = [0, 0, 0], s = [1, 1, 1]) { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.scale.set(...s); m.castShadow = true; parent.add(m); return m; }
/* 물건 모형: 한 번만 만들고 복제해서 쓴다 */
const xf = (geo, p = [0, 0, 0], r = [0, 0, 0]) => { const g = geo.index ? geo.toNonIndexed() : geo; g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(1, 1, 1))); return g; };
function shapeOf(pts) { const s = new THREE.Shape(); pts.forEach(([x, y, cx, cy], i) => i == 0 ? s.moveTo(x, y) : cx !== undefined ? s.quadraticCurveTo(cx, cy, x, y) : s.lineTo(x, y)); s.closePath(); return s; }
function ext(pts, depth, bevel = 0.0012, hole) { const s = shapeOf(pts); if (hole) s.holes.push(shapeOf(hole)); const d = Math.max(1e-4, depth - 2 * bevel), g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 12 }); g.translate(0, 0, -d / 2); return g; }
const cylX = (r, l, n = 20) => new THREE.CylinderGeometry(r, r, l, n).rotateZ(PI / 2), cylZ = (r, l, n = 16) => new THREE.CylinderGeometry(r, r, l, n).rotateX(PI / 2);
function asm(parts, into = new THREE.Group()) { const by = new Map(); for (const [g, m] of parts) { if (!by.has(m)) by.set(m, []); by.get(m).push(g.index ? g.toNonIndexed() : g); }
  for (const [m, gs] of by) { const me = new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m); me.castShadow = true; into.add(me); } return into; }
function buildGun() {               // 리볼버. 완성된 모형은 총열이 -z, 위가 +y를 향한다
  const steel = M(0xc9cdd3, 0.2, 1), dark = M(0x2a2c31, 0.38, 0.9), wood = M(0x6e4324, 0.42, 0), brass = M(0xd8a842, 0.25, 1), black = M(0x060607, 0.8, 0), B = [], C = [], v = (x, y) => new THREE.Vector3(x, y, 0);
  B.push([xf(ext([[-0.030, 0.004], [0.046, 0.010], [0.046, 0.064], [-0.026, 0.064], [-0.034, 0.052, -0.034, 0.064], [-0.034, 0.016]], 0.015, 0.0015, [[-0.009, 0.0165], [0.033, 0.0165], [0.033, 0.0585], [-0.009, 0.0585]])), steel]);
  B.push([xf(ext([[-0.034, 0.018], [-0.006, 0.006], [0.003, -0.012], [-0.016, -0.088, -0.002, -0.05], [-0.05, -0.094], [-0.036, 0.014, -0.06, -0.03]], 0.027, 0.005)), wood]);
  B.push([xf(cylZ(0.0045, 0.0285, 14), [-0.028, -0.02, 0]), brass], [xf(cylZ(0.0022, 0.0288, 8), [-0.034, -0.058, 0]), dark], [xf(cylZ(0.0018, 0.0155, 8), [0.04, 0.02, 0]), dark], [xf(cylZ(0.0018, 0.0155, 8), [-0.028, 0.012, 0]), dark]);
  B.push([xf(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v(0.036, 0.011), v(0.037, -0.008), v(0.028, -0.023), v(0.01, -0.026), v(0.0, -0.014), v(-0.002, 0.004)]), 24, 0.0021, 6).scale(1, 1, 2.6)), steel]);
  B.push([xf(ext([[0.011, 0.008], [0.018, 0.008], [0.013, -0.016, 0.0195, -0.005], [0.0105, -0.014], [0.0115, 0.006, 0.0145, -0.004]], 0.005, 0.0008)), dark]);
  B.push([xf(cylX(0.0088, 0.104, 22), [0.098, 0.05, 0]), steel], [xf(cylX(0.0047, 0.002, 14), [0.1502, 0.05, 0]), black], [xf(new THREE.TorusGeometry(0.0068, 0.0013, 6, 18).rotateY(PI / 2), [0.15, 0.05, 0]), dark]);
  B.push([xf(cylX(0.0062, 0.086, 16), [0.089, 0.0368, 0]), steel], [xf(new THREE.BoxGeometry(0.086, 0.01, 0.0095), [0.089, 0.0425, 0]), steel], [xf(new THREE.BoxGeometry(0.101, 0.0037, 0.0058), [0.0965, 0.0594, 0]), steel]);
  B.push([xf(ext([[0.128, 0.0612], [0.147, 0.0612], [0.145, 0.0708], [0.139, 0.0708]], 0.0032, 0.0004)), dark], [xf(new THREE.BoxGeometry(0.01, 0.005, 0.012), [-0.023, 0.0665, 0]), dark], [xf(new THREE.BoxGeometry(0.01, 0.008, 0.0025), [-0.019, 0.034, -0.009]), dark]);
  C.push([xf(cylX(0.0185, 0.04, 28)), steel], [xf(cylX(0.004, 0.003, 12), [0.021, 0, 0]), steel]);
  for (let k = 0; k < 6; k++) { const a = (30 + 60 * k) * DEG, b = (90 + 60 * k) * DEG;
    C.push([xf(new THREE.CapsuleGeometry(0.0052, 0.013, 4, 10).rotateZ(PI / 2), [0.007, Math.sin(a) * 0.0142, Math.cos(a) * 0.0142]), dark]);
    C.push([xf(cylX(0.0046, 0.0008, 12), [0.0202, Math.sin(b) * 0.0122, Math.cos(b) * 0.0122]), black], [xf(cylX(0.0056, 0.0014, 12), [-0.0205, Math.sin(b) * 0.0122, Math.cos(b) * 0.0122]), brass], [xf(cylX(0.0018, 0.0006, 8), [-0.0214, Math.sin(b) * 0.0122, Math.cos(b) * 0.0122]), steel]); }
  const g = new THREE.Group(), prof = new THREE.Group(); prof.rotation.y = PI / 2; g.add(prof); asm(B, prof);
  const cyl = asm(C); cyl.name = 'cyl'; cyl.position.set(0.012, 0.0375, 0); prof.add(cyl);
  const ham = asm([[xf(ext([[-0.004, -0.006], [0.006, -0.002], [0.004, 0.013], [-0.008, 0.027, 0.002, 0.024], [-0.013, 0.024], [-0.008, 0.006, -0.006, 0.018]], 0.007, 0.0008)), dark]]); ham.name = 'hammer'; ham.position.set(-0.027, 0.05, 0); prof.add(ham);
  return g;
}
function buildKnife() {             // 식칼. 날이 -z, 칼날(베는 쪽)이 -y를 향하고 손잡이는 +z 쪽이다
  const blade = M(0xdfe3e8, 0.16, 1), edge = M(0xf6f8fa, 0.06, 1), steel = M(0xb9bdc3, 0.25, 1), grip = M(0x1a1a1c, 0.5, 0), B = [];
  B.push([xf(ext([[0, 0.018], [0.14, 0.018], [0.186, -0.004, 0.176, 0.017], [0.02, -0.0242, 0.12, -0.0262], [0, -0.0242]], 0.0027, 0.001)), blade]);
  B.push([xf(ext([[0.003, -0.016], [0.02, -0.016], [0.177, 0.0, 0.12, -0.0175], [0.1855, -0.0042], [0.02, -0.0245, 0.12, -0.0265], [0.003, -0.0245]], 0.003, 0)), edge]);
  B.push([xf(ext([[-0.013, -0.0155], [0.002, -0.0155], [0.002, 0.019], [-0.013, 0.019]], 0.017, 0.002)), steel]);
  B.push([xf(ext([[-0.012, 0.017], [-0.11, 0.019, -0.06, 0.0225], [-0.125, 0.004, -0.127, 0.018], [-0.118, -0.016, -0.128, -0.012], [-0.012, -0.013, -0.06, -0.021]], 0.019, 0.005)), grip]);
  for (const x of [-0.036, -0.066, -0.096]) B.push([xf(cylZ(0.0032, 0.0196, 12), [x, 0.002, 0]), steel]);
  const g = new THREE.Group(), prof = new THREE.Group(); prof.rotation.y = PI / 2; g.add(prof); asm(B, prof); return g;
}
function buildBullet() {            // 탄약 한 발(세워 놓은 상태, 아래가 원점)
  const L = pts => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  return asm([[xf(L([[0, 0], [0.0056, 0], [0.0056, 0.0012], [0.0046, 0.0016], [0.0048, 0.0024], [0.0048, 0.029], [0.0046, 0.0292], [0, 0.0292]])), M(0xd8a842, 0.22, 1, { emissive: 0x2e2000 })],
    [xf(L([[0, 0.029], [0.0045, 0.029], [0.0045, 0.032], [0.0038, 0.0355], [0.0024, 0.0382], [0, 0.0392]])), M(0xb9774a, 0.3, 1)], [xf(new THREE.CylinderGeometry(0.0019, 0.0019, 0.0004, 10), [0, -0.0001, 0]), M(0xb9bdc3, 0.3, 1)]]);
}
function buildPhone() {             // 휴대폰. 두께가 x, 길이가 y, 화면이 +x를 향한다
  const R = (w, h, r) => [[-w / 2 + r, -h / 2], [w / 2 - r, -h / 2], [w / 2, -h / 2 + r, w / 2, -h / 2], [w / 2, h / 2 - r], [w / 2 - r, h / 2, w / 2, h / 2], [-w / 2 + r, h / 2], [-w / 2, h / 2 - r, -w / 2, h / 2], [-w / 2, -h / 2 + r], [-w / 2 + r, -h / 2, -w / 2, -h / 2]];
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 272; const c = cv.getContext('2d'), gr = c.createLinearGradient(0, 0, 0, 272); gr.addColorStop(0, '#dfeaff'); gr.addColorStop(1, '#f7f9fc'); c.fillStyle = gr; c.fillRect(0, 0, 128, 272);
  c.fillStyle = '#2f6fed'; c.fillRect(0, 0, 128, 30); for (let i = 0; i < 6; i++) { c.fillStyle = '#c9d4e6'; c.fillRect(10, 42 + i * 37, 30, 28); c.fillStyle = '#5b6677'; c.fillRect(48, 46 + i * 37, 60 - (i * 13) % 30, 6); c.fillStyle = '#aab3c2'; c.fillRect(48, 58 + i * 37, 70, 5); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group(), p = new THREE.Group(); p.rotation.y = PI / 2; g.add(p);
  asm([[xf(ext(R(0.071, 0.148, 0.009), 0.0082, 0.002)), M(0x15171b, 0.3, 0.5)], [xf(ext(R(0.03, 0.032, 0.006), 0.002, 0.0006), [0.014, 0.05, -0.0045]), M(0x0c0d10, 0.2, 0.6)], [xf(cylZ(0.0055, 0.0014, 14), [0.02, 0.056, -0.0056]), M(0x1c2a3a, 0.1, 0.8)], [xf(cylZ(0.0055, 0.0014, 14), [0.008, 0.044, -0.0056]), M(0x1c2a3a, 0.1, 0.8)]], p);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.142), new THREE.MeshBasicMaterial({ map: tex })); scr.position.z = 0.0043; p.add(scr); return g;
}
function buildCan() {               // 음료수 캔(세워 놓은 상태, 가운데가 원점)
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const c = cv.getContext('2d'); c.fillStyle = '#d63a2f'; c.fillRect(0, 0, 512, 256); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, 150); c.bezierCurveTo(120, 100, 260, 210, 512, 140); c.lineTo(512, 176); c.bezierCurveTo(260, 246, 120, 136, 0, 186); c.fill();
  for (let k = 0; k < 2; k++) { c.fillStyle = '#fff'; c.font = '900 54px "Noto Sans KR","Malgun Gothic","Noto Sans CJK KR",sans-serif'; c.textAlign = 'center'; c.fillText('톡톡 사이다', 128 + k * 256, 92); c.font = '700 20px sans-serif'; c.fillText('TOKTOK CIDER · 250ml', 128 + k * 256, 228); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const L = pts => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 28), al = M(0xd5d8dc, 0.25, 1);
  const g = asm([[xf(L([[0, -0.058], [0.025, -0.058], [0.029, -0.061], [0.031, -0.057], [0.033, -0.05]])), al], [xf(L([[0.033, 0.05], [0.03, 0.058], [0.0275, 0.061], [0.0285, 0.0625], [0.0265, 0.0625], [0.0255, 0.059], [0, 0.059]])), al], [xf(new THREE.BoxGeometry(0.012, 0.0012, 0.02), [0, 0.06, 0.004]), al]]);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.1, 28, 1, true), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.28, metalness: 0.75, envMapIntensity: 0.9 })); body.castShadow = true; g.add(body); return g;
}
const ITEM_T = {}, ITEM_B = { gun: buildGun, knife: buildKnife, bullet: buildBullet, phone: buildPhone, can: buildCan };
function newItem(k) { if (!ITEM_T[k]) ITEM_T[k] = ITEM_B[k](); return ITEM_T[k].clone(true); }
// 손에 쥔 물건은 처음 보일 때 만든다
function makeItems(hand) { return { hand, phone: null, knife: null, gun: null }; }
function holdItem(items, k) {
  for (const n of ['phone', 'knife', 'gun']) {
    if (n == k && !items[n]) { const h = new THREE.Object3D(), o = newItem(n); h.add(o);
      if (n == 'phone') h.position.set(0.02, -0.082, 0.004);
      if (n == 'knife') { h.position.set(0.022, -0.078, 0.002); h.rotation.set(0, PI, 0); o.position.set(0, 0, -0.06); }
      if (n == 'gun') { h.position.set(0.022, -0.078, 0.002); h.rotation.set(PI / 2, PI, 0); o.position.set(0, 0.04, -0.022); }
      items.hand.add(h); items[n] = h; }
    if (items[n]) items[n].visible = n == k; }
}

/* ───────────── 동작 ───────────── */
const SEAT = 0.44;
function animate(P, pose, t, item, o = {}) {
  const J = P.J, s = P.s, ph = P.ph;
  for (const k in J) J[k].rotation.set(0, 0, 0);
  let rootY = 0;
  const sitting = pose == 'sit' || pose == 'sitphone', weapon = item == 'knife' || item == 'gun';
  const phoning = (pose == 'phone' || pose == 'sitphone' || o.phone) && !weapon && pose != 'walk' && pose != 'aim';   // 무기를 들면 휴대폰은 보지 않는다
  const showItem = phoning && item == 'none' ? 'phone' : item;
  let cl = 0.42, cr = 0.42, tl = 0.25, tr = 0.25;
  J.shL.rotation.set(0.04, 0, 0.09); J.shR.rotation.set(0.04, 0, -0.09); J.elL.rotation.x = J.elR.rotation.x = -0.2;
  J.legL.rotation.z = 0.025; J.legR.rotation.z = -0.025;
  J.spine.rotation.x = P.lean; J.chest.rotation.x = P.lean * 0.9; J.neck.rotation.x = -P.lean * 0.5;
  const sway = Math.sin(t * 0.7 + ph), breathe = Math.sin(t * 1.4 + ph), look = Math.sin(t * 0.37 + ph * 3) * Math.sin(t * 0.11 + ph);
  J.chest.rotation.x += breathe * 0.008;
  if (pose == 'idle' || pose == 'strap' || pose == 'aim' || pose == 'phone') {
    J.hips.rotation.z = sway * 0.018; J.spine.rotation.z = -sway * 0.014; J.legL.rotation.z += -sway * 0.018; J.legR.rotation.z += -sway * 0.018;
    J.neck.rotation.y = look * 0.14; J.head.rotation.y = look * 0.16;
  }
  if (pose == 'walk') {
    const p = (o.walkT ?? t) * 5.4 + ph, sn = Math.sin(p), cs = Math.cos(p), ga = o.gait ?? 1;      // gait: 걸음 크기(느리게 걸으면 보폭이 줄어든다)
    J.legL.rotation.x = -0.38 * ga * sn; J.legR.rotation.x = 0.38 * ga * sn;
    J.knL.rotation.x = 0.06 + 0.78 * ga * Math.max(0, cs); J.knR.rotation.x = 0.06 + 0.78 * ga * Math.max(0, -cs);
    J.ftL.rotation.x = -0.12 * ga * sn; J.ftR.rotation.x = 0.12 * ga * sn;
    J.shL.rotation.x = 0.3 * ga * sn; J.shR.rotation.x = -0.3 * ga * sn; J.elL.rotation.x = -0.25 - 0.16 * Math.max(0, -sn); J.elR.rotation.x = -0.25 - 0.16 * Math.max(0, sn);
    rootY = 0.014 * Math.cos(2 * p) - 0.014; J.chest.rotation.y = 0.08 * sn; J.hips.rotation.y = -0.06 * sn; J.spine.rotation.x += 0.03; J.head.rotation.y = -0.03 * sn;
  }
  if (sitting) {
    const hipY = (o.seat ?? SEAT) + 0.086 * s, d = Math.asin(clamp((hipY - 0.493 * s) / (0.41 * s), -0.5, 0.5));
    rootY = hipY / s - 0.9;
    J.legL.rotation.set(-(PI / 2 - d), 0, 0.07); J.legR.rotation.set(-(PI / 2 - d), 0, -0.07); J.knL.rotation.x = J.knR.rotation.x = PI / 2 - d;
    J.spine.rotation.x = P.lean + 0.05; J.chest.rotation.x = P.lean + 0.04; J.neck.rotation.x = -0.04;
    J.shL.rotation.set(-0.34, 0, -0.06); J.shR.rotation.set(-0.34, 0, 0.06); J.elL.rotation.x = J.elR.rotation.x = -0.82;
    J.neck.rotation.y = look * 0.16; J.head.rotation.y = look * 0.18; J.head.rotation.x = 0.07;
  }
  if (pose == 'strap') {            // 왼팔로 손잡이를 잡는다(두 관절 역계산)
    const a = 0.285 * s, b = 0.335 * s, dy = (o.ringY ?? 1.69) - 1.385 * s, dz = o.ringZ ?? 0.14, D = Math.min(Math.hypot(dy, dz), a + b - 0.002), th = Math.atan2(-dz, -dy);
    const A = Math.acos(clamp((a * a + D * D - b * b) / (2 * a * D), -1, 1)), Cc = Math.acos(clamp((a * a + b * b - D * D) / (2 * a * b), -1, 1));
    J.hips.rotation.z = 0; J.spine.rotation.set(0, 0, 0); J.chest.rotation.set(0, 0, 0); J.neck.rotation.x = 0;
    J.shL.rotation.set(th + A, 0, 0); J.elL.rotation.x = -(PI - Cc); cl = 1.25; tl = 0.9;
  }
  if (phoning) {
    if (sitting) { J.shR.rotation.set(-0.2, 0.42, 0.04); J.elR.rotation.x = -1.72; J.wrR.rotation.y = -1.25; J.spine.rotation.x += 0.06; J.chest.rotation.x += 0.07; J.neck.rotation.x = 0.26; J.head.rotation.x = 0.3; J.neck.rotation.y = 0; J.head.rotation.y = -0.05 + look * 0.03; J.shL.rotation.set(-0.3, 0, -0.1); J.elL.rotation.x = -0.9; }
    else { J.shR.rotation.set(-0.28, 0.5, 0.02); J.elR.rotation.x = -2.05; J.wrR.rotation.y = -1.25; J.neck.rotation.x += 0.2; J.head.rotation.x = 0.22; J.head.rotation.y = -0.04; }
  } else if (pose == 'aim') {
    if (item == 'knife') { J.shR.rotation.set(-1.2, 0, 0.1); J.elR.rotation.x = -1.0 + Math.sin(t * 6) * 0.03; }
    else { J.shR.rotation.set(-1.5 + breathe * 0.008, 0, 0.16); J.elR.rotation.x = -0.07; }
    J.chest.rotation.y = 0.3; J.neck.rotation.y = -0.14; J.head.rotation.y = -0.16;
  } else if (weapon) {
    if (sitting) { J.shR.rotation.set(-0.05, 0, -0.16); J.elR.rotation.x = -1.36; J.wrR.rotation.x = item == 'gun' ? 0.3 : 0.05; J.shL.rotation.set(-0.3, 0, -0.04); J.elL.rotation.x = -0.9; J.head.rotation.x = 0.02; }   // 팔뚝을 허벅지에 얹고 쥔다
    else { J.shR.rotation.x = pose == 'walk' ? J.shR.rotation.x * 0.35 - 0.1 : -0.1; J.elR.rotation.x = -0.34; }
  } else if (item == 'phone') { J.shR.rotation.x += -0.08; J.elR.rotation.x = Math.min(J.elR.rotation.x, -0.32); }
  if (showItem == 'gun' || showItem == 'knife') { cr = 1.28; tr = 0.95; } else if (showItem == 'phone') { cr = 0.34; tr = 0.6; }
  J.fL1.rotation.z = -cl * 0.85; J.fL2.rotation.z = -cl; J.thL.rotation.y = -tl;
  J.fR1.rotation.z = cr * 0.85; J.fR2.rotation.z = cr; J.thR.rotation.y = tr;
  J.root.position.y = rootY;
  holdItem(P.items, showItem);
}
// 자세가 바뀔 때 뚝 끊기지 않도록 이전 자세에서 부드럽게 따라간다
function smoothPose(P, dt, rate = 14) {
  const a = 1 - Math.exp(-dt * rate), J = P.J;
  if (!P.sq) { P.sq = {}; for (const k in J) P.sq[k] = J[k].quaternion.clone(); P.sy = J.root.position.y; return; }
  for (const k in J) { P.sq[k].slerp(J[k].quaternion, a); J[k].quaternion.copy(P.sq[k]); }
  P.sy += (J.root.position.y - P.sy) * a; J.root.position.y = P.sy;
}

