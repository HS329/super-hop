import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const BASE = process.env.HOP_URL || 'http://127.0.0.1:5175/platformer/';
const browser = await chromium.launch({ executablePath: process.env.HOP_BROWSER || undefined, headless: true, args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [];
page.on('pageerror', e => errors.push(e.message));
const snap = () => page.evaluate(() => window.__HOP__.snapshot());
const tiers = () => page.evaluate(() => window.__HOP__.debug.tiers());
const routeOf = () => page.evaluate(() => window.__HOP__.debug.route());
const boot = async url => { await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.__HOP__); };

// その座標に置いて、足場に着地して静止するまで待つ
const stand = async (x, y, z) => {
  await page.evaluate(v => window.__HOP__.debug.teleport(v[0], v[1], v[2]), [x, y, z]);
  await page.waitForFunction(() => window.__HOP__.snapshot().player.grounded, null, { timeout: 8000 });
  await page.waitForTimeout(200);
};

// 発射から着地（または谷底への落下）まで、最高点と水平到達距離を追跡する
const flightTrace = from => page.evaluate(async v => {
  const H = window.__HOP__;
  let top = v.y, far = 0;
  for (let i = 0; i < 700; i++) {
    const s = H.snapshot();
    top = Math.max(top, s.player.y);
    far = Math.max(far, Math.hypot(s.player.x - v.x, s.player.z - v.z));
    if (s.player.y < -13.5 || s.mode !== 'playing') break;
    if (s.player.grounded && i > 20) break;
    await new Promise(r => requestAnimationFrame(r));
  }
  return { rise: +(top - v.y).toFixed(2), reach: +far.toFixed(2) };
}, from);

try {
  await boot(BASE);
  assert.equal((await snap()).mode, 'menu', 'Title screen boots');
  await page.screenshot({ path: 'artifacts/hop-title.png' });

  /* ---------- 面：ひとつだけ作りこんだ、町から始まる長い登り ---------- */
  const menu = await snap();
  const home = menu.spawn;
  const stages = await tiers();
  const route = await routeOf();
  assert.ok(home && Number.isFinite(home.y), 'The world reports where the climb starts');
  assert.equal(menu.world, 'skyward', 'There is exactly one world, and it is the crafted one');
  assert.ok(route.length >= 20, `The main route is a long climb: ${route.length} hops`);
  assert.ok(stages.length >= 35, `The world is full of things to land on: ${stages.length} pads`);
  assert.ok(stages.filter(s => s.side).length >= 5, 'Side branches hang off the main route');
  assert.ok(stages.every(s => s.hx > 0 && s.hz > 0), 'Every pad reports its footprint for the climb test');
  assert.ok(menu.solids > 30, 'The pads are real collision solids');
  assert.ok(menu.coinsLeft > 60, `Coins trace the routes: ${menu.coinsLeft}`);
  assert.ok(menu.topHeight > 75, `The summit is high above the town: ${menu.topHeight} m`);
  assert.ok(Math.abs(menu.pump.maxHeight - 17) < 0.001, 'A full pump charge is sized for ten character heights');
  assert.equal(await page.locator('#life-count').count(), 0, 'There is no life counter any more');
  assert.equal(await page.locator('#over').count(), 0, 'There is no game-over screen any more');
  assert.ok(await page.locator('#height-count').isVisible() === false, 'HUD is hidden on the title screen');

  // 本道は下から上へ、高度が上がっていく順になっている
  const routeStages = route.map(i => stages[i]);
  for (let i = 1; i < routeStages.length; i++) {
    assert.ok(routeStages[i].y > routeStages[i - 1].y, `Route hop ${i} climbs higher`);
  }
  assert.equal(routeStages[routeStages.length - 1].kind, 'top', 'The route ends on the summit');

  // 面の名前と紹介。難易度ではなく、この面そのものの話である
  assert.ok((await page.locator('#world-tag').textContent()).includes('そらへのぼる町'), 'The title screen names the world');
  assert.ok((await page.locator('#world-brief').textContent()).includes('Hop'), 'The title screen states the climb length');
  assert.equal(await page.locator('#diff-select').count(), 0, 'There is no difficulty selector any more');

  /* ---------- 罠と風：この面に入っているもの ---------- */
  // 火の玉はこの面から外した。落ちること自体が罰なので、落とすきっかけだけを置く
  assert.equal(menu.hazards, undefined, 'The spinning fireballs are gone');
  assert.equal(await page.evaluate(() => typeof window.__HOP__.debug.hazardBars), 'undefined', 'Nothing left to draw a hit for');
  assert.equal(menu.blinkers, 3, 'The world has disappearing platforms');
  assert.equal(menu.movers, 3, 'The world has moving platforms');
  assert.ok(menu.wind.strength > 0, 'The world blows wind');

  /* ---------- 登りは地面から始まる：はじめは落ちる場所のない地面 ---------- */
  assert.ok(menu.groundY < 0, `There is real ground under the town: y=${menu.groundY}`);
  assert.ok(menu.plainHalf >= 50, `The ground is wide enough to walk on: ${menu.plainHalf} m half-side`);
  assert.ok(Math.abs(home.y - menu.groundY) < 0.3, 'The run starts standing on the ground, not on the town square');
  assert.ok(Math.hypot(home.x, home.z) + 1 < menu.plainHalf, 'The start is well inside the edge of the ground');
  assert.ok(menu.tutorial >= 5, `The climb starts with a ground-level tutorial path: ${menu.tutorial} pads`);
  // チュートリアルはすべて地面の上。落ちても地面に立つので、はじめは落ちる場所がない
  const tutStages = menu.tutorial ? stages.filter(s => s.tut) : [];
  assert.ok(tutStages.length >= 5, 'The tutorial pads are listed with the rest of the world');
  for (const t of tutStages) {
    assert.ok(Math.abs(t.y - menu.groundY) < 4, `Tutorial pad ${t.i} sits on the ground, not in the air`);
  }

  await page.locator('#start').click();
  assert.equal((await snap()).mode, 'playing', 'Start enters play');
  assert.ok(await page.locator('#hud').isVisible(), 'HUD appears in play');
  assert.ok(await page.locator('#wind-mark').isVisible(), 'The wind gauge shows up because this world has wind');
  assert.ok((await page.locator('#hint').textContent()).includes('ポンプ'), 'The footer hint teaches the pump, not the jump');

  /* ---------- ジャンプは存在しない：スペースを叩いても何も起きない ---------- */
  await stand(home.x, home.y, home.z);
  const tapBefore = await snap();
  await page.keyboard.press('Space');
  await page.waitForTimeout(220);
  const tapAfter = await snap();
  assert.ok(tapAfter.player.grounded, 'Tapping the jump key does not leave the ground');
  assert.ok(Math.abs(tapAfter.player.y - tapBefore.player.y) < 0.05, 'There is no jump: the feet stay put');
  assert.ok(tapAfter.pump.charge < 0.01, 'A tap is too short to charge the pump');

  /* ---------- ポンプ：長押しで満タン、離すと17m ---------- */
  await page.keyboard.down('e');
  // headlessでは実行速度が揺れるので、「待った時間」ではなく満タンになった事実で待つ
  await page.waitForFunction(() => window.__HOP__.snapshot().pump.charge >= 0.99, null, { timeout: 10000 });
  const charged = await snap();
  assert.ok(charged.pump.charge >= 0.99, 'Holding E charges the pump to full');
  assert.ok(charged.pump.held, 'The pump reports that it is being held');
  await page.keyboard.up('e');
  const straight = await flightTrace(charged.player);
  assert.ok(straight.rise > 16 && straight.rise < 18.5, `A full charge climbs about ten character heights: ${straight.rise} m`);
  // 真上に撃つと、横へ進むのは風だけ。この面は風が常にかかっているので、
  // 真っすぐな打ち上げでもこれくらいは流れる（風が力になっている証拠）
  assert.ok(straight.reach < 4, `A straight-up launch does not travel sideways on its own: ${straight.reach} m`);
  await page.screenshot({ path: 'artifacts/hop-pump.png' });

  /* ---------- 横へ飛ぶ：溜めている間は足が止まり、体を倒して方向を付ける ---------- */
  // 広場の外側へ倒して撃つ。横へ飛んで横の足場に乗れることが、この面の遊び方
  await page.evaluate(() => window.__HOP__.debug.setCamera(0, 0.35, 13));
  await stand(home.x, home.y, home.z);
  const aimBefore = await snap();
  await page.keyboard.down('e');
  await page.waitForFunction(() => window.__HOP__.snapshot().pump.charge > 0.2, null, { timeout: 10000 });
  const lowCharge = await snap();
  assert.ok(lowCharge.pump.charge > 0.2 && lowCharge.pump.charge < 0.5, 'The charge grows with how long the pump is held');
  // 軌道のラインガイドは廃止した。届くかどうかは、撃って確かめるものになった
  assert.equal(await page.evaluate(() => typeof window.__HOP__.debug.aimPreview), 'undefined', 'The trajectory guide is gone');
  await page.keyboard.down('w');
  await page.waitForTimeout(400);
  const aiming = await snap();
  assert.ok(Math.abs(aiming.player.x - aimBefore.player.x) < 0.05 && Math.abs(aiming.player.z - aimBefore.player.z) < 0.05,
    'Charging holds the feet in place instead of walking');
  assert.ok(aiming.player.aimTilt > 0.5, `Holding a direction while charging leans the body: ${aiming.player.aimTilt} rad`);
  await page.screenshot({ path: 'artifacts/hop-aim.png' });
  await page.keyboard.up('e');
  await page.keyboard.up('w');
  const leaned = await flightTrace(aiming.player);
  assert.ok(leaned.rise < 9, `Leaning trades height for range: only ${leaned.rise} m up`);
  assert.ok(leaned.reach > 12, `…and it reaches far sideways: ${leaned.reach} m`);

  /* ---------- 落ちても死なない。いちばん下の地面に、ただ立つ ---------- */
  await page.waitForFunction(() => window.__HOP__.snapshot().player.grounded, null, { timeout: 20000 });
  const beforeFall = await snap();
  // 塔の真上、何の足場もない空気中に置いて、そのまま落ちさせる。
  // 戻されるのではなく、地面まで落ちて、そこに立つ
  await page.evaluate(v => window.__HOP__.debug.teleport(v[0], 24, v[1]), [home.x, home.z]);
  await page.waitForFunction(() => {
    const s = window.__HOP__.snapshot();
    return s.player.grounded && s.player.y < s.groundY + 0.5;
  }, null, { timeout: 15000 });
  const afterFall = await snap();
  assert.equal(afterFall.mode, 'playing', 'Falling out of the tower does not end the run');
  assert.ok(Math.abs(afterFall.player.y - afterFall.groundY) < 0.2, `The player ends up standing on the ground: y=${afterFall.player.y}`);
  assert.ok(Math.abs(afterFall.player.x - home.x) < 2 && Math.abs(afterFall.player.z - home.z) < 2,
    'No teleport: the player fell where they were put, and landed there');
  assert.ok(afterFall.falls > beforeFall.falls, 'Losing that much height is still counted');
  assert.ok((await page.locator('#fall-count').textContent()).includes(String(afterFall.falls)), 'The HUD counts the fall');
  await page.screenshot({ path: 'artifacts/hop-fall.png' });

  /* ---------- 地面の縁から落ちた時だけ、いちばん近い地面に戻る ---------- */
  const beforeEdge = await snap();
  await page.evaluate(g => window.__HOP__.debug.teleport(g * 1.15, -6, 0), beforeEdge.plainHalf);
  await page.waitForFunction(v => window.__HOP__.snapshot().falls > v, beforeEdge.falls, { timeout: 8000 });
  const afterEdge = await snap();
  assert.equal(afterEdge.mode, 'playing', 'Falling off the edge of the world still does not end the run');
  assert.ok(Math.hypot(afterEdge.player.x, afterEdge.player.z) <= afterEdge.plainHalf + 0.5, 'Back inside the edge of the ground');
  assert.ok(Math.abs(afterEdge.player.y - afterEdge.groundY) < 0.3, 'Put back on the nearest ground, not at the start point');

  /* ---------- チュートリアル: 地面から、ポンプだけで足場を渡って町に出られる ---------- */
  const tutPads = stages.filter(s => s.tut);
  assert.ok(tutPads.length >= 5, 'There is a tutorial path to walk');
  await stand(home.x, home.y + 0.05, home.z);
  for (const t of tutPads) {
    // 前の足場の中心から、次の足場そのものへ届く軌道を解いて発射させる。
    // hopTo は「板の輪郭を板の高さより上で越えてから落ちる」軌道しか解かないので、
    // ここが通れば頭をぶつけずに渡れる。少し下がる段も同じ解き方
    const shot = await page.evaluate(n => window.__HOP__.debug.hopTo(0, n), t.i);
    assert.ok(shot.ok, `The tutorial hop onto pad ${t.i} (${t.kind}) is solvable: ${JSON.stringify(shot)}`);
    assert.ok(shot.charge <= 0.6, `The tutorial only asks for a gentle pump: ${shot.charge}`);
    await page.waitForFunction(() => {
      const s = window.__HOP__.snapshot();
      return s.player.grounded || s.mode !== 'playing';
    }, null, { timeout: 12000 });
    const now = await snap();
    assert.ok(now.player.y >= t.y - 0.5, `The tutorial hop landed on pad ${t.i} (${t.kind}): ${now.player.y} < ${t.y}`);
    const off = Math.hypot(now.player.x - t.x, now.player.z - t.z);
    assert.ok(off < Math.max(t.hx, t.hz) + 1.6, `The landing stayed on the tutorial pad ${t.i}: ${off.toFixed(2)} m off centre`);
    await stand(t.x, t.y + 0.05, t.z);
  }
  // 渡り切れば広場と同じ高さに立つ。そのまま町に入り、登りは始まる
  assert.ok(Math.abs((await snap()).player.y) < 0.5, 'The tutorial ends level with the town square');
  await page.screenshot({ path: 'artifacts/hop-tutorial.png' });

  /* ---------- 空中では少しだけ舵が取れる ---------- */
  await stand(home.x, home.y, home.z);
  const drift = await page.evaluate(v => {
    window.__HOP__.debug.launchTo(v[0], v[1] + 14, v[2]);
    return window.__HOP__.snapshot().player;
  }, [home.x, home.y, home.z]);
  await page.waitForTimeout(400);
  const noSteer = await snap();
  assert.ok(Math.hypot(noSteer.player.x - drift.x, noSteer.player.z - drift.z) < 0.6, 'Without input the player goes straight up and down');
  // 高度HUDは、いまの位置の高度そのもの（地面は0より下なので、そこは0と出す）
  const hud = await page.evaluate(() => ({
    text: document.querySelector('#height-count').textContent,
    height: window.__HOP__.snapshot().height,
  }));
  const shownHeight = Number(hud.text.replace(/\D/g, ''));
  assert.ok(hud.height > 3, `The player is actually up: ${hud.height} m`);
  assert.ok(Math.abs(shownHeight - hud.height) <= 1.5, `The HUD reports the current height: ${shownHeight} vs ${hud.height}`);

  await stand(home.x, home.y, home.z);
  const steerFrom = await page.evaluate(v => {
    window.__HOP__.debug.launchTo(v[0], v[1] + 8, v[2]);
    return window.__HOP__.snapshot().player;
  }, [home.x, home.y, home.z]);
  await page.keyboard.down('d');
  await page.waitForTimeout(700);
  const steered = await snap();
  await page.keyboard.up('d');
  const nudged = Math.hypot(steered.player.x - steerFrom.x, steered.player.z - steerFrom.z);
  assert.ok(nudged > 1.0, `The air steer nudges the player sideways: ${nudged.toFixed(2)} m`);
  await page.waitForFunction(() => window.__HOP__.snapshot().player.grounded, null, { timeout: 8000 });

  /* ---------- 音とポーズ ---------- */
  await page.locator('#sound').click();
  assert.equal(await page.locator('#sound-state').textContent(), 'OFF');
  await page.locator('#sound').click();
  assert.equal(await page.locator('#sound-state').textContent(), 'ON');
  await page.keyboard.press('Escape');
  assert.equal((await snap()).mode, 'paused', 'Escape pauses');
  const frozen = await snap();
  await page.waitForTimeout(300);
  assert.equal((await snap()).player.x, frozen.player.x, 'Physics frozen while paused');
  await page.keyboard.press('Escape');
  assert.equal((await snap()).mode, 'playing', 'Escape resumes');

  /* ---------- 面は本当に登れる：広場から頂上まで、本道をHopで登る ---------- */
  // 前の足場の中心ではなく、次の足場を向いた縁のほうに立ってから撃つ。
  // hopTo は「板の縁を板の高さより上で越えてから落ちる」軌道しか解かないので、
  // ここが通れば頭をぶつけずに登れる。動く・消える足場では位置が変わるので、
  // 立つ場所も狙いも「いまそこに有る足場」を見て決める（実プレイと同じ）
  const padPos = i => page.evaluate(n => window.__HOP__.debug.padPos(n), i);
  const climb = [];
  for (let i = 0; i < route.length; i++) {
    const plan = routeStages[i];
    let shot = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const target = (await padPos(route[i])) || plan;
      const prev = i === 0
        ? { x: 0, y: 0, z: 0, hx: 9, hz: 9 }
        : (await padPos(route[i - 1])) || routeStages[i - 1];
      const dx = target.x - prev.x, dz = target.z - prev.z;
      const d = Math.hypot(dx, dz) || 1;
      const off = Math.min(d * 0.5, Math.min(prev.hx, prev.hz) * 0.7);
      await stand(prev.x + (dx / d) * off, prev.y + 0.05, prev.z + (dz / d) * off);
      shot = await page.evaluate(n => window.__HOP__.debug.hopTo(n), i);
      if (!shot.ok) { await page.waitForTimeout(900); continue; }
      await page.waitForFunction(() => {
        const s = window.__HOP__.snapshot();
        return s.player.grounded || s.mode !== 'playing';
      }, null, { timeout: 15000 });
      if (plan.kind === 'top') break;
      if ((await snap()).player.y >= plan.y - 0.5) break;
      await page.waitForTimeout(600);   // 消えた・動いた足場から落ちた。同じHopをもう一度挑戦
    }
    const target = (await padPos(route[i])) || plan;
    assert.ok(shot && shot.ok, `Route hop ${i} (${plan.kind}) is within pump range: ${JSON.stringify(shot)}`);
    climb.push(shot.charge);
    console.log(`  hop ${String(i).padStart(2)} ${plan.kind.padEnd(8)} charge=${shot.charge} tilt=${shot.tilt} 空き=${shot.clear} 距離=${shot.dist}`);
    const now = await snap();
    if (plan.kind === 'top') {
      // 頂上は着地ではなくゴール到達で決まる。天板の上を通った時点で登り切り
      assert.equal(now.mode, 'clear', `Passing the summit ends the climb: ${JSON.stringify(now.player)}`);
      break;
    }
    assert.ok(now.player.y >= target.y - 0.5, `Landed on route hop ${i}: ${now.player.y} < ${target.y}`);
    const off2 = Math.hypot(now.player.x - target.x, now.player.z - target.z);
    assert.ok(off2 < Math.max(target.hx, target.hz) + 1.6, `The landing stayed on route hop ${i}: ${off2.toFixed(2)} m off centre`);
    assert.equal(now.mode, 'playing', `The climb is still going at route hop ${i}`);
  }
  assert.ok(climb.length >= 20, `The whole route was climbed: ${climb.length} hops`);
  const worst = Math.max(...climb);
  assert.ok(worst < 1, `Every hop fits inside one full pump: worst ${worst.toFixed(3)} charge`);
  await page.waitForFunction(() => window.__HOP__.snapshot().mode === 'clear', null, { timeout: 15000 });
  const summit = await snap();
  assert.ok(summit.maxHeight >= menu.topHeight - 2, 'The climb reached the top of the world');
  assert.ok(summit.score >= 5000, 'The summit is worth the summit bonus');
  const panel = await page.locator('#clear-stats').textContent();
  assert.ok(panel.includes(String(Math.round(summit.topHeight))), 'The result panel reports the world height');
  assert.ok(await page.locator('#clear').isVisible(), 'The summit panel opens');
  await page.screenshot({ path: 'artifacts/hop-summit.png' });

  // やり直しで状態と面が戻る
  await page.locator('#retry').click();
  const reset = await snap();
  assert.equal(reset.mode, 'playing');
  assert.equal(reset.coins, 0, 'Run state resets');
  assert.equal(reset.falls, 0, 'Fall count resets');
  assert.equal(reset.maxHeight, 0, 'Climb progress resets');
  assert.ok(reset.coinsLeft > 60, 'Coins are restored for the next attempt');

  /* ---------- ホバリング: 空中で一度だけ、押している間だけ水平に進む ---------- */
  // 足場のない平野の上で試す。滑走中にうっかり足場へ着いてしまうと測れない
  const open = { x: 0, z: -34 };
  await boot(BASE);
  await page.locator('#start').click();
  await stand(open.x, menu.groundY + 0.05, open.z);
  assert.ok((await snap()).hover.available, 'A hover is ready while standing on the ground');
  // 地面では効かない。空中でしか使えない
  await page.keyboard.down('q');
  await page.waitForTimeout(300);
  const onGround = await snap();
  await page.keyboard.up('q');
  assert.ok(onGround.hover.available && !onGround.hover.active, 'Hover does nothing while standing on the ground');

  // 真上に撃たれてから、Qを押しっぱなしにする。落下が止まって、水平に進むだけになる
  const hoverFrom = await page.evaluate(v => {
    window.__HOP__.debug.launchTo(v[0], v[1] + 10, v[2]);
    return window.__HOP__.snapshot().player;
  }, [open.x, menu.groundY + 0.05, open.z]);
  await page.keyboard.down('d');
  await page.keyboard.down('q');
  const glide = await page.evaluate(async v => {
    const H = window.__HOP__, samples = [];
    for (let i = 0; i < 150; i++) {
      const s = H.snapshot();
      samples.push({
        vy: s.player.vy, y: s.player.y, grounded: s.player.grounded,
        far: Math.hypot(s.player.x - v[0], s.player.z - v[1]),
        active: s.hover.active, used: s.hover.used, avail: s.hover.available, max: s.hover.max,
      });
      await new Promise(r => requestAnimationFrame(r));
    }
    return samples;
  }, [open.x, open.z]);
  await page.keyboard.up('q');
  await page.keyboard.up('d');
  const gliding = glide.filter(s => s.active);
  assert.ok(gliding.length >= 15, `Holding the hover key glides for about a second: ${gliding.length} frames`);
  const vys = gliding.map(s => s.vy);
  assert.ok(Math.max(...vys) <= 1.5, `Hover does not climb: max vy ${Math.max(...vys)}`);
  assert.ok(Math.min(...vys) >= -2.5, `Hover does not fall fast: min vy ${Math.min(...vys)}`);
  const glideHeight = Math.abs(gliding[0].y - gliding[gliding.length - 1].y);
  assert.ok(glideHeight < 3, `A hover holds height instead of flying: ${glideHeight.toFixed(2)} m of change`);
  const sideways = Math.max(...gliding.map(s => s.far)) - Math.hypot(hoverFrom.x - open.x, hoverFrom.z - open.z);
  assert.ok(sideways > 4, `While hovering, the stick drives the player sideways: ${sideways.toFixed(2)} m`);
  assert.ok(gliding[gliding.length - 1].used >= gliding[gliding.length - 1].max - 0.05,
    'The hover stops by itself once the breath runs out');
  // 息が切れたあと、地面に立つまでのあいだは戻らない。着地したサンプルまで見ると
  // 「立ったので戻った」になって検査できないので、空中のサンプルだけを見る
  const lastGlide = glide.reduce((acc, s, i) => (s.active ? i : acc), -1);
  const afterGlide = glide.slice(lastGlide + 1).filter(s => !s.grounded);
  assert.ok(afterGlide.length >= 3, `The player is still falling after the hover ends: ${afterGlide.length} frames`);
  assert.ok(afterGlide.every(s => !s.avail), 'Once used, the hover is spent for this airtime');
  await page.screenshot({ path: 'artifacts/hop-hover.png' });

  /* ---------- 指を離せば終わり。同じ空中では二度と出ない ---------- */
  await stand(open.x, menu.groundY + 0.05, open.z);
  assert.ok((await snap()).hover.available, 'Standing on the ground gives the hover back');
  // 満タンで真上に撃ち、頂上で一息を使う。頂上からなら、そのあとの落下が長いので
  // 「離したら終わり」「この空中では戻らない」を落ちきる前に確かめられる
  const upFrom = await page.evaluate(() => {
    const p = window.__HOP__.snapshot().player;
    return window.__HOP__.debug.launchTo(p.x, p.y + 16.9, p.z);
  });
  assert.ok(upFrom.ok, `The launch goes straight up from wherever the glide ended: ${JSON.stringify(upFrom)}`);
  await page.waitForFunction(() => window.__HOP__.snapshot().player.vy < 0.5, null, { timeout: 8000 });
  const apex = await snap();
  assert.ok(apex.hover.available && apex.player.y > 8, `Waiting at the top of the launch: y=${apex.player.y}`);
  await page.keyboard.down('q');
  await page.waitForTimeout(250);
  const held = await snap();
  assert.ok(held.hover.active, 'The hover starts at the top of a launch');
  await page.keyboard.up('q');
  await page.waitForTimeout(200);
  const letGo = await snap();
  assert.ok(!letGo.hover.active, 'Letting go ends the hover');
  assert.ok(!letGo.hover.available, 'One hover per airtime — letting go does not give it back');
  assert.ok(letGo.player.y > 8, `and there is still air left to test with: y=${letGo.player.y}`);
  await page.keyboard.down('q');
  await page.waitForTimeout(300);
  const retry = await snap();
  await page.keyboard.up('q');
  assert.ok(!retry.hover.active, 'A second hover in the same airtime does nothing');
  assert.ok(retry.player.vy < -3, `and the player is falling again: vy=${retry.player.vy}`);
  await page.waitForFunction(() => window.__HOP__.snapshot().player.grounded, null, { timeout: 12000 });
  assert.ok((await snap()).hover.available, 'and standing on the ground gives it back');

  /* ---------- 罠：消える足場は周期で当たり判定を出し入れする ---------- */
  const blinkA = (await snap()).blinkersOn;
  await page.waitForTimeout(1300);
  const blinkNow = await snap();
  assert.equal(blinkNow.blinkers, 3, 'The disappearing platforms keep cycling');
  assert.ok(blinkNow.blinkersOn !== blinkA, 'Disappearing platforms toggle their collision');

  /* ---------- 風は実際の力としてかかっている ---------- */
  await stand(home.x, home.y, home.z);
  const windShot = await page.evaluate(() => {
    const s = window.__HOP__.snapshot().player;
    window.__HOP__.debug.launchTo(s.x, s.y + 8, s.z);
    return s;
  });
  const windFlight = await flightTrace(windShot);
  assert.ok(windFlight.reach > 0.5, `Wind drifts the player sideways mid-flight: ${windFlight.reach} m`);
  const windLive = await snap();
  assert.ok(Math.hypot(windLive.wind.x, windLive.wind.z) > 0.5, 'The wind vector is live');

  /* ---------- 面は毎回同じ。テストもプレイヤーも同じ登りを歩く ---------- */
  await boot(BASE);
  const again = await snap();
  const routeAgain = await routeOf();
  assert.equal(again.world, 'skyward', 'The same world boots again');
  assert.deepEqual(routeAgain, route, 'The layout is identical after a reload');
  assert.ok(Math.abs(again.topHeight - menu.topHeight) < 0.001, 'The summit is at the same height');

  /* ---------- 表示言語：日本語 ⇄ English ---------- */
  assert.equal(await page.locator('html').getAttribute('lang'), 'ja', 'The page starts in Japanese');
  assert.ok((await page.locator('#blurb').textContent()).includes('ポンプ'), 'The title screen explains the pump in Japanese');
  assert.ok((await page.locator('#blurb').textContent()).includes('ホバリング'), 'The title screen explains the hover in Japanese');
  assert.ok((await page.locator('#blurb').textContent()).includes('地面'), 'The title screen explains that falling lands you on the ground');
  await page.locator('.seg-btn[data-lang="en"]').click();
  assert.equal((await snap()).lang, 'en', 'The language switch reaches the game state');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en', 'The document language follows the switch');
  assert.ok((await page.locator('#blurb').textContent()).includes('pump'), 'The title screen is in English');
  assert.ok((await page.locator('#world-tag').textContent()).includes('SKYWARD TOWN'), 'The world name is translated');
  assert.ok((await page.locator('#hint').textContent()).includes('pump'), 'The footer hint is translated');
  assert.ok((await page.locator('#guide-static').textContent()).includes('release to launch'), 'The control guide is translated');
  assert.ok((await page.locator('#guide-static').textContent()).includes('DRAG'), 'Even the key caps are translated');
  assert.ok((await page.title()).includes('Skyward Town'), 'The page title is translated');
  assert.equal(await page.locator('.seg-btn[data-lang="en"]').getAttribute('aria-pressed'), 'true', 'The language buttons follow the switch');
  await page.screenshot({ path: 'artifacts/hop-title-en.png' });
  await boot(BASE);
  assert.equal((await snap()).lang, 'en', 'Language is remembered after reload');
  await page.keyboard.press('KeyL');
  assert.equal((await snap()).lang, 'ja', 'L switches back to Japanese');
  assert.ok((await page.locator('#blurb').textContent()).includes('ポンプ'), 'The whole UI goes back to Japanese');

  /* ---------- コントローラー（Gamepad API） ---------- */
  await page.addInitScript(() => {
    const pad = {
      index: 0, connected: true, mapping: 'standard', id: 'Test Pad (TEST VENDOR 0x0000)',
      axes: [0, 0, 0, 0], timestamp: 0,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    window.__PAD__ = pad;
    navigator.getGamepads = () => [pad];
  });
  await boot(BASE);
  assert.equal((await snap()).pad.connected, true, 'A gamepad is picked up without any setup');
  assert.ok((await page.locator('#pad-state').textContent()).includes('Test Pad'), 'Title screen reports the connected pad');
  await page.evaluate(() => { window.__PAD__.buttons[0].pressed = true; });
  await page.waitForTimeout(140);
  await page.evaluate(() => { window.__PAD__.buttons[0].pressed = false; });
  assert.equal((await snap()).mode, 'playing', 'A button starts the game');

  await page.evaluate(v => window.__HOP__.debug.teleport(v[0], v[1], v[2]), [home.x, home.y, home.z]);
  await page.waitForFunction(() => window.__HOP__.snapshot().player.grounded, null, { timeout: 5000 });
  const padRest = await snap();
  await page.evaluate(() => { window.__PAD__.axes[1] = -1; });
  await page.waitForTimeout(600);
  const padMove = await snap();
  await page.evaluate(() => { window.__PAD__.axes[1] = 0; });
  assert.ok(padMove.player.x > padRest.player.x + 1.5, 'Left stick moves the player');

  /* ---------- スティックの感度：少し傾けただけでは、ほとんど進まない ---------- */
  await page.waitForFunction(() => window.__HOP__.snapshot().player.grounded, null, { timeout: 5000 });
  const creepFrom = await snap();
  await page.evaluate(() => { window.__PAD__.axes[1] = -0.5; });
  await page.waitForTimeout(600);
  const creep = await snap();
  await page.evaluate(() => { window.__PAD__.axes[1] = 0; });
  const creepDist = Math.hypot(creep.player.x - creepFrom.player.x, creep.player.z - creepFrom.player.z);
  const fullDist = Math.hypot(padMove.player.x - padRest.player.x, padMove.player.z - padRest.player.z);
  assert.ok(creepDist > 0.05, `A slight tilt still creeps, so fine positioning is possible: ${creepDist.toFixed(2)} m`);
  assert.ok(creepDist < fullDist * 0.45, `A half-tilted stick is far slower than a full one: ${creepDist.toFixed(2)} m vs ${fullDist.toFixed(2)} m`);

  /* ---------- Aボタンはポンプではない。空中でホバリング ---------- */
  const padPumpBefore = await snap();
  await page.evaluate(() => { window.__PAD__.buttons[0].pressed = true; });
  await page.waitForTimeout(500);
  const padA = await snap();
  await page.evaluate(() => { window.__PAD__.buttons[0].pressed = false; });
  assert.ok(padA.pump.charge < 0.01, `A does not charge the pump any more: ${padA.pump.charge}`);
  assert.ok(padA.player.grounded && !padA.hover.active, 'A on the ground does nothing');
  assert.ok(padA.falls === padPumpBefore.falls, 'and it is not a fall either');

  const padUp = await page.evaluate(() => {
    const p = window.__HOP__.snapshot().player;
    return window.__HOP__.debug.launchTo(p.x, p.y + 10, p.z);
  });
  assert.ok(padUp.ok, `The pad test launches straight up from wherever the stick test ended: ${JSON.stringify(padUp)}`);
  await page.waitForTimeout(120);
  await page.evaluate(() => { window.__PAD__.buttons[0].pressed = true; });
  await page.waitForTimeout(300);
  const padHover = await snap();
  assert.ok(padHover.hover.active, 'A in the air starts the hover');
  assert.ok(padHover.player.vy > -2.5, `and it holds the fall: vy=${padHover.player.vy}`);
  await page.evaluate(() => { window.__PAD__.buttons[0].pressed = false; });
  await page.waitForFunction(() => window.__HOP__.snapshot().player.grounded, null, { timeout: 12000 });

  await page.waitForFunction(() => window.__HOP__.snapshot().player.grounded, null, { timeout: 5000 });
  const padBefore = await snap();
  await page.evaluate(() => { window.__PAD__.buttons[7].pressed = true; });
  await page.waitForFunction(() => window.__HOP__.snapshot().pump.charge >= 0.99, null, { timeout: 10000 });
  const padCharged = await snap();
  await page.evaluate(() => { window.__PAD__.buttons[7].pressed = false; });
  const padFlight = await flightTrace(padBefore.player);
  assert.ok(padCharged.pump.charge >= 0.99, 'Holding RT charges the pump');
  assert.ok(padFlight.rise > 16 && padFlight.rise < 18.5, `Releasing RT climbs ten character heights: ${padFlight.rise} m`);

  const camBefore = await snap();
  await page.evaluate(() => { window.__PAD__.axes[2] = 1; });
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__PAD__.axes[2] = 0; });
  const camAfter = await snap();
  assert.ok(Math.abs(camAfter.camera.yaw - camBefore.camera.yaw) > 0.3, 'Right stick rotates the view');
  assert.equal(camAfter.player.x, camBefore.player.x, 'View control does not move the player');

  await page.evaluate(() => { window.__PAD__.buttons[9].pressed = true; });
  await page.waitForTimeout(140);
  await page.evaluate(() => { window.__PAD__.buttons[9].pressed = false; });
  assert.equal((await snap()).mode, 'paused', 'Start button pauses');
  await page.waitForTimeout(120); // 離したことを1フレーム見せてから、次の押しを検出させる
  await page.evaluate(() => { window.__PAD__.buttons[9].pressed = true; });
  await page.waitForTimeout(140);
  await page.evaluate(() => { window.__PAD__.buttons[9].pressed = false; });
  assert.equal((await snap()).mode, 'playing', 'Start button resumes');

  await page.evaluate(() => { window.__PAD__.buttons[2].pressed = true; });
  await page.waitForTimeout(140);
  await page.evaluate(() => { window.__PAD__.buttons[2].pressed = false; });
  assert.equal((await snap()).lang, 'en', 'X button switches the display language');
  assert.ok((await page.locator('#blurb').textContent()).includes('pump'), 'The whole UI follows the gamepad language switch');
  await page.waitForTimeout(120); // 離したことを1フレーム見せてから、次の押しを検出させる
  await page.evaluate(() => { window.__PAD__.buttons[2].pressed = true; });
  await page.waitForTimeout(140);
  await page.evaluate(() => { window.__PAD__.buttons[2].pressed = false; });
  assert.equal((await snap()).lang, 'ja', 'X button switches the language back');
  await page.screenshot({ path: 'artifacts/hop-gamepad.png' });

  const drawn = await page.evaluate(() => window.__HOP__.debug.renderer());
  assert.ok(drawn.calls > 10 && drawn.triangles > 5000, 'Scene actually renders');

  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`PASS: one crafted world (${route.length} route hops, ${stages.length} pads, ${stages.filter(s => s.side).length} side branches, ${stages.filter(s => s.tut).length} tutorial pads on the ground, top ${menu.topHeight} m), no-jump, pump charge and 17 m launch, sideways hop by leaning, no trajectory guide, one hover per airtime gliding for at most a second, air steer, soft stick curve, falling lands you on the ground instead of a respawn, ground-level start and tutorial, route-by-route climb to the summit with every hop inside one pump, summit panel and reset, disappearing platforms, wind force, height/fall HUD, sound toggle, pause/resume, identical layout on reload, language switch and persistence, gamepad pump and hover and no pump on A, real draw calls, no JS errors.`);
} finally { await browser.close(); }
