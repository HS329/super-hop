// 「そらへのぼる町」の景色写真。検証は verify-hop.mjs が撮るので、これは見栄え用の補助。
// 地上のチュートリアルから本道を登りながら帯（町・浮島・岩・雲）ごとに一枚、罠の近くで一枚ずつ撮る
import { chromium } from '@playwright/test';

const BASE = process.env.HOP_URL || 'http://127.0.0.1:5175/platformer/';
const browser = await chromium.launch({
  executablePath: process.env.HOP_BROWSER || undefined,
  headless: true,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__HOP__);
await page.locator('#start').click();
await page.waitForTimeout(500);

const snap = () => page.evaluate(() => window.__HOP__.snapshot());
const route = await page.evaluate(() => window.__HOP__.debug.route());
const tiers = await page.evaluate(() => window.__HOP__.debug.tiers());
const top = tiers[route[route.length - 1]];
const tut = tiers.filter(t => t.tut);

const pose = async (at, yaw, pitch, dist, wait = 900) => {
  await page.evaluate(v => {
    window.__HOP__.debug.teleport(v.x, v.y + 0.05, v.z);
    window.__HOP__.debug.setCamera(v.yaw, v.pitch, v.dist);
  }, { ...at, yaw, pitch, dist });
  await page.waitForTimeout(wait);
};

// 庭先に始まるチュートリアル。地面から5つの足場を渡って、そのまま町に入っていく
if (tut.length) {
  const spawn = (await snap()).spawn;
  const first = tut[0];
  const yaw = Math.atan2(spawn.x - first.x, spawn.z - first.z);
  await pose({ x: spawn.x, y: spawn.y - 0.05, z: spawn.z }, yaw, 0.3, 15);
  await page.screenshot({ path: 'artifacts/hop-view-tutorial.png' });
  console.log(`  hop-view-tutorial.png  地面=${spawn.y}m から ${tut.length}個の足場`);
}

// 本道の何番目に立つか → その高度でどんな景色が見えるか
const shots = [
  ['a-town', 0, 0.05, 18],       // 広場と、庭先に散らばった木箱と樽
  ['b-roofs', 3, 0.3, 15],       // 家根と切り株を渡る町の中層
  ['c-islands', 8, 0.45, 14],    // 浮島と板渡し
  ['d-rocks', 14, 0.6, 13],      // 岩棚と尖岩
  ['e-clouds', 19, 0.75, 12],    // 雲の足場
  ['f-summit', route.length - 1, 0.2, 13],  // 頂上の旗
];
for (const [name, hop, pitch, dist] of shots) {
  // 広場から始まるので、最初の一枚は台地の上に立つ
  const at = hop === 0
    ? { x: 0, y: 0, z: 6 }
    : (await page.evaluate(n => window.__HOP__.debug.padPos(n), route[hop])) || tiers[route[hop]];
  // 常に、次へ登る方向を画面の奥に見せる構図
  const next = tiers[route[Math.min(hop + 1, route.length - 1)]];
  const yaw = Math.atan2(at.x - next.x, at.z - next.z);
  await pose(at, yaw, pitch, dist);
  await page.screenshot({ path: `artifacts/hop-view-${name}.png` });
  console.log(`  hop-view-${name}.png  hop=${hop} 高度=${at.y}m`);
}

// ホバリング。空中で息をついている、いちばん長い一瞬
// 頂上に立つとゴール判定になってしまうので、地面からやり直してから撮る
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !!window.__HOP__);
await page.locator('#start').click();
await page.waitForTimeout(600);
const open = { x: 0, z: -30 };
await page.evaluate(v => {
  window.__HOP__.debug.teleport(v.x, v.y, v.z);
  window.__HOP__.debug.setCamera(Math.PI, 0.12, 14);
}, { ...open, y: (await snap()).groundY + 0.05 });
await page.waitForFunction(() => window.__HOP__.snapshot().player.grounded, null, { timeout: 10000 });
await page.waitForTimeout(400);
const shot = await page.evaluate(v => window.__HOP__.debug.launchTo(v.x, v.y + 14, v.z), { ...open, y: (await snap()).groundY });
console.log(`  hover shot launch: ${JSON.stringify(shot)} mode=${(await snap()).mode}`);
await page.waitForFunction(() => window.__HOP__.snapshot().player.vy < 1, null, { timeout: 8000 });
await page.keyboard.down('d');
await page.keyboard.down('q');
await page.waitForTimeout(450);
const hov = await snap();
await page.screenshot({ path: 'artifacts/hop-view-hover.png' });
console.log(`  hop-view-hover.png  高度=${hov.height}m active=${hov.hover.active} 残り=${(1 - hov.hover.used).toFixed(2)}s`);
await page.keyboard.up('q');
await page.keyboard.up('d');

// 罠の近くで、当たり判定が見える一枚ずつ
const blink = tiers.find(t => t.trap === 'blinker') || tiers.find(t => t.kind === 'cloud');
if (blink) {
  await pose(blink, Math.PI * 0.5, 0.35, 16, 700);
  await page.screenshot({ path: 'artifacts/hop-view-blinker.png' });
  console.log(`  hop-view-blinker.png  高度=${blink.y}m`);
}
const move = tiers.find(t => t.trap === 'mover');
if (move) {
  await pose(move, Math.PI * 1.2, 0.4, 15, 700);
  await page.screenshot({ path: 'artifacts/hop-view-mover.png' });
  console.log(`  hop-view-mover.png  高度=${move.y}m`);
}
// 眼下に町を望む、頂上からの一枚
await pose(top, 0, -0.55, 22);
await page.screenshot({ path: 'artifacts/hop-view-overlook.png' });
console.log(`  hop-view-overlook.png  頂上=${top.y}m`);

await browser.close();
console.log('done');
