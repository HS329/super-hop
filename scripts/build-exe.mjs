// SUPER HOP を .exe にまとめるスクリプト
//   1) npm run build            … Viteで dist を作る
//   2) node scripts/pack-hop.mjs … 単体で動くフォルダー share/super-hop にまとめる
//   3) dotnet publish           … 薄い皮（WebView2を呼ぶだけ）を1個のexeに
//   4) exeの隣に web/ を置き、zipにまとめる
// 使い方:
//   node scripts/build-exe.mjs                 … 小さい方（.NET Desktop Runtime 8が必要）
//   node scripts/build-exe.mjs --self-contained … 何もインストール不要（exeが大きくなる）
//   node scripts/build-exe.mjs --skip-build     … distとshareはそのまま再パックだけ
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const SELF_CONTAINED = process.argv.includes('--self-contained');
const SKIP_BUILD = process.argv.includes('--skip-build');
const OUT = 'dist-exe/win';
const WEB = join(OUT, 'web');
const ZIP = 'share/SUPER-HOP-win.zip';

const run = (cmd, args, label, shell = false) => {
  console.log(`\n=== ${label} ===`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell });
  if (r.status !== 0) { console.error(`${label} が失敗しました (exit ${r.status})`); process.exit(1); }
};

if (!SKIP_BUILD) {
  // npm は .cmd なので shell 経由で呼ぶ
  run('npm', ['run', 'build'], 'vite build', true);
  run('node', ['scripts/pack-hop.mjs'], '単体フォルダーにまとめる');
}
try { await stat(join('share/super-hop/index.html')); }
catch { console.error('share/super-hop が見つかりません。先に npm run build && node scripts/pack-hop.mjs を実行してください'); process.exit(1); }

// 前のビルド（自己完結版など）の残骸が残らないようにする。data/ は設定の保存先なので残す
try {
  for (const name of await readdir(OUT)) {
    if (name === 'data') continue;
    await rm(join(OUT, name), { recursive: true, force: true });
  }
} catch { }

run('dotnet', [
  'publish', 'desktop/SuperHop.csproj', '-c', 'Release', '-r', 'win-x64',
  `--self-contained=${SELF_CONTAINED}`,
  '-p:PublishSingleFile=true',
  //  native DLL（WebView2Loader.dll）はexeの隣に置く。一時フォルダーに展開しないので
  // %TEMP% が使えない環境や、前回の起動が残した展開先で失敗することがない
  '-p:IncludeNativeLibrariesForSelfExtract=false',
  '-p:DebugType=none',
  '-o', OUT,
], 'dotnet publish');

// IntelliSense用の .xml は実行に要らないので落とす
for (const name of await readdir(OUT)) {
  if (name.endsWith('.xml')) await rm(join(OUT, name), { force: true });
}

// exeの隣にゲーム本体を置く
await rm(WEB, { recursive: true, force: true });
await mkdir(WEB, { recursive: true });
for (const name of await readdir('share/super-hop')) {
  const from = join('share/super-hop', name);
  if ((await stat(from)).isFile()) await copyFile(from, join(WEB, name));
}
for (const name of await readdir(join('share/super-hop', 'assets'))) {
  await mkdir(join(WEB, 'assets'), { recursive: true });
  await copyFile(join('share/super-hop/assets', name), join(WEB, 'assets', name));
}

const runtime = SELF_CONTAINED
  ? 'このexeはそれ自体で動きます。インストールは不要です（Windows 10/11 + WebView2、どちらも普通入っています）。'
  : 'このexeを動かすには .NET Desktop Runtime 8 と WebView2 が必要です（Windows 11なら大抵そのまま動きます）。';
await writeFile(join(OUT, 'README.txt'), [
  'SUPER HOP - 「そらへのぼる町」 Windows版',
  '',
  '【開き方】 SUPER-HOP.exe をダブルクリック。それだけで起動します。',
  `  ${runtime}`,
  '',
  'ウィンドウサイズは自由に変えられます。F11でフルスクリーン、Alt+F4で終了。',
  'ゲームパッドは接続するだけで認識します。',
  '表示言語の設定などは exeと同じ場所の data/ に保存されます（消すと初期状態に戻ります）。',
  '',
  '中身はブラウザ版とまったく同じです。exeは薄い皮で、描画にはWindowsのWebView2（Chromium）を使っています。',
  'web/ フォルダーがこのexeの隣にある限り、ネットワーク接続は不要です。',
  '',
  '操作: WASD 移動 / E・Space・RT ポンプ（押しっぱなしでチャージ、離すと発射） / Q ホバリング（空中で一度だけ） / Shift 走る / ドラッグ 視点 / ホイール ズーム / B 視点リセット / L 言語 / M 音 / Esc ポーズ / R 再挑戦',
  '目的: 地面から、81m上の頂上の旗まで。作りこんだ1面だけを、何度も登り直すゲームです。',
].join('\r\n'), 'utf8');

// ---- zip（entry区切りは / 。Windowsの Compress-Archive は \ になるので自分で書く） ----
const files = [];
const walk = async (dir, prefix) => {
  for (const name of await readdir(dir)) {
    if (!prefix && name === 'data') continue;   // 設定の保存先はzipに入れない
    const p = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if ((await stat(p)).isDirectory()) await walk(p, rel);
    else files.push([rel, p]);
  }
};
await walk(OUT, '');

const makeCrcTable = () => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
};
const CRC_TABLE = makeCrcTable();
const crc32 = buf => {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
};
const now = new Date();
const DOS_TIME = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
const DOS_DATE = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

const chunks = [];
const central = [];
let offset = 0;
for (const [rel, p] of files.sort()) {
  const data = await readFile(p);
  const deflated = deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const name = Buffer.from(rel, 'utf8');
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);            // UTF-8名
  local.writeUInt16LE(useDeflate ? 8 : 0, 8); // 9: deflate / 0: 格納
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  chunks.push(local, name, body);

  const head = Buffer.alloc(46);
  head.writeUInt32LE(0x02014b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(20, 6);
  head.writeUInt16LE(0x0800, 8);
  head.writeUInt16LE(useDeflate ? 8 : 0, 10);
  head.writeUInt16LE(DOS_TIME, 12);
  head.writeUInt16LE(DOS_DATE, 14);
  head.writeUInt32LE(crc, 16);
  head.writeUInt32LE(body.length, 20);
  head.writeUInt32LE(data.length, 24);
  head.writeUInt16LE(name.length, 28);
  head.writeUInt32LE(0, 38);                 // 外部属性
  head.writeUInt32LE(offset, 42);
  central.push(head, name);
  offset += local.length + name.length + body.length;
}
const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);
await mkdir('share', { recursive: true });
await writeFile(ZIP, Buffer.concat([...chunks, centralBuf, end]));

const exe = await stat(join(OUT, 'SUPER-HOP.exe'));
const zip = await stat(ZIP);
console.log(`\n=== 完成 ===`);
console.log(`  ${OUT}/SUPER-HOP.exe  ${(exe.size / 1024).toFixed(0)} KB`);
console.log(`  ${OUT}/web/           ゲーム本体`);
console.log(`  ${ZIP}  ${(zip.size / 1024 / 1024).toFixed(2)} MB`);
console.log(`  起動: ${join(OUT, 'SUPER-HOP.exe')}`);
