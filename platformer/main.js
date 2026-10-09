// SUPER HOP — 「そらへのぼる町」 / three.js 3Dアクションゲーム
import * as THREE from 'three';
import { buildLevel } from './level.js';
import { createHero } from './models.js';
import { WORLD, worldName, worldDesc } from './world.js';
import { LANGS, LANG_MAP, loadLang, saveLang, setLang, getLang, t } from './i18n.js';
import './style.css';

/* ================= 物理・ゲーム定数 ================= */
const PHYS = {
  gravity: 28,
  fastFall: 1.3,      // 落ち始めると少し強く引っ張られる。登りは優しく、落下は厳しく
  maxFall: 22,
  accel: 46,
  accelAir: 6,        // 空中では「少しだけ」舵が取れる
  airMax: 14,         // 空中で舵によって増える速度の上限。発射で得た速度は殺さない
  friction: 22,
  runMax: 9.4,
  walkMax: 5.6,
  half: 0.42,
  height: 1.7,
  eps: 0.002,
};
const FIXED = 1 / 120;
// 塔から落ちても、いちばん下の地面にただ立つ。ここを通るのは、平野の縁から
// 海へ落ちた時だけ。その時だけ、いちばん近い地面の上へ戻す
const FALL_Y = -11;

/* ================= ホバリング ================= */
// 空中で、一回だけ。押している間（最大 HOVER.max 秒）だけ落下を止めて、水平に進む。
// 届きそうで届かない、あの1mを稼ぐ最後の一手。着くまで飛べるようになる代わりに、
// 撃つ前に軌道が見えなくなった。その分はこの一息で稼ぐ
const HOVER = {
  max: 1.0,          // 押していられる最長（秒）。使い切ると地面に立つまで出ない
  lift: 1.2,         // 押している間に上がりきれる速さの上限
  sink: -2.4,        // 押している間に沈る速さの上限。止まりはしない
  accel: 26,         // 水平の加速。空中の舵（PHYS.accelAir）よりずっと効く
  maxSpeed: 11,      // ホバリングで出せる水平速度。発射で得た速度はこれでも殺さない
};
// 検査用。ホバリングがなぜ始まり、なぜ終わったのかを、テストが読めるように残す
const hoverDbg = { key: false, pad0: false, want: false, grounded: false };

/* ================= ポンプ（背中のタンク） ================= */
// RT / E を長押しでタンクに水が溜まり、離した瞬間に「傾けた方向」へ打ち上がる。
// 満タンで主人公の身長10体分（PHYS.height × 10 = 17m）真上へ届く。
// 傾けると同じ出力を横距離に回すことになる。届かせる方向を選ぶのがこのゲームの登り方。
const PUMP = {
  chargeTime: 1.25,                 // 最大まで溜まるまでの時間
  maxHeight: PHYS.height * 10,      // 満タンで真上に上がる高さ（m）
  minCharge: 0.1,                   // これ未満のチャージは発射しない
  drip: 0.07,                       // 溜めている間に水滴を落とす間隔
  leanMax: Math.PI * 0.3,           // 傾けられる最大角（54°）。真上〜かなり斜めの撃ち方
  aimRate: 3.6,                     // 傾きが入力に追従する速さ（rad/s）
};
// 満タン時の発射速度。h = v² / 2g を逆算したもの
const LAUNCH_SPEED = Math.sqrt(2 * PHYS.gravity * PUMP.maxHeight);

/* ================= DOM ================= */
const $ = id => document.getElementById(id);
const dom = {
  canvas: $('scene'), coin: $('coin-count'), height: $('height-count'), falls: $('fall-count'),
  time: $('time-count'), score: $('score-count'),
  progress: $('progress-fill'), progressLabel: $('progress-label'), toast: $('toast'), flash: $('flash'), hud: $('hud'),
  title: $('title'), start: $('start'), clear: $('clear'), pausePanel: $('pause-panel'),
  clearStats: $('clear-stats'), retry: $('retry'), again: $('again'),
  sound: $('sound'), soundState: $('sound-state'), pauseBtn: $('pause-btn'), help: $('help'), guide: $('guide'), closeHelp: $('close-help'),
  worldTag: $('world-tag'), worldBrief: $('world-brief'),
  langSelect: $('lang-select'), padState: $('pad-state'),
  pumpMeter: $('pump-meter'), pumpFill: $('pump-fill'), windMark: $('wind-mark'), windArrow: $('wind-arrow'),
  hoverMeter: $('hover-meter'), hoverFill: $('hover-fill'),
};

/* ================= 描画セットアップ ================= */
const renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(new THREE.Color('#bfe3f7'), 95, 340);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 900);

// 高度に応じて空と霧の色が変わる。登っていることを伝えるいちばん素直な手段
const SKY = {
  low: { top: new THREE.Color('#2f7fd6'), mid: new THREE.Color('#7ec8f2'), bottom: new THREE.Color('#e8f5fc'), fog: new THREE.Color('#bfe3f7') },
  high: { top: new THREE.Color('#111f4a'), mid: new THREE.Color('#2f5fa8'), bottom: new THREE.Color('#a9cbe6'), fog: new THREE.Color('#c2d7ea') },
};

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(420, 32, 18),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color('#2f7fd6') }, mid: { value: new THREE.Color('#7ec8f2') }, bottom: { value: new THREE.Color('#e8f5fc') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
void main(){
  float h = clamp(normalize(vP).y * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(bottom, mid, smoothstep(0.42, 0.53, h));
  c = mix(c, top, smoothstep(0.53, 0.86, h));
  gl_FragColor = vec4(c, 1.0);
}`,
  }),
);
sky.frustumCulled = false;
scene.add(sky);

const sun = new THREE.DirectionalLight('#fff4dc', 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.camera.left = -28;
sun.shadow.camera.right = 28;
sun.shadow.camera.top = 28;
sun.shadow.camera.bottom = -28;
sun.shadow.bias = -0.0009;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#cfe9f7', '#4a6b3a', 0.85);
scene.add(hemi);

/* ================= 面 ================= */
// 面はひとつきり。設計数字は world.js、足場の配置は level.js が決める
let level = buildLevel(scene, WORLD);
const hero = createHero();
hero.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
scene.add(hero.root);

/* ================= 表示言語 ================= */
// 画面の文言はすべて i18n.js から引く。保存された言語を先に決めておかないと
// 起動時のトーストや面名が日本語のままになってしまう。
setLang(loadLang());

/* ================= 状態 ================= */
// 命も制限時間もない。失うのは「登った高さ」だけ。だから落ちること自体が罰になる。
const state = {
  mode: 'menu', coins: 0, falls: 0, score: 0, elapsed: 0,
  bricks: 0, clearTimer: 0, flagLower: 0,
  toastTimer: 0, flashTimer: 0, bestTier: -1, maxY: 0,
  pumpHintShown: false, aimHintShown: false, hoverHintShown: false,
};
const consumed = [];
const particles = [];
// 初めて立った足場を記録する。同じ足場では二度加点されない。横道も本道と同じように
// 立ったら加点なので、遠回りにもちゃんと点になる
const scoredPads = new Set();

const player = {
  pos: new THREE.Vector3(level.spawn.x, level.spawn.y, level.spawn.z),
  vel: new THREE.Vector3(),
  grounded: false, groundSolid: null,
  facing: Math.PI / 2, invuln: 0, squash: 0, walkPhase: 0, airTime: 0,
  pumpCharge: 0, pumpHeld: false, pumpDrip: 0,
  // 狙い: 溜めている間の入力は「傾き」になる。離した瞬間、傾けた方向へ打ち上がる
  aimTilt: 0, aimX: 0, aimZ: 1, launchH: 0,
  // ホバリング: 空中で一度だけ、押している間だけ落下を止めて水平に進む
  hoverTime: 0, hoverUsed: false, hovering: false,
  // 空中で一番高かった地点。立った時にこれを割ると、どれだけ落ちたかが分かる
  airTop: 0,
};

// 風（かぜの塔 とこやの塔 のみ）。空中のドリフトと雲の流れに効く
const wind = { angle: 0.7, x: 0, z: 0 };

// 視点操作は手動のみ（ドラッグ / ホイール / 右スティック / C でリセット）。
// 移動は常に画面の向き基準なので、カメラが勝手に回ることはない。
const cam = { yaw: Math.PI / 2, pitch: 0.3, dist: 10.5, dragging: false, lastX: 0, lastY: 0 };

/* ================= 効果音・BGM（WebAudio で合成） ================= */
const MELODY = [
  [72, 76, 79, 76, 72, 76, 79, 0],
  [74, 79, 83, 79, 74, 79, 83, 0],
  [69, 72, 76, 72, 81, 72, 76, 0],
  [65, 69, 72, 69, 77, 69, 72, 0],
  [72, 76, 79, 84, 81, 79, 76, 72],
  [74, 79, 83, 86, 83, 79, 74, 0],
  [69, 76, 81, 76, 69, 72, 76, 0],
  [72, 0, 79, 0, 84, 81, 79, 76],
];
const BASS = [[48, 55, 48, 55], [43, 50, 43, 50], [45, 52, 45, 52], [41, 48, 41, 48]];
const hz = midi => 440 * 2 ** ((midi - 69) / 12);

class Chip {
  constructor() { this.ctx = null; this.on = true; this.step = 0; this.next = 0; this.musicOn = false; }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.55;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.13;
    this.musicBus.connect(this.master);
    const len = Math.floor(this.ctx.sampleRate * 0.4);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.next = this.ctx.currentTime;
  }
  resume() { this.ctx?.resume(); }
  setOn(on) {
    this.on = on;
    if (!on) this.pumpStop();
    if (this.master) this.master.gain.value = on ? 0.85 : 0;
  }
  tone(freq, dur = 0.12, o = {}) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + (o.delay || 0);
    const osc = this.ctx.createOscillator();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(24, o.to), t + dur);
    const g = this.ctx.createGain();
    const peak = o.gain ?? 0.22;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(o.bus || this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }
  burst(dur = 0.16, gain = 0.3, cutoff = 900, delay = 0) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.25), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
  hat(t, gain) {
    if (!this.ctx || !this.on) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 4200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(t); src.stop(t + 0.06);
  }
  jump() { this.tone(430, 0.16, { to: 900, gain: 0.16 }); }
  land() { this.burst(0.07, 0.12, 500); }
  coin() { this.tone(988, 0.07, { gain: 0.18 }); this.tone(1319, 0.2, { gain: 0.16, delay: 0.06 }); }
  stomp() { this.burst(0.12, 0.28, 700); this.tone(220, 0.14, { to: 70, type: 'triangle', gain: 0.24 }); }
  bump() { this.tone(180, 0.08, { to: 120, gain: 0.15 }); }
  brick() { this.burst(0.22, 0.34, 1400); this.tone(300, 0.1, { to: 120, gain: 0.12 }); }
  spring() { this.tone(300, 0.28, { to: 1200, type: 'sine', gain: 0.22 }); }
  // ポンプ: 溜めている間は低音のうなりを鳴らし続け、出力に応じて音程を上げる
  pumpStart() {
    if (!this.ctx || !this.on || this.pumpOsc) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, t);
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(46, t);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.1);
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    sub.start(t);
    this.pumpOsc = [osc, sub];
    this.pumpFilter = filter;
  }
  pumpPitch(v) {
    if (!this.pumpOsc) return;
    const t = this.ctx.currentTime;
    this.pumpOsc[0].frequency.setTargetAtTime(80 + 300 * v, t, 0.08);
    this.pumpOsc[1].frequency.setTargetAtTime(46 + 120 * v, t, 0.08);
    this.pumpFilter.frequency.setTargetAtTime(420 + 1900 * v, t, 0.08);
  }
  pumpStop() {
    if (!this.pumpOsc) return;
    const t = this.ctx.currentTime;
    for (const osc of this.pumpOsc) {
      osc.frequency.setTargetAtTime(60, t, 0.05);
      osc.stop(t + 0.3);
    }
    this.pumpOsc = null;
    this.pumpFilter = null;
  }
  pumpLaunch(power) {
    this.tone(240, 0.55, { to: 900 + 700 * power, type: 'sine', gain: 0.24 });
    this.burst(0.4, 0.3, 1800);
    if (power > 0.85) this.tone(1046, 0.3, { to: 1568, gain: 0.12, delay: 0.05 });
  }
  power() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, { gain: 0.16, delay: i * 0.07 })); }
  // ホバリング: 空中で一度だけ、空を掴んで踏みとどまる一息
  hover() { this.burst(0.5, 0.2, 2600); this.tone(620, 0.34, { to: 900, type: 'sine', gain: 0.11 }); }
  hurt() { this.tone(420, 0.4, { to: 90, type: 'sawtooth', gain: 0.24 }); this.burst(0.2, 0.2, 600); }
  die() { [392, 349, 294, 220].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', gain: 0.2, delay: i * 0.13 })); }
  oneUp() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.18, { gain: 0.15, delay: i * 0.09 })); }
  goal() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.24, { gain: 0.18, delay: i * 0.13 })); }
  tick() { this.tone(1500, 0.05, { gain: 0.12 }); }
  startMusic() {
    this.init();
    if (!this.ctx) return;
    this.musicOn = true;
    this.next = Math.max(this.next, this.ctx.currentTime);
  }
  stopMusic() { this.musicOn = false; }
  tickMusic() {
    if (!this.ctx || !this.on || !this.musicOn) return;
    const stepDur = 60 / 132 / 4;
    let guard = 0;
    while (this.next < this.ctx.currentTime + 0.25 && guard++ < 64) {
      const s = this.step % 128;
      const bar = Math.floor(s / 16);
      const sub = s % 16;
      const lead = this.next - this.ctx.currentTime;
      if (sub % 2 === 0) {
        const i = sub / 2;
        const n = MELODY[bar][i];
        if (n) this.tone(hz(n), stepDur * 1.7, { gain: 0.16, bus: this.musicBus, delay: lead });
        if (i % 2 === 0) {
          const b = BASS[bar % 4][i / 2];
          if (b) this.tone(hz(b), stepDur * 3.4, { type: 'triangle', gain: 0.5, bus: this.musicBus, delay: lead });
        }
        if (sub % 4 === 0) this.hat(this.next, 0.05);
      }
      this.step++;
      this.next += stepDur;
    }
    if (this.next < this.ctx.currentTime) this.next = this.ctx.currentTime;
  }
}
const chip = new Chip();

/* ================= 小さなパーティクル ================= */
function spawnParticle(mesh, vel, life, spin = 0) {
  mesh.userData.life = life;
  mesh.userData.max = life;
  mesh.userData.spin = spin;
  scene.add(mesh);
  particles.push({ mesh, vel });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vel.y -= 26 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += p.mesh.userData.spin * dt;
    p.mesh.rotation.y += p.mesh.userData.spin * dt;
    p.mesh.userData.life -= dt;
    p.mesh.scale.setScalar(Math.max(0.01, p.mesh.userData.life / p.mesh.userData.max));
    if (p.mesh.userData.life <= 0 || p.mesh.position.y < -20) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      particles.splice(i, 1);
    }
  }
}

/* ================= 入力 ================= */
const keys = new Set();
const KEY = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
};
const anyDown = list => list.some(k => keys.has(k));

window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'Space' && state.mode === 'menu') startGame();
  if (e.code === 'Enter' && state.mode !== 'playing' && state.mode !== 'paused') startGame();
  if (e.code === 'KeyR' && state.mode === 'clear') startGame();
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyC') snapCamera();
  if (e.code === 'KeyL' && !e.repeat) cycleLanguage(1);
  if (e.code === 'KeyM' && !e.repeat) toggleSound();
});
window.addEventListener('keyup', e => {
  keys.delete(e.code);
});
window.addEventListener('blur', () => { keys.clear(); if (state.mode === 'playing') togglePause(); });

dom.canvas.addEventListener('pointerdown', e => {
  cam.dragging = true;
  cam.lastX = e.clientX;
  cam.lastY = e.clientY;
  dom.canvas.setPointerCapture(e.pointerId);
});
dom.canvas.addEventListener('pointermove', e => {
  if (!cam.dragging) return;
  cam.yaw -= (e.clientX - cam.lastX) * 0.006;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - cam.lastY) * 0.004, 0.04, 1.15);
  cam.lastX = e.clientX;
  cam.lastY = e.clientY;
});
const endDrag = () => { cam.dragging = false; };
dom.canvas.addEventListener('pointerup', endDrag);
dom.canvas.addEventListener('pointercancel', endDrag);
dom.canvas.addEventListener('wheel', e => {
  e.preventDefault();
  // 塔は上下に長いので、見下ろせる距離まで引けるようにしておく
  cam.dist = THREE.MathUtils.clamp(cam.dist + Math.sign(e.deltaY) * 0.9, 6, 22);
}, { passive: false });
dom.canvas.addEventListener('contextmenu', e => e.preventDefault());

function snapCamera() {
  const dir = new THREE.Vector3(player.vel.x, 0, player.vel.z);
  cam.yaw = dir.lengthSq() > 0.5 ? Math.atan2(dir.x, dir.z) : player.facing;
  cam.pitch = 0.3;
  cam.dist = 10.5;
}

/* ================= コントローラー（Gamepad API） ================= */
// 接続されているだけで自動対応。標準レイアウト（Xbox / Switch Pro 等の割り当て）で読む。
const PAD_BUTTONS = 17;
const pad = {
  index: -1, connected: false, name: '',
  axes: [0, 0, 0, 0], held: new Array(PAD_BUTTONS).fill(false), just: new Array(PAD_BUTTONS).fill(false), aWas: false,
};
const PAD_DEAD = 0.24;
// デッドゾーンのあと、入力を二乗で返す。少し倒しただけではゆっくり動き、
// 深く倒して初めて速くなる。倒し切りで走る判定は素の値（padRaw）で見る
const padRaw = i => {
  const v = pad.axes[i] || 0;
  if (Math.abs(v) < PAD_DEAD) return 0;
  const s = (Math.abs(v) - PAD_DEAD) / (1 - PAD_DEAD);
  return Math.sign(v) * s;
};
const padAxis = i => {
  const s = padRaw(i);
  return Math.sign(s) * s * s;
};
const padHeld = i => !!pad.held[i];
const padPressed = i => !!pad.just[i];
const padName = id => (String(id || '').replace(/\s*\(.*$/, '').replace(/^Vendor.*$/i, '').trim() || t('padFallback')).slice(0, 28);

function showPad() {
  dom.padState.textContent = pad.connected ? t('padConnected', { name: pad.name }) : t('padNone');
  dom.padState.dataset.on = pad.connected ? '1' : '0';
}

function pollPad(dt) {
  pad.just.fill(false);
  const list = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  let g = null;
  for (const p of list) {
    if (p && p.connected && (pad.index < 0 || p.index === pad.index)) { g = p; break; }
  }
  if (!g) {
    if (pad.connected) {
      pad.connected = false;
      pad.index = -1;
      pad.name = '';
      pad.held.fill(false);
      pad.axes = [0, 0, 0, 0];
      showPad();
      toast(t('toastPadOff'));
    }
    return;
  }
  if (!pad.connected) {
    pad.connected = true;
    pad.name = padName(g.id);
    showPad();
    toast(t('toastPadOn'));
    chip.power();
  }
  pad.index = g.index;
  for (let i = 0; i < pad.axes.length; i++) pad.axes[i] = (g.axes && g.axes[i]) || 0;
  const n = Math.min(PAD_BUTTONS, (g.buttons || []).length);
  for (let i = 0; i < n; i++) {
    const down = !!(g.buttons[i] && g.buttons[i].pressed);
    pad.just[i] = down && !pad.held[i];
    pad.held[i] = down;
  }

  // A: 決定。ゲーム中は空中のホバリング（RT はポンプ専用）
  if (padPressed(0) && (state.mode === 'menu' || state.mode === 'clear')) startGame();

  if (padPressed(9)) {
    if (state.mode === 'menu' || state.mode === 'clear') startGame();
    else togglePause();
  }
  if (padPressed(1)) snapCamera();
  if (padPressed(2)) cycleLanguage(1);
  if (padPressed(8)) toggleSound();

  // 右スティック: 視点だけ回す。移動とは完全に別系統
  const rx = padAxis(2), ry = padAxis(3);
  if (rx || ry) {
    cam.yaw -= rx * dt * 2.6;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + ry * dt * 1.9, 0.04, 1.15);
  }
}
window.addEventListener('gamepadconnected', e => { pad.index = e.gamepad.index; });
window.addEventListener('gamepaddisconnected', () => { if (pad.index >= 0) pad.index = -1; });
showPad();

/* ================= 衝突ヘルパ ================= */
function boxHits(minX, minY, minZ, maxX, maxY, maxZ, s) {
  return (
    maxX > s.min.x && minX < s.max.x &&
    maxY > s.min.y && minY < s.max.y &&
    maxZ > s.min.z && minZ < s.max.z
  );
}

function overlaps(s) {
  const h = PHYS.half;
  return boxHits(player.pos.x - h, player.pos.y, player.pos.z - h, player.pos.x + h, player.pos.y + PHYS.height, player.pos.z + h, s);
}

// 主人公ではなく、渡した箱が足場に当たっているか。軌道プレビュー用
function hitsSolid(minX, minY, minZ, maxX, maxY, maxZ) {
  for (const s of level.solids) {
    if (boxHits(minX, minY, minZ, maxX, maxY, maxZ, s)) return true;
  }
  return false;
}

function moveAxis(axis, delta) {
  if (delta === 0) return;
  player.pos[axis] += delta;
  const h = PHYS.half;
  for (const s of level.solids) {
    if (!overlaps(s)) continue;
    if (axis === 'x') {
      player.pos.x = delta > 0 ? s.min.x - h - PHYS.eps : s.max.x + h + PHYS.eps;
      player.vel.x = 0;
    } else if (axis === 'z') {
      player.pos.z = delta > 0 ? s.min.z - h - PHYS.eps : s.max.z + h + PHYS.eps;
      player.vel.z = 0;
    } else if (delta > 0) {
      player.pos.y = s.min.y - PHYS.height - PHYS.eps;
      player.vel.y = 0;
      headHit(s);
    } else {
      player.pos.y = s.max.y + PHYS.eps;
      player.vel.y = 0;
      land(s);
    }
  }
}

function land(s) {
  if (!player.grounded && player.airTime > 0.18) {
    player.squash = Math.min(0.32, player.airTime * 0.5);
    chip.land();
  }
  player.grounded = true;
  player.groundSolid = s;
  player.launchH = 0;
  player.airTime = 0;
  // 初めてその足場に立った瞬間だけ加点。足場によって点は違う（屋根や岩は大きくて価値がある）。
  // 落ちると谷底まで戻る＝また登り直しなので、「どこまで登ったか」が進み方そのものになる
  if (s.tier != null && !scoredPads.has(s)) {
    scoredPads.add(s);
    if (s.tier > state.bestTier) state.bestTier = s.tier;
    state.score += s.pts || 300;
    chip.power();
  }
}

const usedMats = {
  q: new THREE.MeshLambertMaterial({ color: '#8d939c' }),
};

function headHit(s) {
  if (s.kind === 'q' && !s.used) {
    consumed.push({ solid: s, material: s.mesh.material });
    s.used = true;
    s.mesh.material = usedMats.q;
    s.bump = 0.22;
    addCoin(1);
    popCoin(s.mesh.position.x, s.max.y + 0.2, s.mesh.position.z);
    chip.coin();
    return;
  }
  if (s.kind === 'brick') {
    breakBrick(s);
    return;
  }
  if (s.kind !== 'mover') {
    s.bump = Math.min(0.16, (s.bump || 0) + 0.1);
    chip.bump();
  }
}

function breakBrick(s) {
  const i = level.solids.indexOf(s);
  if (i >= 0) level.solids.splice(i, 1);
  level.world.remove(s.mesh);
  consumed.push({ solid: s, material: s.mesh.material, removed: true });
  state.bricks++;
  state.score += 50;
  addCoin(1);
  const geo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
  const mat = s.mesh.material;
  for (const [dx, dy, dz] of [[-0.3, 0.4, 0], [0.3, 0.4, 0], [0, 0.5, 0.3], [0, 0.35, -0.3]]) {
    spawnParticle(new THREE.Mesh(geo, mat), new THREE.Vector3(dx * 6, 4 + dy * 4, dz * 6), 0.9, 9);
  }
  chip.brick();
}

function popCoin(x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.07, 14),
    new THREE.MeshStandardMaterial({ color: '#ffd24a', emissive: '#a06a00', emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.3 }),
  );
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, y, z);
  spawnParticle(mesh, new THREE.Vector3(0, 7.5, 0), 0.75, 12);
}

function addCoin(n) {
  state.coins += n;
  state.score += 100 * n;
}

/* ================= ポンプの発射 ================= */
// 溜めた量だけ上へ飛べる、という約束から発射速度を逆算する（h = v² / 2g）。
// 傾けている場合は同じ出力を「上」と「横」に分ける。横に届く距離を稼ぐ代わりに、登れる高さを削る。
function launchVelocity(charge, tilt, out) {
  const speed = LAUNCH_SPEED * charge;
  const horiz = speed * Math.sin(tilt);
  out.set(player.aimX * horiz, speed * Math.cos(tilt), player.aimZ * horiz);
  return out;
}

function pumpLaunch() {
  const charge = player.pumpCharge;
  launchVelocity(charge, player.aimTilt, player.vel);
  player.grounded = false;
  player.groundSolid = null;
  player.launchH = Math.hypot(player.vel.x, player.vel.z);
  player.squash = -0.3;
  player.airTime = 0;
  const rise = (player.vel.y * player.vel.y) / (2 * PHYS.gravity);
  state.pumpMaxHeight = Math.max(state.pumpMaxHeight || 0, rise);
  pumpSpray(10 + Math.round(charge * 16), 0.9 + charge);
  chip.pumpLaunch(charge);
  if (charge >= 0.99 && !state.pumpHintShown) {
    state.pumpHintShown = true;
    toast(t('toastPump'));
  }
  if (charge >= 0.99 && player.aimTilt > 0.35 && !state.aimHintShown) {
    state.aimHintShown = true;
    toast(t('toastAim'));
  }
}

const waterMat = new THREE.MeshLambertMaterial({ color: '#8fe3f5' });
// 落下リセット・ポーズ・面切替など、発射以外でポンプを素に戻す
function cancelPump() {
  player.pumpHeld = false;
  player.pumpCharge = 0;
  player.pumpDrip = 0;
  player.aimTilt = 0;
  chip.pumpStop();
}

// ノズルの下へ水を吹く。推力が見えるだけの演出
function pumpSpray(n, power) {
  const geo = new THREE.SphereGeometry(0.09, 8, 6);
  const origin = hero.nozzle.getWorldPosition(new THREE.Vector3());
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(geo, waterMat);
    mesh.position.set(origin.x + (Math.random() - 0.5) * 0.3, origin.y, origin.z + (Math.random() - 0.5) * 0.3);
    spawnParticle(
      mesh,
      new THREE.Vector3((Math.random() - 0.5) * 3 * power, -(2.5 + Math.random() * 5) * power, (Math.random() - 0.5) * 3 * power),
      0.45 + Math.random() * 0.3,
      4,
    );
  }
}

/* ================= 物理 ================= */
// 動く足場。塔では段の向きによって x 方向にも z 方向にも揺れる。
// 上に立っている間は足場ごと主人公を運ぶので、落ちずに乗って行ける
function updateMovers(dt) {
  for (const m of level.movers) {
    const half = m.half ?? 2;
    const c = m.base + Math.sin(state.elapsed * m.speed + m.phase) * m.amp;
    const d = c - (m.cur ?? c);
    m.cur = c;
    if (m.axis === 'z') {
      m.solid.min.z = c - half;
      m.solid.max.z = c + half;
      m.mesh.position.z = c;
      if (player.groundSolid === m.solid) player.pos.z += d;
    } else {
      m.solid.min.x = c - half;
      m.solid.max.x = c + half;
      m.mesh.position.x = c;
      if (player.groundSolid === m.solid) player.pos.x += d;
    }
  }
}

const NO_DIR = new THREE.Vector3();

function physicsStep(dt) {
  updateMovers(dt);

  // 移動はどのモードでも画面の向き基準。倒した方向（画面の奥）がそのまま進む方向になる
  const yaw = cam.yaw;
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
  const dir = new THREE.Vector3();
  if (anyDown(KEY.up)) dir.add(fwd);
  if (anyDown(KEY.down)) dir.sub(fwd);
  if (anyDown(KEY.right)) dir.add(right);
  if (anyDown(KEY.left)) dir.sub(right);
  if (padHeld(12)) dir.add(fwd);
  if (padHeld(13)) dir.sub(fwd);
  if (padHeld(15)) dir.add(right);
  if (padHeld(14)) dir.sub(right);
  const mx = padAxis(0), my = padAxis(1);
  if (mx || my) dir.addScaledVector(right, mx).addScaledVector(fwd, -my);
  if (dir.lengthSq() > 1) dir.normalize();

  // 走る: シフト / LB / RB / LT、または左スティックを最後まで倒し切った時（RT はポンプ専用）
  // 倒し切りの判定だけは素の値を見る。感度を落としても、走る操作はそのまま効く
  const stickTilt = Math.hypot(padRaw(0), padRaw(1));
  const wantRun = keys.has('ShiftLeft') || keys.has('ShiftRight') || padHeld(4) || padHeld(5) || padHeld(6) || stickTilt > 0.92;

  /* ---- ポンプ: 溜めている間は体を傾けて狙う。離した瞬間に傾けた方向へ打ち上がる ---- */
  const wantPump = keys.has('KeyE') || keys.has('Space') || padHeld(7);
  if (wantPump && player.grounded) {
    if (!player.pumpHeld) {
      player.pumpHeld = true;
      player.pumpCharge = 0;
      player.pumpDrip = PUMP.drip;
      chip.pumpStart();
    }
    player.pumpCharge = Math.min(1, player.pumpCharge + dt / PUMP.chargeTime);
    chip.pumpPitch(player.pumpCharge);
    // 足には体重が乗ったまま。入力は「傾き」を作るほうにだけ使われる
    const push = dir.length();
    if (push > 0.05) {
      player.aimX = dir.x / push;
      player.aimZ = dir.z / push;
      player.aimTilt = Math.min(PUMP.leanMax, player.aimTilt + PUMP.aimRate * dt);
    } else {
      player.aimTilt = Math.max(0, player.aimTilt - PUMP.aimRate * dt * 1.8);
    }
    player.pumpDrip -= dt;
    if (player.pumpDrip <= 0) {
      player.pumpDrip = PUMP.drip;
      pumpSpray(1, 0.3);
    }
  } else if (player.pumpHeld) {
    // 離した瞬間が発射。空中で離した場合は取り消し（チャージは地面でしか作れない）
    if (player.grounded && player.pumpCharge >= PUMP.minCharge) pumpLaunch();
    cancelPump();
  }
  if (!player.pumpHeld) player.aimTilt = Math.max(0, player.aimTilt - PUMP.aimRate * dt * 2);

  /* ---- ホバリング: 空中で一度だけ。押している間（最大1秒）だけ落下を止めて水平に進む ---- */
  // 届きそうで届かない1mを稼ぐ一手。一度使えば、次に使えるのは地面に立ってから。
  // 息が続く間は押しっぱなしでよい。離した時点で、この空中ではもう使えない
  const hoverKey = state.mode === 'playing' && (keys.has('KeyQ') || padHeld(0)) && !player.grounded;
  const wantHover = hoverKey && (player.hovering || !player.hoverUsed);
  hoverDbg.key = keys.has('KeyQ');
  hoverDbg.pad0 = padHeld(0);
  hoverDbg.want = wantHover;
  hoverDbg.grounded = player.grounded;
  if (wantHover) {
    if (!player.hovering) {
      player.hovering = true;
      player.hoverUsed = true;
      chip.hover();
      pumpSpray(5, 0.55);
      if (!state.hoverHintShown) {
        state.hoverHintShown = true;
        toast(t('toastHover'));
      }
    }
    player.hoverTime = Math.min(HOVER.max, player.hoverTime + dt);
    if (player.hoverTime >= HOVER.max) player.hovering = false;   // 息が続いたここまで
  } else {
    player.hovering = false;
  }

  if (player.grounded) {
    /* ---- 地上: チャージ中は足が動かない。狙いは撃つ前に決める ---- */
    const gdir = player.pumpHeld ? NO_DIR : dir;
    const maxSpeed = wantRun ? PHYS.runMax : PHYS.walkMax;
    const maxDelta = PHYS.accel * dt;
    player.vel.x += THREE.MathUtils.clamp(gdir.x * maxSpeed - player.vel.x, -maxDelta, maxDelta);
    player.vel.z += THREE.MathUtils.clamp(gdir.z * maxSpeed - player.vel.z, -maxDelta, maxDelta);
    if (gdir.lengthSq() === 0) {
      const stop = PHYS.friction * dt;
      const hs = Math.hypot(player.vel.x, player.vel.z);
      if (hs <= stop) { player.vel.x = 0; player.vel.z = 0; }
      else { player.vel.x *= (hs - stop) / hs; player.vel.z *= (hs - stop) / hs; }
    }
    const hs = Math.hypot(player.vel.x, player.vel.z);
    if (hs > maxSpeed) { player.vel.x *= maxSpeed / hs; player.vel.z *= maxSpeed / hs; }
  } else {
    /* ---- 空中: 舵は少しだけ効く。発射で得た速度は殺さない ---- */
    // ホバリング中は、舵ではなく「進む」ことができる。それでも発射速度は殺さない
    const steer = player.hovering ? HOVER.accel : PHYS.accelAir;
    player.vel.x += dir.x * steer * dt;
    player.vel.z += dir.z * steer * dt;
    const cap = Math.max(player.hovering ? HOVER.maxSpeed : PHYS.airMax, player.launchH);
    const hs = Math.hypot(player.vel.x, player.vel.z);
    if (hs > cap) { player.vel.x *= cap / hs; player.vel.z *= cap / hs; }
    // 風。塔の高いほど強く効いて、狙いを少しずつずらしてくる
    if (level.cfg.wind) {
      player.vel.x += wind.x * dt;
      player.vel.z += wind.z * dt;
    }
  }

  // 向き: 進行方向、または傾けて狙っている方向へ体を向ける
  if (player.pumpHeld && player.aimTilt > 0.05) {
    player.facing = lerpAngle(player.facing, Math.atan2(player.aimX, player.aimZ), Math.min(1, dt * 10));
  } else if (Math.hypot(player.vel.x, player.vel.z) > 0.4) {
    const target = Math.atan2(dir.lengthSq() > 0 ? dir.x : player.vel.x, dir.lengthSq() > 0 ? dir.z : player.vel.z);
    player.facing = lerpAngle(player.facing, target, Math.min(1, dt * 14));
  }

  moveAxis('x', player.vel.x * dt);
  moveAxis('z', player.vel.z * dt);

  player.grounded = false;
  player.groundSolid = null;
  if (player.hovering) {
    // 落下を止めて、水平に進むだけ。ほんの少し沈むので、いつかは地面に着く
    player.vel.y = THREE.MathUtils.clamp(player.vel.y, HOVER.sink, HOVER.lift);
  } else {
    player.vel.y -= PHYS.gravity * (player.vel.y < 0 ? PHYS.fastFall : 1) * dt;
    player.vel.y = Math.max(player.vel.y, -PHYS.maxFall);
  }
  moveAxis('y', player.vel.y * dt);

  // 接地判定のちらつき防止：ほんの少し上に浮いているだけなら地面に固定する
  if (!player.grounded && player.vel.y <= 0) {
    const h = PHYS.half;
    const probeY = player.pos.y - 0.06;
    for (const s of level.solids) {
      if (
        player.pos.x + h > s.min.x && player.pos.x - h < s.max.x &&
        probeY + PHYS.height > s.min.y && probeY < s.max.y &&
        player.pos.z + h > s.min.z && player.pos.z - h < s.max.z
      ) {
        player.pos.y = s.max.y + PHYS.eps;
        player.vel.y = 0;
        player.grounded = true;
        player.groundSolid = s;
        break;
      }
    }
  }

  if (player.grounded) {
    player.launchH = 0;
    // 立った地点が、この空中で一番高かった地点より大きく低ければ「落とした」。
    // 塔ではそれが罰そのものなので、数えて合図を出す。登り直しになるのは、
    // 落とした分をまた登らされることだ。命もリセットもない
    const drop = player.airTop - player.pos.y;
    if (drop > BIG_FALL) noteBigFall(drop);
    player.airTop = player.pos.y;
    // 地面に立ったので、ホバリングはまた一度だけ使える
    player.hoverTime = 0;
    player.hoverUsed = false;
  } else {
    player.airTime += dt;
    if (player.pos.y > player.airTop) player.airTop = player.pos.y;
  }

  // 到達した最高高度。HUDの高度バーはこれを見る（落ちても記録は残る）
  if (player.pos.y > state.maxY) state.maxY = player.pos.y;

  // 塔から落ちても、いちばん下の地面にただ立つ。ここを通るのは平野の縁から
  // 海へ落ちた時だけなので、その時だけいちばん近い地面の上へ戻す
  if (player.pos.y < FALL_Y) recoverToGround();
}

/* ================= 落ちた ================= */
// 塔から落ちても、いちばん下の地面にただ立つ。命もリセットもない。
// 失うのは「登った高さ」だけなので、落とした分をまた登ることがそのまま罰になる
const BIG_FALL = 12;         // これ以上落としたら「大きな落ち方」として数える
function noteBigFall(drop) {
  if (state.mode !== 'playing') return;
  state.falls++;
  dom.flash.classList.add('on');
  state.flashTimer = 0.35;
  chip.hurt();
  toast(t('toastFall', { lost: Math.round(drop) }));
}

// 平野の縁から海へ落ちた時だけの安全網。いちばん近い地面の上へ戻す
function recoverToGround() {
  const r = level.plainHalf - 4;
  const d = Math.hypot(player.pos.x, player.pos.z) || 1;
  const k = Math.min(1, r / d);
  state.falls++;
  cancelPump();
  player.pos.set(player.pos.x * k, level.groundY + 0.05, player.pos.z * k);
  player.vel.set(0, 0, 0);
  player.grounded = false;
  player.groundSolid = null;
  player.launchH = 0;
  player.airTime = 0;
  player.airTop = player.pos.y;
  player.hoverTime = 0;
  player.hoverUsed = false;
  player.squash = 0;
  player.invuln = 1.2;
  dom.flash.classList.add('on');
  state.flashTimer = 0.35;
  chip.hurt();
  toast(t('toastSea'));
  snapCamera();
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/* ================= 罠: 消える足場 ================= */
function updateBlinkers() {
  for (const b of level.blinkers) {
    const t = ((state.elapsed + b.phase) % b.period) / b.period;
    const on = t < b.onFrac;
    if (on !== b.on) {
      b.on = on;
      b.group.visible = on;
      if (on) {
        if (!level.solids.includes(b.solid)) level.solids.push(b.solid);
      } else {
        const i = level.solids.indexOf(b.solid);
        if (i >= 0) level.solids.splice(i, 1);
        if (player.groundSolid === b.solid) {
          player.groundSolid = null;
          player.grounded = false;
        }
      }
    }
    // 消える直前は点滅して合図を出す
    const remain = on ? (b.onFrac - t) * b.period : 0;
    const alpha = on && remain < 0.75 ? (Math.sin(state.elapsed * 24) > 0 ? 0.32 : 0.92) : 0.95;
    for (const m of b.mats) m.opacity = alpha;
  }
}

/* ================= コイン ================= */
function updateCoins(dt) {
  for (let i = level.coins.length - 1; i >= 0; i--) {
    const c = level.coins[i];
    if (c.taken) {
      c.anim += dt;
      c.mesh.position.y += dt * 4.5;
      c.mesh.rotation.y += dt * 16;
      c.mesh.scale.setScalar(Math.max(0.01, 1 - c.anim * 2));
      if (c.anim > 0.5) {
        level.world.remove(c.mesh);
        level.coins.splice(i, 1);
      }
      continue;
    }
    c.mesh.rotation.y += dt * 3.4;
    c.mesh.position.y += Math.sin(state.elapsed * 2.4 + c.phase) * dt * 0.35;
    const h = PHYS.half;
    if (
      Math.abs(player.pos.x - c.mesh.position.x) < h + 0.45 &&
      Math.abs(player.pos.z - c.mesh.position.z) < h + 0.45 &&
      player.pos.y < c.mesh.position.y + 0.75 && player.pos.y + PHYS.height > c.mesh.position.y - 0.75
    ) {
      c.taken = true;
      addCoin(1);
      chip.coin();
    }
  }
}

/* ================= カメラ ================= */
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
function updateCamera(dt) {
  camTarget.set(player.pos.x, player.pos.y + 1.3, player.pos.z);

  if (state.mode === 'menu') {
    // タイトル画面だけゆっくり周回する。ゲーム中は視点操作（ドラッグ等）でしか回らない。
    // 低めの位置から撮って、塔が画面の上へ抜けていくように見せる
    cam.yaw = Math.PI / 2 + Math.sin(state.elapsed * 0.12) * 0.5;
    cam.pitch = 0.16;
    cam.dist = 16;
  }

  const cp = Math.cos(cam.pitch);
  camPos.set(
    camTarget.x - Math.sin(cam.yaw) * cam.dist * cp,
    camTarget.y + cam.dist * Math.sin(cam.pitch),
    camTarget.z - Math.cos(cam.yaw) * cam.dist * cp,
  );

  const toCam = camPos.clone().sub(camTarget);
  const dist = toCam.length();
  toCam.normalize();
  let hit = dist;
  for (const s of level.solids) {
    const t = rayHit(camTarget, toCam, s, dist);
    if (t !== null && t < hit) hit = t;
  }
  if (hit < dist) camPos.copy(camTarget).addScaledVector(toCam, Math.max(2.4, hit - 0.4));

  camera.position.lerp(camPos, state.mode === 'menu' ? 1 : 1 - Math.exp(-dt * 9));
  camera.lookAt(camTarget);
}

function rayHit(origin, dir, s, maxDist) {
  const pad = 0.35;
  let tmin = 1.2, tmax = maxDist;
  for (const axis of ['x', 'y', 'z']) {
    const d = dir[axis];
    const lo = s.min[axis] - pad, hi = s.max[axis] + pad;
    if (Math.abs(d) < 1e-6) {
      if (origin[axis] < lo || origin[axis] > hi) return null;
      continue;
    }
    let t1 = (lo - origin[axis]) / d;
    let t2 = (hi - origin[axis]) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

/* ================= 空の色 ================= */
// 高度に応じて空と霧を切り替える。登っている実感は、HUDより先にこの色で伝わる
function updateSky() {
  const alt = THREE.MathUtils.clamp((player.pos.y + 8) / (level.height + 8), 0, 1);
  const u = sky.material.uniforms;
  u.top.value.copy(SKY.low.top).lerp(SKY.high.top, alt);
  u.mid.value.copy(SKY.low.mid).lerp(SKY.high.mid, alt);
  u.bottom.value.copy(SKY.low.bottom).lerp(SKY.high.bottom, alt);
  scene.fog.color.copy(SKY.low.fog).lerp(SKY.high.fog, alt);
  // 上に行くほど見通しが良くなる。足元まで見えて、それが落ちる怖さになる
  scene.fog.near = 95 + alt * 140;
  scene.fog.far = 340 + alt * 420;
  hemi.intensity = 0.85 - alt * 0.3;
  sun.intensity = 2.0 + alt * 0.45;
}

/* ================= 主人公アニメーション ================= */
const leanAxis = new THREE.Vector3();
function animateHero(dt) {
  hero.root.position.copy(player.pos);
  const speed = Math.hypot(player.vel.x, player.vel.z);

  if (player.pumpHeld && player.aimTilt > 0.001) {
    // 溜めている間は、傾けた方向へ体を倒す。離した瞬間の撃ち方向そのもの
    leanAxis.set(player.aimZ, 0, -player.aimX);
    hero.root.quaternion.setFromAxisAngle(leanAxis, player.aimTilt);
  } else {
    hero.root.quaternion.identity();
    hero.root.rotation.y = player.facing;
  }

  if (!player.grounded) {
    hero.legL.rotation.x = -0.5;
    hero.legR.rotation.x = 0.35;
    hero.armL.rotation.x = lerpAngle(hero.armL.rotation.x, -2.3, 0.3);
    hero.armR.rotation.x = lerpAngle(hero.armR.rotation.x, -2.3, 0.3);
  } else {
    player.walkPhase += speed * dt * 2.1;
    const swing = Math.min(0.75, speed * 0.09) * Math.sin(player.walkPhase);
    hero.legL.rotation.x = swing;
    hero.legR.rotation.x = -swing;
    hero.armL.rotation.x = -swing * 0.7;
    hero.armR.rotation.x = swing * 0.7;
  }

  player.squash *= Math.exp(-dt * 7);
  const s = THREE.MathUtils.clamp(player.squash, -0.35, 0.35);
  // チャージ中は身を縮めてタンクに圧を溜める。ゲージに応じてタンクの帯が発光する
  const charge = player.pumpHeld ? player.pumpCharge : 0;
  hero.pumpGlow.emissiveIntensity = 0.08 + charge * 2.6;
  hero.body.scale.set(1 + s * 0.5 + charge * 0.18, 1 - s * 0.9 - charge * 0.26, 1 + s * 0.5 + charge * 0.18);
  if (charge > 0) {
    hero.armL.rotation.x = lerpAngle(hero.armL.rotation.x, -0.7, 0.25);
    hero.armR.rotation.x = lerpAngle(hero.armR.rotation.x, -0.7, 0.25);
  }

  player.invuln = Math.max(0, player.invuln - dt);
  hero.root.visible = player.invuln <= 0 || Math.floor(player.invuln * 12) % 2 === 0;
}

/* ================= HUD・画面 ================= */
function toast(text) {
  dom.toast.textContent = text;
  dom.toast.classList.add('on');
  state.toastTimer = 1.9;
}
function syncHud() {
  dom.coin.textContent = String(state.coins).padStart(2, '0');
  // 高度は「いまどこにいるか」。登りバーはこれまでで一番高いところまで動く
  dom.height.textContent = Math.round(Math.max(0, player.pos.y)) + 'm';
  dom.falls.textContent = '×' + String(state.falls).padStart(2, '0');
  dom.time.textContent = formatTime(state.elapsed);
  dom.score.textContent = String(state.score).padStart(6, '0');
  const p = THREE.MathUtils.clamp(state.maxY / level.height, 0, 1);
  dom.progress.style.height = (p * 100).toFixed(1) + '%';
  dom.progressLabel.textContent = Math.round(p * 100) + '%';
  // ポンプのゲージ。溜めている間だけ明るく、満タンで金色に変わる
  const pump = THREE.MathUtils.clamp(player.pumpCharge, 0, 1);
  dom.pumpFill.style.width = (pump * 100).toFixed(1) + '%';
  dom.pumpMeter.dataset.active = pump > 0 ? '1' : '0';
  dom.pumpMeter.dataset.full = pump >= 0.999 ? '1' : '0';
  // ホバリング。使える間は満たしておき、使っている間だけ息の残りを減らす。
  // 使い切ると空になり、地面に立つまで戻らない。撃つ前に軌道を見せない代わりに、
  // 「いま一息残っているか」だけは画面に出す
  const hoverLeft = player.hovering ? Math.max(0, 1 - player.hoverTime / HOVER.max) : (player.hoverUsed ? 0 : 1);
  dom.hoverFill.style.width = (hoverLeft * 100).toFixed(1) + '%';
  dom.hoverMeter.dataset.ready = player.hoverUsed ? '0' : '1';
  dom.hoverMeter.dataset.flying = player.hovering ? '1' : '0';
  // 風。この塔では狙いに効くので、画面の向きでの向きを隠さず出す
  const hasWind = level.cfg.wind > 0;
  dom.windMark.hidden = !hasWind;
  if (hasWind) {
    const y = cam.yaw;
    const sx = wind.x * -Math.cos(y) + wind.z * Math.sin(y);
    const sy = wind.x * Math.sin(y) + wind.z * Math.cos(y);
    dom.windArrow.style.transform = `rotate(${(Math.atan2(-sy, sx) * 180) / Math.PI}deg)`;
  }
}
function formatTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}
// 頂上までの登り切りは par（目安タイム）より早ければボーナス。制限時間はない
function finalScore() {
  const bonus = Math.max(0, Math.floor(level.cfg.par - state.elapsed)) * 10;
  return Math.round((state.score + bonus) * level.cfg.scoreMul);
}
function stats(el) {
  const bonus = Math.max(0, Math.floor(level.cfg.par - state.elapsed)) * 10;
  const total = finalScore();
  el.innerHTML = `
    <div><span>WORLD</span><b>${worldName(level.cfg, getLang())}</b></div>
    <div><span>TIME</span><b>${formatTime(state.elapsed)}</b></div>
    <div><span>HEIGHT</span><b>${Math.round(state.maxY)} / ${Math.round(level.height)} m</b></div>
    <div><span>COINS</span><b>${state.coins}</b></div>
    <div><span>FALLS</span><b>${state.falls}</b></div>
    <div><span>TIME BONUS</span><b>${bonus}</b></div>
    <div class="total"><span>SCORE</span><b>${String(total).padStart(6, '0')}</b></div>`;
}
const show = el => { el.hidden = false; };
const hide = el => { el.hidden = true; };

function restoreConsumables() {
  for (const c of consumed.splice(0)) {
    c.solid.used = false;
    c.solid.bump = 0;
    c.solid.mesh.material = c.material;
    c.solid.mesh.position.y = c.solid.baseY;
    if (c.removed) {
      level.world.add(c.solid.mesh);
      if (!level.solids.includes(c.solid)) level.solids.push(c.solid);
    }
  }
}

function startGame() {
  chip.init();
  chip.resume();
  cancelPump();
  state.mode = 'playing';
  state.coins = 0;
  state.falls = 0;
  state.score = 0;
  state.bricks = 0;
  state.elapsed = 0;
  state.bestTier = -1;
  scoredPads.clear();
  state.maxY = 0;
  state.flagLower = 0;
  state.clearTimer = 0;
  state.pumpHintShown = false;
  state.aimHintShown = false;
  state.hoverHintShown = false;
  level.flagpole.flag.position.y = 6.9;
  restoreConsumables();
  level.resetEntities();
  hide(dom.title); hide(dom.clear); hide(dom.pausePanel);
  show(dom.hud);
  player.pos.set(level.spawn.x, level.spawn.y, level.spawn.z);
  player.vel.set(0, 0, 0);
  player.grounded = false;
  player.groundSolid = null;
  player.launchH = 0;
  player.airTime = 0;
  player.airTop = level.spawn.y;
  player.hoverTime = 0;
  player.hoverUsed = false;
  player.hovering = false;
  player.squash = 0;
  player.facing = Math.PI / 2;
  hero.root.quaternion.identity();
  hero.root.rotation.y = player.facing;
  hero.body.scale.set(1, 1, 1);
  snapCamera();
  player.invuln = 1.2;
  chip.startMusic();
}

function reachGoal() {
  state.mode = 'clear';
  state.clearTimer = 0;
  state.score += 5000;
  cancelPump();
  chip.stopMusic();
  chip.goal();
  stats(dom.clearStats);
  show(dom.clear);
  toast(t('toastSummit'));
  const colors = ['#ffd24a', '#e0392f', '#2f62c9', '#4fb843', '#ffffff'];
  const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  for (let i = 0; i < 40; i++) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colors[i % colors.length] }));
    mesh.position.set(level.goal.x + (Math.random() - 0.5) * 7, level.goal.y + 1 + Math.random() * 3, level.goal.z + (Math.random() - 0.5) * 7);
    spawnParticle(mesh, new THREE.Vector3((Math.random() - 0.5) * 9, 6 + Math.random() * 9, (Math.random() - 0.5) * 9), 2.4, 8);
  }
}

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    cancelPump();
    chip.stopMusic();
    show(dom.pausePanel);
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
    last = performance.now();
    hide(dom.pausePanel);
    chip.startMusic();
  }
}

/* ================= メインループ ================= */
let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(Math.max(dt, 0), 0.1);
  pollPad(dt);

  // 風はゆっくり向きを変える。雲の流れと、空中の主人公の両方に効く
  if (level.cfg.wind) {
    wind.angle += dt * 0.16;
    wind.x = Math.cos(wind.angle) * level.cfg.wind;
    wind.z = Math.sin(wind.angle) * level.cfg.wind;
  } else {
    wind.x = 0;
    wind.z = 0;
  }

  if (state.mode === 'playing') {
    state.elapsed += dt;
    acc = Math.min(acc + dt, 0.25);
    while (acc >= FIXED && state.mode === 'playing') {
      physicsStep(FIXED);
      acc -= FIXED;
    }
    if (state.mode === 'playing') {
      updateCoins(dt);
      // 頂上: 円の範囲に入り、床に届いていれば登り切り
      const gx = player.pos.x - level.goal.x, gz = player.pos.z - level.goal.z;
      if (player.pos.y > level.goal.y - 0.6 && gx * gx + gz * gz < level.goal.r * level.goal.r) reachGoal();
    }
  } else if (state.mode === 'clear') {
    state.clearTimer += dt;
    state.flagLower = Math.min(1, state.flagLower + dt * 0.8);
    level.flagpole.flag.position.y = 6.9 - state.flagLower * 4.6;
  } else if (state.mode === 'menu') {
    state.elapsed += dt;
  }

  for (const s of level.solids) {
    if (!s.bump || !s.mesh) continue;
    s.bump = Math.max(0, s.bump - dt * 1.6);
    s.mesh.position.y = s.baseY + Math.sin(s.bump * 14) * s.bump * 0.9;
  }

  updateBlinkers();
  level.updateDecor(dt, wind);
  updateParticles(dt);
  animateHero(dt);
  updateCamera(dt);
  updateSky();

  // 太陽は主人公の高さに合わせて付いていく。登り切っても影が切れないように
  sun.position.set(player.pos.x - 16, player.pos.y + 26, player.pos.z + 14);
  sun.target.position.set(player.pos.x, player.pos.y, player.pos.z);
  sun.target.updateMatrixWorld();
  sky.position.copy(camera.position);

  chip.tickMusic();
  syncHud();

  if (state.toastTimer > 0) {
    state.toastTimer -= dt;
    if (state.toastTimer <= 0) dom.toast.classList.remove('on');
  }
  if (state.flashTimer > 0) {
    state.flashTimer -= dt;
    if (state.flashTimer <= 0) dom.flash.classList.remove('on');
  }

  renderer.render(scene, camera);
}

/* ================= 面の紹介 ================= */
// 面はひとつきり。タイトル画面には、この登りがどんなものかを書いておく
function updateWorldUI() {
  const lang = getLang();
  const c = level.cfg;
  dom.worldTag.textContent = worldName(c, lang);
  dom.worldTag.dataset.world = c.key;
  dom.worldBrief.innerHTML =
    `${worldDesc(c, lang)}<br /><span class="world-nums">${t('statTop')} ${Math.round(level.height)}m / ${t('statHops')} ${c.steps} / ${t('statWind')} ${c.wind > 0 ? c.wind.toFixed(1) : t('statNone')}</span>`;
}


/* ================= 表示言語の切り替え ================= */
// 画面の文言は HTML の data-i18n キーと t() から引く。切り替わるのは表示言語だけで、
// 操作・面といったゲームの中身はそのまま。
function applyStaticUI() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.title = t('docTitle');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const btn of dom.langSelect.querySelectorAll('button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
  }
  dom.langSelect.setAttribute('aria-label', t('langLabel'));
  showPad();
  updateWorldUI();
}

function setLanguage(key) {
  const lang = LANG_MAP.get(key);
  if (!lang || lang.key === getLang()) return;
  setLang(lang.key);
  saveLang(lang.key);
  applyStaticUI();
  toast(t('toastLang', { name: lang.label }));
}

function cycleLanguage(step) {
  const i = LANGS.findIndex(l => l.key === getLang());
  const next = LANGS[THREE.MathUtils.euclideanModulo(i + step, LANGS.length)];
  setLanguage(next.key);
}

function toggleSound() {
  chip.init();
  chip.setOn(!chip.on);
  dom.soundState.textContent = chip.on ? 'ON' : 'OFF';
  if (chip.on && state.mode === 'playing') chip.startMusic();
  toast(chip.on ? 'SOUND ON' : 'SOUND OFF');
}

/* ================= ボタン ================= */
dom.start.addEventListener('click', startGame);
dom.retry.addEventListener('click', startGame);
dom.langSelect.addEventListener('click', e => {
  const btn = e.target.closest('button[data-lang]');
  if (!btn) return;
  chip.init();
  setLanguage(btn.dataset.lang);
});
applyStaticUI();
dom.again.addEventListener('click', () => {
  hide(dom.clear);
  show(dom.title);
  state.mode = 'menu';
  state.elapsed = 0;
  player.pos.set(level.spawn.x, level.spawn.y, level.spawn.z);
  player.vel.set(0, 0, 0);
  hero.root.rotation.set(0, Math.PI / 2, 0);
});
dom.pauseBtn.addEventListener('click', togglePause);
dom.sound.addEventListener('click', toggleSound);
dom.help.addEventListener('click', () => {
  if (state.mode === 'paused') return;
  if (state.mode !== 'playing') { show(dom.pausePanel); return; }
  togglePause();
});
dom.closeHelp.addEventListener('click', () => {
  if (state.mode === 'paused') togglePause();
  else hide(dom.pausePanel);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ================= 診断API ================= */
// 半直線が長方形（pad だけ内外にふくらませる）へ入る距離と抜ける距離。
// pad=+半幅 で「身体が板の輪郭に触れる位置」、pad=-半幅 で「中心が板の上に載る範囲」になる
function rayRect(px, pz, ux, uz, rect, pad) {
  let tin = 0, tout = Infinity;
  for (const [p, u, lo, hi] of [
    [px, ux, rect.x0 - pad, rect.x1 + pad],
    [pz, uz, rect.z0 - pad, rect.z1 + pad],
  ]) {
    if (Math.abs(u) < 1e-9) {
      if (p < lo || p > hi) return { tin: Infinity, tout: -Infinity };
      continue;
    }
    let t1 = (lo - p) / u, t2 = (hi - p) / u;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tin) tin = t1;
    if (t2 < tout) tout = t2;
  }
  return { tin, tout };
}

// 足場の、その瞬間の当たり判定。動く足場は動いているし、消える足場は判定から外れている
// ことがある。発射も検査も「いま実際にそこにある足場」を相手にする
function padRect(idx) {
  for (const b of level.blinkers) if (b.solid.tier === idx) return b.solid;
  return level.solids.find(o => o.tier === idx) || null;
}

window.__HOP__ = {
  snapshot: () => ({
    mode: state.mode,
    world: level.cfg.key,
    lang: getLang(),
    pad: { connected: pad.connected, name: pad.name },
    camera: { yaw: +cam.yaw.toFixed(3), pitch: +cam.pitch.toFixed(3), dist: +cam.dist.toFixed(2) },
    coins: state.coins,
    falls: state.falls,
    score: state.score,
    elapsed: +state.elapsed.toFixed(2),
    height: +Math.max(0, player.pos.y).toFixed(2),
    maxHeight: +state.maxY.toFixed(2),
    topHeight: +level.height.toFixed(1),
    bestTier: state.bestTier,
    tiers: level.tiers.length,
    route: level.route.length,
    tutorial: level.tutorial.length,
    groundY: level.groundY,
    plainHalf: level.plainHalf,
    player: {
      x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(2),
      vy: +player.vel.y.toFixed(2), grounded: player.grounded, facing: +player.facing.toFixed(2),
      invuln: +player.invuln.toFixed(2),
      aimTilt: +player.aimTilt.toFixed(3), aimX: +player.aimX.toFixed(3), aimZ: +player.aimZ.toFixed(3),
    },
    pump: {
      charge: +player.pumpCharge.toFixed(3),
      held: player.pumpHeld,
      maxHeight: PUMP.maxHeight,
      bestHeight: +(state.pumpMaxHeight || 0).toFixed(2),
      leanMax: +PUMP.leanMax.toFixed(3),
    },
    // ホバリング: 空中で一度だけ。残りの息と、いま使っているか。検査はこれを見る
    hover: {
      available: !player.hoverUsed,
      active: player.hovering,
      used: +player.hoverTime.toFixed(3),
      max: HOVER.max,
      sink: HOVER.sink,
      lift: HOVER.lift,
      accel: HOVER.accel,
      maxSpeed: HOVER.maxSpeed,
    },
    wind: { x: +wind.x.toFixed(2), z: +wind.z.toFixed(2), strength: level.cfg.wind },
    goal: { x: level.goal.x, y: +level.goal.y.toFixed(1), z: level.goal.z, r: level.goal.r, half: level.goal.half },
    spawn: { x: level.spawn.x, y: level.spawn.y, z: level.spawn.z },
    coinsLeft: level.coins.filter(c => !c.taken).length,
    solids: level.solids.length,
    blinkers: level.blinkers.length,
    blinkersOn: level.blinkers.filter(b => b.on).length,
    movers: level.movers.length,
  }),
  debug: {
    teleport(x, y, z) {
      player.pos.set(x, y, z);
      player.vel.set(0, 0, 0);
      // 検査でテレポートした時に、そこへ「落ちてきた」ことにしない
      player.airTop = y;
      player.hoverTime = 0;
      player.hoverUsed = false;
      player.hovering = false;
    },
    setCamera(yaw, pitch, dist) { cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; },
    setLang(key) { setLanguage(key); },
    // 各足場の中心と高さ、輪郭の半分の大きさ。面が登れる組み方になっているかを
    // 機械で確かめるための足場一覧。route は本道の並び（この順に登れば頂上へ着く）
    tiers: () => level.tiers.map((t, i) => ({
      i,
      x: +t.x.toFixed(2), y: +t.y.toFixed(2), z: +t.z.toFixed(2),
      half: +t.half.toFixed(2), hx: +t.hx.toFixed(2), hz: +t.hz.toFixed(2), kind: t.kind,
      trap: t.trap || null, side: !!t.side, tut: !!t.tut,
    })),
    route: () => level.route.slice(),
    // 足場 i の、いまの実位置と広がり。動く足場は動いているので、検査はここに立つ
    padPos(i) {
      const s = padRect(i);
      if (!s) return null;
      return {
        x: +((s.min.x + s.max.x) / 2).toFixed(2), y: +s.max.y.toFixed(2), z: +((s.min.z + s.max.z) / 2).toFixed(2),
        hx: +((s.max.x - s.min.x) / 2).toFixed(2), hz: +((s.max.z - s.min.z) / 2).toFixed(2),
      };
    },
    // 本道の i 番目へ一発で飛ぶ。足場は厚い板なので、板の輪郭を「板の高さより上で」
    // 越えてから落ちる軌道でなければならない（下で越えると頭をぶつける）。その条件で
    // 一番少ない溜めで済む解を探して発射する。面が本当に登れているかの検査入口。
    // tier を渡した場合は本道の何番目ではなく、その足場そのものへ飛ぶ（地上のチュートリアル検査用）
    hopTo(i, tier = null) {
      const at = tier === null ? level.route[i] : tier;
      const plan = at === undefined ? null : level.tiers[at];
      if (!plan) return { ok: false, reason: 'no-tier' };
      const live = padRect(at);
      const t = live
        ? {
          x: (live.min.x + live.max.x) / 2, y: live.max.y, z: (live.min.z + live.max.z) / 2,
          x0: live.min.x, x1: live.max.x, z0: live.min.z, z1: live.max.z,
        }
        : plan;
      const from = player.pos;
      const dx = t.x - from.x, dz = t.z - from.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.01) return { ok: false, reason: 'same-place' };
      const ux = dx / dist, uz = dz / dist;
      const R = t.y - from.y;
      // 少し下がる段も解く（チュートリアルには、同じ高さか少し下の足場がある）。
      // 体ひとつ分以上の見下ろしは、撃たずに降りれば済むことなので解かない
      if (R < -PHYS.height) return { ok: false, reason: 'far-below' };
      const body = rayRect(from.x, from.z, ux, uz, t, PHYS.half);
      const on = rayRect(from.x, from.z, ux, uz, t, -PHYS.half);
      if (!Number.isFinite(body.tin) || !Number.isFinite(on.tout) || on.tout < body.tin) {
        return { ok: false, reason: 'off-course', dist: +dist.toFixed(2) };
      }
      const gFall = PHYS.gravity * PHYS.fastFall;
      const heightAt = (vy, tt) => {
        const tRise = vy / PHYS.gravity;
        if (tt <= tRise) return vy * tt - 0.5 * PHYS.gravity * tt * tt;
        return (vy * vy) / (2 * PHYS.gravity) - 0.5 * gFall * (tt - tRise) * (tt - tRise);
      };
      let best = null;
      // 上へ登るHopは、目標の高さまで届くvyが下限。同じ高さか下がるHopは、
      // 縁より上で越えるための小さなvyから探す
      const vyMin = R > 0.05 ? Math.sqrt(2 * PHYS.gravity * R) * 1.02 : 0.8;
      for (let vy = vyMin; vy <= LAUNCH_SPEED; vy *= 1.03) {
        const tLand = vy / PHYS.gravity
          + Math.sqrt(Math.max(0, (vy * vy) / (2 * PHYS.gravity) - R) * 2 / gFall);
        for (let vh = 0.5; vh <= 34; vh *= 1.04) {
          const land = vh * tLand;
          if (land < body.tin + 0.3) continue;      // 板の上に載らない
          if (land > on.tout - 0.3) break;          // 板を突き抜けて向こうへ落ちる
          // 身体が輪郭に触れるまでに、足が板の高さへ届いていなければならない
          if (heightAt(vy, body.tin / vh) < R) continue;
          const charge = Math.hypot(vy, vh) / LAUNCH_SPEED;
          const tilt = Math.atan2(vh, vy);
          if (charge > 1 || tilt > PUMP.leanMax) continue;
          if (!best || charge < best.charge) best = { vy, vh, charge, tilt, land };
        }
      }
      if (!best) {
        return { ok: false, reason: 'no-arc', dist: +dist.toFixed(2), clear: +body.tin.toFixed(2) };
      }
      player.aimTilt = best.tilt;
      player.aimX = ux;
      player.aimZ = uz;
      player.vel.set(ux * best.vh, best.vy, uz * best.vh);
      player.launchH = best.vh;
      player.grounded = false;
      player.groundSolid = null;
      player.pumpHeld = false;
      player.pumpCharge = 0;
      return {
        ok: true, tier: i, charge: +best.charge.toFixed(3), tilt: +best.tilt.toFixed(3),
        dist: +dist.toFixed(2), clear: +body.tin.toFixed(2), land: +best.land.toFixed(2),
      };
    },
    // 今の位置から目標へ、頂点が over だけ上を通るように解いて発射する。
    // over=0 なら頂点＝目標。板の厚さで頭をぶつけないには、足が板の高さに達してから
    // 縁を越える必要があるので、検査では over を渡して「届いてから落ちる」解を解かせる
    launchTo(x, y, z, over = 0) {
      const rise = y + over - player.pos.y;
      if (rise <= 0.05) return { ok: false, reason: 'not-above' };
      const vy = Math.sqrt(2 * PHYS.gravity * rise);
      const t = vy / PHYS.gravity + Math.sqrt((2 * over) / (PHYS.gravity * PHYS.fastFall));
      const d = Math.hypot(x - player.pos.x, z - player.pos.z);
      const vh = d / t;
      const speed = Math.hypot(vy, vh);
      const tilt = Math.atan2(vh, vy);
      const charge = speed / LAUNCH_SPEED;
      if (charge > 1.001) return { ok: false, reason: 'too-far', charge: +charge.toFixed(3), tilt: +tilt.toFixed(3) };
      if (tilt > PUMP.leanMax + 0.001) return { ok: false, reason: 'too-steep', charge: +charge.toFixed(3), tilt: +tilt.toFixed(3) };
      player.aimTilt = tilt;
      player.aimX = d < 0.01 ? 0 : (x - player.pos.x) / d;
      player.aimZ = d < 0.01 ? 0 : (z - player.pos.z) / d;
      player.vel.set(player.aimX * vh, vy, player.aimZ * vh);
      player.launchH = vh;
      player.grounded = false;
      player.groundSolid = null;
      player.pumpHeld = false;
      player.pumpCharge = 0;
      return { ok: true, charge: +charge.toFixed(3), tilt: +tilt.toFixed(3), rise: +(y - player.pos.y).toFixed(2), apex: +rise.toFixed(2), reach: +d.toFixed(2) };
    },
    // いま押されているキー。入力の検査用
    heldKeys: () => [...keys],
    hoverState: () => ({ ...hoverDbg }),
    renderer: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
  },
};

requestAnimationFrame(frame);
