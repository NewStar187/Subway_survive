/* ───────────── 플레이어·미션 ───────────── */
const PLAYER = { player: true };
const G = { alive: true, boarded: false, round: 0, mission: null, done: false, knives: 1, bullets: 1, drink: false, slot: 0, seat: null, seatWait: null, eye: 1.48, glowT: 0, car: -1, prog: 0, hold: 0, seatsUsed: new Set(), cool: 0, wCool: 0, lastId: 0,
  ghost: false, punch: 0, swing: null, sip: null, boostT: 0, bought: -1, strap: null, phoneLook: false, phoneK: 0, fireT: 9, dryT: 9, equipT: 1, cylA: 0, lastPhase: 'closed' };
const ui = (() => {
  const st = document.createElement('style');
  st.textContent = `#mis,#inv,#pr,#toast,#warn{position:fixed;pointer-events:none;opacity:0;transition:opacity .4s;text-shadow:0 1px 5px #000}
  body.play #mis,body.play #inv{opacity:1}
  #mis{right:16px;top:14px;max-width:340px;background:rgba(0,0,0,.45);padding:10px 14px;border-radius:10px;font-size:14px;line-height:1.55}
  #mis b{font-size:12px;color:#9fd8b7;font-weight:700;display:block} #mis i{font-style:normal;color:#ffd27a} #mis .ok{color:#7fe0a5} #mis .bad{color:#ff8f86}
  #inv{left:50%;bottom:44px;transform:translateX(-50%);display:flex;gap:8px;font-size:13px}
  #inv span.boost{background:rgba(214,58,47,.8);border-color:#ff9a8f;font-weight:700}
  #inv span{background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.18);padding:6px 12px;border-radius:8px;white-space:nowrap} #inv span.on{background:rgba(0,168,77,.75);border-color:#7fe0a5} #inv span.no{opacity:.4}
  #pr{left:50%;top:58%;transform:translateX(-50%);background:rgba(0,0,0,.55);padding:7px 14px;border-radius:8px;font-size:14px;font-weight:700}
  #toast{left:50%;top:22%;transform:translateX(-50%);background:rgba(0,0,0,.6);padding:9px 18px;border-radius:10px;font-size:16px;font-weight:700}
  #warn{left:50%;top:12%;transform:translateX(-50%);background:rgba(190,32,24,.88);padding:9px 18px;border-radius:10px;font-size:16px;font-weight:900;white-space:nowrap;transition:opacity .2s}
  #glow{position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity .3s;box-shadow:inset 0 0 140px 40px rgba(255,60,40,.75);display:grid;place-items:end center;padding-bottom:110px;font-weight:900;font-size:18px;color:#ffd0c8;text-shadow:0 1px 6px #000}
  #over{position:fixed;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(20,4,4,.82);text-align:center}
  #over h2{font-size:48px;margin:0;font-weight:900} #over p{margin:0;opacity:.85} #over button{background:#00a84d;margin-top:10px}`;
  document.head.appendChild(st);
  const mk = id => { const d = document.createElement('div'); d.id = id; document.body.appendChild(d); return d; };
  const o = { mis: mk('mis'), inv: mk('inv'), pr: mk('pr'), toast: mk('toast'), warn: mk('warn'), glow: mk('glow'), over: mk('over') };
  o.over.innerHTML = '<h2>탈락</h2><p id="why"></p><button id="again">다시 시작</button>';
  return o;
})();
let toastT = 0;
function toast(s, sec = 2.4) { ui.toast.textContent = s; ui.toast.style.opacity = 1; toastT = sec; }

/* 소리 */
let AC = null, rumble = null;
const audio = () => { try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state == 'suspended') AC.resume(); } catch (e) {} return AC; };
function noiseBuf(a, sec, decay) { const n = (a.sampleRate * sec) | 0, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (decay ? Math.exp(-i / n * decay) : 1); return buf; }
function sWhistle(vol = 1) { const a = audio(); if (!a) return; const o = a.createOscillator(), g = a.createGain(), t = a.currentTime; o.type = 'sine';
  o.frequency.setValueAtTime(1650, t); o.frequency.linearRampToValueAtTime(2350, t + 0.12); o.frequency.linearRampToValueAtTime(1950, t + 0.42);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * vol, t + 0.03); g.gain.linearRampToValueAtTime(0, t + 0.45); o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.47); }
function sShot(vol = 1) { const a = audio(); if (!a) return; const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = noiseBuf(a, 0.4, 9); f.type = 'lowpass'; f.frequency.value = 600 + 2000 * vol; g.gain.value = 0.8 * vol; s.connect(f).connect(g).connect(a.destination); s.start();
  const o = a.createOscillator(), g2 = a.createGain(), t = a.currentTime; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18); g2.gain.setValueAtTime(0.5 * vol, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g2).connect(a.destination); o.start(t); o.stop(t + 0.21); }
function sWhoosh() { const a = audio(); if (!a) return; const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime; s.buffer = noiseBuf(a, 0.3, 0); f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.16); f.frequency.exponentialRampToValueAtTime(700, t + 0.3);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28, t + 0.12); g.gain.linearRampToValueAtTime(0, t + 0.3); s.connect(f).connect(g).connect(a.destination); s.start(); }
function sBlip(f = 880, len = 0.09, vol = 0.1, at = 0) { const a = audio(); if (!a) return; const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + at; o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t + len); o.connect(g).connect(a.destination); o.start(t); o.stop(t + len + 0.01); }
function sSlam() { const a = audio(); if (!a) return; const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime; s.buffer = noiseBuf(a, 0.5, 5); f.type = 'lowpass'; f.frequency.value = 420; g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.45); s.connect(f).connect(g).connect(a.destination); s.start(); sBlip(70, 0.3, 0.3); }
// 안내방송: 한국어 음성이 있는 기기에서는 말로도 읽어 준다
let koVoice = null; try { const pickV = () => { koVoice = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('ko')) || null; }; pickV(); speechSynthesis.addEventListener('voiceschanged', pickV); } catch (e) {}
function say(text) { try { if (!koVoice || !playing || noRender) return; const u = new SpeechSynthesisUtterance(text); u.voice = koVoice; u.lang = 'ko-KR'; u.rate = 1.03; u.volume = 0.75; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {} }
function sChime() { sBlip(1175, 0.35, 0.09); sBlip(880, 0.5, 0.09, 0.3); }
function setRumble(v) { const a = AC; if (!a) return; if (!rumble) { const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = noiseBuf(a, 2, 0); s.loop = true; f.type = 'lowpass'; f.frequency.value = 160; g.gain.value = 0; s.connect(f).connect(g).connect(a.destination); s.start(); rumble = { g, f }; }
  rumble.g.gain.value += (v - rumble.g.gain.value) * 0.08; rumble.f.frequency.value = 110 + v * 900; }

/* ───────────── 1인칭 손과 무기 ───────────── */
scene.add(camera);
const VS = 0.3, vmRoot = new THREE.Object3D(); vmRoot.scale.setScalar(VS); camera.add(vmRoot);      // 작게 만들어 눈 가까이 두면 벽을 뚫지 않는다
const skinM = new THREE.MeshStandardMaterial({ color: 0xe3b08a, roughness: 0.62 }), sleeveM = new THREE.MeshStandardMaterial({ color: 0x2b2e34, roughness: 0.92 }), cuffM = new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.95 });
const _up = new THREE.Vector3(0, 1, 0);
function segm(parent, a, b, r1, r2, mat, capsule) { const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), L = d.length(), m = new THREE.Mesh(capsule ? new THREE.CapsuleGeometry(r1, L, 5, 12) : new THREE.CylinderGeometry(r2, r1, L, 16), mat);
  m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(_up, d.normalize()); parent.add(m); return m; }
function blob(parent, c, rad, mat) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), mat); m.position.set(...c); m.scale.set(...rad); parent.add(m); return m; }
function forearm(parent, hand, wrist, elbow) { segm(parent, hand, wrist, 0.026, 0.029, skinM); segm(parent, wrist, elbow, 0.036, 0.052, sleeveM); const w = new THREE.Vector3(...wrist), e = new THREE.Vector3(...elbow).sub(w).normalize(); segm(parent, wrist, w.clone().addScaledVector(e, 0.03).toArray(), 0.039, 0.04, cuffM); }
// 리볼버를 쥔 손
const rigGun = new THREE.Object3D(); vmRoot.add(rigGun); const gunObj = newItem('gun'); rigGun.add(gunObj);
const gunCyl = gunObj.getObjectByName('cyl'), gunHam = gunObj.getObjectByName('hammer');
blob(rigGun, [0.017, -0.04, 0.037], [0.024, 0.048, 0.034], skinM);
forearm(rigGun, [0.018, -0.066, 0.058], [0.03, -0.1, 0.1], [0.1, -0.3, 0.34]);
const flashTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.translate(64, 64);
  for (let i = 0; i < 9; i++) { g.rotate(Math.PI * 2 / 9 + (i % 2) * 0.2); const gr = g.createLinearGradient(0, 0, 60, 0); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(1, 'rgba(255,150,40,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, -7); g.lineTo(34 + (i % 3) * 13, 0); g.lineTo(0, 7); g.fill(); }
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,220,140,.8)'); gr.addColorStop(1, 'rgba(255,160,60,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill(); return new THREE.CanvasTexture(c); })();
const softTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const flashM = new THREE.MeshBasicMaterial({ map: flashTex, color: new THREE.Color(4, 3.2, 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.05, -0.17); rigGun.add(muzzle);
const flashA = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), flashM), flashB = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.09), flashM); flashB.rotation.y = Math.PI / 2; flashB.position.z = -0.08; muzzle.add(flashA, flashB); muzzle.visible = false;
let flashK = 0;                      // 총구 화염은 잠깐 화면을 밝히는 것으로 대신한다(조명을 하나 더 두면 모든 표면 계산이 느려진다)
// 칼을 쥔 손
const rigKnife = new THREE.Object3D(); vmRoot.add(rigKnife); rigKnife.add(newItem('knife'));
blob(rigKnife, [0.012, -0.002, 0.062], [0.026, 0.034, 0.046], skinM);
forearm(rigKnife, [0.016, -0.016, 0.098], [0.03, -0.05, 0.14], [0.1, -0.26, 0.38]);
// 캔을 쥔 손
const rigCan = new THREE.Object3D(); vmRoot.add(rigCan); rigCan.add(newItem('can'));
blob(rigCan, [0.036, -0.005, 0.02], [0.022, 0.045, 0.034], skinM);
forearm(rigCan, [0.04, -0.03, 0.045], [0.05, -0.07, 0.09], [0.11, -0.28, 0.34]);
// 휴대폰을 쥔 손(화면이 눈 쪽을 본다)
const rigPhone = new THREE.Object3D(); vmRoot.add(rigPhone); { const ph = newItem('phone'); ph.rotation.y = -Math.PI / 2; rigPhone.add(ph); }
blob(rigPhone, [0.004, -0.035, -0.022], [0.042, 0.046, 0.02], skinM);
forearm(rigPhone, [0.01, -0.07, -0.012], [0.02, -0.12, 0.02], [0.1, -0.34, 0.25]);
// 손잡이를 잡은 왼팔(세계 좌표에 직접 놓는다)
const strapArm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.05, 1, 14), sleeveM), strapHand = new THREE.Mesh(new THREE.SphereGeometry(0.046, 16, 12), skinM); strapArm.visible = strapHand.visible = false; scene.add(strapArm, strapHand);
vmRoot.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
rigGun.visible = rigKnife.visible = rigCan.visible = rigPhone.visible = false;
const BASE = { gun: [[0.15, -0.165, -0.4], [0.03, 0.05, -0.03]], knife: [[0.19, -0.19, -0.42], [0.5, 0.42, 0.28]], phone: [[0.17, -0.25, -0.42], [-1.0, 0.25, 0]], can: [[0.2, -0.2, -0.46], [0.1, 0.2, -0.1]] };
// 연기, 탄도, 불꽃
const fx = [], smokeM = new THREE.SpriteMaterial({ map: softTex, color: 0x9a9a9a, transparent: true, depthWrite: false, opacity: 0.35 });
function addFx(o, life, upd) { scene.add(o); fx.push({ o, t: 0, life, upd }); }
const tracerM = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
function rayLimit(o, d) {            // 총알이 벽·바닥·천장에 닿는 거리(열린 문은 통과)
  let t = 45, inT = o.z < -0.1; const walls = (inT2, tMin) => { const zs = inT2 ? [-3.16, -0.24] : [0.0, 7.5], yTop = inT2 ? 2.19 : 3; let best = 45, crossed = false;
    for (const z of zs) { const tt = (z - o.z) / d.z; if (tt > tMin + 1e-4 && tt < best) { const x = o.x + d.x * tt, y = o.y + d.y * tt, door = (z == -0.24 || z == 0.0) && doorT > 0.8 && y < 1.9 && doorXs.some((q, i) => (i >> 2) >= firstOpen && Math.abs(q - x) < 0.6); if (door) crossed = tt; else best = tt; } }
    for (const y of [0, yTop]) { const tt = (y - o.y) / d.y; if (tt > tMin + 1e-4 && tt < best) best = tt; }
    return [best, crossed]; };
  let [b, cr] = walls(inT, 0); if (cr !== false && cr < b) { const [b2] = walls(!inT, cr + 0.06); b = b2; } return Math.min(t, b);
}

const BOOST = 10;                    // 음료수를 마신 뒤 달리기 속도가 2배가 되는 시간(초)
function slots() { return [['맨손', true], [`칼 ×${G.knives}`, G.knives > 0], [`리볼버 ${G.bullets}/6`, true], ['음료수', G.drink], ['휴대폰', true]]; }
function setSlot(i) { const s = slots(), dir = i >= G.slot ? 1 : -1; for (let k = 0; k < 5; k++) { const j = ((i + k * dir) % 5 + 5) % 5; if (s[j][1]) { if (j != G.slot) { G.slot = j; G.equipT = 0; G.swing = null; G.phoneLook = false; } break; } } drawInv(); }
function drawInv() { ui.inv.innerHTML = slots().map((s, i) => `<span class="${i == G.slot ? 'on' : s[1] ? '' : 'no'}">${i + 1} ${s[0]}</span>`).join('') + (G.boostT > 0 ? `<span class="boost">질주 ${Math.ceil(G.boostT)}초</span>` : '');
  const a = G.alive; rigKnife.visible = a && G.slot == 1 && G.knives > 0; rigGun.visible = a && G.slot == 2; rigCan.visible = a && G.slot == 3 && G.drink; rigPhone.visible = a && G.slot == 4; ui.inv.style.visibility = a ? '' : 'hidden'; }

/* ───────────── 주울 수 있는 물건: 열차와 승강장 곳곳 ───────────── */
const pickups = [], pick = a => a[(Math.random() * a.length) | 0]; let pickId = 1;
function trainSpot(c) {
  const C = CARS[c], k = Math.random(), bench = () => C + pick([-4.8, 0, 4.8]) + rnd(-1.4, 1.4), near = Math.random() < 0.5;
  if (k < 0.3) return { x: bench(), y: 1.822, z: near ? -0.44 : -2.96 };                                   // 선반 위
  if (k < 0.55) { const list = seats.filter(s => s.car == c && !s.occ && !s.item); if (list.length) { const s = pick(list); return { x: s.x + rnd(-0.08, 0.08), y: 0.468, z: s.z + rnd(-0.05, 0.1) * (s.yaw == 0 ? 1 : -1), seat: s }; } }   // 빈 좌석 위
  if (k < 0.75) return { x: bench(), y: 0.006, z: near ? -0.24 - rnd(0.2, 0.42) : -3.16 + rnd(0.2, 0.42) };  // 좌석 밑
  if (k < 0.9) return { x: C + pick(DOORS) + rnd(-0.5, 0.5), y: 0.006, z: -3.0 - rnd(0, 0.1) };              // 반대편 문 앞 바닥
  return { x: C + pick([-9.5, 9.5]), y: 0.006, z: ZC + rnd(-0.5, 0.5) };                                     // 통로 끝 구석
}
function platformSpot() {
  const k = Math.random();
  if (k < 0.2 && PLAT.benches.length) return { x: pick(PLAT.benches) + rnd(-0.8, 0.8), y: 0.456, z: rnd(7.03, 7.34) };                 // 의자 위
  if (k < 0.3 && PLAT.bins.length) return { x: pick(PLAT.bins), y: 0.936, z: rnd(7.16, 7.36) };                                         // 분리수거함 위
  if (k < 0.55) return { x: pick(PLAT.wall) + rnd(-0.3, 0.3), y: 0.012, z: rnd(7.2, 7.38) };                                           // 벽 아래
  if (k < 0.75) { const cx = pick(PLAT.pillars), s = pick([-1, 1]); return { x: cx + s * rnd(0.45, 0.6), y: 0.012, z: rnd(4.4, 4.9) }; }   // 기둥 옆
  if (k < 0.9) return { x: pick(PLAT.psdAds) + rnd(-1, 1), y: 0.012, z: rnd(0.12, 0.3) };                                              // 안전문 광고판 아래
  const i = (Math.random() * 12) | 0, s = pick([-1, 1]); return { x: s * (HP + 0.3 + i * 0.3 + 0.16), y: (i + 1) * 0.17 + 0.008, z: rnd(2.3, 5.9) };   // 계단
}
function spawnPickup(frame, c) {
  const sp = frame == 't' ? trainSpot(c) : platformSpot(); if (pickups.some(p => p.frame == frame && Math.hypot(p.x - sp.x, p.z - sp.z) < 0.5 && Math.abs(p.y - sp.y) < 0.4)) return false;
  const p = addPickup(pickId++, Math.random() < 0.6 ? 'bullet' : 'knife', frame, c, sp.x, sp.y, sp.z, Math.random() * 6.28); p.seat = sp.seat; if (sp.seat) sp.seat.item = p; return true;
}
function addPickup(id, type, frame, car, x, y, z, ry) {
  const g = new THREE.Group(), o = newItem(type); o.rotation.z = Math.PI / 2;
  if (type == 'bullet') { o.scale.setScalar(1.5); o.position.set(0.03, 0.0085, 0); } else o.position.y = 0.011;
  g.add(o); g.position.set(x, y, z); g.rotation.y = ry; scene.add(g); const p = { id, type, frame, car, x, y, z, g }; pickups.push(p); return p;
}
function syncPickups(list) {         // 참가자 쪽: 방장이 보낸 목록에 맞춘다
  const ids = new Set(list.map(e => e[0])); for (const p of pickups.slice()) if (!ids.has(p.id) || p.local) removePickup(p);
  for (const e of list) if (!pickups.some(p => p.id == e[0])) addPickup(e[0], e[1] ? 'knife' : 'bullet', e[2] ? 't' : 's', e[3], e[4], e[5], e[6], e[7]);
}
function onGot(type) { sBlip(1100, 0.06);
  if (type == 'knife') { G.knives++; toast('칼을 주웠다', 1.4); } else if (G.bullets < 6) { G.bullets++; toast('총알을 장전했다', 1.4); } else toast('총알이 가득 차서 버렸다', 1.4);
  if (G.mission && G.mission.id == 8 && !G.done) { G.prog++; if (G.prog >= 2) complete(); } drawInv(); }
function removePickup(p) { pickups.splice(pickups.indexOf(p), 1); scene.remove(p.g); if (p.seat) p.seat.item = null; }
let pickT = 0;
function clearPickups() { for (const q of pickups.slice()) removePickup(q); }
function refillPickups(full) {       // 방장. full: 새 판을 시작할 때 열차 곳곳에 뿌린다. 그 뒤로 열차 안에서는 마지막 칸만 남았을 때에만 다시 생긴다
  if (!isHost()) return; const before = pickups.length, N = CARS.length, inCar = c => pickups.filter(q => q.frame == 't' && q.car == c).length;
  if (full) for (let c = firstOpen; c < N; c++) { let n = inCar(c); for (let k = 0; n < 6 && k < 14; k++) if (spawnPickup('t', c)) n++; }
  else if (firstOpen >= N - 1 && inCar(N - 1) < 6) for (let k = 0; k < 14; k++) if (spawnPickup('t', N - 1)) break;      // 마지막 칸: 주기적으로 하나씩 다시 생긴다
  if (full || Math.abs(trainX) > 150) { let n = pickups.filter(q => q.frame == 's').length; for (let k = 0; n < 4 * N && k < 12 * N; k++) if (spawnPickup('s', -1)) n++; }   // 승강장은 열차가 터널에 있을 때 채운다(역마다 새로 놓인 것처럼)
  if (pickups.length != before) sendPickups();
}

/* ───────────── 미션 ───────────── */
const COND = [['마스크를 쓴', n => n.P.tags.mask], ['안경을 쓴', n => n.P.tags.glasses], ['모자를 쓴', n => !!n.P.tags.hat], ['백팩을 멘', n => n.P.tags.bag == 'back'], ['헤드폰을 쓴', n => n.P.tags.ear == 'phones'],
  ['패딩을 입은', n => n.P.tags.top.includes('puffer')], ['코트를 입은', n => n.P.tags.top == 'coat'], ['앉아 있는', n => n.state == 'seated'], ['휴대폰을 보고 있는', n => n.phone && (settled(n) || n.state == 'queue')]];
const MISSION = { 1: ['5초 동안 뛰기', 5, '초'], 2: ['호차 3번 옮기기', 3, '번'], 3: ['서로 다른 의자 3개에 앉기', 3, '개'], 4: ['뒤로 3초 걷기', 3, '초'], 5: ['다음 정차역에서 내려 자판기에서 음료수 사오기'], 6: ['휘파람(H) 3번 불기', 3, '번'], 7: ['아무 승객이나 처치'], 8: ['수집 2번 하기', 2, '번'], 9: [''], 10: [''] };
const alive = n => n.state != 'dead' && n.state != 'gone';
function pickMission() {             // 지금 수행할 수 있는 미션 가운데 하나를 고른다
  const armed = G.knives > 0 || G.bullets > 0, ok = [1, 3, 4, 5, 6], N = CARS.length, safe = firstOpen + (firstOpen < N - 1 ? 1 : 0), cur = pos.z < -0.1 ? carOf(pos.x) : -1;      // safe: 이번 라운드가 끝나도 남는 첫 칸
  const dest = []; for (let c = safe; c < N; c++) if (c != cur) dest.push(c);
  if (N - safe >= 2) ok.push(2); if (dest.length) ok.push(9); if (armed) ok.push(7); if (pickups.filter(p => p.frame == 't' && p.car >= safe).length >= 2) ok.push(8);
  const conds = COND.filter(c => npcs.filter(n => alive(n) && n.z < -0.1 && c[1](n)).length >= 2); if (armed && conds.length) ok.push(10);
  let id; do { id = pick(ok); } while (id == G.lastId && ok.length > 1);
  const m = { id, name: MISSION[id][0], goal: MISSION[id][1], unit: MISSION[id][2] };
  if (id == 9) { m.car = pick(dest); m.name = `${m.car + 1}호차로 이동`; }
  if (id == 10) { m.cond = pick(conds); m.name = `${m.cond[0]} 승객 처치`; }
  return m;
}
function complete() { if (G.done) return; G.done = true; toast('미션 완료'); sBlip(880); sBlip(1320, 0.09, 0.1, 0.11); drawMission(); }
function startRound() { G.round++; G.mission = pickMission(); G.lastId = G.mission.id; G.done = false; G.prog = 0; G.hold = 0; G.seatsUsed.clear(); if (G.seat) G.seatsUsed.add(seats.indexOf(G.seat)); toast(`${G.round}라운드 · ${G.mission.name}`, 3.5); drawMission(); }
function onDoorsClosed() {           // 문이 닫히는 순간이 라운드의 끝이자 다음 라운드의 시작
  if (!G.alive) return; const inside = pos.z < -0.1;
  if (G.boarded && !inside) return eliminate('열차를 놓쳤습니다.');      // 정차 중에는 누구나 내릴 수 있지만 문이 닫힐 때 밖이면 탈락
  if (G.round > 0) {
    if (!G.done) { G.glowT = 1.5 * G.round; toast(`미션 실패 · ${(1.5 * G.round).toFixed(1)}초 동안 위치 노출`, 3); sBlip(220, 0.4, 0.14); }
    }
  if (inside) { G.boarded = true; startRound(); }
}
/* ───────────── 칸 폐쇄 ───────────── */
function reopenCars() {              // 모든 칸을 다시 잇는다(새 판)
  CARS.forEach((c, i) => { const g = carG[i]; if (carState[i]) { g.removeFromParent(); tG.add(g); } g.visible = true; g.position.x = 0; carState[i] = 0; });
  carState.length = CARS.length; firstOpen = 0; closing = -1; gameRound = 0; if (sealG) sealG.visible = false;
  for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].seal) blocks.splice(i, 1);
}
function setFirstOpen(k, instant) {  // k번째 칸(0부터)보다 뒤쪽 칸을 닫는다. 방장과 참가자가 똑같이 실행한다
  if (k < firstOpen) reopenCars(); if (k == firstOpen) return; if (Math.abs(trainX) > 1) instant = true;      // 달리는 중에 닫히면(건너뛰기) 남겨 둘 역이 없다
  for (let c = firstOpen; c < k; c++) { const g = carG[c]; carState[c] = instant ? 2 : 1; g.removeFromParent(); sG.add(g); g.position.x = offT - offS; g.visible = !instant; }   // 닫힌 칸은 떼어 내 역에 남긴다
  firstOpen = k; const xb = CARS[k] - 9.71;
  for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].seal) blocks.splice(i, 1);
  blocks.push({ x1: xb - 0.9, x2: xb + 0.02, z1: -3.3, z2: -0.2, seal: true }); sealG.position.x = xb; sealG.visible = true;
  if (G.alive && !G.ghost && pos.z < -0.1 && pos.x < xb - 0.14) eliminate('폐쇄된 칸에 남아 있었습니다.');
  else if (!instant && playing) { sSlam(); toast(k >= CARS.length - 1 ? `${k}호차 폐쇄 · 마지막 칸만 남았습니다` : `${k}호차가 폐쇄됐습니다`, 3.5); }
}
function resetTrain() {              // 방장: 새 판을 위해 열차와 승객, 물건을 처음 상태로 돌린다
  reopenCars(); placeNPCs(); clearPickups(); refillPickups(true); sendPickups();
}
function eliminate(why, tell = true) { if (!G.alive) return; if (G.seat) standUp(); letGo(); G.alive = false; G.swing = null; G.sip = null; if (tell) toHost({ t: 'out' }); drawInv(); document.getElementById('why').textContent = why; document.getElementById('again').textContent = NET.solo ? '다시 시작' : '관전하기'; ui.over.style.display = 'flex'; try { document.exitPointerLock(); } catch (e) {} }
function resetGame() { if (G.seat) { G.seat.occ = null; toHost({ t: 'stand' }); } Object.assign(G, { ghost: false, alive: true, boarded: false, round: 0, mission: null, done: false, knives: 1, bullets: 1, drink: false, slot: 0, seat: null, seatWait: null, glowT: 0, car: -1, prog: 0, lastId: 0, swing: null, sip: null, boostT: 0, bought: -1, phoneLook: false }); letGo();
  pos.x = 2.4; pos.z = 3.3; yaw = 0; pitch = -0.02; ui.over.style.display = 'none'; drawInv(); drawMission(); }
document.getElementById('again').addEventListener('click', () => { if (NET.solo) { resetGame(); resetTrain(); phase = 'closed'; phaseT = 6; doorTarget = 0; approached = true; } else { ui.over.style.display = 'none'; G.ghost = true; } lock(); });
let misTxt = '';
function drawMission() {
  let h;
  if (!G.round) h = '<b>시작 전</b>열차에 타면 문이 닫힐 때 1라운드가 시작됩니다.';
  else { const m = G.mission, pr = m.goal ? ` <i>${m.unit == '초' ? Math.min(m.goal, G.prog).toFixed(1) : Math.min(m.goal, Math.floor(G.prog))}/${m.goal}${m.unit}</i>` : m.id == 5 ? (G.drink ? ' <i>음료수 확보 · 열차로 돌아가기</i>' : phase == 'open' ? ' <i>지금 내릴 수 있음</i>' : ' <i>도착하면 내리기</i>') : '';
    h = `<b>${G.round}라운드 미션</b>${m.name}${pr}<br>${G.done ? '<span class="ok">완료 · 다음 라운드 대기</span>' : `<span class="bad">다음 역에서 문이 닫히기 전까지 (실패 시 ${(1.5 * G.round).toFixed(1)}초 노출)</span>`}`; }
  if (h != misTxt) ui.mis.innerHTML = misTxt = h;
}

/* ───────────── 공격 ───────────── */
function strike(n) {                 // 내가 승객을 처치: 미션을 따지고 방장에게 알린다
  if (!alive(n)) return; const cond = G.mission && G.mission.id == 10 && G.mission.cond[1](n);
  if (G.mission && !G.done && (G.mission.id == 7 || (G.mission.id == 10 && cond))) complete();
  toHost({ t: 'kill', n: npcs.indexOf(n) });
}
function killNPC(n) { strike(n); }
function killNPCHost(n) {
  if (!alive(n)) return;
  if (n.spot) { n.spot.occ = null; n.spot = null; }
  for (const d of doorInfo) { for (const l of d.lines) { const i = l.indexOf(n); if (i >= 0) l.splice(i, 1); } const j = d.alight.indexOf(n); if (j >= 0) d.alight.splice(j, 1); }
  n.state = 'dead'; n.deadT = 0; n.path = []; n.phone = false; n.moving = false; n.onArrive = null; n.after = null;
}
const zoneOf = (x, z) => (z < -0.1 ? 0 : 100) + carOf(x);      // 소리가 들리는 범위를 따지는 구역(칸 단위)
function netEvent(m) {
  const o = others.get(m.from), mz = zoneOf(pos.x, pos.z);
  if (m.k == 'dead') { if (m.id == NET.id) eliminate('다른 플레이어에게 당했습니다.', false); return; }
  if (m.k == 'swing') { if (o) { o.aimT = 0.42; o.aimItem = 'knife'; } return; }
  if (m.k == 'whistle') { if (zoneOf(m.x, m.z) == mz) sWhistle(clamp(1.2 - Math.hypot(m.x - pos.x, m.z - pos.z) / 16, 0.25, 1)); return; }     // 같은 칸에서만 들린다
  if (m.k == 'shot') { if (o) { o.aimT = 0.5; o.aimItem = 'gun'; }
    const sz = zoneOf(m.o[0], m.o[2]), same = (sz >= 100) == (mz >= 100), near = Math.abs(sz % 100 - mz % 100) <= 1 && (same || doorT > 0.5);      // 인접한 칸까지 들린다
    if (near) sShot(clamp(1.1 - Math.hypot(m.o[0] - pos.x, m.o[2] - pos.z) / 30, 0.2, 1) * (same ? 1 : 0.6));
    const off = m.o[2] < -0.1 ? offT : offS; shotFx(new THREE.Vector3(m.o[0] + off, m.o[1], m.o[2]), new THREE.Vector3(m.e[0] + off, m.e[1], m.e[2]), m.hit, { x: 0, z: 0 }); }
}
function shotFx(m0, end, hit, d) {    // 탄도, 착탄 불꽃, 총구 연기
  const L = m0.distanceTo(end), dir = end.clone().sub(m0).normalize();
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, L, 5), tracerM.clone()); tr.position.copy(m0).lerp(end, 0.5); tr.quaternion.setFromUnitVectors(_up, dir); addFx(tr, 0.07, (f, u) => { f.o.material.opacity = 1 - u; });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: hit ? 0xff5040 : 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.position.copy(end).addScaledVector(dir, -0.05); sp.scale.setScalar(0.3); addFx(sp, 0.12, (f, u) => { f.o.material.opacity = 1 - u; f.o.scale.setScalar(0.3 + u * 0.3); });
  for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(smokeM.clone()); s.position.copy(m0); const v = new THREE.Vector3(dir.x * 0.5 + rnd(-0.1, 0.1), 0.25 + rnd(0, 0.15), dir.z * 0.5 + rnd(-0.1, 0.1)); s.scale.setScalar(0.06); addFx(s, 0.9 + i * 0.2, (f, u, dt) => { f.o.position.addScaledVector(v, dt * (1 - u * 0.7)); f.o.scale.setScalar(0.06 + u * 0.28); f.o.material.opacity = 0.32 * (1 - u); }); }
}
const pvp = () => NET.started && !NET.over && !NET.solo;
const rivals = () => pvp() ? [...others.values()].filter(o => o.alive && o.state != 'dead' && o.P) : [];
function lineOfFire(ox, oz, tx, tz) {            // 벽과 유리는 막고, 열린 문과 통로만 지나간다
  if ((oz > -0.1) != (tz > -0.1)) { const x = ox + (tx - ox) * (-0.1 - oz) / (tz - oz); if (doorT < 0.8 || !doorXs.some((d, i) => (i >> 2) >= firstOpen && Math.abs(d - x) < 0.62)) return false; }
  if (oz < -0.1 && tz < -0.1) for (let i = 1; i < CARS.length; i++) { const bx = CARS[i] - 10; if ((ox - bx) * (tx - bx) < 0) { const z = oz + (tz - oz) * (bx - ox) / (tx - ox); if (Math.abs(z - ZC) > 0.6 || i <= firstOpen) return false; } }
  return true;
}
function knifeHit() {
  const fx2 = -Math.sin(yaw), fz = -Math.cos(yaw); let best = null, bd = 1.4;
  for (const n of npcs.concat(rivals())) { if (n.state == 'dead' || n.state == 'gone') continue; const dx = n.x - pos.x, dz = n.z - pos.z, d = Math.hypot(dx, dz); if (d < bd && Math.abs(n.y - groundY(pos.x)) < 0.6 && (dx * fx2 + dz * fz) / (d || 1) > 0.5) { bd = d; best = n; } }
  if (best) { if (best.id) toHost({ t: 'hit', p: best.id }); else strike(best); G.knives--; sBlip(150, 0.14, 0.16); toast('칼을 사용했다'); G.punch = -0.03; }
}
function attack() {
  if (!G.alive || !playing || G.cool > 0 || G.seatWait || G.equipT < 0.8) return;
  if ((G.slot == 1 || G.slot == 2) && (!NET.started || NET.over)) { toast('게임이 시작되면 쓸 수 있다', 1.2); G.cool = 0.5; return; }
  if (G.slot == 4) { G.cool = 0.3; G.phoneLook = !G.phoneLook; return; }                    // 휴대폰 보기/내리기
  if (G.slot == 3 && G.drink && !G.sip) { G.cool = 1.4; G.sip = { t: 0 }; return; }          // 음료수 마시기
  if (G.slot == 1 && G.knives > 0) { G.cool = 0.55; G.swing = { t: 0, hit: false }; sWhoosh(); toHost({ t: 'swing' }); }
  else if (G.slot == 2) { G.cool = 0.55; if (G.bullets <= 0) { G.dryT = 0; sBlip(1500, 0.03, 0.07); toast('총알이 없다', 1.2); return; }
    G.bullets--; G.fireT = 0; G.punch = 0.05; G.cylA += Math.PI / 3; flashK = 1; muzzle.visible = true; flashA.rotation.z = Math.random() * 6.28; flashA.scale.setScalar(0.8 + Math.random() * 0.5); sShot(); drawInv();
    const cp = Math.cos(pitch), d = { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp }, o = { x: pos.x, y: camera.position.y, z: pos.z }; let best = null, bt = rayLimit(o, d);
    for (const n of npcs.concat(rivals())) { if (n.state == 'dead' || n.state == 'gone') continue; const t = ((n.x - o.x) * d.x + (n.z - o.z) * d.z) / (d.x * d.x + d.z * d.z || 1e-6); if (t <= 0.2 || t > bt) continue;
      const px = o.x + d.x * t, pz = o.z + d.z * t, h = o.y + d.y * t - n.y, top = (n.state == 'seated' || n.pose == 1 ? 1.32 : 1.78) * n.P.s; if (Math.hypot(px - n.x, pz - n.z) < 0.27 && h > 0.05 && h < top && lineOfFire(o.x, o.z, n.x, n.z)) { bt = t; best = n; } }
    if (best) { if (best.id) toHost({ t: 'hit', p: best.id }); else strike(best); }
    const m0 = muzzle.getWorldPosition(new THREE.Vector3()), end = new THREE.Vector3(o.x + d.x * bt, o.y + d.y * bt, o.z + d.z * bt); shotFx(m0, end, !!best, d);
    toHost({ t: 'shot', o: [+o.x.toFixed(2), +(o.y - 0.12).toFixed(2), +o.z.toFixed(2)], e: [+(o.x + d.x * bt).toFixed(2), +(o.y + d.y * bt).toFixed(2), +(o.z + d.z * bt).toFixed(2)], hit: best ? 1 : 0 }); }
}

/* ───────────── 앉기·줍기·자판기 ───────────── */
function letGo() { if (G.strap) { G.strap = null; toHost({ t: 'unstrap' }); } }
const seatTaken = sp => npcs.some(n => n.state == 'seated' && Math.abs(n.x - sp.x) < 0.2 && Math.abs(n.z - sp.z) < 0.2) || [...others.values()].some(o => o.pose == 1 && o.state != 'dead' && Math.abs(o.x - sp.x) < 0.2 && Math.abs(o.z - sp.z) < 0.2);
function sitNow(sp) { letGo(); G.seat = sp; G.seatWait = null; sp.occ = PLAYER; pos.x = sp.x; pos.z = sp.z + (sp.yaw == 0 ? 0.1 : -0.1); G.seatsUsed.add(seats.indexOf(sp)); if (G.mission && G.mission.id == 3 && !G.done) { G.prog = G.seatsUsed.size; if (G.prog >= 3) complete(); } }
function standUp() { const sp = G.seat; if (!sp) return; sp.occ = null; G.seat = null; pos.x = sp.ax; pos.z = sp.az; toHost({ t: 'stand' }); }
function trySit(sp) { G.seatWait = { sp, t: 0 }; if (seatTaken(sp)) toast('자리를 비켜 받는 중', 1.2); toHost({ t: 'sit', i: seats.indexOf(sp) }); }      // 방장이 자리를 확인해 준다
function findLook() {                // 지금 상호작용할 수 있는 대상
  if (!G.alive || G.seatWait) return null;
  const fx2 = -Math.sin(yaw), fz = -Math.cos(yaw), cp = Math.cos(pitch), dir = [fx2 * cp, Math.sin(pitch), fz * cp], oy = camera.position.y, fr = pos.z < -0.1 ? 't' : 's'; let best = null, ba = 0.82;
  for (const p of pickups) { if (p.frame != fr) continue; const v = [p.x - pos.x, p.y - oy, p.z - pos.z], d = Math.hypot(...v); if (d > 2.0) continue; const c = (v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]) / d; if (c > ba) { ba = c; best = { kind: 'pick', p, text: `E 줍기: ${p.type == 'bullet' ? '총알' : '칼'}` }; } }
  if (best) return best;
  if (G.strap) return { kind: 'letgo', text: 'E 손잡이 놓기' };
  if (G.seat) return { kind: 'stand', text: 'E 일어나기' };
  if (pos.z < -0.2 && pitch > 0.12) { let br = null, bd = 0.75;      // 위를 보면 가까운 손잡이를 잡을 수 있다
    for (const sp of seats) { const s = sp.yaw == 0 ? 1 : -1, rz = sp.z + s * 0.42, d = Math.hypot(sp.x - pos.x, rz - pos.z); if (d < bd) { bd = d; br = { x: sp.x, z: rz, s }; } }
    if (br) { const sz = br.z + br.s * 0.14, busy = npcs.some(n => n.state == 'strap' && Math.abs(n.z - sz) < 0.15 && Math.abs(n.x - br.x) < 0.4) || [...others.values()].some(o => o.pose == 2 && Math.abs(o.z - sz) < 0.15 && Math.abs(o.x - br.x) < 0.2); return busy ? { kind: 'none', text: '다른 승객이 잡고 있다' } : { kind: 'strap', r: br, text: 'E 손잡이 잡기' }; } }
  if (pos.z > 5.3) for (const vx of PLAT.vend) if (Math.abs(pos.x - vx) < 0.9) return G.bought == G.round ? { kind: 'none', text: '이번 라운드에는 이미 샀다' } : G.drink ? { kind: 'none', text: '음료수를 이미 들고 있다' } : { kind: 'vend', text: 'E 음료수 구매' };     // 라운드마다 1개
  if (pos.z < -0.2) { let bs = null, bd = 1.25; for (const sp of seats) { const dx = sp.x - pos.x, dz = sp.z - pos.z, d = Math.hypot(dx, dz); if (d < bd && (dx * fx2 + dz * fz) / (d || 1) > 0.5) { bd = d; bs = sp; } }
    if (bs && bs !== G.seat) return { kind: 'sit', sp: bs, text: seatTaken(bs) ? 'E 앉기 (자리 양보 받기)' : 'E 앉기' }; }
  return null;
}
function interact() {
  const L = findLook(); if (!L) return;
  if (L.kind == 'none') return;
  if (L.kind == 'stand') return standUp();
  if (L.kind == 'letgo') return letGo();
  if (L.kind == 'strap') { G.strap = { x: L.r.x, z: L.r.z, s: L.r.s }; toHost({ t: 'strap', x: L.r.x, z: L.r.z + L.r.s * 0.14 }); pos.x = L.r.x + 0.16 * Math.cos(yaw); pos.z = L.r.z + L.r.s * 0.16; return; }
  if (L.kind == 'sit') return trySit(L.sp);
  if (L.kind == 'vend') { G.drink = true; G.bought = G.round; G.slot = 3; G.equipT = 0; drawInv(); sBlip(520, 0.2); toast(G.mission && G.mission.id == 5 && !G.done ? '음료수를 샀다 · 문이 닫히기 전에 열차로' : '음료수를 샀다 · 클릭해서 마시면 10초 동안 질주'); return; }
  if (L.kind == 'pick') toHost({ t: 'pick', id: L.p.id });
}
function whistle() { if (!G.alive || G.wCool > 0) return; G.wCool = 0.9; sWhistle(); toHost({ t: 'whistle', x: +pos.x.toFixed(1), z: +pos.z.toFixed(1) }); if (G.mission && G.mission.id == 6 && !G.done) { G.prog++; if (G.prog >= 3) complete(); } }

addEventListener('keydown', e => { if (!playing || e.repeat || e.target.tagName == 'INPUT') return;
  if (e.code == 'KeyE') interact(); else if (e.code == 'KeyH') whistle(); else if (e.code == 'Space') attack();
  else if (/^Digit[1-5]$/.test(e.code)) { const i = +e.code[5] - 1; if (slots()[i][1] && i != G.slot) { G.slot = i; G.equipT = 0; G.swing = null; G.phoneLook = false; drawInv(); } } });
addEventListener('wheel', e => { if (playing) setSlot(G.slot + (e.deltaY > 0 ? 1 : -1)); }, { passive: true });
canvas.addEventListener('mousedown', e => { if (playing && e.button == 0 && document.pointerLockElement === canvas) attack(); });

/* 손 움직임: 꺼내기, 걸을 때 흔들림, 칼 휘두르기, 총 반동 */
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
let swayYaw = 0, swayPitch = 0, lastYaw = 0, lastPitch = 0;
function animateHands(dt, moving) {
  G.equipT = Math.min(1, G.equipT + dt / 0.28); G.fireT += dt; G.dryT += dt;
  let dyaw = yaw - lastYaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw)); lastYaw = yaw; const dp = pitch - lastPitch; lastPitch = pitch;
  swayYaw += (clamp(dyaw * 3, -0.12, 0.12) - swayYaw) * Math.min(1, dt * 9); swayPitch += (clamp(dp * 3, -0.1, 0.1) - swayPitch) * Math.min(1, dt * 9);
  const e = 1 - sm(0, 1, G.equipT), bx = moving ? Math.sin(bob) * 0.008 : 0, by = moving ? -Math.abs(Math.cos(bob)) * 0.007 : Math.sin(performance.now() / 900) * 0.002;
  const place = (rig, key, p, r) => { const [bp, br] = BASE[key]; rig.position.set(bp[0] + bx + swayYaw * 0.25 + p[0], bp[1] + by - e * 0.38 - swayPitch * 0.2 + p[1], bp[2] + p[2]); rig.rotation.set(br[0] - e * 0.7 + r[0], br[1] + swayYaw * 0.6 + r[1], br[2] + r[2]); };
  // 칼: 뒤로 젖혔다가 오른쪽 위에서 왼쪽 아래로 크게 벤다
  let kp = [0, 0, 0], kr = [0, 0, 0];
  if (G.swing) { const s = G.swing; s.t += dt; const u = s.t / 0.44, A = [[0.1, 0.13, 0.07], [0.55, -0.75, -0.55]], B = [[-0.42, -0.07, -0.14], [-0.45, 1.25, 1.05]]; let w, from, to;
    if (u < 0.28) { w = sm(0, 0.28, u); from = [[0, 0, 0], [0, 0, 0]]; to = A; } else if (u < 0.58) { w = Math.pow((u - 0.28) / 0.3, 1.6); from = A; to = B; } else { w = sm(0.58, 1, u); from = B; to = [[0, 0, 0], [0, 0, 0]]; }
    kp = from[0].map((v, i) => v + (to[0][i] - v) * w); kr = from[1].map((v, i) => v + (to[1][i] - v) * w);
    if (!s.hit && u >= 0.42) { s.hit = true; knifeHit(); if (G.knives <= 0) { G.slot = 0; } drawInv(); }
    if (u >= 1) G.swing = null; }
  place(rigKnife, 'knife', kp, kr);
  // 총: 순간적으로 튀어 오른 뒤 천천히 제자리로
  const t = G.fireT, k = t < 0.045 ? t / 0.045 : Math.exp(-(t - 0.045) * 8) * (1 + 0.25 * Math.sin((t - 0.045) * 22)), dk = G.dryT < 0.2 ? Math.sin(G.dryT / 0.2 * Math.PI) : 0;
  place(rigGun, 'gun', [0.004 * k, 0.035 * k, 0.085 * k], [0.46 * k + 0.03 * dk, 0.03 * k, -0.05 * k]);
  gunCyl.rotation.x += (G.cylA - gunCyl.rotation.x) * Math.min(1, dt * 16); gunHam.rotation.z = (t < 0.035 ? 0.7 * (1 - t / 0.035) : 0) + dk * 0.7;
  if (t > 0.05) muzzle.visible = false;
  let cp2 = [0, 0, 0], cr2 = [0, 0, 0];
  if (G.sip) { const s = G.sip; s.t += dt; const k = s.t < 0.35 ? sm(0, 0.35, s.t) : s.t < 0.95 ? 1 : 1 - sm(0.95, 1.3, s.t);
    cp2 = [-0.17 * k, 0.17 * k, 0.2 * k]; cr2 = [1.25 * k, -0.2 * k, 0.15 * k];
    if (s.t >= 0.95 && !s.done) { s.done = true; G.boostT = BOOST; sBlip(700, 0.1); sBlip(1050, 0.12, 0.1, 0.1); toast(`음료수를 마셨다 · ${BOOST}초 동안 달리기 속도 2배`); }
    if (s.t >= 1.3) { G.sip = null; G.drink = false; G.slot = 0; G.equipT = 0; drawInv(); } }
  place(rigCan, 'can', cp2, cr2);
  // 휴대폰: 클릭하면 눈앞으로 들어 올려 화면을 본다
  G.phoneK += ((G.phoneLook && G.slot == 4 ? 1 : 0) - G.phoneK) * Math.min(1, dt * 9); { const k = G.phoneK; place(rigPhone, 'phone', [-0.15 * k, 0.13 * k, 0.07 * k], [0.72 * k, -0.25 * k, 0]); }
  // 손잡이를 잡은 팔
  strapArm.visible = strapHand.visible = !!G.strap;
  if (G.strap) { const sh = new THREE.Vector3(pos.x - Math.cos(yaw) * 0.2, camera.position.y - 0.24, pos.z + Math.sin(yaw) * 0.2), rg = new THREE.Vector3(G.strap.x, 1.655, G.strap.z), d = rg.clone().sub(sh), L = d.length();
    strapArm.position.copy(sh).addScaledVector(d, 0.5); strapArm.scale.set(1, L, 1); strapArm.quaternion.setFromUnitVectors(_up, d.normalize()); strapHand.position.copy(rg); }
  G.punch += (0 - G.punch) * Math.min(1, dt * 9); flashK = Math.max(0, flashK - dt * 14); renderer.toneMappingExposure = EXPOSURE * (1 + 0.4 * flashK);
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; const u = f.t / f.life; if (u >= 1) { scene.remove(f.o); f.o.material.dispose(); if (f.o.geometry && f.o.isMesh) f.o.geometry.dispose(); fx.splice(i, 1); } else f.upd(f, u, dt); }
}

let prTxt = '';
let annClosing = -1, annLate = true, annT = 0, warnTxt = '';
function gameUpdate(dt, f, moving, run) {
  G.cool -= dt; G.wCool -= dt; animateHands(G.freeze ? 0 : dt, moving);
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) ui.toast.style.opacity = 0; }
  if (G.glowT > 0) { G.glowT -= dt; ui.glow.style.opacity = 1; ui.glow.textContent = `위치 노출 중 · ${Math.max(0, G.glowT).toFixed(1)}초`; } else ui.glow.style.opacity = 0;
  if (G.seatWait) { G.seatWait.t += dt; if (G.seatWait.t > 4) G.seatWait = null; }
  if (G.boostT > 0) { const c = Math.ceil(G.boostT); G.boostT -= dt; if (Math.ceil(G.boostT) != c) drawInv(); if (G.boostT <= 0) { G.boostT = 0; toast('질주 효과가 끝났다', 1.4); drawInv(); } }
  pickT -= dt; if (pickT <= 0) { pickT = 20; refillPickups(); }
  // 폐쇄 안내방송과 경고
  if (closing != annClosing) { annClosing = closing; annLate = closing < 0; annT = closing >= 0 ? 4 : 0; }
  if (annT > 0) { annT -= dt; if (annT <= 0 && closing >= 0) { sChime(); toast(`안내방송 · 다음 역에서 ${closing + 1}호차가 폐쇄됩니다`, 5); say(`안내 말씀 드립니다. 다음 역에서 ${closing + 1}호차가 폐쇄됩니다. ${closing + 1}호차에 계신 승객께서는 다른 칸으로 이동해 주시기 바랍니다.`); } }
  if (!annLate && closing >= 0 && phase == 'closed' && phaseT < 21) { annLate = true; sChime(); say(`잠시 후 ${closing + 1}호차가 폐쇄됩니다.`); }
  { const danger = G.alive && !G.ghost && closing >= 0 && pos.z < -0.1 && pos.x < CARS[closing + 1] - 9.85, t = danger ? `이 칸은 도착하면 폐쇄됩니다 · ${closing + 2}호차 쪽으로 이동 (${Math.max(0, Math.ceil(phaseT - 3))}초)` : '';
    if (t != warnTxt) { ui.warn.textContent = warnTxt = t; ui.warn.style.opacity = t ? 1 : 0; } }
  for (const p of pickups) { const x = p.x + (p.frame == 't' ? offT : offS); p.g.position.x = x; p.g.visible = Math.abs(x - pos.x) < 30; }      // 작은 물건은 가까울 때만 그린다
  if (phase != G.lastPhase) { G.lastPhase = phase; sChime(); }
  const inTrain = pos.z < -0.2, car = inTrain ? carOf(pos.x) : -1, m = G.mission;
  setRumble(inTrain ? trainV / 16 * 0.16 : Math.abs(trainX) < 60 ? trainV / 16 * 0.07 : 0);
  if (m && !G.done && G.alive) {
    if (m.id == 1 && run && moving) G.prog += dt;
    if (m.id == 4 && f < 0 && moving) G.prog += dt;
    if (m.id == 2 && car >= 0 && G.car >= 0 && car != G.car) G.prog++;
    if (m.id == 9) { G.hold = car == m.car ? G.hold + dt : 0; if (G.hold > 0.8) complete(); }
    if (m.id == 5 && G.drink && G.bought == G.round && inTrain) complete();
    if (m.goal && m.id != 3 && m.id != 6 && m.id != 8 && G.prog >= m.goal) complete();
  }
  G.car = car;
  G.eye += ((G.seat ? 1.12 : 1.48) - G.eye) * Math.min(1, dt * 8);
  const L = findLook(), t = L ? L.text : ''; if (t != prTxt) { ui.pr.textContent = prTxt = t; ui.pr.style.opacity = t ? 1 : 0; }
  drawMission();
}
