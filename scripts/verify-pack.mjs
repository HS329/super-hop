// 単体に組み出した SUPER HOP フォルダーが、それだけで起動・登れることを確認する
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const BASE = process.env.PACK_URL || 'http://127.0.0.1:5177';
const browser = await chromium.launch({
  executablePath: process.env.PACK_BROWSER
    || undefined,
  headless: true,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`http ${r.status()} ${r.url()}`); });
  const snap = () => page.evaluate(() => window.__HOP__.snapshot());

  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__HOP__, null, { timeout: 20000 });
  const boot = await snap();
  assert.equal(boot.mode, 'menu', 'title screen');
  assert.equal(boot.world, 'skyward', 'the crafted world is the one that boots');
  assert.ok(boot.solids >= 40, 'the world is built');
  assert.ok(boot.tiers >= 40, 'the pads are all there');
  assert.ok(boot.route >= 20, 'the main route is intact');
  assert.ok(boot.topHeight > 78, `the summit is at the top of the world: ${boot.topHeight}`);
  assert.ok(boot.coinsLeft > 90, 'the world is stocked with coins');
  assert.ok(boot.groundY < 0 && boot.plainHalf >= 50, 'the world stands on a plain you can fall onto');
  assert.ok(boot.tutorial >= 5, 'the ground-level tutorial is part of the packed build');

  await page.locator('#start').click();
  assert.equal((await snap()).mode, 'playing', 'playing');
  const home = (await snap()).spawn;
  assert.ok(Math.abs(home.y - boot.groundY) < 0.3, 'the game starts on the ground, not on the tower');

  // 歩いて移動できる（画面基準の移動と衝突が生きている）
  const before = await snap();
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  await page.keyboard.up('w');
  await page.keyboard.up('ShiftLeft');
  const walked = await snap();
  assert.ok(Math.hypot(walked.player.x - before.player.x, walked.player.z - before.player.z) > 3,
    'walking actually moves the player across the plain');

  // ポンプで打ち上がる（チャージ→発射→17m→着地が、単体フォルダーだけで動いている）
  await page.waitForFunction(() => window.__HOP__.snapshot().player.grounded, null, { timeout: 5000 });
  await page.keyboard.down('e');
  // 待った時間ではなく、満タンになった事実で待つ（headlessは実行速度が揺れる）
  await page.waitForFunction(() => window.__HOP__.snapshot().pump.charge >= 0.99, null, { timeout: 10000 });
  const charged = await snap();
  await page.keyboard.up('e');
  const flight = await page.evaluate(async () => {
    const H = window.__HOP__;
    let top = -1e9, peak = 0;
    for (let i = 0; i < 260; i++) {
      const s = H.snapshot();
      top = Math.max(top, s.player.y);
      peak = Math.max(peak, s.maxHeight);
      if (s.player.grounded && s.player.y < 1 && i > 30) break;
      await new Promise(r => requestAnimationFrame(r));
    }
    return { top, peak };
  });
  assert.ok(charged.pump.charge >= 0.99, 'holding E charges the pump');
  assert.ok(flight.top - walked.player.y > 16 && flight.top - walked.player.y < 18.5,
    `a full pump climbs about 17 m: ${flight.top - walked.player.y}`);

  // ホバリング: 空中でQを押し続けている間だけ落下が止まる。単体フォルダーでも同じ
  const hoverFrom = await page.evaluate(() => {
    const p = window.__HOP__.snapshot().player;
    return window.__HOP__.debug.launchTo(p.x, p.y + 14, p.z);
  });
  assert.ok(hoverFrom.ok, `the packed build can launch straight up: ${JSON.stringify(hoverFrom)}`);
  await page.keyboard.down('q');
  await page.waitForTimeout(300);
  const hov = await snap();
  await page.keyboard.up('q');
  assert.ok(hov.hover.active && !hov.hover.available, 'the hover works in the packed build too');
  assert.ok(hov.player.vy > -2.5, `and it holds the fall: vy=${hov.player.vy}`);
  await page.waitForFunction(() => window.__HOP__.snapshot().player.grounded, null, { timeout: 12000 });
  assert.ok((await snap()).hover.available, 'landing gives the hover back');

  const drawn = await page.evaluate(() => window.__HOP__.debug.renderer());
  assert.ok(drawn.calls > 10 && drawn.triangles > 5000, 'renders');
  await page.screenshot({ path: 'artifacts/hop-packed.png' });

  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: 単体フォルダーだけで起動・面の生成（地面とチュートリアルを含む）・歩行・ポンプ17m・ホバリング・描画。JSエラー/404なし。');
} finally {
  await browser.close();
}
