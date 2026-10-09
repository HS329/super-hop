// exeに同梱した web/ が、exe自身のサーバーだけで動くかを検査する
// exeを --serve-only で立てて、既存の verify-pack.mjs をそのままそのURLに通す
import { spawn } from 'node:child_process';

const EXE = 'dist-exe/win/SUPER-HOP.exe';
const PORT = Number(process.env.EXE_PORT || 5199);

const srv = spawn(EXE, ['--serve-only', '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', d => process.stdout.write('[exe] ' + d));
srv.stderr.on('data', d => process.stderr.write('[exe] ' + d));
srv.on('exit', c => { if (c !== 0 && c !== null) console.error(`exeサーバーが exit ${c} で終わりました`); });

const wait = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/index.html`);
      if (r.ok) return r;
    } catch { }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`http://127.0.0.1:${PORT}/ が起動しません`);
};

let code = 1;
try {
  const res = await wait();
  const html = await res.text();
  if (!/type="module"/.test(html)) throw new Error('index.htmlがmoduleスクリプトを呼んでいません');
  const js = [...html.matchAll(/src="\.\/assets\/([^"]+\.js)"/g)].map(m => m[1]);
  for (const name of js) {
    const r = await fetch(`http://127.0.0.1:${PORT}/assets/${name}`);
    if (!r.ok) throw new Error(`アセットが取りに出せません: ${name}`);
    const type = r.headers.get('content-type') || '';
    if (!type.includes('javascript')) throw new Error(`${name} のMIMEが ${type} です`);
  }
  console.log(`exeのサーバーが起動しました（index.html + ${js.length}個のJS, MIME正常）`);
  const child = spawn(process.execPath, ['scripts/verify-pack.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, PACK_URL: `http://127.0.0.1:${PORT}` },
  });
  code = await new Promise(r => child.on('exit', r));
} catch (e) {
  console.error('FAIL:', e.message);
} finally {
  srv.kill();
}
process.exit(code);
