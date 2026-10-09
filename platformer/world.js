// SUPER HOP — 面の設定。難易度はなく、この一本の登りだけ。
//
//   steps    : 主ルートのHop数。頂上までの段数の目安
//   height   : 頂上の目標高度（m）。steps で割ったものが平均の段差になる
//   riseBig  : ときどき現れる大きな段差の高さ。ポンプの大きな溜めがいる
//   reach    : 一Hopの水平到達目標（m）。遠いほど横への狙いと溜めの配分がいる
//   scale    : 足場の大きさの倍率。小さいほど着地の精度がいる
//   movers   : 横へ滑る台に置き換わる箇所の数
//   blinkers : 消える雲の足場に置き換わる箇所の数
//   wind     : 空中で効く横風の加速度（m/s²）。高度に応じて強くなる
//   par      : 目標タイム。この秒数より速く登った分だけボーナスになる
//
// 足場の実際の位置は level.js の planClimb() が「そのHopが本当に届くか」を
// 確かめながら置く。届かない配置にならないことを scripts/check-climb.mjs が検査する
export const WORLD = {
  key: 'skyward',
  name: 'そらへのぼる町',
  nameEn: 'SKYWARD TOWN',
  desc: 'いちばん下の平野から始まる、ひとつの長い登り。チュートリアルを辿って町に入り、家と木箱から屋根、浮島と岩を渡って雲の頂上へ。道は何本もある。外せばいちばん下の地面まで落ちる。',
  descEn: 'One long climb that starts on the plain below town. Follow the tutorial up into town, then hop across roofs, floating isles and rocks to the clouds. Several routes are open. Miss one and you fall all the way to the ground.',
  steps: 22,
  height: 78,
  riseBig: 7.5,
  reach: 8.0,
  scale: 1.0,
  movers: 3,
  blinkers: 3,
  wind: 1.0,
  par: 320,
  scoreMul: 1,
};

export function worldName(cfg = WORLD, lang = 'ja') {
  return lang === 'ja' ? cfg.name : cfg.nameEn;
}

export function worldDesc(cfg = WORLD, lang = 'ja') {
  return lang === 'ja' ? cfg.desc : cfg.descEn;
}
