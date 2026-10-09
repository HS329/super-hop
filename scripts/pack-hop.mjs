// dist から SUPER HOP だけを単体で動くフォルダーに組み出す
// 使い方: npm run build  ->  node scripts/pack-hop.mjs  [出力先]  [zip先]
import { readFile, writeFile, readdir, mkdir, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const SRC = 'dist';
const OUT = process.argv[2] || 'share/super-hop';
const assetsDir = join(SRC, 'assets');
const entries = await readdir(assetsDir);

const html = await readFile(join(SRC, 'platformer/index.html'), 'utf8');
// dist/platformer/index.html → 単体の index.html。アセットを同じフォルダー直下に置く
const packed = html.replace(/\.\.\/assets\//g, './assets/');

// HTMLから参照されるアセットを起点に、JSが import するアセット（three チャンク等）を辿る
const needed = new Set();
const queue = [...packed.matchAll(/["']\.\/assets\/([^"']+)["']/g)].map(m => m[1]);
while (queue.length) {
  const name = queue.pop();
  if (!name || needed.has(name) || !entries.includes(name)) continue;
  needed.add(name);
  if (name.endsWith('.js')) {
    const code = await readFile(join(assetsDir, name), 'utf8');
    for (const m of code.matchAll(/["']\.\/([A-Za-z0-9_.\-]+\.js)["']/g)) queue.push(m[1]);
    for (const m of code.matchAll(/import\(["']\.\/([A-Za-z0-9_.\-]+\.js)["']\)/g)) queue.push(m[1]);
  }
}

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'assets'), { recursive: true });
await writeFile(join(OUT, 'index.html'), packed, 'utf8');
for (const name of [...needed].sort()) await copyFile(join(assetsDir, name), join(OUT, 'assets', name));

await writeFile(join(OUT, 'README.txt'), [
  'SUPER HOP - 「そらへのぼる町」',
  '',
  'このフォルダーだけで動きます。画像・音・モデルはすべてコード生成で、外部アセットはありません。',
  'ジャンプのない3Dアクションです。上へ行く手段は背中のすいとりポンプだけ。',
  '',
  '【開き方】index.html をダブルクリックでは開けません（ES modules のため）。',
  '何かしらの静的サーバーを通して開いてください。',
  '',
  '  Node がある場合 : このフォルダーで  npx serve .   または  python -m http.server 5176',
  '  Python がある場合:  python -m http.server 5176',
  '  どちらも無い場合: Netlify Drop / itch.io / GitHub Pages にこのフォルダーを置く',
  '',
  'サーバーのURL（例 http://127.0.0.1:5176/）をブラウザで開くとタイトル画面が出ます。',
  '操作: WASD 移動 / E・Space・RT ポンプ（押しっぱなしでチャージ、離すと発射） / Q ホバリング（空中で一度だけ） / Shift 走る / ドラッグ 視点 / ホイール ズーム / C 視点リセット / L 言語 / M 音 / Esc ポーズ / R 再挑戦',
  '',
  '目的: 地面から、81m上の頂上の旗まで。作りこんだ1面だけを、何度も登り直すゲームです（難易度セレクトはありません）。',
  '  スタートはいちばん下の地面。そこには落ちる場所がありません。庭先の木箱→藁の山→樽→切り株→屋根をポンプで5つ渡ると、',
  '  最後の屋根が町の広場と同じ高さに出ます（チュートリアルは各Hopがチャージ3〜4割で済むように作ってあります）。',
  '  本道は23ホップ。広場には木箱・樽・荷台・切り株・藁の山、その上は家根、中層は浮島と板渡し、上層は岩棚と尖岩、てっぺんは雲。',
  '  本道以外にも「横道」が9本伸びていて、横へ跳んで別の足場に乗ると、そこにもコインと得点があります。遠回りほど高得点です。',
  '  配置は毎回まったく同じ（固定シード）なので、道順は自分で覚えて見つけてください。真上へ撃うだけでは登れません。',
  '各ホップのコインは、次の足場へ届く放物線そのものに沿って並んでいます（軌道の案内）。弾道を描く線や着点のリングはありません。',
  '',
  '移動: どの視点からでも、倒した方向＝画面の奥へ進みます。スティックは半分に倒すと速度は約2割なので、細かい位置合わせができます。',
  '視点: カメラは手動操作のみで、勝手に回ることはありません。ドラッグ・ホイール・右スティックだけで動きます。C（パッドではB）でいつでも背後に構え直せます。',
  '',
  'ポンプ: E / Space / RT（右トリガー）を押しっぱなしにすると地面に立ったまま圧が溜まり（1.25秒で満タン）、離した瞬間に打ち上がります。',
  '  満タンで身長10体分（17m）。半分なら約4.3m、3割なら約1.5m。溜め方がそのまま到達高度になります。空中では圧は作れません。',
  '  溜めている間は足が止まり、同じ入力が「体の傾き」になります（最大54°）。傾けたぶん横に届き、そのぶん登れる高さは減ります。',
  '  空中では少しだけ舵が取れます（発射の向きは変えられない）。',
  '',
  'ホバリング: Q（パッドではA）を空中で押している間だけ、落下が止まって水平に進めます。1回の空中で1回だけ、長くて1秒。',
  '  届きそうで届かない1mを稼ぐ最後の一手です。使い切ると、また地面に立つまで戻りません（HUDの HOVER ゲージに残りが出ます）。',
  '',
  '落ちても終わらない: ライフもタイムリミットもゲームオーバーもありません。塔から落ちたら、いちばん下の地面まで落ちて、そこに立ちます。',
  '  テレポートもリスポーンもありません。そこからまた登り直します。地面の縁の外へ落ちた時だけ、いちばん近い地面の上に戻されます。',
  '  登りかけた位置より12m以上落としたときだけ落下数が1つ増えます。罠は2種: 動く足場3基 / 光っている間だけ踏める消える足場3基。',
  '  いずれも死にはつながりません。計測はストップウォッチで、頂上に到達した時点で 持ち時間ボーナス が加算されます。',
  '',
  '言語: タイトル画面の「言語」ボタン、または L キー（パッドではX）で日本語 ⇄ English を切り替えます。画面中の文言がその場で変わり、選択は記憶されます。',
  '',
  'コントローラー: 接続するだけで自動対応（設定不要）。RT ポンプ / A 空中でホバリング / 左スティック・十字キー 移動（チャージ中は狙い、半分の倒し幅では約2割の速度） / LT・LB・RB 走る /',
  '  右スティック 視点回転 / Start ポーズ / B 視点リセット / X 言語切替 / Select 音。',
  '',
  '風: 空中には一定の横風が実際に力として働きます（HUD右上に風向の矢印）。真上に撃うと数m流されるので、高さを取るときは上風へ傾けて補ってください。',
  '  風は足場の上では効きません。空中で舵は取れますが、発射の向きそのものは変えられません。',
  '',
  'WebGL 対応の Chrome / Edge が必要です。',
].join('\r\n'), 'utf8');

// zip もこの手順の続きで作る。PowerShell の Compress-Archive は区切りを「\」で
// 書くため、展開側の実装によっては assets フォダーが崩れる。仕様どおり「/」で書く
const ZIP = process.argv[3];
if (ZIP) {
  const files = [
    { name: 'index.html', path: join(OUT, 'index.html') },
    { name: 'README.txt', path: join(OUT, 'README.txt') },
  ];
  for (const name of [...needed].sort()) files.push({ name: `assets/${name}`, path: join(OUT, 'assets', name) });
  const parts = [];
  for (const f of files) parts.push({ name: f.name, data: await readFile(f.path) });
  const buf = buildZip(parts);
  await writeFile(ZIP, buf);
  console.log(`zip ${ZIP}: ${buf.length} bytes`);
}

const total = [...needed].map(n => n);
console.log(`packed ${OUT}: index.html + ${needed.size} assets`);
console.log(total.join('\n'));

// ---- 依存なしの ZIP ライター（deflate + store、名前は UTF-8 / 「/」区切り） ----
function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
}
function crc32(buf, table = makeCrcTable()) {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildZip(files) {
  // タイムスタンプを固定して、同じ内容から同じzipが出るようにする
  const DOS_TIME = 0;
  const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = f.data;
    const deflated = deflateRawSync(raw, { level: 9 });
    const store = deflated.length >= raw.length;
    const data = store ? raw : deflated;
    const method = store ? 0 : 8;
    const sum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // 名前がUTF-8であることを示す
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }
  const body = Buffer.concat(locals);
  const table = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(table.length, 12);
  end.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, table, end]);
}
