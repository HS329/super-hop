// SUPER HOP — キャラクターと小道具。すべて three.js のプリミティブだけで組み立てる。
import * as THREE from 'three';

const cache = new Map();
export function mat(hex, opts = {}) {
  const key = hex + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshLambertMaterial({ color: hex, ...opts });
  cache.set(key, m);
  return m;
}
const goldMat = new THREE.MeshStandardMaterial({ color: '#ffd24a', emissive: '#a06a00', emissiveIntensity: 0.45, metalness: 0.55, roughness: 0.32 });
const goldCore = new THREE.MeshStandardMaterial({ color: '#e0a41c', emissive: '#7a4a00', emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.4 });

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function ball(r, material, x = 0, y = 0, z = 0, seg = 18) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1)), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* ------------------------------------------------------------------ */
/* 主人公: 赤い帽子とサロペットのジャンプ職人（足元 y=0 / 全長 約1.7） */
/* ------------------------------------------------------------------ */
export function createHero() {
  const skin = mat('#f4cba2'), skinShade = mat('#dfaa80'), red = mat('#e0392f'), blue = mat('#2f62c9');
  const brown = mat('#5d3418'), dark = mat('#26262a'), white = mat('#f7f7f7');

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // 脚（脚付け根を軸に回す）
  const legL = new THREE.Group();
  legL.position.set(-0.17, 0.52, 0);
  legL.add(box(0.2, 0.5, 0.24, blue, 0, -0.25, 0));
  legL.add(box(0.24, 0.16, 0.36, brown, 0, -0.52, 0.05));
  const legR = legL.clone();
  legR.position.x = 0.17;
  body.add(legL, legR);

  // 胴体
  body.add(box(0.6, 0.62, 0.4, blue, 0, 0.86, 0));
  body.add(box(0.62, 0.22, 0.42, red, 0, 1.12, 0));
  body.add(box(0.14, 0.34, 0.06, blue, -0.2, 1.2, 0.2));
  body.add(box(0.14, 0.34, 0.06, blue, 0.2, 1.2, 0.2));
  body.add(ball(0.05, goldMat, -0.2, 1.06, 0.21, 10));
  body.add(ball(0.05, goldMat, 0.2, 1.06, 0.21, 10));

  // 腕（肩を軸に回す）
  const armL = new THREE.Group();
  armL.position.set(-0.34, 1.16, 0);
  armL.add(box(0.16, 0.4, 0.16, red, 0, -0.2, 0));
  armL.add(ball(0.12, skin, 0, -0.44, 0.02, 12));
  const armR = armL.clone();
  armR.position.x = 0.34;
  body.add(armL, armR);

  // 頭
  const head = new THREE.Group();
  head.position.set(0, 1.38, 0);
  head.add(ball(0.3, skin));
  head.add(ball(0.09, skinShade, 0, -0.02, 0.29, 12));
  head.add(box(0.28, 0.08, 0.07, brown, 0, -0.13, 0.26));
  head.add(ball(0.055, white, -0.11, 0.05, 0.25, 10));
  head.add(ball(0.055, white, 0.11, 0.05, 0.25, 10));
  head.add(ball(0.028, dark, -0.11, 0.05, 0.29, 8));
  head.add(ball(0.028, dark, 0.11, 0.05, 0.29, 8));
  head.add(box(0.1, 0.05, 0.06, brown, -0.13, 0.13, 0.26));
  head.add(box(0.1, 0.05, 0.06, brown, 0.13, 0.13, 0.26));
  head.add(box(0.12, 0.16, 0.16, brown, -0.27, -0.02, 0.02));
  head.add(box(0.12, 0.16, 0.16, brown, 0.27, -0.02, 0.02));

  // 帽子
  const cap = new THREE.Group();
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), red);
  capTop.position.y = 0.05;
  capTop.castShadow = true;
  cap.add(capTop);
  cap.add(box(0.34, 0.06, 0.26, red, 0, 0.06, 0.24));
  cap.add(ball(0.07, white, 0, 0.19, 0.21, 10));
  head.add(cap);
  body.add(head);

  // 背中のポンプ（サンシャインのポンプをイメージ）。タンク＋充填ゲージ＋ホース＋下向きノズル。
  // ゲージの光量は main.js がチャージ量で動かすので、マテリアルは共有キャッシュを使わない。
  const pump = new THREE.Group();
  const pumpGlow = new THREE.MeshStandardMaterial({ color: '#1d4f6b', emissive: '#5fd8e8', emissiveIntensity: 0.08, roughness: 0.5, metalness: 0.1 });
  const steel = mat('#8d939c');
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.62, 16), mat('#3f7fa8'));
  tank.position.set(0, 1.0, -0.34);
  const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.215, 0.3, 16), pumpGlow);
  gauge.position.set(0, 0.92, -0.34);
  const tankCap = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ffd24a'));
  tankCap.position.set(0, 1.31, -0.34);
  const hoseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.05, 1.28, -0.3),
    new THREE.Vector3(0.3, 1.12, -0.48),
    new THREE.Vector3(0.24, 0.78, -0.52),
    new THREE.Vector3(0.06, 0.6, -0.44),
  ]);
  const hose = new THREE.Mesh(new THREE.TubeGeometry(hoseCurve, 22, 0.05, 6, false), mat('#2c3e50'));
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 12), steel);
  nozzle.rotation.x = Math.PI; // 先端を下に向けて噴射の推力方向を見せる
  nozzle.position.set(0.05, 0.48, -0.42);
  pump.add(tank, gauge, tankCap, hose, nozzle);
  body.add(pump);

  return { root, body, legL, legR, armL, armR, head, cap, pump, pumpGlow, nozzle };
}

/* ------------------------------------------------------------------ */
/* コイン（縦に立った円盤）                                            */
/* ------------------------------------------------------------------ */
export function createCoin() {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 18), goldMat);
  disc.rotation.z = Math.PI / 2;
  disc.castShadow = true;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 18), goldCore);
  core.rotation.z = Math.PI / 2;
  group.add(disc, core);
  return { group, disc };
}

/* ------------------------------------------------------------------ */
/* 頂上の旗                                                            */
/* ------------------------------------------------------------------ */
export function createFlagpole(flagTexture) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 8, 12), mat('#dfe6ee'));
  pole.position.y = 4;
  pole.castShadow = true;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), goldMat);
  orb.position.y = 8.1;
  orb.castShadow = true;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 18), mat('#8f97a1'));
  base.position.y = 0.25;
  base.castShadow = true;
  base.receiveShadow = true;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.25), new THREE.MeshLambertMaterial({ map: flagTexture, side: THREE.DoubleSide }));
  flag.position.set(-1.05, 6.9, 0);
  flag.rotation.y = -Math.PI / 2;
  group.add(pole, orb, base, flag);
  return { group, flag };
}

/* ------------------------------------------------------------------ */
/* 罠: 火の玉バー（柱の頂上で火の玉が円を描いて回転する）             */
export function createFirebar(height, count, radius) {
  const group = new THREE.Group();
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.66, 0.3, 16), mat('#59636e'));
  foot.position.y = 0.15;
  foot.castShadow = true;
  foot.receiveShadow = true;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, height, 12), mat('#6f7a86'));
  pole.position.y = height / 2;
  pole.castShadow = true;
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 10), mat('#3b424b'));
  hub.position.y = height;
  hub.castShadow = true;

  const arm = new THREE.Group();
  arm.position.y = height;
  const spokeMat = new THREE.MeshLambertMaterial({ color: '#4a525c' });
  const coreMat = new THREE.MeshLambertMaterial({ color: '#ff8a2b', emissive: '#ff5a10', emissiveIntensity: 0.95 });
  const haloMat = new THREE.MeshBasicMaterial({ color: '#ffb14a', transparent: true, opacity: 0.26, depthWrite: false });
  const cores = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(radius, 0.08, 0.08), spokeMat);
    spoke.position.set(Math.cos(a) * radius * 0.5, 0, Math.sin(a) * radius * 0.5);
    spoke.rotation.y = -a;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), coreMat);
    core.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    core.castShadow = true;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 10), haloMat);
    core.add(halo);
    arm.add(spoke, core);
    cores.push(core);
  }

  group.add(foot, pole, hub, arm);
  // cores は当たり判定が「見えている火の玉」とズレないように実体を渡す
  return { group, arm, cores, coreRadius: 0.3 };
}

/* 罠: 消える足場（周期で実体化／消滅する） */
export function createBlinkPlatform(w, d = w) {
  const group = new THREE.Group();
  const face = new THREE.MeshLambertMaterial({ color: '#8ff0e0', emissive: '#1d6f7a', emissiveIntensity: 0.55, transparent: true, opacity: 0.95 });
  const side = new THREE.MeshLambertMaterial({ color: '#49c3bd', emissive: '#12545c', emissiveIntensity: 0.4, transparent: true, opacity: 0.9 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.45, d), [side, side, face, side, side, side]);
  deck.position.y = -0.225;
  deck.castShadow = true;
  deck.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.08, d + 0.14), new THREE.MeshBasicMaterial({ color: '#e8fffb', transparent: true, opacity: 0.45, depthWrite: false }));
  rim.position.y = 0.02;
  group.add(deck, rim);
  return { group, mats: [face, side, rim.material] };
}
