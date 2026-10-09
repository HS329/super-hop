// itch.ioの表紙（630×390の2倍 = 1260×780）とgallery用の、HUDなしの画面を作る補助スクリプト
// 実際のゲーム画面を、計器類を隠した状態でそのまま撮る
import { chromium } from '@playwright/test';

const BASE = process.env.HOP_URL || 'http://127.0.0.1:5175/platformer/';
const browser = await chromium.launch({
  executablePath: process.env.HOP_BROWSER || undefined,
  headless: true,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
});
// itch.ioのカード比率（630:390）そのままの解像度で撮る
const page = await browser.newPage({ viewport: { width: 1260, height: 780 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__HOP__);
await page.locator('#start').click();
await page.waitForTimeout(500);
// 計器もヒントも消して、景色だけ残す
await page.evaluate(() => {
  for (const sel of ['#hud', '#hint', '#toast', '#flash']) {
    const el = document.querySelector(sel);
    if (el) el.style.display = 'none';
  }
});

const route = await page.evaluate(() => window.__HOP__.debug.route());
const tiers = await page.evaluate(() => window.__HOP__.debug.tiers());

const shots = [
  // [名前, 本道の何番目, 見上げる(+)/見下ろす(−)の角度, カメラ距離]
  ['cover-climb', 8, 0.34, 17],     // 浮島の帯。次へ続く足場が画面奥に並ぶ
  ['cover-town', 0, 0.62, 22],      // 地面から見上げる、町から塔までまるごと
  ['cover-overlook', route.length - 1, -0.5, 24],  // 頂上から眼下の町
];
for (const [name, hop, pitch, dist] of shots) {
  const at = hop === 0
    ? { x: -14, y: (await page.evaluate(() => window.__HOP__.snapshot().groundY)), z: 26 }
    : tiers[route[hop]];
  const next = tiers[route[Math.min(hop + 1, route.length - 1)]];
  const yaw = Math.atan2(at.x - next.x, at.z - next.z);
  await page.evaluate(v => {
    window.__HOP__.debug.teleport(v.x, v.y + 0.05, v.z);
    window.__HOP__.debug.setCamera(v.yaw, v.pitch, v.dist);
  }, { ...at, yaw, pitch, dist });
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `artifacts/hop-${name}.png` });
  console.log(`  hop-${name}.png  高度=${at.y}m`);
}
await browser.close();
console.log('done');
