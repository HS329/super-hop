// 面の検査。level.js の planClimb が作った登りを、
// 実際の発射と同じ物理で1Hopずつ数値シミュレーションして確かめる。
// 生成式とは別の経路（刻みシミュレーション）で検証するのが目的。
import { WORLD } from '../platformer/world.js';
import { planClimb, GROUND_HALF, GROUND_Y, PLAIN_HALF } from '../platformer/level.js';

const G = 28;                 // main.js PHYS.gravity
const FALL_G = G * 1.3;       // main.js PHYS.fastFall を掛けた落下重力
const HALF = 0.42;            // main.js PHYS.half
const HEIGHT = 1.7;           // main.js PHYS.height
const MAXH = 17;              // PUMP.maxHeight
const V0 = Math.sqrt(2 * G * MAXH);
const LEAN = Math.PI * 0.3;   // PUMP.leanMax
const WORLD_R = 52;

const plan = planClimb(WORLD);
const nodes = plan.nodes;
const route = plan.route;

function launchPoint(src, tx, tz) {
  const dx = tx - src.x, dz = tz - src.z;
  const d = Math.hypot(dx, dz) || 1;
  const ux = dx / d, uz = dz / d;
  if (src.rect.sx * src.rect.sz <= 36) return { x: src.x, z: src.z };
  let tin = -Infinity, tout = Infinity;
  for (const [p, u, lo, hi] of [[src.x, ux, src.rect.x0, src.rect.x1], [src.z, uz, src.rect.z0, src.rect.z1]]) {
    if (Math.abs(u) < 1e-6) { if (p < lo || p > hi) return { x: src.x, z: src.z }; continue; }
    let t0 = (lo - p) / u, t1 = (hi - p) / u;
    if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
    tin = Math.max(tin, t0);
    tout = Math.min(tout, t1);
  }
  const t = tout > 0 ? Math.max(0, tout - HALF) : 0;
  return { x: src.x + ux * t, z: src.z + uz * t };
}

// 一Hopを刻んで模拟。target の輪郭に入った時点で縁より下なら側面にぶつけ、
// 降りながら天板の高さに来たら着地
function simulate(px, py, pz, vx, vy, vz, target) {
  const dt = 1 / 120;
  let x = px, y = py, z = pz, w = vy;
  for (let i = 0; i < 420; i++) {
    x += vx * dt;
    z += vz * dt;
    w -= (w < 0 ? FALL_G : G) * dt;
    y += w * dt;
    if (y < target.y - 8) break;
    const inXZ = x > target.rect.x0 - HALF && x < target.rect.x1 + HALF
      && z > target.rect.z0 - HALF && z < target.rect.z1 + HALF;
    if (!inXZ) continue;
    if (y < target.y - 0.02 && y + HEIGHT > target.y - target.thick) return 'bump';
    if (w < 0 && y <= target.y + 0.3 && y >= target.y - 0.4) return 'land';
  }
  return 'miss';
}

// vy と vh を総当たりして、着地できるいちばん軽い吹き方を返す
function bestHop(src, target, fromOverride) {
  const from = fromOverride || launchPoint(src, target.rect.cx, target.rect.cz);
  const dx = target.rect.cx - from.x, dz = target.rect.cz - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.3) return null;
  const ux = dx / dist, uz = dz / dist;
  let best = null;
  for (let vy = 1; vy <= V0; vy += 1) {
    for (let vh = 0.5; vh <= V0; vh += 0.5) {
      if (Math.hypot(vh, vy) > V0) continue;
      if (Math.atan2(vh, vy) > LEAN) continue;
      if (simulate(from.x, src.y, from.z, ux * vh, vy, uz * vh, target) === 'land') {
        const charge = Math.hypot(vh, vy) / V0;
        if (!best || charge < best.charge) best = { charge, vy, vh, dist };
        break;
      }
    }
  }
  return best;
}

const fails = [];
let worst = 0;
console.log(`面「${WORLD.name}」  段数 ${route.length} / 高さ ${WORLD.height}m`);
console.log(`足場 ${nodes.length} 個（本道 ${route.length}・横道 ${nodes.filter(n => n.side).length}・広場 ${nodes.filter(n => n.yard).length}・チュートリアル ${nodes.filter(n => n.tut).length}）`);

let prev = plan.ground;
for (let i = 0; i < route.length; i++) {
  const n = route[i];
  const hop = bestHop(prev, n);
  const rise = (n.y - prev.y).toFixed(1);
  if (!hop) {
    fails.push(`${i + 1}: ${prev.prop} → ${n.prop} が届かない（上昇 ${rise}m / 水平 ${Math.hypot(n.x - prev.x, n.z - prev.z).toFixed(1)}m）`);
    console.log(`  ${String(i + 1).padStart(2)}  ${prev.prop}→${n.prop}  +${rise}m  ✗ 届かない`);
  } else {
    worst = Math.max(worst, hop.charge);
    const flag = hop.charge > 0.95 ? '△ 満タン近い' : '';
    console.log(`  ${String(i + 1).padStart(2)}  ${(prev.prop + '→' + n.prop).padEnd(14)} +${rise}m  水平 ${hop.dist.toFixed(1)}m  必要チャージ ${(hop.charge * 100).toFixed(0)}% ${flag}`);
  }
  prev = n;
}

// 横道が、本道のどこかから乗れるようになっているか
let sideOk = 0, sideBad = 0;
for (const n of nodes) {
  if (!n.side) continue;
  const from = route.find(p => {
    const hop = bestHop(p, n);
    return hop && Math.hypot(p.x - n.x, p.z - n.z) < 14;
  });
  if (from) sideOk++; else sideBad++;
}
if (sideBad) fails.push(`横道 ${sideBad} 箇所が、本道からどのHopでも届かない`);

/* ---------------- チュートリアル ---------------- */
// いちばん下の地面（平らで、落ちるところがない）から、町のある台地まで。
// ここでつまずくとこの先が始まらないので、必要チャージが半分を超えてはいけない
const footOf = (src, target) => {
  const dx = target.rect.cx - src.x, dz = target.rect.cz - src.z;
  const d = Math.hypot(dx, dz) || 1;
  const ux = dx / d, uz = dz / d;
  const edge = Math.min(
    Math.abs(ux) > 1e-6 ? (target.rect.sx / 2) / Math.abs(ux) : Infinity,
    Math.abs(uz) > 1e-6 ? (target.rect.sz / 2) / Math.abs(uz) : Infinity,
  );
  return { x: target.rect.cx - ux * (edge + 1.5), z: target.rect.cz - uz * (edge + 1.5) };
};

const tut = nodes.filter(n => n.tut);
if (tut.length < 3) fails.push(`チュートリアルの足場が ${tut.length} 個しかない`);
if (Math.abs(plan.spawn.y - GROUND_Y) > 0.2) fails.push(`出発点が地面の上にいない (y=${plan.spawn.y})`);
if (Math.abs(plan.spawn.x) > PLAIN_HALF - 6 || Math.abs(plan.spawn.z) > PLAIN_HALF - 6) fails.push('出発点が地面の縁に近い');

const plain = {
  prop: 'plain', x: plan.spawn.x, z: plan.spawn.z, y: GROUND_Y, thick: 10,
  rect: { x0: -PLAIN_HALF, x1: PLAIN_HALF, z0: -PLAIN_HALF, z1: PLAIN_HALF, cx: 0, cz: 0, sx: PLAIN_HALF * 2, sz: PLAIN_HALF * 2 },
};
let tutWorst = 0;
let tprev = plain;
console.log('チュートリアル（地面 → 町）');
for (let i = 0; i < tut.length; i++) {
  const n = tut[i];
  // 地面は平らなので、足場の足もとまで歩いてから吹き上げる
  const hop = bestHop(tprev, n, i === 0 ? footOf(plan.spawn, n) : null);
  if (!hop) {
    fails.push(`チュートリアル ${i + 1}: ${tprev.prop} → ${n.prop} が届かない`);
    console.log(`  ${i + 1}  ${tprev.prop}→${n.prop}  ✗ 届かない`);
  } else {
    tutWorst = Math.max(tutWorst, hop.charge);
    console.log(`  ${i + 1}  ${(tprev.prop + '→' + n.prop).padEnd(12)} +${(n.y - tprev.y).toFixed(1)}m  水平 ${hop.dist.toFixed(1)}m  必要チャージ ${(hop.charge * 100).toFixed(0)}%`);
  }
  tprev = n;
}
// 最後は台地（広場）へ上がれるか
const up = bestHop(tprev, plan.ground);
if (!up) fails.push('チュートリアルから町（広場）へ上がれない');
else {
  tutWorst = Math.max(tutWorst, up.charge);
  console.log(`  ${tut.length + 1}  ${tprev.prop}→ground  +${(0 - tprev.y).toFixed(1)}m  水平 ${up.dist.toFixed(1)}m  必要チャージ ${(up.charge * 100).toFixed(0)}%`);
}
if (tutWorst > 0.55) fails.push(`チュートリアルでチャージ ${(tutWorst * 100).toFixed(0)}% が必要（易しさが足りない）`);
for (const n of tut) {
  if (n.rect.x1 < -GROUND_HALF || n.rect.x0 > GROUND_HALF || n.rect.z1 < -GROUND_HALF || n.rect.z0 > GROUND_HALF) continue;
  fails.push(`チュートリアルの ${n.prop} が台地の輪郭にもぐり込んでいる`);
}

// 重なり・はみ出し・高さの検査
for (const n of nodes) {
  if (n.prop === 'ground') continue;
  if (Math.hypot(n.x, n.z) > WORLD_R) fails.push(`${n.prop} (${n.x.toFixed(1)},${n.z.toFixed(1)}) が世界の外`);
  if (n.y > GROUND_Y && n.y < GROUND_Y + 1.0) fails.push(`${n.prop} が地面にめり込んでいる (y=${n.y.toFixed(2)})`);
  for (const m of nodes) {
    if (m === n || m.prop === 'ground') continue;
    if (n.rect.x1 < m.rect.x0 - 0.8 || n.rect.x0 > m.rect.x1 + 0.8) continue;
    if (n.rect.z1 < m.rect.z0 - 0.8 || n.rect.z0 > m.rect.z1 + 0.8) continue;
    const lower = n.y - n.thick < m.y - m.thick ? n : m;
    const upper = lower === n ? m : n;
    const gap = (upper.y - upper.thick) - lower.y;
    if (Math.abs(gap) < 0.4) continue;              // まさに載っている
    if (gap < 3.2) fails.push(`${n.prop} と ${m.prop} が重なって隙間 ${gap.toFixed(2)}m（下に乗ったまま登れない）`);
  }
}

const top = route[route.length - 1];
if (!top || top.prop !== 'top') fails.push('頂上の足場が無い');
else if (top.y < WORLD.height * 0.8) fails.push(`頂上が ${top.y.toFixed(1)}m しか無い（設計 ${WORLD.height}m）`);

const gotMovers = nodes.filter(n => n.trap === 'mover').length;
const gotBlink = nodes.filter(n => n.trap === 'blinker').length;
if (gotMovers < WORLD.movers) fails.push(`動く足場 ${gotMovers} 個（設計 ${WORLD.movers} 個）`);
if (gotBlink < WORLD.blinkers) fails.push(`消える足場 ${gotBlink} 個（設計 ${WORLD.blinkers} 個）`);

console.log(`罠: 動く ${gotMovers} / 消える ${gotBlink}  横道 届く ${sideOk}・届かない ${sideBad}`);
console.log(`チュートリアル いちばん重いHopでもチャージ ${(tutWorst * 100).toFixed(0)}%`);
console.log(`いちばん重いHopはチャージ ${(worst * 100).toFixed(0)}%  頂上 ${top ? top.y.toFixed(1) : '?'}m`);

if (fails.length) {
  console.log(`\n✗ 検査 ${fails.length} 件`);
  for (const f of fails) console.log('  ' + f);
  process.exit(1);
}
console.log('\n✓ 全Hopが実発射の範囲で届く。重なり・はみ出しなし');
