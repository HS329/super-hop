// ホバリングが実戦で何m分けてくれるのかを測る補助プローブ（verify-hopは規則を確認するもの、これは手応えの計測）
// 広場から同じ一発を二度撃ち、一度だけ頂点で1秒ホバリングして、届く距離と最高高度を比べる
import { chromium } from '@playwright/test';

const BASE = process.env.HOP_URL || 'http://127.0.0.1:5175/platformer/';
const browser = await chromium.launch({
  executablePath: process.env.HOP_BROWSER || undefined,
  headless: true,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__HOP__);
await page.locator('#start').click();
await page.waitForTimeout(500);

async function bigHop(hoverAt) {
  // 町の台地の中央に立ち、そこから14m先・高さ1mを3m越える扁平な弧で撃つ
  await page.evaluate(() => window.__HOP__.debug.teleport(0, 0.05, 0));
  await page.waitForFunction(() => window.__HOP__.snapshot().player.grounded, null, { timeout: 6000 });
  await page.waitForTimeout(300);
  const shot = await page.evaluate(() => {
    const H = window.__HOP__;
    const p = H.snapshot().player;
    return H.debug.launchTo(p.x + 14, p.y + 1, p.z, 3);
  });
  if (!shot.ok) return { shot };
  if (hoverAt !== null) {
    // 上昇が止まったところ＝頂点で息をつく
    await page.waitForFunction(v => window.__HOP__.snapshot().player.vy < v, hoverAt, { timeout: 6000 });
    await page.keyboard.down('q');
    await page.waitForTimeout(1000);
    await page.keyboard.up('q');
  }
  const trace = await page.evaluate(async () => {
    const H = window.__HOP__;
    let top = -1e9, far = 0;
    for (let i = 0; i < 400; i++) {
      const s = H.snapshot();
      top = Math.max(top, s.player.y);
      far = Math.max(far, Math.hypot(s.player.x, s.player.z));
      if (s.player.grounded && i > 20) break;
      await new Promise(r => requestAnimationFrame(r));
    }
    const s = H.snapshot();
    return { top: +top.toFixed(1), far: +far.toFixed(1), land: { x: +s.player.x.toFixed(1), y: +s.player.y.toFixed(1), z: +s.player.z.toFixed(1) } };
  });
  return { charge: shot.charge, ...trace };
}

const plain = await bigHop(null);
const glided = await bigHop(1.0);
console.log('そのまま   :', JSON.stringify(plain));
console.log('ホバリング:', JSON.stringify(glided));
if (plain.far && glided.far) {
  console.log(`→ 届く距離 +${(glided.far - plain.far).toFixed(1)}m  /  最高高度 ${(glided.top - plain.top).toFixed(1)}m 差`);
  console.log('  （ホバリングは高さではなく、届きを増やす道具）');
}
await browser.close();
