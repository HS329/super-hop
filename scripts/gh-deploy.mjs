// 組み出したSUPER HOPを gh-pages ブランチに置いて、GitHub Pagesのルートにします。
//   使い方:
//     node scripts/gh-deploy.mjs                     … ビルド→組み出し→gh-pagesへpush
//     node scripts/gh-deploy.mjs --skip-build        … share/super-hop をそのままpush
//   トークンは GH_TOKEN 環境変数か .tmp/gh-token.txt から読みます（remoteのURLには残しません）
//   Pages側は Settings → Pages で Source を "Deploy from a branch" / gh-pages / root に設定します
//   （一度 `POST /repos/<owner>/<repo>/pages` で設定してしまえば、以後はpushだけ）
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const arg = (name, dflt = null) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const OWNER = arg('--owner', 'HS329');
const REPO = arg('--repo', 'super-hop');
const SKIP_BUILD = process.argv.includes('--skip-build');
const SRC = 'share/super-hop';
const DEPLOY = '.tmp/gh-pages-deploy';
const BRANCH = 'gh-pages';

const run = (cmd, args, label, opts = {}) => {
  console.log(`=== ${label} ===`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (r.status !== 0) { console.error(`${label} が失敗しました (exit ${r.status})`); process.exit(1); }
};

if (!SKIP_BUILD) {
  run('npm', ['run', 'build'], 'vite build', { shell: true });
  run('node', ['scripts/pack-hop.mjs', SRC, 'share/SUPER-HOP.zip'], '単体フォルダーに組み出す');
}
try { await stat(join(SRC, 'index.html')); }
catch { console.error(`${SRC} が見つかりません。先に npm run build && npm run pack:hop`); process.exit(1); }

let token = process.env.GH_TOKEN || null;
if (!token) {
  try { token = (await readFile('.tmp/gh-token.txt', 'utf8')).trim(); } catch { }
}
if (!token) { console.error('トークンが見つかりません。GH_TOKEN を設定するか .tmp/gh-token.txt に置いてください'); process.exit(1); }

// 置くもの: index.html と assets/ と README.txt に、Jekyllを止める .nojekyll だけ足す
await rm(DEPLOY, { recursive: true, force: true });
await mkdir(join(DEPLOY, 'assets'), { recursive: true });
const put = async (name) => await copyFile(join(SRC, name), join(DEPLOY, name));
await put('index.html');
await put('README.txt');
for (const name of await readdir(join(SRC, 'assets'))) {
  await copyFile(join(SRC, 'assets', name), join(DEPLOY, 'assets', name));
}
await writeFile(join(DEPLOY, '.nojekyll'), '', 'utf8');

run('git', ['init', '-b', BRANCH], 'git init', { cwd: DEPLOY });
run('git', ['config', 'user.name', OWNER], 'git config user.name', { cwd: DEPLOY });
run('git', ['config', 'user.email', `${OWNER}@users.noreply.github.com`], 'git config user.email', { cwd: DEPLOY });
run('git', ['add', '-A'], 'git add', { cwd: DEPLOY });
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
run('git', ['commit', '-q', '-m', `組み出し ${stamp}`], 'git commit', { cwd: DEPLOY });

// トークンはこのpushコマンドにだけ渡す（.git/configには残さない）
const authUrl = `https://${OWNER}:${token}@github.com/${OWNER}/${REPO}.git`;
run('git', ['push', '--force', authUrl, `${BRANCH}:${BRANCH}`], `gh-pages へpush`, { cwd: DEPLOY });
run('git', ['remote', 'add', 'origin', `https://github.com/${OWNER}/${REPO}.git`], 'origin（トークンなし）', { cwd: DEPLOY });

const files = [];
const walk = async (dir, prefix) => {
  for (const name of await readdir(dir)) {
    if (!prefix && name === '.git') continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    if ((await stat(join(dir, name))).isDirectory()) await walk(join(dir, name), rel);
    else files.push(rel);
  }
};
await walk(DEPLOY, '');
console.log(`\n=== push完了（${files.length}個） ===`);
for (const f of files.sort()) console.log('  ' + f);
console.log(`\n  サイト: https://${OWNER.toLowerCase()}.github.io/${REPO}/`);
