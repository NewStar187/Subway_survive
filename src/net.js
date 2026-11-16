/* ───────────── 방, 접속, 동기화 ─────────────
   방장의 브라우저가 승객·열차·물건을 계산하고 나머지는 결과를 받아 그린다.
   혼자 할 때는 참가자가 없는 방장과 같다. */
const NET = { mode: 'host', solo: true, started: true, hold: false, over: false, id: 'host', code: '', peer: null, conns: new Map(), hostConn: null,
  members: [{ id: 'host', name: '나', host: true, spec: false, alive: true, seed: 0, st: null }], nextId: 1, tSend: 0, startCount: 0, gotSnap: false, cars: 3, carsAuto: true, busy: false };
const others = new Map(), ROOM_PREFIX = 'subway-survive-v1-';
const isHost = () => NET.mode == 'host', myMember = () => NET.members.find(m => m.id == NET.id);
const recCars = () => Math.max(2, Math.min(MAXC, NET.members.filter(m => !m.spec).length + 1));      // 추천 칸 수 = 참가 인원 + 1
const peerOpts = () => { const u = new URLSearchParams(location.search), q = u.get('peer'), debug = +u.get('debug') || 0; if (!q) return { debug }; const [h, p] = q.split(':'); return { host: h, port: +p || 9000, path: '/', secure: false, debug, config: { iceServers: [] } }; };   // ?peer=주소:포트 로 중개 서버를 바꿀 수 있다(시험용)
const genCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[(Math.random() * 32) | 0]).join('');

function toHost(m) { if (isHost()) hostHandle(NET.id, m); else if (NET.hostConn && NET.hostConn.open) NET.hostConn.send(m); }
function toClient(pid, m) { if (pid == NET.id) fromHost(m); else { const c = NET.conns.get(pid); if (c && c.open) c.send(m); } }
function broadcast(m, except) { for (const [pid, c] of NET.conns) if (pid != except && c.open) c.send(m); if (except != NET.id) fromHost(m); }

/* ── 화면: 방 패널, 결과, 가림막 ── */
const netUI = (() => {
  const st = document.createElement('style');
  st.textContent = `#room{position:fixed;left:16px;top:92px;width:230px;background:rgba(0,0,0,.5);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.5;display:none;text-shadow:0 1px 4px #000}
  #room b{font-size:12px;color:#9fd8b7} #room .code{font-size:22px;font-weight:900;letter-spacing:.18em;margin:0 0 6px;user-select:all}
  #room .m{display:flex;align-items:center;gap:6px;padding:2px 0} #room .m span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} #room .m i{font-style:normal;font-size:11px;color:#ffd27a} #room .dead span{opacity:.45;text-decoration:line-through}
  #room button{font-size:12px;padding:4px 9px;border-radius:6px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25)} #room button.go{background:#00a84d;border-color:#00a84d;font-size:14px;padding:7px 12px}
  #room .row{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap} #room .cars{display:flex;align-items:center;gap:6px;margin-top:8px} #room .cars span{font-weight:900;font-size:15px;min-width:34px;text-align:center} #room .cars i{font-style:normal;font-size:11px;color:#ffd27a} #room .cars button{padding:2px 9px;font-size:14px} #room .tip{font-size:11px;opacity:.7;margin-top:6px}
  #fade{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .5s}
  #result{position:fixed;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(4,12,8,.8);text-align:center}
  #result h2{font-size:46px;margin:0;font-weight:900} #result button{background:#00a84d}`;
  document.head.appendChild(st);
  const mk = id => { const d = document.createElement('div'); d.id = id; document.body.appendChild(d); return d; };
  return { room: mk('room'), fade: mk('fade'), result: mk('result') };
})();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function drawLobby() {
  const r = netUI.room; if (NET.solo) { r.style.display = 'none'; return; }
  const meM = myMember(), inGame = NET.started && !NET.over;
  r.style.display = 'block';
  let h = `<b>방 코드</b><div class="code">${esc(NET.code)}</div>`;
  for (const m of NET.members) h += `<div class="m${NET.started && !m.spec && !m.alive ? ' dead' : ''}"><span>${esc(m.name)}${m.id == NET.id ? ' (나)' : ''}</span>${m.host ? '<i>방장</i>' : ''}${m.spec ? '<i>관전</i>' : ''}${isHost() && !m.host ? `<button data-kick="${m.id}">강퇴</button>` : ''}</div>`;
  if (!inGame) { h += `<div class="cars"><b>칸 수</b>${isHost() ? '<button data-cars="-1">−</button>' : ''}<span>${NET.cars}칸</span>${isHost() ? `<button data-cars="1">+</button><i>추천 ${recCars()}칸</i>` : ''}</div>`;
    h += '<div class="row">' + (meM ? `<button data-spec="1">${meM.spec ? '참가로 전환' : '관전으로 전환'}</button>` : '') + (isHost() ? '<button class="go" data-go="1">게임 시작</button>' : '') + '</div>';
    h += `<div class="tip">${isHost() ? '친구에게 방 코드를 알려 주세요. ' : '방장이 시작하기를 기다리는 중. '}버튼은 Esc로 마우스를 푼 뒤 누르세요.</div>`; }
  else if (isHost()) h += '<div class="row"><button data-lobby="1">로비로 돌아가기</button></div>';
  r.innerHTML = h;
}
netUI.room.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.cars) { NET.cars = Math.max(2, Math.min(MAXC, NET.cars + +b.dataset.cars)); NET.carsAuto = NET.cars == recCars(); sendLobby(); }
  else if (b.dataset.kick) kick(b.dataset.kick); else if (b.dataset.spec) toHost({ t: 'spec', v: !myMember().spec }); else if (b.dataset.go) startGame(); else if (b.dataset.lobby) backToLobby(); });
function menuMsg(s) { const el = document.getElementById('menuMsg'); if (el) el.textContent = s; }
function showResult(text) { netUI.result.style.display = 'flex'; netUI.result.innerHTML = `<h2>${esc(text)}</h2>` + (isHost() ? '<button id="toLobby">로비로 돌아가기</button>' : '<p>방장이 로비로 돌아가기를 기다리는 중</p>'); const b = document.getElementById('toLobby'); if (b) b.onclick = backToLobby; try { document.exitPointerLock(); } catch (e) {} }

/* ── 방 만들기와 참여 ── */
function makeRoom(name, tries = 0) {
  if (!window.Peer) return menuMsg('이 환경에서는 방을 만들 수 없습니다. GitHub 주소로 접속해 주세요.');
  menuMsg('방을 만드는 중…'); const code = genCode(), peer = new Peer(ROOM_PREFIX + code, peerOpts());
  setTimeout(() => { if (!NET.peer && !peer.destroyed) { try { peer.destroy(); } catch (e) {} menuMsg('방을 만들지 못했습니다. 접속 중개 서버에 닿지 않습니다. GitHub 주소로 접속했는지, 네트워크가 막혀 있지 않은지 확인해 주세요.'); } }, 12000);
  peer.on('open', () => { NET.peer = peer; NET.solo = false; NET.mode = 'host'; NET.id = 'host'; NET.code = code; NET.started = false; NET.over = false; NET.hold = true; phase = 'closed'; phaseT = 2.5; doorTarget = 0;
    NET.members = [{ id: 'host', name, host: true, spec: false, alive: true, seed: seedN++, st: null }]; resetGame(); enterWorld(); drawLobby(); });
  peer.on('connection', c => { c.on('data', d => { if (d && d.t == 'hello') hostHello(c, d); else if (c.pid) hostHandle(c.pid, d); }); c.on('close', () => { if (c.pid) dropMember(c.pid); }); });
  peer.on('error', e => { if (e.type == 'unavailable-id' && tries < 4) { peer.destroy(); makeRoom(name, tries + 1); } else if (!NET.peer) { try { peer.destroy(); } catch (x) {} menuMsg('방을 만들지 못했습니다 (' + e.type + '). 잠시 뒤 다시 시도해 주세요.'); } });
}
function joinRoom(code, name) {
  if (!window.Peer) return menuMsg('이 환경에서는 방에 참여할 수 없습니다. GitHub 주소로 접속해 주세요.');
  code = code.trim().toUpperCase(); if (code.length < 4) return menuMsg('방 코드를 입력해 주세요.');
  menuMsg('방에 접속하는 중…'); const peer = new Peer(undefined, peerOpts()); let done = false;
  const fail = s => { if (done) return; done = true; menuMsg(s); try { peer.destroy(); } catch (e) {} };
  setTimeout(() => fail('접속 시간이 초과됐습니다. 코드를 확인하고 다시 시도해 주세요.'), 15000);
  peer.on('open', () => { const c = peer.connect(ROOM_PREFIX + code, { reliable: true, serialization: 'json' });
    c.on('open', () => { c.send({ t: 'hello', name }); });
    c.on('data', d => { if (d.t == 'welcome') { done = true; NET.peer = peer; NET.hostConn = c; NET.solo = false; NET.mode = 'client'; NET.id = d.id; NET.code = code; NET.gotSnap = false; for (const sp of seats.concat(straps, stands)) sp.occ = null; resetGame(); if (d.started) { G.alive = false; G.ghost = true; } enterWorld(); } fromHost(d); });
    c.on('close', () => { if (NET.mode == 'client') { alertBox('방장과 연결이 끊겼습니다.'); } }); });
  peer.on('error', e => fail(e.type == 'peer-unavailable' ? '그 코드의 방을 찾을 수 없습니다.' : '접속하지 못했습니다 (' + e.type + ').'));
}
function alertBox(s) { netUI.result.style.display = 'flex'; netUI.result.innerHTML = `<h2 style="font-size:30px">${esc(s)}</h2><button id="rl">처음으로</button>`; document.getElementById('rl').onclick = () => location.reload(); try { document.exitPointerLock(); } catch (e) {} }

/* ── 방장이 하는 일 ── */
function hostHello(c, d) {
  if (c.pid) return; const pid = 'p' + NET.nextId++; c.pid = pid; NET.conns.set(pid, c);
  NET.members.push({ id: pid, name: String(d.name || '손님').slice(0, 10), host: false, spec: NET.started, late: NET.started, alive: !NET.started, seed: seedN++, st: null });
  c.send({ t: 'welcome', id: pid, started: NET.started }); sendLobby(); c.send(pickupMsg());
}
function sendLobby() { if (NET.carsAuto && (!NET.started || NET.over)) NET.cars = recCars(); const m = { t: 'lobby', cars: NET.cars, code: NET.code, started: NET.started, over: NET.over, m: NET.members.map(x => ({ id: x.id, name: x.name, host: x.host, spec: x.spec, alive: x.alive })) }; for (const c of NET.conns.values()) if (c.open) c.send(m); drawLobby(); }
function freeSpots(pid) { for (const sp of seats.concat(straps)) if (sp.occ && sp.occ.player == pid) sp.occ = null; }
function dropMember(pid) { const i = NET.members.findIndex(m => m.id == pid); if (i < 0) return; NET.members.splice(i, 1); NET.conns.delete(pid); freeSpots(pid); sendLobby(); checkWin(); }
function kick(pid) { const c = NET.conns.get(pid); if (!c) return; try { c.send({ t: 'kicked' }); } catch (e) {} setTimeout(() => { try { c.close(); } catch (e) {} }, 300); dropMember(pid); }
async function startGame() {
  if (!isHost() || (NET.started && !NET.over) || NET.busy) return; NET.busy = true;
  try { const n = NET.cars, changed = n != CARS.length; netUI.fade.style.opacity = 1; await new Promise(r => setTimeout(r, 520));
    if (changed) await remake(n);                      // 칸 수가 바뀌면 역과 열차를 다시 짓는다(참가자는 받은 칸 수를 보고 따라 짓는다)
    resetTrain(); const a = {};
    NET.started = true; NET.over = false; NET.hold = false; phase = 'closed'; phaseT = changed ? 9 : 5; doorTarget = 0; approached = true;
    for (const m of NET.members) { m.alive = !m.spec; m.body = null; if (!m.spec) { m.seed = seedN++; a[m.id] = [m.seed, +rnd(-HP + 5, HP - 5).toFixed(2), +rnd(1.6, 3.9).toFixed(2)]; } }   // 겉모습과 위치를 새로 섞는다
    NET.startCount = NET.members.filter(m => !m.spec).length;
    broadcast({ t: 'start', a, cars: n }); sendLobby();
  } finally { NET.busy = false; }
}
function backToLobby() {            // 도중에 들어와 관전하던 사람은 다음 판부터 참가한다
  if (!isHost()) return; NET.started = false; NET.over = false; NET.hold = true; phase = 'closed'; phaseT = 2.5; doorTarget = 0; approached = true; for (const m of NET.members) { m.alive = true; m.body = null; freeSpots(m.id); if (m.late) { m.late = false; m.spec = false; } } resetTrain(); broadcast({ t: 'toLobby' }); sendLobby(); }
function checkWin() { if (!isHost() || !NET.started || NET.over || NET.startCount < 2) return; const a = NET.members.filter(m => !m.spec && m.alive); if (a.length <= 1) { NET.over = true; broadcast({ t: 'win', id: a[0] ? a[0].id : null, name: a[0] ? a[0].name : '' }); sendLobby(); } }
function hostHandle(pid, m) {
  const mem = NET.members.find(x => x.id == pid); if (!mem || !m) return;
  switch (m.t) {
    case 'u': if (mem.alive || mem.spec) mem.st = m.s; break;
    case 'kill': { const n = npcs[m.n]; if (n && alive(n)) killNPCHost(n); break; }
    case 'hit': { const v = NET.members.find(x => x.id == m.p); if (NET.started && !NET.over && v && v.alive && !v.spec && mem.alive) { v.alive = false; v.body = v.st ? v.st.slice() : null; freeSpots(v.id); broadcast({ t: 'ev', k: 'dead', id: v.id, by: pid }); sendLobby(); checkWin(); } break; }
    case 'out': if (mem.alive) { mem.alive = false; mem.body = null; freeSpots(pid); sendLobby(); checkWin(); } break;
    case 'shot': case 'whistle': case 'swing': broadcast({ ...m, t: 'ev', k: m.t, from: pid }, pid); break;
    case 'pick': { const p = pickups.find(q => q.id == m.id); if (p) { removePickup(p); toClient(pid, { t: 'got', type: p.type }); sendPickups(); } break; }
    case 'sit': { const sp = seats[m.i], n = sp && sp.occ; let wait = 0;
      if (!sp || (n && n.player && n.player != pid) || (n && !n.player && n.state != 'seated' && n.state != 'tospot')) { toClient(pid, { t: 'sitno' }); break; }
      if (n && n.state == 'seated') { leaveSpot(n, () => goToSpot(n, pickSpot(n.car, n.x))); wait = 1000; } else if (n && n.state == 'tospot') { n.spot = null; n.path = []; goToSpot(n, pickSpot(n.car, n.x)); }
      freeSpots(pid); sp.occ = { player: pid }; setTimeout(() => toClient(pid, { t: 'sitok', i: m.i }), wait); break; }
    case 'stand': for (const sp of seats) if (sp.occ && sp.occ.player == pid) sp.occ = null; break;
    case 'strap': { const sp = straps.find(q => Math.abs(q.rx - m.x) < 0.05 && Math.abs(q.z - m.z) < 0.1); if (sp && !sp.occ) sp.occ = { player: pid }; break; }
    case 'unstrap': for (const sp of straps) if (sp.occ && sp.occ.player == pid) sp.occ = null; break;
    case 'spec': if (!NET.started || NET.over) { mem.spec = !!m.v; sendLobby(); } break;
    case 'pkreq': toClient(pid, pickupMsg()); break;
  }
}
const pickupMsg = () => ({ t: 'pk', l: pickups.map(p => [p.id, p.type == 'bullet' ? 0 : 1, p.frame == 't' ? 1 : 0, p.car, +p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3), +p.g.rotation.y.toFixed(2)]) });
function sendPickups() { if (NET.conns.size) { const m = pickupMsg(); for (const c of NET.conns.values()) if (c.open) c.send(m); } }
function buildSnap() {
  const n = new Array(npcs.length * 5); let k = 0;
  for (const q of npcs) { const st = q.state, code = (st == 'gone' ? 0 : st == 'dead' ? 4 : st == 'strap' ? 3 : (st == 'seated' || st == 'sitdown') ? 2 : 1) | (q.moving ? 8 : 0) | (q.phone && !q.moving && (settled(q) || st == 'queue') ? 16 : 0);
    n[k++] = q.seed; n[k++] = Math.round(q.x * 100); n[k++] = Math.round(q.z * 100); n[k++] = Math.round(q.yaw * 100); n[k++] = code; }
  const p = []; for (const m of NET.members) { const st = m.alive ? m.st : m.body; if (st && !(st[6] & 8)) p.push([m.id, m.seed, m.alive ? 1 : 0, ...st]); }
  return { t: 's', c: CARS.length, fo: firstOpen, cl: closing, ph: phase == 'open' ? 1 : 0, pt: +phaseT.toFixed(2), n, p };
}

/* ── 내 상태 보내기와 받은 내용 반영 ── */
function myState() {
  let x = pos.x, z = pos.z, yw = yaw + Math.PI, pose = 0;
  if (G.seat) { x = G.seat.x; z = G.seat.z; yw = G.seat.yaw; pose = 1; } else if (G.strap) { x = G.strap.x; z = G.strap.z + G.strap.s * 0.14; yw = G.strap.s < 0 ? 0 : Math.PI; pose = 2; }
  return [+x.toFixed(2), +z.toFixed(2), +Math.atan2(Math.sin(yw), Math.cos(yw)).toFixed(2), +pitch.toFixed(2), pose, G.slot == 1 && G.knives <= 0 ? 0 : G.slot, (G.phoneLook ? 2 : 0) | (G.glowT > 0 ? 4 : 0) | (G.ghost || !G.alive ? 8 : 0)];
}
function applyPlayers(list) {
  const seen = new Set();
  for (const e of list) { const id = e[0]; if (id == NET.id) continue; seen.add(id);
    let o = others.get(id); if (!o) { o = { id, x: e[3], z: e[4], yaw: e[5], y: 0, walkT: 0, v: 0, aimT: 0, deadT: 0, state: 'stand', moving: false, wasVis: false, P: null, seed: -1 }; others.set(id, o); }
    if (o.seed != e[1]) { o.seed = e[1]; if (o.P) o.P.g.visible = false; o.P = null; o.wasVis = false; }
    if (!e[2] && o.state != 'dead') { o.state = 'dead'; o.deadT = 0; } else if (e[2] && o.state == 'dead') o.state = 'stand';
    o.alive = !!e[2]; o.tx = e[3]; o.tz = e[4]; o.tyaw = e[5]; o.pose = e[7]; o.slot = e[8]; o.fl = e[9]; }
  for (const [id, o] of others) if (!seen.has(id)) { if (o.P) o.P.g.visible = false; if (o.glow) o.glow.visible = false; others.delete(id); }
}
function applySnap(m) {
  if (m.c != CARS.length) { if (!remaking) remake(m.c); return; }      // 방장과 칸 수가 다르면 먼저 같은 열차를 짓는다
  if (remaking) return;
  const wasOpen = phase == 'open'; phase = m.ph ? 'open' : 'closed'; phaseT = m.pt; doorTarget = m.ph ? 1 : 0; if (wasOpen && !m.ph) onDoorsClosed();
  const a = m.n, first = !NET.gotSnap, cnt = Math.min(npcs.length, a.length / 5); NET.gotSnap = true;
  if (m.fo != firstOpen) setFirstOpen(m.fo, first); closing = m.cl;
  for (let i = 0; i < cnt; i++) { const n = npcs[i], k = i * 5, code = a[k + 4], sc = code & 7; n.want = a[k];
    n.tx = a[k + 1] / 100; n.tz = a[k + 2] / 100; n.tyaw = a[k + 3] / 100; const st = sc == 0 ? 'gone' : sc == 2 ? 'seated' : sc == 3 ? 'strap' : sc == 4 ? 'dead' : 'stand';
    if (st == 'dead' && n.state != 'dead') n.deadT = first ? 9 : 0; if (first || n.state == 'gone' || Math.hypot(n.tx - n.x, n.tz - n.z) > 4) { n.x = n.tx; n.z = n.tz; n.yaw = n.tyaw; }
    n.state = st; n.movingNet = !!(code & 8); n.phone = !!(code & 16); n.path = []; }
  applyPlayers(m.p);
}
let bodyBudget = 0;
function clientNPCs(dt) {                // 참가자 쪽: 방장이 보낸 위치를 부드럽게 따라간다
  phaseT = Math.max(0, phaseT - dt); bodyBudget = 2;
  for (const n of npcs) {
    if (n.want != null && n.want != n.seed) { if (bodies.has(n.want)) setBody(n, n.want); else if (bodyBudget > 0) { bodyBudget--; setBody(n, n.want); } }
    if (n.state == 'dead') { n.deadT += dt; continue; } if (n.state == 'gone' || n.tx == null) continue;
    const k = Math.min(1, dt * 12), ox = n.x, oz = n.z; n.x += (n.tx - n.x) * k; n.z += (n.tz - n.z) * k; let dy = n.tyaw - n.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); n.yaw += dy * Math.min(1, dt * 10);
    const d = Math.hypot(n.x - ox, n.z - oz), sp = d / Math.max(dt, 1e-3); n.moving = n.movingNet && sp > 0.08; n.gaitNow = 0.95 * clamp(sp / 0.9, 0.45, 1); n.walkT += d * (0.87 / n.P.s) / 0.95; n.y = groundY(n.x);
  }
}
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,90,60,1)'); gr.addColorStop(0.5, 'rgba(255,60,40,.55)'); gr.addColorStop(1, 'rgba(255,40,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
function updatePlayers(dt) {
  for (const o of others.values()) {
    if (!o.P && o.seed >= 0 && (bodies.has(o.seed) || bodyBudget-- > 0)) o.P = getBody(o.seed);
    o.aimT -= dt; if (o.state == 'dead') { o.deadT += dt; continue; }
    const far = Math.hypot(o.tx - o.x, o.tz - o.z) > 4, k = far ? 1 : Math.min(1, dt * 12), ox = o.x, oz = o.z; o.x += (o.tx - o.x) * k; o.z += (o.tz - o.z) * k; let dy = o.tyaw - o.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); o.yaw += dy * Math.min(1, dt * 12);
    const d = far ? 0 : Math.hypot(o.x - ox, o.z - oz); o.v += (d / Math.max(dt, 1e-3) - o.v) * Math.min(1, dt * 8); o.moving = o.pose == 0 && o.v > 0.25; o.gait = clamp(0.55 + o.v * 0.3, 0.6, 1.8); if (o.P) o.walkT += d * (0.87 / o.P.s) / o.gait; o.y = groundY(o.x);
  }
}
function drawPlayers(dt, t, i, fx, fz) {      // 다른 플레이어는 승객과 똑같은 방식으로 그린다
  for (const o of others.values()) { const P = o.P; if (!P) continue;
    let rx = o.x + (o.z < -0.1 ? offT : offS); if (o.pose == 2 && o.state != 'dead') rx -= Math.cos(o.yaw) * P.B.sx * P.s;
    const sit = o.pose == 1 && o.state != 'dead'; _m4.makeScale(sit ? 1.25 : 1, 1, sit ? 1.6 : 1); _m4.setPosition(rx + (sit ? Math.sin(o.yaw) * 0.22 : 0), o.y + 0.012, o.z + (sit ? Math.cos(o.yaw) * 0.22 : 0)); shadowMesh.setMatrixAt(i++, _m4);
    const dx = rx - pos.x, dz = o.z - pos.z, d2 = dx * dx + dz * dz, vis = d2 < 16 || (d2 < 4900 && dx * fx + dz * fz > 0.42 * Math.sqrt(d2));
    if (o.fl & 4 && o.state != 'dead') { if (!o.glow) { o.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending })); o.glow.scale.set(1.5, 2.3, 1); o.glow.renderOrder = 9; scene.add(o.glow); } o.glow.visible = true; o.glow.position.set(rx, o.y + 0.95, o.z); } else if (o.glow) o.glow.visible = false;   // 미션 실패: 벽 너머에서도 보이는 빛
    P.g.visible = vis; if (!vis) { o.wasVis = false; continue; }
    const item = o.slot == 1 ? 'knife' : o.slot == 2 ? 'gun' : o.slot == 4 ? 'phone' : 'none', pose = o.aimT > 0 ? 'aim' : o.moving ? 'walk' : o.pose == 1 ? 'sit' : o.pose == 2 ? 'strap' : 'idle';
    poseBody(P, { x: o.x, z: o.z, y: o.y, yaw: o.yaw, state: o.state, deadT: o.deadT, wasVis: o.wasVis, moving: o.moving || o.aimT > 0 }, rx, d2, dt, t, i, pose, pose == 'aim' ? (o.aimItem || item) : item, { phone: !!(o.fl & 2) && !o.moving, walkT: o.walkT, gait: o.gait, seat: SEAT_H, ringY: RING_Y, ringZ: 0.14 });
    o.wasVis = true; }
  return i;
}
function fromHost(m) {
  switch (m.t) {
    case 'lobby': if (!isHost()) { NET.members = m.m; NET.started = m.started; NET.over = m.over; NET.code = m.code; NET.cars = m.cars || NET.cars; } drawLobby(); break;
    case 's': applySnap(m); break;
    case 'pk': syncPickups(m.l); break;
    case 'got': onGot(m.type); break;
    case 'sitok': if (G.seatWait && seats.indexOf(G.seatWait.sp) == m.i) sitNow(G.seatWait.sp); else toHost({ t: 'stand' }); break;
    case 'sitno': G.seatWait = null; toast('지금은 앉을 수 없다', 1.2); break;
    case 'ev': netEvent(m); break;
    case 'start': { const a = m.a[NET.id]; netUI.fade.style.opacity = 1; netUI.result.style.display = 'none';
      setTimeout(async () => { if (m.cars && m.cars != CARS.length) await remake(m.cars); else if (remaking) await remaking; resetGame(); NET.started = true; NET.over = false; if (a) { pos.x = a[1]; pos.z = a[2]; yaw = 0; G.boarded = true; } else { G.alive = false; G.ghost = true; } drawLobby(); netUI.room.style.display = 'none'; toast(a ? '게임 시작 · 문이 열리면 열차에 타세요' : '관전 중', 3.5); netUI.fade.style.opacity = 0; }, 600); break; }
    case 'toLobby': netUI.result.style.display = 'none'; resetGame(); pos.x = 2.4 + rnd(-3, 3); pos.z = 3.3 + rnd(-0.6, 0.6); if (!isHost()) { NET.started = false; NET.over = false; } drawLobby(); break;
    case 'win': NET.over = true; showResult(m.id == NET.id ? '승리!' : m.id ? `${m.name} 승리` : '무승부'); drawLobby(); break;
    case 'kicked': NET.mode = 'kicked'; alertBox('방에서 내보내졌습니다.'); break;
  }
}
function netTick(dt) {
  bodyBudget = Math.max(bodyBudget, 1); updatePlayers(dt);
  if (NET.solo) return; NET.tSend += dt;
  if (isHost()) { if (NET.tSend >= 0.1) { NET.tSend = 0; const mm = myMember(); mm.st = myState(); const s = buildSnap(); for (const c of NET.conns.values()) if (c.open) c.send(s); applyPlayers(s.p); } }
  else if (NET.tSend >= 0.066) { NET.tSend = 0; if (NET.hostConn && NET.hostConn.open) NET.hostConn.send({ t: 'u', s: myState() }); }
}
// 방장의 탭이 가려져도 방이 멈추지 않도록, 가려진 동안에는 별도 타이머로 계산을 이어 간다
try { const w = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),50)'], { type: 'text/javascript' }))); w.onmessage = () => { if (document.hidden && !NET.solo && isHost()) { tick(0.05); netTick(0.05); } }; } catch (e) {}
