// SUPER HOP — 「そらへのぼる町」。Only Up 風の、ひとつの長い登り。
// 谷底の町の家や木箱から始まって、浮島・岩柱・雲を渡って頂上へ向かう。
// 道は一本じゃない。横へ逸れた足場にも乗れる。ただし外せば谷底まで落ちる。
// ジャンプはなく、背中のポンプだけが登る手段。
import * as THREE from 'three';
import { createBlinkPlatform, createCoin, createFlagpole, mat } from './models.js';
import { WORLD } from './world.js';

/* ---------------- 決定乱数（毎回同じ見た目になるように） ---------------- */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- テクスチャ生成 ---------------- */
function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function drawGrassTop(ctx, s) {
  const r = rng(11);
  ctx.fillStyle = '#4fb843';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(28,116,38,0.34)' : 'rgba(146,224,116,0.34)';
    ctx.fillRect(r() * s, r() * s, 2 + r() * 6, 2);
  }
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = 'rgba(24,102,32,0.5)';
    ctx.fillRect(r() * s, r() * s, 1, 3 + r() * 4);
  }
}
function drawDirt(ctx, s) {
  const r = rng(23);
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(104,64,28,0.55)' : 'rgba(176,124,72,0.5)';
    ctx.fillRect(r() * s, s * 0.2 + r() * s * 0.8, 2 + r() * 5, 2 + r() * 4);
  }
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = 'rgba(206,198,182,0.75)';
    ctx.beginPath();
    ctx.arc(r() * s, s * 0.35 + r() * s * 0.6, 1.5 + r() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // 上端だけ芝の縁
  ctx.fillStyle = '#4fb843';
  ctx.fillRect(0, 0, s, s * 0.16);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = 'rgba(28,116,38,0.55)';
    ctx.fillRect(r() * s, s * 0.14, 2 + r() * 4, 3 + r() * 4);
  }
}
function drawDirtBottom(ctx, s) {
  const r = rng(37);
  ctx.fillStyle = '#5f3c1c';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = 'rgba(38,24,10,0.5)';
    ctx.fillRect(r() * s, r() * s, 3 + r() * 6, 3 + r() * 5);
  }
}
function drawStone(ctx, s) {
  const r = rng(53);
  ctx.fillStyle = '#9aa3ad';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(96,104,114,0.9)';
  ctx.lineWidth = 2;
  for (let y = 0; y <= s; y += s / 2) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(126,134,144,0.6)' : 'rgba(184,192,200,0.5)';
    ctx.fillRect(r() * s, r() * s, 2 + r() * 6, 2);
  }
}
function drawBrick(ctx, s) {
  const r = rng(71);
  ctx.fillStyle = '#c1652f';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#7c3a17';
  ctx.fillRect(0, 0, s, 3);
  ctx.fillRect(0, s / 2 - 1.5, s, 3);
  ctx.fillRect(0, s - 3, s, 3);
  ctx.fillRect(0, 0, 3, s / 2);
  ctx.fillRect(s / 2, s / 2, 3, s / 2);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = 'rgba(214,140,86,0.45)';
    ctx.fillRect(r() * s, r() * s, 2 + r() * 5, 2);
  }
}
function drawQuestion(ctx, s, used = false) {
  const base = used ? '#8d939c' : '#f0a63a';
  const edge = used ? '#565c65' : '#8a4a12';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, s, 4);
  ctx.fillRect(0, s - 4, s, 4);
  ctx.fillRect(0, 0, 4, s);
  ctx.fillRect(s - 4, 0, 4, s);
  ctx.fillStyle = used ? '#4a5058' : '#6d3808';
  for (const [x, y] of [[8, 8], [s - 12, 8], [8, s - 12], [s - 12, s - 12]]) ctx.fillRect(x, y, 4, 4);
  if (!used) {
    ctx.font = `bold ${Math.round(s * 0.62)}px "Trebuchet MS", "Verdana", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(90,45,8,0.55)';
    ctx.fillText('?', s / 2 + 2, s / 2 + 4);
    ctx.fillStyle = '#fff6df';
    ctx.fillText('?', s / 2, s / 2);
  } else {
    ctx.fillStyle = 'rgba(70,76,84,0.5)';
    ctx.fillRect(s * 0.3, s * 0.42, s * 0.16, 3);
    ctx.fillRect(s * 0.58, s * 0.6, s * 0.12, 3);
  }
}
function drawWood(ctx, s) {
  const r = rng(97);
  ctx.fillStyle = '#a9743f';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(120,80,40,0.7)';
  for (let y = 0; y < s; y += s / 3) ctx.fillRect(0, y, s, 3);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = 'rgba(150,108,62,0.5)';
    ctx.fillRect(r() * s, r() * s, 4 + r() * 12, 2);
  }
}
function drawFlag(ctx, s) {
  ctx.fillStyle = '#f7f9fb';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#e0392f';
  ctx.fillRect(0, 0, s, 6);
  ctx.fillRect(0, s - 6, s, 6);
  ctx.fillStyle = '#2f62c9';
  ctx.beginPath();
  const cx = s / 2, cy = s / 2, R = s * 0.34;
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? R * 0.45 : R;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}
// 頂上を示す矢印の看板。地上の出発点に立てる
function drawSign(ctx, s) {
  ctx.fillStyle = '#c99a5b';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#7a5327';
  ctx.lineWidth = 5;
  ctx.strokeRect(4, 4, s - 8, s - 8);
  ctx.fillStyle = '#4a3113';
  const cx = s / 2;
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.16);
  ctx.lineTo(s * 0.74, s * 0.46);
  ctx.lineTo(s * 0.6, s * 0.46);
  ctx.lineTo(s * 0.6, s * 0.82);
  ctx.lineTo(s * 0.4, s * 0.82);
  ctx.lineTo(s * 0.4, s * 0.46);
  ctx.lineTo(s * 0.26, s * 0.46);
  ctx.closePath();
  ctx.fill();
}

export function createTextures() {
  return {
    grassTop: canvasTexture(64, drawGrassTop),
    dirt: canvasTexture(64, drawDirt),
    dirtBottom: canvasTexture(64, drawDirtBottom),
    stone: canvasTexture(64, drawStone),
    brick: canvasTexture(64, drawBrick),
    question: canvasTexture(64, c => drawQuestion(c, 64, false)),
    questionUsed: canvasTexture(64, c => drawQuestion(c, 64, true)),
    wood: canvasTexture(64, drawWood),
    flag: canvasTexture(128, drawFlag),
    sign: canvasTexture(128, drawSign),
    crate: canvasTexture(64, drawCrate),
    barrel: canvasTexture(64, drawBarrel),
    barrelTop: canvasTexture(64, drawBarrelTop),
    roof: canvasTexture(64, drawRoofTile),
    wall: canvasTexture(64, drawWall),
    rock: canvasTexture(64, drawRock),
    hay: canvasTexture(64, drawHay),
    stump: canvasTexture(64, drawStumpTop),
  };
}

function tiled(baseTexture, repeatX, repeatY) {
  const map = baseTexture.clone();
  map.needsUpdate = true;
  map.repeat.set(Math.max(1, repeatX), Math.max(1, repeatY));
  return new THREE.MeshLambertMaterial({ map });
}
/* ------------------------------------------------------------------ */
/* 町と岩場のテクスチャ                                                */
/* ------------------------------------------------------------------ */
function drawCrate(ctx, s) {
  ctx.fillStyle = '#b8813f';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  for (let y = 5; y < s; y += 9) ctx.fillRect(0, y, s, 2);
  ctx.strokeStyle = '#7c5124';
  ctx.lineWidth = 5;
  ctx.strokeRect(2, 2, s - 4, s - 4);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(4, 4);
  ctx.lineTo(s - 4, s - 4);
  ctx.moveTo(s - 4, 4);
  ctx.lineTo(4, s - 4);
  ctx.stroke();
}

function drawBarrel(ctx, s) {
  ctx.fillStyle = '#9c6a34';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let x = 3; x < s; x += 7) ctx.fillRect(x, 0, 2, s);
  ctx.fillStyle = '#6f7a86';
  ctx.fillRect(0, Math.round(s * 0.16), s, 5);
  ctx.fillRect(0, Math.round(s * 0.72), s, 5);
}

function drawBarrelTop(ctx, s) {
  ctx.fillStyle = '#9c6a34';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#b8813f';
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6f7a86';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2);
  ctx.stroke();
}

function drawRoofTile(ctx, s) {
  ctx.fillStyle = '#a8452f';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < s; y += 10) ctx.fillRect(0, y, s, 2);
  for (let y = 0; y < s; y += 10) {
    const shift = (y / 10) % 2 ? 6 : 0;
    for (let x = shift; x < s; x += 12) ctx.fillRect(x, y, 2, 10);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let y = 2; y < s; y += 10) ctx.fillRect(0, y, s, 3);
}

function drawWall(ctx, s) {
  ctx.fillStyle = '#d8c39a';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  for (let y = 4; y < s; y += 12) ctx.fillRect(0, y, s, 2);
  ctx.fillStyle = '#5f7f9c';
  ctx.fillRect(Math.round(s * 0.28), Math.round(s * 0.34), Math.round(s * 0.24), Math.round(s * 0.28));
  ctx.fillStyle = '#e8eef5';
  ctx.fillRect(Math.round(s * 0.28), Math.round(s * 0.34), Math.round(s * 0.24), 2);
}

function drawRock(ctx, s) {
  ctx.fillStyle = '#8c8b90';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 26; i++) {
    const x = (i * 37) % s;
    const y = (i * 53) % s;
    const w = 4 + (i % 5) * 4;
    ctx.fillStyle = i % 3 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, 3 + (i % 3) * 3);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < s; y += 16) ctx.fillRect(0, y, s, 2);
}

function drawHay(ctx, s) {
  ctx.fillStyle = '#d9b558';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(120,86,26,0.55)';
  ctx.lineWidth = 2;
  for (let i = -s; i < s * 2; i += 7) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + s * 0.4, s);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(90,64,18,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(s * 0.3));
  ctx.lineTo(s, Math.round(s * 0.3));
  ctx.moveTo(0, Math.round(s * 0.7));
  ctx.lineTo(s, Math.round(s * 0.7));
  ctx.stroke();
}

function drawStumpTop(ctx, s) {
  ctx.fillStyle = '#a9743f';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#7a4a22';
  ctx.lineWidth = 2;
  for (let r = 5; r < s / 2; r += 6) {
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ */
/* 登りの設計                                                          */
/* ------------------------------------------------------------------ */
// ここに書く物理の値は main.js の PHYS / PUMP と必ず同じものを使う。
// 「そのHopが本当に届くか」は、実際に発射されるのと同じ軌道式で解いている
const GRAVITY = 28;
const FALL_GRAVITY = GRAVITY * 1.3;      // main.js の PHYS.fastFall を掛けた落下重力
const MAX_RISE = 17;                     // 満タンチャージで届く高さ
const LAUNCH_SPEED = Math.sqrt(2 * GRAVITY * MAX_RISE);
const LEAN_MAX = Math.PI * 0.3;          // 倒しきれる角度（main.js の PUMP.leanMax）
const HALF = 0.42;                       // 主人公の半幅（main.js の PHYS.half）

export const GROUND_HALF = 10;           // 町のある台地（広場）の半辺
const WORLD_R = 52;                      // 足場を置く世界の半径
const VALLEY_Y = -26;                    // 町のはずれ、はるか下の海面

// いちばん下の地面。平らで、落ちても必ずここに立つ。ここには穴も縁もない
// （塔の足もとを囲む広い平野で、台地だけが3m盛り上がっていてそこに町がある）
export const GROUND_Y = -3;              // 地面の天板の高さ
export const PLAIN_HALF = 62;            // 地面の半辺。塔のまわりを囲む広さ

// 出発点。地面の上。ここからチュートリアルを辿って、町のある台地へ登る
const SPAWN = { x: -21.5, y: GROUND_Y + 0.05, z: 21.5 };

// 高度の割合いで景色が変わる。band 0=町 / 1=浮島 / 2=岩場 / 3=雲
//   w      : 足場のひと辺の範囲（scale で掛ける）
//   thick  : 天板からの厚み。衝突箱はこの分だけ下まである
//   pts    : 初めて立ったときの得点
//   band   : 出現させてよいband
//   wgt    : そのbandでの出やすさ。景色らしいものほど大きく置く
const PROPS = {
  crate: { w: [1.5, 2.3], thick: 1.6, pts: 60, band: [0, 1], wgt: 2 },
  barrel: { w: [1.5, 1.9], thick: 1.5, pts: 60, band: [0, 1], wgt: 2 },
  roof: { w: [4.2, 6.2], thick: 3.0, pts: 300, band: [0], wgt: 3 },
  cart: { w: [3.0, 3.6], thick: 1.1, pts: 60, band: [0], wgt: 3 },
  stump: { w: [1.8, 2.4], thick: 1.3, pts: 60, band: [0, 1], wgt: 2 },
  hay: { w: [2.2, 2.8], thick: 1.2, pts: 60, band: [0, 1], wgt: 2 },
  island: { w: [4.0, 6.2], thick: 1.8, pts: 300, band: [1, 2], wgt: 4 },
  plank: { w: [2.6, 3.6], thick: 0.5, pts: 300, band: [1, 2], wgt: 1 },
  ledge: { w: [3.0, 4.6], thick: 1.3, pts: 300, band: [2, 3], wgt: 4 },
  spire: { w: [2.6, 3.6], thick: 1.2, pts: 300, band: [2, 3], wgt: 4 },
  cloud: { w: [3.2, 4.4], thick: 0.5, pts: 300, band: [2, 3], wgt: 1 },
  top: { w: [5.6, 6.4], thick: 1.8, pts: 0, band: [0, 1, 2, 3] },
};

/* ------------------------------------------------------------------ */
/* チュートリアル                                                      */
/* ------------------------------------------------------------------ */
// いちばん下の地面は平らで、落ちるところがない。そこから町のある台地まで、
// ポンプの使い方を一段ずつ覚えながら進める短い道。
//   x, z : 足場の中心（地面の上）     w : ひと辺の大きさ
// 高さはすべて PROPS の厚みそのもの。地面に載った足場なので、登りは1.5m前後
// 最後は屋根（台地と同じ高さ）に出て、そのまま広場へ入れる
const TUTORIAL = [
  { prop: 'crate', x: -21.5, z: 16.8, w: 2.4 },
  { prop: 'hay', x: -17.6, z: 13.6, w: 2.8 },
  { prop: 'barrel', x: -13.6, z: 10.6, w: 2.0 },
  { prop: 'stump', x: -12.5, z: 6.0, w: 2.6 },
  { prop: 'roof', x: -15.5, z: 1.5, w: 4.6 },
];

const bandOf = (y, height) => {
  const f = y / height;
  return f < 0.2 ? 0 : f < 0.48 ? 1 : f < 0.78 ? 2 : 3;
};

function rectOf(cx, cz, sx, sz) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  return { x0, x1, z0, z1, cx, cz, sx, sz };
}

// (px,pz) から向き (ux,uz) へ進んだとき、pad だけ膨らませた長方形へ入る距離と抜ける距離
function rayRect(px, pz, ux, uz, rect, pad) {
  let tin = -Infinity, tout = Infinity;
  const spans = [[px, ux, rect.x0 - pad, rect.x1 + pad], [pz, uz, rect.z0 - pad, rect.z1 + pad]];
  for (const [p, u, lo, hi] of spans) {
    if (Math.abs(u) < 1e-6) {
      if (p < lo || p > hi) return null;
      continue;
    }
    let t0 = (lo - p) / u, t1 = (hi - p) / u;
    if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
    if (t0 > tin) tin = t0;
    if (t1 < tout) tout = t1;
  }
  if (tout < Math.max(0, tin)) return null;
  return { tin, tout };
}

// どの地点から撃つか。小さな台は中心（厳めに見る）。広場のように大きい地面は、
// その向きへ歩いた縁から撃つ。そうしないと「中心から10m」が実際より遠くなる
function launchToward(src, ux, uz) {
  if (src.rect.sx * src.rect.sz <= 36) return { x: src.x, z: src.z };
  const hit = rayRect(src.x, src.z, ux, uz, src.rect, 0);
  const t = hit ? Math.max(0, hit.tout - HALF) : 0;
  return { x: src.x + ux * t, z: src.z + uz * t };
}

function launchPoint(src, tx, tz) {
  const dx = tx - src.x, dz = tz - src.z;
  const d = Math.hypot(dx, dz) || 1;
  return launchToward(src, dx / d, dz / d);
}

// 天板 ay の台から、天板 by・輪郭 rect の足場へ一発で乗れるか。
// 足場は厚い板なので、輪郭へ入った時点で縁より下ににいると側面に頭をぶつける。
// そこで「着地が足場の中」を決めたうえで、その軌道が縁の高さを越えているかを
// 高さ式へ実際に代入して確かめる（上がっている間と降りてからで式が違う）
function hopPlan(src, rect, by) {
  const from = launchPoint(src, rect.cx, rect.cz);
  const dx = rect.cx - from.x, dz = rect.cz - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.4) return { ok: false, why: 'same' };
  const ux = dx / dist, uz = dz / dist;
  const hit = rayRect(from.x, from.z, ux, uz, rect, HALF);
  if (!hit) return { ok: false, why: 'miss' };
  const tin = Math.max(hit.tin, 0), tout = hit.tout;
  if (tout - tin < 1.0) return { ok: false, why: 'thin' };
  const rise = by - src.y;
  for (const over of [1.2, 1.8, 2.6, 3.8]) {
    const vy = Math.sqrt(2 * GRAVITY * (Math.max(rise, 0) + over));
    const tUp = vy / GRAVITY;
    const T = tUp + Math.sqrt((2 * over) / FALL_GRAVITY);
    // 足場の中へ落ちる水平速度の範囲。深いほど縁を大きく越えられる
    const lo = (tin + 0.6) / T, hi = (tout - 0.6) / T;
    if (hi <= lo) continue;
    for (const vh of [hi, (lo + hi) / 2, lo]) {
      const tc = tin / vh;
      const h = tc <= tUp
        ? vy * tc - 0.5 * GRAVITY * tc * tc
        : (0.5 * vy * vy) / GRAVITY - 0.5 * FALL_GRAVITY * (tc - tUp) * (tc - tUp);
      if (h < rise + 0.25) continue;
      const speed = Math.hypot(vh, vy);
      const charge = speed / LAUNCH_SPEED;
      const tilt = Math.atan2(vh, vy);
      if (charge > 1 || tilt > LEAN_MAX) continue;
      return { ok: true, charge, tilt, vh, vy, dist, land: vh * T };
    }
  }
  return { ok: false, why: 'no-arc' };
}

// 足場が真上／真下に来るとき、下に乗ったまま上へ飛べるだけの隙を空ける
function clashes(nodes, rect, top, thick) {
  const bottom = top - thick;
  for (const n of nodes) {
    if (rect.x1 < n.rect.x0 - 0.8 || rect.x0 > n.rect.x1 + 0.8) continue;
    if (rect.z1 < n.rect.z0 - 0.8 || rect.z0 > n.rect.z1 + 0.8) continue;
    if (Math.abs(bottom - n.y) < 0.4) continue;      // まさに載っている
    if (bottom - n.y >= 3.2) continue;               // 上を通る
    if (n.y - top >= 3.2) continue;                  // 下をくぐる
    return true;
  }
  return false;
}

// 広場に足場を置くときの禁じ手。
//   床そのものに突き立つ形は作らない（地面に置くものは別に並べる）
//   出発点のまわりは、落ちてきた人が歩ける空きとして残す
function overPlaza(rect, bottom) {
  const onPlaza = rect.x1 > -GROUND_HALF && rect.x0 < GROUND_HALF
    && rect.z1 > -GROUND_HALF && rect.z0 < GROUND_HALF;
  if (onPlaza && bottom < 0.6) return true;
  if (rect.x0 - 1.2 > SPAWN.x || rect.x1 + 1.2 < SPAWN.x) return false;
  if (rect.z0 - 1.2 > SPAWN.z || rect.z1 + 1.2 < SPAWN.z) return false;
  return bottom < 3.2;
}

// そのbandで使ってよい足場。wgtの分だけ名前の数を増やして、引く確率にする
function kindsFor(band) {
  const out = [];
  for (const k of Object.keys(PROPS)) {
    if (k === 'top' || !PROPS[k].band.includes(band)) continue;
    for (let i = 0, n = PROPS[k].wgt || 1; i < n; i++) out.push(k);
  }
  return out;
}

// 頂上までの段差を配る。平均 around に寄せつつ、ときどき大きな段差を混ぜる。
// 残り段数で上下限を出すので合計は必ず total になる。加えて「残り平均の2倍」までと
// するので、序盤で大きな段差を使い切って終盤が小さな段差ばかりになる組み方を防ぐ
function spreadRise(total, n, cfg, r) {
  const lo = 2.0, hi = cfg.riseBig;
  const avg = total / n;
  const out = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const left = total - sum, remain = n - i;
    const min = Math.max(lo, left - hi * (remain - 1));
    const max = Math.min(hi, (left / remain) * 1.5, left - lo * (remain - 1));
    let want = avg * (0.7 + r() * 0.6);
    if (r() < 0.14) want = Math.max(want, hi * (0.66 + r() * 0.3));
    const v = Math.min(Math.max(want, min), Math.max(max, min));
    out.push(v);
    sum += v;
  }
  return out;
}

function hashKey(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// 一Hopぶんの足場を置く。届く・重ならない・世界の外に出ない、を全部満たすまで試す
function placeStep(nodes, from, heading, rise, cfg, r, want) {
  const y = from.y + rise;
  const band = bandOf(y, cfg.height);
  const kinds = kindsFor(band);
  if (!kinds.length) return null;
  for (let attempt = 0; attempt < 90; attempt++) {
    const fade = 1 - Math.min(0.72, attempt * 0.016);
    let dx = Math.cos(heading + (r() - 0.5) * 2.6);
    let dz = Math.sin(heading + (r() - 0.5) * 2.6);
    // 世界の外へ逃げてしまったら、中心へ引き戻す方向へ少しずつ寄せる
    const edge = launchToward(from, dx, dz);
    const far = Math.hypot(edge.x, edge.z);
    if (far > 20) {
      const w = Math.min(0.8, (far - 20) / 26);
      dx = dx * (1 - w) + (-edge.x / far) * w;
      dz = dz * (1 - w) + (-edge.z / far) * w;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
    }
    // 頂上の天板だけは他のもので代用しない。それ以外は諦めて種類を変える
    const kind = (want && (want !== 'top' ? attempt < 50 : true)) ? want : kinds[(r() * kinds.length) | 0];
    const p = PROPS[kind];
    if (!p) continue;
    const w = Math.max(1.6, (p.w[0] + (p.w[1] - p.w[0]) * r()) * cfg.scale);
    const sx = w;
    const sz = Math.max(1.6, w * (0.82 + r() * 0.36));
    // 距離は「実際に撃つ地点」から測る。広場の縁から次の足場、が正しい一Hop
    const lp = launchToward(from, dx, dz);
    const dist = (2.6 + r() * cfg.reach) * fade;
    const cx = lp.x + dx * dist, cz = lp.z + dz * dist;
    const rect = rectOf(cx, cz, sx, sz);
    if (Math.hypot(cx, cz) > WORLD_R) continue;
    if (overPlaza(rect, y - p.thick)) continue;
    if (clashes(nodes, rect, y, p.thick)) continue;
    const plan = hopPlan(from, rect, y);
    if (!plan.ok) continue;
    return { prop: kind, x: cx, z: cz, y, thick: p.thick, rect, heading: Math.atan2(dz, dx), pts: p.pts, hop: plan };
  }
  return null;
}

// 横道。本道から直角方向へ逸れた、遠回りでも登れる足場
function placeSide(nodes, from, heading, cfg, r) {
  const band = bandOf(from.y, cfg.height);
  const kinds = kindsFor(band).filter(k => PROPS[k].pts === 60 || PROPS[k].pts === 300);
  for (let attempt = 0; attempt < 24; attempt++) {
    const side = r() < 0.5 ? -1 : 1;
    const ang = heading + side * (1.15 + r() * 1.0);
    const dist = 3.2 + r() * 5.0;
    const y = from.y + (-1.8 + r() * 3.6);
    if (y < 1.2) continue;
    const kind = kinds[(r() * kinds.length) | 0];
    const p = PROPS[kind];
    const w = Math.max(1.6, (p.w[0] + (p.w[1] - p.w[0]) * r()) * cfg.scale);
    const cx = from.x + Math.cos(ang) * dist, cz = from.z + Math.sin(ang) * dist;
    const rect = rectOf(cx, cz, w, w * (0.85 + r() * 0.3));
    if (Math.hypot(cx, cz) > WORLD_R) continue;
    if (overPlaza(rect, y - p.thick)) continue;
    if (clashes(nodes, rect, y, p.thick)) continue;
    const plan = hopPlan(from, rect, y);
    if (!plan.ok) continue;
    return { prop: kind, x: cx, z: cz, y, thick: p.thick, rect, heading: ang, pts: p.pts, side: true, hop: plan };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 面の設計そのもの（組み立てと検査の両方从这里へ）                    */
/* ------------------------------------------------------------------ */
export function planClimb(cfg = WORLD) {
  const r = rng(hashKey(cfg.key));
  const nodes = [];
  const route = [];
  const ground = {
    prop: 'ground', x: 0, z: 0, y: 0, thick: 12,
    rect: rectOf(0, 0, GROUND_HALF * 2, GROUND_HALF * 2),
  };
  nodes.push(ground);

  // 広場とそのまわりに、乗れるものをたくさん置く。
  // 家・木箱・樽・荷台・切り株を渡って、最初の一段へ登る
  const spawn = SPAWN;
  const yardKinds = ['crate', 'barrel', 'cart', 'stump', 'hay', 'roof'];
  for (let attempt = 0, placed = 0; attempt < 90 && placed < 9; attempt++) {
    const kind = yardKinds[(r() * yardKinds.length) | 0];
    const p = PROPS[kind];
    const w = Math.max(1.6, (p.w[0] + (p.w[1] - p.w[0]) * r()) * Math.max(1, cfg.scale));
    const cx = (r() * 2 - 1) * (GROUND_HALF - w / 2 - 1.2);
    const cz = (r() * 2 - 1) * (GROUND_HALF - w / 2 - 1.2);
    const rect = rectOf(cx, cz, w, w * (0.85 + r() * 0.3));
    if (Math.hypot(cx - spawn.x, cz - spawn.z) < 3.6) continue;
    if (clashes(nodes, rect, p.thick, p.thick)) continue;
    nodes.push({ prop: kind, x: cx, z: cz, y: p.thick, thick: p.thick, rect, pts: p.pts, yard: true });
    placed++;
  }

  const rises = spreadRise(cfg.height, cfg.steps, cfg, r);
  const used = { mover: 0, blinker: 0, last: -9 };
  let cur = ground;
  let heading = r() * Math.PI * 2;

  for (let i = 0; i < cfg.steps; i++) {
    // 罠は経路に均等に散らす。かたよると「ここだけ別ゲーム」になる。
    // 進行の割合いで遅れているほうから作り、その高度に無い種類なら諦めて次に回す
    let want = null;
    const need = (cfg.movers - used.mover) + (cfg.blinkers - used.blinker);
    const spacing = Math.max(2, Math.floor(cfg.steps / (need + 1)));
    if (need > 0 && i - used.last >= spacing) {
      const band = bandOf(cur.y + rises[i], cfg.height);
      const kinds = kindsFor(band);
      const behind = (cfg.movers ? used.mover / cfg.movers : 1) >= (cfg.blinkers ? used.blinker / cfg.blinkers : 1);
      const order = behind ? ['plank', 'cloud'] : ['cloud', 'plank'];
      for (const k of order) {
        if ((k === 'plank' ? used.mover : used.blinker) >= (k === 'plank' ? cfg.movers : cfg.blinkers)) continue;
        if (!kinds.includes(k)) continue;
        want = k;
        break;
      }
      if (want) used.last = i;
    }

    let node = placeStep(nodes, cur, heading, rises[i], cfg, r, want);
    if (!node) {
      // どうしても置けないときは、大きくて近い足場で確実に登れる形に落とす
      for (const rise2 of [rises[i], rises[i] * 0.7, rises[i] * 0.45, 2.6]) {
        for (const kind of ['island', 'roof', 'ledge', 'crate']) {
          node = placeStep(nodes, cur, heading, rise2, { ...cfg, reach: 3.2, scale: 1.25 }, r, kind);
          if (node) break;
        }
        if (node) break;
      }
    }
    if (!node) break;
    if (want && node.prop === want) node.trap = want === 'plank' ? 'mover' : 'blinker';
    if (node.trap === 'mover') used.mover++;
    if (node.trap === 'blinker') used.blinker++;
    nodes.push(node);
    route.push(node);
    heading = node.heading;
    cur = node;

    // 横道を開く。遠回りになるけれど、風や罠を避けられる道。
    // 頂上のまわりは空けておかないと、天板を置く場所がなくなる
    if (r() < 0.55 && i < cfg.steps - 3) {
      const side = placeSide(nodes, cur, heading, cfg, r);
      if (side) nodes.push(side);
    }
  }

  // 頂上。広くて安心できる天板にして、そこに旗を立てる
  let top = null;
  for (const t of [[4.5, 1.1], [3.2, 1.0], [2.2, 0.9], [1.6, 0.8]]) {
    top = placeStep(nodes, cur, heading, t[0], { ...cfg, reach: 4.0, scale: t[1] }, r, 'top');
    if (top) break;
  }
  if (top) {
    top.prop = 'top';
    top.pts = 0;
    nodes.push(top);
    route.push(top);
  }

  // 罠が足りなければ、後から既存の足場を罠に変える。
  // 個数が設計とズレると、面を検査する側の期待値もズレてしまう
  const fillTraps = (kind, have, need) => {
    const step = Math.max(4, Math.floor(route.length / (need + 1)));
    let got = have;
    for (let i = step; i < route.length - 1 && got < need; i += step) {
      const n = route[i];
      if (n.trap || n.bared) continue;
      if (Math.min(n.rect.sx, n.rect.sz) < 2.6) continue;   // 小さい足場を動かすと乗れない
      n.trap = kind;
      got++;
    }
    return got;
  };
  used.mover = fillTraps('mover', used.mover, cfg.movers);
  used.blinker = fillTraps('blinker', used.blinker, cfg.blinkers);

  // チュートリアル。本道の作りはそのままに、地面から台地までを結ぶ足場を後から足す。
  // ここは平らな地面の上。落ちても地面に立つだけで、登り直しにはならない
  const tutorial = [];
  for (const t of TUTORIAL) {
    const p = PROPS[t.prop];
    const rect = rectOf(t.x, t.z, t.w, t.w * 0.92);
    const y = GROUND_Y + p.thick;
    nodes.push({ prop: t.prop, x: t.x, z: t.z, y, thick: p.thick, rect, pts: p.pts, tut: true });
    tutorial.push([+rect.cx.toFixed(2), +rect.cz.toFixed(2), y]);
  }

  return { nodes, route, top, ground, spawn, tutorial };
}

/* ------------------------------------------------------------------ */
/* 面 組み立て                                                         */
/* ------------------------------------------------------------------ */
export function buildLevel(scene, cfg = WORLD) {
  const plan = planClimb(cfg);
  const tex = createTextures();
  const world = new THREE.Group();
  world.name = 'skyward-town';
  scene.add(world);

  const solids = [];
  const movers = [];
  const coins = [];
  const blinkers = [];
  const tiers = [];
  const animated = [];
  const bobbers = [];
  const clouds = [];

  const blockMats = {
    brick: new THREE.MeshLambertMaterial({ map: tex.brick }),
    question: new THREE.MeshLambertMaterial({ map: tex.question }),
    questionUsed: new THREE.MeshLambertMaterial({ map: tex.questionUsed }),
    stone: new THREE.MeshLambertMaterial({ map: tex.stone }),
  };

  function addSolid(min, max, kind, mesh) {
    const solid = { min, max, kind, mesh, baseY: mesh ? mesh.position.y : 0, bump: 0 };
    solids.push(solid);
    return solid;
  }

  // 六面の貼り分け。側面は横幅と厚みに合わせてリピートする
  function faceMats(sideTex, topTex, botTex, rect, thick) {
    const hRep = Math.max(1, Math.round(thick / 2));
    const sideX = tiled(tex[sideTex], Math.max(1, Math.round(rect.sz / 2)), hRep);
    const sideZ = tiled(tex[sideTex], Math.max(1, Math.round(rect.sx / 2)), hRep);
    const top = tiled(tex[topTex], Math.max(1, Math.round(rect.sx / 2)), Math.max(1, Math.round(rect.sz / 2)));
    const bot = tiled(tex[botTex], Math.max(1, Math.round(rect.sx / 2)), Math.max(1, Math.round(rect.sz / 2)));
    return [sideX, sideX, top, bot, sideZ, sideZ];
  }

  // 一枚の箱。天板の高さ topY から厚み thick だけ下へ伸びる
  function slab(rect, topY, thick, mats, kind = 'prop') {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(rect.sx, thick, rect.sz), mats);
    mesh.position.set(rect.cx, topY - thick / 2, rect.cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.add(mesh);
    return addSolid(
      { x: rect.x0, y: topY - thick, z: rect.z0 },
      { x: rect.x1, y: topY, z: rect.z1 },
      kind, mesh,
    );
  }

  function decoBox(w, h, d, x, y, z, material) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    world.add(m);
    return m;
  }

  // 1x1 の interactive ブロック（y は底面）
  function block(x, y, z, kind) {
    const material = kind === 'brick' ? blockMats.brick : blockMats.question;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.position.set(x, y + 0.5, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.add(mesh);
    return addSolid({ x: x - 0.5, y, z: z - 0.5 }, { x: x + 0.5, y: y + 1, z: z + 0.5 }, kind, mesh);
  }

  function coinAt(x, y, z) {
    const coin = createCoin();
    coin.group.position.set(x, y, z);
    world.add(coin.group);
    coins.push({ mesh: coin.group, taken: false, phase: (x * 0.7 + z * 1.3) % 6.28, anim: 0 });
  }

  // 罠: 消える雲の足場
  function blinker(cx, topY, cz, sx, sz, period = 3, phase = 0, onFrac = 0.6) {
    const b = createBlinkPlatform(sx, sz);
    b.group.position.set(cx, topY, cz);
    world.add(b.group);
    const solid = addSolid(
      { x: cx - sx / 2, y: topY - 0.45, z: cz - sz / 2 },
      { x: cx + sx / 2, y: topY, z: cz + sz / 2 },
      'blinker', b.group,
    );
    blinkers.push({ group: b.group, mats: b.mats, solid, period, phase, onFrac, on: true });
    return solid;
  }

  // 動く足場。axis 方向に amp だけ往復する
  function mover(cx, topY, cz, sx, sz, axis, amp, speed, phase) {
    const group = new THREE.Group();
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(sx, 0.5, sz),
      [mat('#8a5a2b'), mat('#8a5a2b'), mat('#a9743f'), mat('#5f3c1c'), mat('#8a5a2b'), mat('#8a5a2b')],
    );
    deck.position.y = -0.25;
    deck.castShadow = true;
    deck.receiveShadow = true;
    const railMat = mat('#c99a5b');
    const rail = axis === 'z'
      ? [new THREE.Mesh(new THREE.BoxGeometry(sx, 0.3, 0.16), railMat), new THREE.Mesh(new THREE.BoxGeometry(sx, 0.3, 0.16), railMat)]
      : [new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, sz), railMat), new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, sz), railMat)];
    if (axis === 'z') { rail[0].position.set(0, 0.15, -sz / 2 + 0.08); rail[1].position.set(0, 0.15, sz / 2 - 0.08); }
    else { rail[0].position.set(-sx / 2 + 0.08, 0.15, 0); rail[1].position.set(sx / 2 - 0.08, 0.15, 0); }
    group.add(deck, rail[0], rail[1]);
    group.position.set(cx, topY, cz);
    world.add(group);
    const base = axis === 'z' ? cz : cx;
    const half = (axis === 'z' ? sz : sx) / 2;
    const solid = addSolid(
      { x: cx - sx / 2, y: topY - 0.5, z: cz - sz / 2 },
      { x: cx + sx / 2, y: topY, z: cz + sz / 2 },
      'mover', group,
    );
    movers.push({ mesh: group, solid, base, amp, speed, phase, half, axis });
    return solid;
  }

  // ポンプの発射台
  function launchPad(x, y, z = 0) {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 28), new THREE.MeshLambertMaterial({ color: '#2f8fa8' }));
    disc.rotation.x = -Math.PI / 2;
    disc.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.08, 1.3, 28), new THREE.MeshBasicMaterial({ color: '#7fe6f5' }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.78, 4), new THREE.MeshLambertMaterial({ color: '#5fd8e8', emissive: '#2b8ea3' }));
    arrow.position.y = 1.15;
    arrow.castShadow = true;
    g.add(disc, ring, arrow);
    g.position.set(x, y + 0.02, z);
    world.add(g);
    bobbers.push({ mesh: arrow, base: 1.15, phase: x * 0.7 });
  }

  /* ---------------- 足場の中身 ---------------- */
  // 乗れるもの全部をここで描く。衝突箱は天板から thick だけ下
  function renderProp(n) {
    const { rect, y, thick } = n;
    switch (n.prop) {
      case 'crate':
        return slab(rect, y, thick, faceMats('crate', 'crate', 'crate', rect, thick));
      case 'barrel':
        return slab(rect, y, thick, faceMats('barrel', 'barrelTop', 'barrelTop', rect, thick));
      case 'roof': {
        const s = slab(rect, y, thick, faceMats('wall', 'roof', 'wall', rect, thick));
        // 屋根のひさし。天板より一回り広いが、当たりは天板のまま
        decoBox(rect.sx + 0.7, 0.22, rect.sz + 0.7, rect.cx, y + 0.02, rect.cz, new THREE.MeshLambertMaterial({ map: tex.roof }));
        decoBox(0.55, 1.1, 0.55, rect.x0 + 0.7, y + 0.65, rect.z0 + 0.7, blockMats.brick);
        return s;
      }
      case 'cart':
        return slab(rect, y, thick, faceMats('wood', 'wood', 'wood', rect, thick));
      case 'stump':
        return slab(rect, y, thick, faceMats('wood', 'stump', 'dirt', rect, thick));
      case 'hay':
        return slab(rect, y, thick, faceMats('hay', 'hay', 'hay', rect, thick));
      case 'island': {
        const s = slab(rect, y, thick, faceMats('dirt', 'grassTop', 'dirtBottom', rect, thick));
        // 浮島らしい逆すぼまりの底
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(Math.min(rect.sx, rect.sz) * 0.52, thick * 2.6, 6),
          new THREE.MeshLambertMaterial({ map: tex.dirt }),
        );
        cone.position.set(rect.cx, y - thick - thick * 1.3, rect.cz);
        cone.rotation.y = 0.4;
        cone.castShadow = true;
        world.add(cone);
        return s;
      }
      case 'ledge':
      case 'spire': {
        const s = slab(rect, y, thick, faceMats('rock', 'rock', 'rock', rect, thick));
        // 岩柱は下へすぼまって続く
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(Math.min(rect.sx, rect.sz) * 0.46, thick * 5.5, 5),
          new THREE.MeshLambertMaterial({ map: tex.rock }),
        );
        cone.position.set(rect.cx, y - thick - thick * 2.75, rect.cz);
        cone.castShadow = true;
        world.add(cone);
        return s;
      }
      case 'plank':
        return slab(rect, y, thick, faceMats('wood', 'wood', 'wood', rect, thick));
      case 'cloud': {
        // 当たり判定は薄い板のまま。見ためは雲のかたまりなので、板のまわりと下に
        // ふくらみを出して、上から見たときも「雲の足場」だと分かるようにする
        const g = new THREE.Group();
        const cloudMat = mat('#e9f1fb', { emissive: '#cfdcec', emissiveIntensity: 0.5 });
        const deck = new THREE.Mesh(new THREE.BoxGeometry(rect.sx - 0.5, 0.45, rect.sz - 0.5), cloudMat);
        deck.position.y = -0.22;
        deck.receiveShadow = true;
        g.add(deck);
        const pr = Math.min(rect.sx, rect.sz) * 0.34;
        const puffs = [
          [-rect.sx * 0.34, -rect.sz * 0.34, pr], [rect.sx * 0.34, -rect.sz * 0.34, pr * 1.1],
          [-rect.sx * 0.34, rect.sz * 0.34, pr * 1.05], [rect.sx * 0.34, rect.sz * 0.34, pr * 0.95],
          [0, -rect.sz * 0.4, pr * 0.9], [0, rect.sz * 0.4, pr],
          [-rect.sx * 0.42, 0, pr * 0.85], [rect.sx * 0.42, 0, pr * 0.9],
          [0, 0, pr * 1.3],
        ];
        for (const [px, pz, rr] of puffs) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(rr, 16, 12), mat('#f2f7fd', { emissive: '#d5e2f0', emissiveIntensity: 0.6 }));
          // 真ん中のふくらみは天板より上に突き出さない。上に立つ足場なので、
          // 足がついている面が見えているほうが「乗れている」と分かる
          puff.position.set(px, px === 0 && pz === 0 ? -rr - 0.05 : -0.42, pz);
          g.add(puff);
        }
        g.position.set(rect.cx, y, rect.cz);
        world.add(g);
        return addSolid(
          { x: rect.x0, y: y - 0.45, z: rect.z0 },
          { x: rect.x1, y, z: rect.z1 },
          'cloud', g,
        );
      }
      default:
        return slab(rect, y, thick, faceMats('stone', 'stone', 'stone', rect, thick));
    }
  }

  /* ---------------- いちばん下の地面 ---------------- */
  // 平らで、落ちるところがない。塔の足もとを囲む平野で、町はこの上の台地の上にある。
  // 塔から落ちてもここに立つだけ。ここからチュートリアルを辿って町へ入る
  const plain = rectOf(0, 0, PLAIN_HALF * 2, PLAIN_HALF * 2);
  slab(plain, GROUND_Y, 10, faceMats('dirt', 'grassTop', 'dirtBottom', plain, 10), 'ground');

  /* ---------------- 町の台地 ---------------- */
  const spawn = plan.spawn;
  slab(rectOf(0, 0, GROUND_HALF * 2, GROUND_HALF * 2), 0, 12, faceMats('dirt', 'grassTop', 'dirtBottom', rectOf(0, 0, GROUND_HALF * 2, GROUND_HALF * 2), 12), 'grass');

  /* ---------------- 地面のチュートリアル ---------------- */
  // 地面から町（台地）まで、ポンプの使い方を一段ずつ覚える道。
  // 足場はすべて地面に載った高さなので、登りは1.5m前後。落ちても地面に立つ
  launchPad(spawn.x, GROUND_Y, spawn.z);
  for (const [x, z, s] of [[-25.5, 18.0, 1.1], [-24.0, 8.0, 0.9], [-16.5, 25.0, 1.0]]) tree(x, GROUND_Y, z, s);
  for (const [x, z] of [[-24.0, 13.5], [-15.5, 17.5], [-10.5, 14.5], [-25.0, 24.5]]) bush(x, GROUND_Y, z, 1.1);

  // 出発点のしるし
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 1.1, 0.16),
    [mat('#8a5a2b'), mat('#8a5a2b'), mat('#8a5a2b'), mat('#8a5a2b'), new THREE.MeshLambertMaterial({ map: tex.sign }), mat('#8a5a2b')],
  );
  sign.position.set(spawn.x - 1.9, GROUND_Y + 1.3, spawn.z + 0.6);
  sign.rotation.y = -0.5;
  sign.castShadow = true;
  const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 10), mat('#6b4423'));
  signPost.position.set(spawn.x - 1.9, GROUND_Y + 0.7, spawn.z + 0.6);
  world.add(sign, signPost);

  // ポンプ給水場
  const shed = new THREE.Group();
  const hut = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 2.0), new THREE.MeshLambertMaterial({ map: tex.wood }));
  hut.position.y = 0.95;
  hut.castShadow = true;
  const shedRoof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.1, 4), mat('#c0503f'));
  shedRoof.position.y = 2.45;
  shedRoof.rotation.y = Math.PI / 4;
  shedRoof.castShadow = true;
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.6, 18), mat('#7f8a95'));
  tank.position.set(1.9, 0.8, 0);
  tank.castShadow = true;
  const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.9, 10), mat('#3f7f8c'));
  hose.position.set(0.9, 0.4, 0);
  hose.rotation.z = Math.PI / 2;
  shed.add(hut, shedRoof, tank, hose);
  shed.position.set(-GROUND_HALF + 2.4, 0, GROUND_HALF - 2.2);
  shed.rotation.y = 0.4;
  world.add(shed);

  /* ---------------- 乗れるもの全部 ---------------- */
  const tierIndex = new Map();
  const tutorialTiers = [];
  for (const n of plan.nodes) {
    if (n.prop === 'ground') continue;
    let solid = null;
    if (n.trap === 'mover') {
      const dx = Math.cos(n.heading || 0), dz = Math.sin(n.heading || 0);
      const axis = Math.abs(dx) > Math.abs(dz) ? 'z' : 'x';
      const amp = Math.min(1.5, (axis === 'z' ? n.rect.sz : n.rect.sx) * 0.34);
      solid = mover(n.rect.cx, n.y, n.rect.cz, n.rect.sx, n.rect.sz, axis, amp, 0.5 + n.y * 0.004, n.y * 0.31);
    } else if (n.trap === 'blinker') {
      solid = blinker(n.rect.cx, n.y, n.rect.cz, n.rect.sx, n.rect.sz, 3.4 - n.y * 0.006, n.y * 0.27);
    } else {
      solid = renderProp(n);
    }
    const i = tiers.length;
    tierIndex.set(n, i);
    solid.tier = i;
    solid.pts = n.pts;
    tiers.push({
      x: n.rect.cx, y: n.y, z: n.rect.cz,
      half: Math.min(n.rect.sx, n.rect.sz) / 2, hx: n.rect.sx / 2, hz: n.rect.sz / 2,
      x0: n.rect.x0, x1: n.rect.x1, z0: n.rect.z0, z1: n.rect.z1,
      kind: n.prop, pts: n.pts, trap: n.trap || null, side: !!n.side, tut: !!n.tut,
    });
    if (n.tut) tutorialTiers.push(i);
  }

  // 本道の順番。検証テストはこの順にHopを確かめる
  const route = plan.route.map(n => tierIndex.get(n)).filter(i => i != null);

  /* ---------------- コインとボーナス ---------------- */
  // 正しい軌道を教えるコインの弧。チュートリアルから本道まで、進む順に置く
  let prev = { x: spawn.x, y: GROUND_Y, z: spawn.z };
  for (const n of plan.nodes) {
    if (!n.tut) continue;
    arcCoins(prev.x, prev.y, prev.z, n.rect.cx, n.y, n.rect.cz, n.rect.sx / 2, n.rect.sz / 2);
    prev = { x: n.rect.cx, y: n.y, z: n.rect.cz };
  }
  // 台地の上。広場南側の発射台から、本道の最初の足場へ
  prev = { x: 0, y: 0, z: 6 };
  for (const i of route) {
    const t = tiers[i];
    arcCoins(prev.x, prev.y, prev.z, t.x, t.y, t.z, t.hx, t.hz);
    prev = { x: t.x, y: t.y, z: t.z };
  }
  // 横道には、そこへ行った人へのご褒美
  for (const n of plan.nodes) {
    if (!n.side) continue;
    const i = tierIndex.get(n);
    if (i == null) continue;
    coinAt(n.rect.cx, n.y + 1.1, n.rect.cz);
    coinAt(n.rect.cx - n.rect.sx * 0.3, n.y + 1.1, n.rect.cz);
    coinAt(n.rect.cx + n.rect.sx * 0.3, n.y + 1.1, n.rect.cz);
  }
  // 軌道上に浮いたボーナスブロック。取ろうとすると高度を失う賭け
  for (let k = 1; k < route.length; k += 3) {
    const a = tiers[route[k - 1]], b = tiers[route[k]];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const my = Math.max(a.y, b.y) + Math.max(3, (b.y - a.y) * 0.55);
    block(mx, my, mz, k % 2 ? 'q' : 'brick');
  }

  /* ---------------- 頂上 ---------------- */
  const topTier = tiers[route[route.length - 1]];
  const summitY = topTier.y;
  const flagpole = createFlagpole(tex.flag);
  flagpole.group.position.set(topTier.x, summitY, topTier.z);
  world.add(flagpole.group);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    coinAt(topTier.x + Math.cos(a) * 2.4, summitY + 0.95, topTier.z + Math.sin(a) * 2.4);
  }
  // 四隅の柱。落ちそうになった目印になる
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      decoBox(0.26, 1.1, 0.26, topTier.x + sx * (topTier.hx - 0.3), summitY + 0.55, topTier.z + sz * (topTier.hz - 0.3), mat('#c9a25f'));
    }
  }
  const goal = { x: topTier.x, y: summitY, z: topTier.z, r: Math.min(topTier.hx, topTier.hz) + 1.6, half: Math.min(topTier.hx, topTier.hz) };
  const topSign = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.0, 0.18),
    [mat('#8a5a2b'), mat('#8a5a2b'), mat('#8a5a2b'), mat('#8a5a2b'), new THREE.MeshLambertMaterial({ map: tex.sign }), mat('#8a5a2b')],
  );
  topSign.position.set(topTier.x, summitY - 3.0, topTier.z + topTier.hz + 0.12);
  topSign.castShadow = true;
  world.add(topSign);

  /* ---------------- 背景 ---------------- */
  // 平野のはるか向こう。低い島が並ぶ海面で、平野の縁（GROUND_Y）より23m下にある
  for (const [x, z, r, c] of [
    [-70, -78, 28, '#41a03a'], [12, -104, 36, '#39943d'], [78, -66, 30, '#41a03a'],
    [104, 34, 24, '#39943d'], [26, 100, 38, '#3c9040'], [-46, 94, 32, '#41a03a'], [-104, 12, 28, '#39943d'],
  ]) hill(x, z, r, c);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat('#63a8cf'));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, VALLEY_Y, 0);
  world.add(sea);

  // 高度に応じて雲の帯。登っている高さが雲で分かる
  const r0 = rng(101);
  for (let i = 0; i < 26; i++) {
    const a = r0() * Math.PI * 2;
    const rad = 14 + r0() * (WORLD_R + 14);
    const y = 4 + (i / 26) * (summitY + 30) + r0() * 7;
    cloud(Math.cos(a) * rad, y, Math.sin(a) * rad, 1.1 + r0() * 1.5);
  }
  animated.push(...clouds);

  // 広場の木と茂み
  for (const [x, z, s] of [
    [-GROUND_HALF + 1.4, -GROUND_HALF + 1.6, 1.1], [GROUND_HALF - 1.8, -GROUND_HALF + 1.2, 0.9],
    [-GROUND_HALF + 1.0, 2.0, 1.0], [GROUND_HALF - 1.4, 3.4, 1.1],
  ]) tree(x, 0, z, s);
  for (const [x, z] of [[-4.6, -GROUND_HALF + 1.2], [4.2, -GROUND_HALF + 1.0], [GROUND_HALF - 1.2, -4.0], [-GROUND_HALF + 1.2, -6.0], [2.4, GROUND_HALF - 1.4]]) bush(x, 0, z, 1.1);

  const coinSpecs = coins.map(c => ({ x: c.mesh.position.x, y: c.mesh.position.y, z: c.mesh.position.z, phase: c.phase }));
  function resetEntities() {
    for (const c of coins) world.remove(c.mesh);
    coins.length = 0;
    for (const s of coinSpecs) coinAt(s.x, s.y, s.z);
    for (const b of blinkers) {
      b.on = true;
      b.group.visible = true;
      for (const m of b.mats) m.opacity = 0.95;
      if (!solids.includes(b.solid)) solids.push(b.solid);
    }
  }

  // 目標の足場へ実際に届く放物線に沿ってコインを置く。狙いの目印になる。
  // 足場は厚い板なので、低い軌道で下から入ると縁の下で頭をぶつける。
  // 「頂点は足場の上 1.6m、着地は足場の手前 0.7m 内側」で解いた、本当に通れる軌道を並べる
  function arcCoins(ax, ay, az, bx, by, bz, hx, hz) {
    const dx = bx - ax, dz = bz - az;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return;
    const ux = dx / dist, uz = dz / dist;
    const edge = Math.min(
      Math.abs(ux) > 1e-3 ? hx / Math.abs(ux) : Infinity,
      Math.abs(uz) > 1e-3 ? hz / Math.abs(uz) : Infinity,
    );
    const land = THREE.MathUtils.clamp(dist - Math.max(0.7, edge - 0.7), dist * 0.3, dist);
    const over = 1.6;
    const rise = Math.max(0.5, by - ay + over);
    const vy = Math.sqrt(2 * GRAVITY * rise);
    const tUp = vy / GRAVITY;
    const t = tUp + Math.sqrt((2 * over) / FALL_GRAVITY);
    const vh = land / t;
    const apexY = ay + rise;
    const arcY = tt => (tt <= tUp
      ? ay + vy * tt - 0.5 * GRAVITY * tt * tt
      : apexY - 0.5 * FALL_GRAVITY * (tt - tUp) * (tt - tUp));
    for (let i = 1; i <= 3; i++) {
      const tt = (i / 3.6) * t;
      coinAt(ax + ux * vh * tt, arcY(tt), az + uz * vh * tt);
    }
  }

  /* ---------------- 飾り ---------------- */
  function bush(x, y, z, scale = 1) {
    const g = new THREE.Group();
    for (const [dx, dz, r] of [[-0.5, 0, 0.55], [0.5, 0, 0.55], [0, 0.3, 0.45]]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), mat('#3f9c37'));
      b.position.set(dx, r * 0.75, dz);
      b.castShadow = true;
      b.receiveShadow = true;
      g.add(b);
    }
    g.position.set(x, y, z);
    g.scale.setScalar(scale);
    world.add(g);
  }
  function tree(x, y, z, scale = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 2.4, 12), mat('#7a4a22'));
    trunk.position.y = 1.2;
    trunk.castShadow = true;
    g.add(trunk);
    for (const [dx, dy, dz, r] of [[0, 2.9, 0, 1.1], [-0.7, 2.4, 0.3, 0.8], [0.7, 2.5, -0.3, 0.8]]) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat('#35892f'));
      leaf.position.set(dx, dy, dz);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      g.add(leaf);
    }
    g.position.set(x, y, z);
    g.scale.setScalar(scale);
    world.add(g);
  }
  function hill(x, z, r, color = '#3f9c37') {
    const h = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 14), mat(color));
    h.position.set(x, VALLEY_Y - r * 0.28, z);
    h.scale.set(1, 0.42, 1);
    world.add(h);
  }
  function cloud(x, y, z, scale = 1) {
    const g = new THREE.Group();
    for (const [dx, dy, dz, r] of [[0, 0, 0, 1.5], [1.4, -0.2, 0.2, 1.1], [-1.5, -0.3, -0.2, 1.0], [0.3, 0.6, -0.4, 0.9]]) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat('#f7fbff', { emissive: '#dceaf7', emissiveIntensity: 0.9 }));
      p.position.set(dx, dy, dz);
      g.add(p);
    }
    g.position.set(x, y, z);
    g.scale.setScalar(scale);
    world.add(g);
    clouds.push({ mesh: g, speed: 0.35 + scale * 0.2 });
  }

  return {
    world, solids, movers, coins, blinkers, tiers, route, tutorial: tutorialTiers,
    goal, spawn, cfg,
    height: summitY, groundY: GROUND_Y, plainHalf: PLAIN_HALF,
    flagpole, resetEntities,
    updateDecor(dt, wind) {
      const wx = wind ? wind.x : 0, wz = wind ? wind.z : 0;
      const bound = WORLD_R + 26;
      for (const c of animated) {
        c.mesh.position.x += (wx * 1.6 - c.speed * 0.4) * dt;
        c.mesh.position.z += wz * 1.6 * dt;
        if (Math.abs(c.mesh.position.x) > bound || Math.abs(c.mesh.position.z) > bound) {
          c.mesh.position.x = -Math.sign(c.mesh.position.x) * (bound - 12);
          c.mesh.position.z *= 0.6;
        }
      }
      for (const b of bobbers) {
        b.phase += dt;
        b.mesh.position.y = b.base + Math.sin(b.phase * 2.4) * 0.16;
        b.mesh.rotation.y += dt * 0.9;
      }
    },
  };
}
