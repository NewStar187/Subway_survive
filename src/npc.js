/* ───────────── 승객 시뮬레이션 ───────────── */
const NPC_N = 120, NPC_SPARE = 16, NPC_Q = 0.55, NPC_LOD = 0.25, SEAT_H = 0.46, RING_Y = 1.665, OPEN_T = 26, CLOSED_T = 64;
const npcs = [], rnd = (a, b) => a + (b - a) * Math.random();
const groundY = x => { const a = Math.abs(x); return a > 34.3 ? Math.min(16, (a - 34.3) / 0.3) * 0.17 : 0; };
// 자리: 좌석, 손잡이, 반대편 문 옆
const seats = [], straps = [], stands = [];
const doorInfo = doorXs.map((x, i) => ({ x, i, car: i >> 2, lines: [[], []], alight: [], tB: [0, 0], tA: 0 }));
CARS.forEach((c, ci) => {
  for (const [zw, s] of [[-0.24, -1], [-3.16, 1]]) {
    const add = (x0, x1, n) => { const w = (x1 - x0) / n; for (let i = 0; i < n; i++) { const x = x0 + (i + 0.5) * w;
      seats.push({ kind: 'seat', x, z: zw + s * 0.2, yaw: s < 0 ? Math.PI : 0, ax: x, az: zw + s * 0.76, car: ci, occ: null });
      if (n == 7 && i % 2 == 1) straps.push({ kind: 'strap', rx: x, z: zw + s * 0.76, yaw: s < 0 ? 0 : Math.PI, car: ci, occ: null }); } };
    [-4.8, 0, 4.8].forEach(w => add(c + w - 1.55, c + w + 1.55, 7));
    for (const e of [-1, 1]) { const a = c + e * 8.05, b = c + e * 9.55; add(Math.min(a, b), Math.max(a, b), 3); }
  }
  DOORS.forEach(d => { for (const o of [-0.4, 0.4]) stands.push({ kind: 'stand', x: c + d + o, z: -2.76, yaw: Math.PI + o * 1.2, car: ci, occ: null }); });
});
let phase = 'closed', phaseT = 11, approached = false, simT = 0, seedN = 9000 + ((Math.random() * 1e6) | 0);
const slotPos = (d, side, k) => [d.x + (side ? 0.78 : -0.78), 1.15 + k * 0.62];
const settled = n => n.state == 'seated' || n.state == 'strap' || n.state == 'stand';

function pickSpot(car, x) {
  const r = Math.random(), kinds = r < 0.62 ? ['seat', 'strap', 'stand'] : r < 0.9 ? ['strap', 'seat', 'stand'] : ['stand', 'strap', 'seat'];
  for (const same of [true, false]) for (const k of kinds) { let best = null, bs = 1e9;
    for (const sp of (k == 'seat' ? seats : k == 'strap' ? straps : stands)) { if (sp.occ || sp.item || (same && sp.car != car)) continue; const sc = Math.abs((sp.x ?? sp.rx) - x) + Math.random() * 5; if (sc < bs) { bs = sc; best = sp; } }
    if (best) return best; }
  return null;
}
// 객실 안에서는 통로 가운데를 따라 우측통행으로 움직인다
function trainPath(n, tx, tz) { const p = [], dir = Math.sign(tx - n.x) || 1, lane = -1.7 - dir * 0.17; if (Math.abs(tx - n.x) > 0.7) p.push([n.x + dir * 0.2, lane], [tx - dir * 0.2, lane]); p.push([tx, tz]); return p; }
function goToSpot(n, sp) {
  if (!sp) { n.state = 'stand'; n.yawT = n.yaw; return; }
  n.spot = sp; sp.occ = n; n.state = 'tospot';
  const tx = sp.kind == 'seat' ? sp.ax : sp.kind == 'strap' ? sp.rx - Math.cos(sp.yaw) * n.P.B.sx * n.P.s : sp.x, tz = sp.kind == 'seat' ? sp.az : sp.z;
  n.path = trainPath(n, tx, tz);
  n.onArrive = () => {
    if (sp.kind == 'seat') { n.state = 'sitdown'; n.tr = 0; n.from = [n.x, n.z]; n.to = [sp.x, sp.z]; n.yawT = sp.yaw; } else { n.state = sp.kind; n.yawT = sp.yaw; }
    n.phone = Math.random() < (sp.kind == 'seat' ? 0.6 : 0.4); n.tP = rnd(15, 60); n.tR = rnd(50, 170);
  };
}
function leaveSpot(n, cb) {
  const sp = n.spot, wasSeated = n.state == 'seated'; if (sp) { sp.occ = null; n.spot = null; } n.phone = false;
  if (wasSeated && sp) { n.state = 'standup'; n.tr = 0; n.from = [sp.x, sp.z]; n.to = [sp.ax, sp.az]; n.after = cb; } else cb();
}
function goAlight(n) {            // 내릴 사람은 문이 열리기 전에 미리 문 앞으로 간다
  let d = null, bs = 1e9; for (const q of doorInfo) if (q.car == n.car) { const sc = Math.abs(q.x - n.x) + Math.random() * 2.5 + q.alight.length * 1.2; if (sc < bs) { bs = sc; d = q; } }
  d.alight.push(n);
  leaveSpot(n, () => {
    if (!d.alight.includes(n)) { goToSpot(n, pickSpot(n.car, n.x)); return; }
    const j = d.alight.indexOf(n); n.state = 'toexit'; n.path = trainPath(n, d.x + (j % 2 ? -0.24 : 0.24), -0.74 - (j >> 1) * 0.52);
    n.onArrive = () => { n.state = 'waitdoor'; n.yawT = 0; };
  });
}
function exitTrain(n, d) {         // 줄 사이 가운데로 내려서 가까운 계단으로 나간다
  const end = Math.random() < 0.5 + clamp(d.x / 50, -0.42, 0.42) ? 1 : -1, zs = rnd(2.5, 3.6), lane = rnd(3.35, 3.85);
  n.state = 'leave'; n.speed = n.baseSpeed * 1.08;
  n.path = [[d.x, 0.5], [d.x + rnd(-0.15, 0.15), 3.3], [d.x + end * 1.3, lane], [end * 32.6, lane], [end * 34.5, zs], [end * 39.25, zs]];
  n.onArrive = () => { n.state = 'gone'; n.timer = rnd(3, 22); };
}
function board(n, d, sd) {
  n.state = 'board'; n.phone = false; n.path = [[d.x + sd * 0.3, 0.5], [d.x + sd * 0.22, -0.62]];
  n.onArrive = () => { n.car = d.car; n.stops = 1 + ((Math.random() * 3) | 0); goToSpot(n, pickSpot(d.car, d.x)); };
}
function arriveAt(n) {             // 문 앞에 도착하면 짧은 줄에 선다. 줄이 길면 옆 문으로 간다
  const d = n.door, side = d.lines[0].length <= d.lines[1].length ? 0 : 1;
  if (d.lines[side].length >= 4 && n.tries < 4) { n.tries++; const j = clamp(d.i + (Math.random() < 0.5 ? -1 : 1), 0, 11); n.door = doorInfo[j]; n.path = [[n.door.x + rnd(-0.3, 0.3), n.z]]; n.onArrive = () => arriveAt(n); return; }
  d.lines[side].push(n); n.side = side; n.state = 'queue'; n.phone = Math.random() < 0.55; n.tP = rnd(10, 40);
}
function spawnArrive(n) {          // 계단으로 내려와 승강장으로 들어온다
  const end = Math.random() < 0.5 ? 1 : -1, lane = rnd(3.35, 3.85);
  n.x = end * 39.2; n.z = rnd(4.6, 5.7); n.y = groundY(n.x); n.yaw = n.yawT = -end * Math.PI / 2;
  n.door = doorInfo[Math.random() < 0.6 ? (end > 0 ? 6 + ((Math.random() * 6) | 0) : (Math.random() * 6) | 0) : (Math.random() * 12) | 0];
  n.tries = 0; n.speed = n.baseSpeed; n.state = 'arrive'; n.path = [[end * 34.5, n.z], [end * 32.4, lane], [n.door.x + rnd(-0.3, 0.3), lane]]; n.onArrive = () => arriveAt(n);
}
// 몸은 미리 만들어 두고 돌려 쓴다. 떠난 승객의 몸은 예비 몸과 바꿔서, 게임 도중에는 새로 만들지 않는다
const bodies = new Map(), spareSeeds = [];
function getBody(seed) { let P = bodies.get(seed); if (!P) { P = makePerson(seed, NPC_Q, { lod: NPC_LOD }); P.g.visible = false; P.g.matrixWorldAutoUpdate = false; scene.add(P.g); bodies.set(seed, P); } return P; }
function setBody(n, seed) { if (n.P && n.seed != seed) n.P.g.visible = false; n.seed = seed; n.P = getBody(seed); n.P.sq = null; n.wasVis = false; }
function newBody(n) {
  if (n.P) { const k = (Math.random() * spareSeeds.length) | 0, old = n.seed; setBody(n, spareSeeds[k]); spareSeeds[k] = old; } else setBody(n, seedN++);
  n.baseSpeed = (n.P.B.old ? 0.82 : 1) * rnd(1.0, 1.35); n.speed = n.baseSpeed; n.gait = 0.8 + (n.baseSpeed - 0.8) * 0.45; n.gaitNow = n.gait;
}
function moveNPC(n, dt) {
  const w = n.path[0], last = n.path.length == 1; let dx = w[0] - n.x, dz = w[1] - n.z; const d = Math.hypot(dx, dz);
  if (d < (last ? 0.07 : 0.28)) { n.path.shift(); if (last) { n.x = w[0]; n.z = w[1]; const cb = n.onArrive; n.onArrive = null; cb && cb(); } return; }
  let vx = dx / d, vz = dz / d, slow = 1;
  const avoid = (ox, oz, still) => { const od = ox * ox + oz * oz; if (od > 0.42 || od < 1e-6) return; const dd = Math.sqrt(od), push = (0.65 - dd) / 0.65, ahead = (ox * dx + oz * dz) / (dd * d);
    const sgn = (ox * dz - oz * dx) > 0 ? 1 : -1;           // 상대가 왼쪽에 있으면 오른쪽으로 비켜 간다
    vx += (-ox / dd) * push * 1.2 + (dz / d) * sgn * push * 0.9 * Math.max(0, ahead); vz += (-oz / dd) * push * 1.2 + (-dx / d) * sgn * push * 0.9 * Math.max(0, ahead);
    if (ahead > 0.75 && dd < 0.5) slow = Math.min(slow, still ? 0.7 : 0.45); };
  if (n.ghostT <= 0) { for (const o of npcs) { if (o === n || o.state == 'gone' || o.state == 'dead' || o.state == 'seated' || Math.abs(o.y - n.y) > 0.5) continue; avoid(o.x - n.x, o.z - n.z, !o.moving); }
    if (playing && G.alive && Math.abs(groundY(pos.x) - n.y) < 0.5) avoid(pos.x - n.x, pos.z - n.z, true);
    for (const o of others.values()) if (o.state != 'dead' && o.pose != 1 && Math.abs(o.y - n.y) < 0.5) avoid(o.x - n.x, o.z - n.z, !o.moving); }
  const l = Math.hypot(vx, vz) || 1, sp = n.speed * slow * Math.min(1, d / 0.3 + 0.35); vx /= l; vz /= l;
  n.x += vx * sp * dt; n.z += vz * sp * dt; collide(n, 0.2);
  n.moving = true; n.walkT += dt * sp * (0.87 / n.P.s) / n.gait; n.gaitNow = n.gait * clamp(sp / 0.9, 0.45, 1); n.yawT = Math.atan2(vx, vz);
  // 막혀서 못 가면 잠시 사람 사이를 비집고 지나간다
  n.stuckT += dt; if (n.stuckT > 1.5) { if (Math.hypot(n.x - n.sx, n.z - n.sz) < 0.2) { n.ghostT = 1.6; if (++n.stuckN >= 2) { if (n.z > 0.5 && Math.abs(n.x) < 33) n.z += (3.6 - n.z) * 0.6; else { n.x = w[0]; n.z = w[1]; } } } else n.stuckN = 0; n.stuckT = 0; n.sx = n.x; n.sz = n.z; }
}
function updateNPCs(dt) {
  if (!isHost()) return clientNPCs(dt);
  simT += dt; phaseT -= dt; if (NET.hold) phaseT = Math.max(phaseT, 2.5);      // 로비에서는 열차가 문을 닫고 서 있는다
  if (phase == 'closed' && !approached && phaseT < 9) { approached = true; for (const n of npcs) if (settled(n) && --n.stops <= 0) goAlight(n); }
  if (phaseT <= 0) {
    if (phase == 'closed') { phase = 'open'; phaseT = OPEN_T; doorTarget = 1; }
    else { phase = 'closed'; phaseT = CLOSED_T; doorTarget = 0; approached = false; onDoorsClosed();
      for (const d of doorInfo) { const left = d.alight.slice(); d.alight.length = 0; for (const n of left) { n.stops = 1; if (n.state == 'toexit' || n.state == 'waitdoor') { n.path = []; goToSpot(n, pickSpot(n.car, n.x)); } } } }
  }
  if (phase == 'open' && doorT > 0.9) for (const d of doorInfo) {
    if (phaseT > 3 && simT - d.tA > 0.8) { const i = d.alight.findIndex(a => a.state == 'waitdoor'); if (i >= 0) { const n = d.alight.splice(i, 1)[0]; d.tA = simT; exitTrain(n, d); } }
    if (phaseT > 5 && (d.alight.length == 0 || OPEN_T - phaseT > 9)) for (let sd = 0; sd < 2; sd++) { const n = d.lines[sd][0];
      if (n && simT - d.tB[sd] > 1.1 && simT - d.tA > 1.2 && n.state == 'queue' && !n.path.length) { const sl = slotPos(d, sd, 0); if (Math.hypot(n.x - sl[0], n.z - sl[1]) < 0.3) { d.lines[sd].shift(); d.tB[sd] = simT; board(n, d, sd ? 1 : -1); } } }
  }
  let rebuilt = false;
  for (const n of npcs) {
    if (n.state == 'dead') { n.deadT += dt; continue; }
    if (n.state == 'gone') { n.timer -= dt; if (n.timer <= 0 && !rebuilt) { rebuilt = true; newBody(n); spawnArrive(n); } continue; }
    n.moving = false; n.ghostT -= dt;
    if (n.state == 'sitdown' || n.state == 'standup') {
      n.tr = Math.min(1, n.tr + dt / 0.8); const k = n.tr * n.tr * (3 - 2 * n.tr); n.x = lerp(n.from[0], n.to[0], k); n.z = lerp(n.from[1], n.to[1], k);
      if (n.tr >= 1) { if (n.state == 'sitdown') n.state = 'seated'; else { n.state = 'free'; const cb = n.after; n.after = null; cb && cb(); } }
    } else if (n.path.length) moveNPC(n, dt);
    else if (n.state == 'queue') { const sl = slotPos(n.door, n.side, n.door.lines[n.side].indexOf(n)); if (Math.hypot(n.x - sl[0], n.z - sl[1]) > 0.14) n.path = [sl]; else n.yawT = Math.PI; }
    if (settled(n) || n.state == 'queue') { n.tP -= dt; if (n.tP <= 0) { n.phone = !n.phone; n.tP = n.phone ? rnd(25, 90) : rnd(8, 40); } }
    if (settled(n) && phase == 'closed' && phaseT > 12) { n.tR -= dt;        // 가끔 다른 칸이나 다른 자리로 옮긴다
      if (n.tR <= 0) { n.tR = rnd(60, 180); const car2 = clamp(n.car + (Math.random() < 0.5 ? -1 : 1), 0, 2), sp = pickSpot(car2, CARS[car2] + rnd(-7, 7)); if (sp) { sp.occ = n; leaveSpot(n, () => goToSpot(n, sp)); } } }
    let dy = n.yawT - n.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); n.yaw += dy * Math.min(1, dt * 9);
    n.y = groundY(n.x); if (n.z < -0.1) n.car = clamp(Math.round((n.x + 20) / 20), 0, 2);
  }
}
// 바닥 그림자(가벼운 원판)
const shadowMesh = (() => { const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 64; const g = cv2.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const geo = new THREE.CircleGeometry(0.42, 16); geo.rotateX(-Math.PI / 2);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv2), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), NPC_N + 16); m.frustumCulled = false; m.renderOrder = 1; scene.add(m); return m; })();
const _m4 = new THREE.Matrix4();
function poseBody(P, n, rx, d2, dt, t, i, pose, item, o) {      // 몸 하나를 화면에 놓는다(멀수록 가볍게, 드물게)
  const g = P.g, far = d2 > 144; if (P.lo) { P.hi.visible = !far; P.lo.visible = far; }
  g.position.set(rx, n.y, n.z); g.rotation.order = 'YXZ'; g.rotation.y = n.yaw;
  if (n.state == 'dead') { const k = Math.min(1, n.deadT / 0.55); g.rotation.x = k * k * 1.5; g.position.y = n.y + k * 0.1; if (n.deadT < 1.6 || !n.wasVis) { animate(P, 'idle', 0, item, {}); smoothPose(P, dt, 8); } g.updateMatrixWorld(true); return; }
  g.rotation.x = 0;
  const step = d2 > 900 ? 4 : d2 > 180 ? 2 : (!n.moving && d2 > 36) ? 2 : 1;
  if (step == 1 || !n.wasVis || (frameN + i) % step == 0) { animate(P, pose, t, item, o); smoothPose(P, dt * step, 14); g.updateMatrixWorld(true); }
  else if (n.moving) { g.updateMatrix(); g.matrixWorld.copy(g.matrix); for (const c of g.children) c.matrixWorld.copy(g.matrixWorld); }      // 자세는 그대로 두고 위치만 옮긴다
}
function drawNPCs(dt, t) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw); let i = 0;
  for (const n of npcs) { const g = n.P.g, gone = n.state == 'gone', sit = n.state == 'seated', rx = n.x + (n.z < -0.1 ? offT : offS);
    _m4.makeScale(gone ? 0 : sit ? 1.25 : 1, 1, gone ? 0 : sit ? 1.6 : 1); _m4.setPosition(rx + (sit ? Math.sin(n.yaw) * 0.22 : 0), n.y + 0.012, n.z + (sit ? Math.cos(n.yaw) * 0.22 : 0)); shadowMesh.setMatrixAt(i++, _m4);
    if (gone) { g.visible = false; n.wasVis = false; continue; }
    const dx = rx - pos.x, dz = n.z - pos.z, d2 = dx * dx + dz * dz, vis = d2 < 16 || (d2 < 4900 && dx * fx + dz * fz > 0.42 * Math.sqrt(d2));
    g.visible = vis; if (!vis) { n.wasVis = false; continue; }
    const pose = n.moving ? 'walk' : (n.state == 'seated' || n.state == 'sitdown') ? 'sit' : n.state == 'strap' ? 'strap' : 'idle';
    poseBody(n.P, n, rx, d2, dt, t, i, pose, 'none', { phone: n.phone && !n.moving && (settled(n) || n.state == 'queue'), walkT: n.walkT, gait: n.gaitNow, seat: SEAT_H, ringY: RING_Y, ringZ: 0.14 });
    n.wasVis = true;
  }
  i = drawPlayers(dt, t, i, fx, fz);
  for (; i < NPC_N + 16; i++) { _m4.makeScale(0, 0, 0); shadowMesh.setMatrixAt(i, _m4); }
  shadowMesh.instanceMatrix.needsUpdate = true;
}
function pushFromNPCs() { if (G.ghost) return; const gy = groundY(pos.x);
  for (const o of others.values()) { if (o.state == 'dead' || o.pose == 1 || Math.abs(o.y - gy) > 0.5) continue; const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz); if (d < 0.46 && d > 1e-4) { pos.x += dx / d * (0.46 - d) * 0.6; pos.z += dz / d * (0.46 - d) * 0.6; } }
  for (const n of npcs) { if (n.state == 'gone' || n.state == 'dead' || n.state == 'seated' || Math.abs(n.y - gy) > 0.5) continue; const dx = pos.x - n.x, dz = pos.z - n.z, d = Math.hypot(dx, dz); if (d < 0.46 && d > 1e-4) { pos.x += dx / d * (0.46 - d) * 0.6; pos.z += dz / d * (0.46 - d) * 0.6; } } }
async function spawnNPCs(onProgress) {
  for (let i = 0; i < NPC_N; i++) {
    const n = { x: 0, z: 0, y: 0, yaw: 0, yawT: 0, state: 'gone', timer: rnd(1, 22), path: [], walkT: Math.random() * 9, ghostT: 0, stuckT: 0, stuckN: 0, sx: 0, sz: 0, phone: false, tP: rnd(5, 40), tR: rnd(8, 150), stops: 1 + ((Math.random() * 3) | 0), car: 1, tries: 0 };
    newBody(n); npcs.push(n);
    if (i < 76) { const car = i % 3, sp = pickSpot(car, CARS[car] + rnd(-9, 9)); n.car = car; n.spot = sp; sp.occ = n; n.yaw = n.yawT = sp.yaw; n.phone = Math.random() < 0.5;
      if (sp.kind == 'seat') { n.x = sp.x; n.z = sp.z; n.state = 'seated'; } else if (sp.kind == 'strap') { n.x = sp.rx - Math.cos(sp.yaw) * n.P.B.sx * n.P.s; n.z = sp.z; n.state = 'strap'; } else { n.x = sp.x; n.z = sp.z; n.state = 'stand'; } }
    else if (i < 106) { let d, side; do { d = doorInfo[(Math.random() * 12) | 0]; side = Math.random() < 0.5 ? 0 : 1; } while (d.lines[side].length >= 3);
      const sl = slotPos(d, side, d.lines[side].length); d.lines[side].push(n); n.door = d; n.side = side; n.x = sl[0]; n.z = sl[1]; n.yaw = n.yawT = Math.PI; n.state = 'queue'; n.phone = Math.random() < 0.55; }
    if (i % 3 == 2) { onProgress && onProgress(i + 1); await new Promise(r => setTimeout(r)); }
  }
  for (let k = 0; k < NPC_SPARE; k++) { const sd = seedN++; getBody(sd); spareSeeds.push(sd); if (k % 3 == 2) await new Promise(r => setTimeout(r)); }
}
