// SUPER HOP — 表示言語（日本語 / English）。
// 画面の文字列はすべてここから引く。HTML 側の静的な文言は data-i18n キーで対応させ、
// 実行中に組み立てる文言（トーストやリザルト）は t() で引く。
export const LANGS = [
  { key: 'ja', label: '日本語' },
  { key: 'en', label: 'English' },
];
export const LANG_MAP = new Map(LANGS.map(l => [l.key, l]));
export const DEFAULT_LANG = 'ja';

const STORE_KEY = 'super-hop.lang';

export function loadLang() {
  try {
    const key = localStorage.getItem(STORE_KEY);
    if (key && LANG_MAP.has(key)) return key;
  } catch {
    /* localStorage が使えない環境では無視 */
  }
  return DEFAULT_LANG;
}

export function saveLang(key) {
  try {
    localStorage.setItem(STORE_KEY, key);
  } catch {
    /* 保存できなくてもゲームは続く */
  }
}

export const UI = {
  ja: {
    docTitle: 'SUPER HOP — そらへのぼる町',
    kicker: 'THREE.JS VERTICAL ACTION',
    blurb:
      'ジャンプはない。背中のポンプだけが、上へ行く手段。<br />' +
      '長押しで圧を溜め、離した方向へ打ち上がる。傾ければ横に届くが、そのぶん登れる高さは減る。<br />' +
      '空中で一度だけ、ホバリング。押している間だけ落下を止めて、届かない1mを稼げる。<br />' +
      '外しても死なない。いちばん下の地面に立つだけだ。落としたぶんを、また登る。',
    start: 'START — ENTER',
    langLabel: '言語',
    hudHelp: '操作',
    hudSound: 'SOUND',
    hudPause: 'PAUSE',
    hudHeight: '高度',
    hudFalls: '落下',
    hudWind: '風',
    hudTopShort: 'TOP',
    pumpLabel: 'PUMP',
    hoverLabel: 'HOVER',
    guidePump: 'ポンプ 長押しでチャージ → 離した方向へ打ち上がる（ジャンプはない）',
    guidePumpAlt: 'ポンプ 長押しでチャージ → 離した方向へ打ち上がる',
    guideHover: 'ホバリング 空中で1回だけ。押している間（最大1秒）落下を止めて水平に進む',
    guideAim: '溜めている間は倒した方向へ体を傾ける＝狙い。空中では少しだけ舵が取れる',
    guideRun: '走る',
    keyDrag: 'ドラッグ',
    keyWheel: 'ホイール',
    guideDrag: '視点回転',
    guideZoom: 'ズーム',
    guideCamReset: '視点リセット',
    guideLang: '言語 日本語/English',
    guideSound: '音',
    guideSoundAlt: '音 ON/OFF',
    guidePause: 'ポーズ',
    guideResume: '再開 / ポーズ',
    guidePad: '左スティック移動・狙い / RT ポンプ / A ホバリング / 右スティック視点 / Startポーズ',
    guideFall: '足場から落ちても死なない。いちばん下の地面に立つだけ。落としたぶんをまた登る',
    padIdle: '未接続 — 接続すると自動対応',
    padConnected: 'コントローラー: {name} 接続中',
    padNone: 'コントローラー: 未接続（自動対応）',
    toastPadOn: 'コントローラー接続 — そのまま操作できます',
    toastPadOff: 'コントローラー切断',
    toastLang: '表示言語: {name}',
    toastPump: 'ポンプ: 長押しで満タン。離した方向へ打ち上がる',
    toastAim: '傾けると横に届く。そのぶん登れる高さは減る',
    toastHover: 'ホバリング: 空中で1回だけ。押している間だけ水平に進める',
    toastFall: '地面に落ちた。{lost}m 落とした',
    toastSea: '平野の縁から落ちた。いちばん近い地面に戻る',
    toastSummit: '頂上に到達！',
    statTop: 'TOP',
    statHops: 'Hop',
    statWind: '風',
    statNone: 'なし',
    hintPump: 'E / RT ポンプ',
    hintHover: 'Q / A ホバリング',
    hintAim: '倒した方向へ狙う',
    hintRun: 'SHIFT 走る',
    hintCam: 'ドラッグ 視点',
    hintFall: '落ちたら地面に戻る',
    hintPad: 'コントローラー対応',
    clearKicker: 'SUMMIT!',
    clearTitle: '頂上に到達',
    clearRetry: 'もう一度のぼる',
    clearBack: 'タイトルへ',
    pauseTitle: '一時停止',
    pauseBack: 'もどる',
    padFallback: 'コントローラー',
  },
  en: {
    docTitle: 'SUPER HOP — Skyward Town',
    kicker: 'THREE.JS VERTICAL ACTION',
    blurb:
      'There is no jump. The pump on your back is the only way up.<br />' +
      'Hold to build pressure, release and you fly that way. Lean to reach sideways — it costs you height.<br />' +
      'Once per airtime: hover. Hold it and you stop falling and glide — for one second at most.<br />' +
      'Miss and you do not die. You land on the ground below, and climb back what you dropped.',
    start: 'START — ENTER',
    langLabel: 'LANGUAGE',
    hudHelp: 'CONTROLS',
    hudSound: 'SOUND',
    hudPause: 'PAUSE',
    hudHeight: 'HEIGHT',
    hudFalls: 'FALLS',
    hudWind: 'WIND',
    hudTopShort: 'TOP',
    pumpLabel: 'PUMP',
    hoverLabel: 'HOVER',
    guidePump: 'Pump — hold to charge, release to launch (there is no jump)',
    guidePumpAlt: 'Pump — hold to charge, release to launch',
    guideHover: 'Hover — once per airtime. Hold it and you stop falling and glide, for up to 1 second',
    guideAim: 'While charging, tilt to aim. In the air the stick still steers a little',
    guideRun: 'Run',
    keyDrag: 'DRAG',
    keyWheel: 'WHEEL',
    guideDrag: 'Orbit camera',
    guideZoom: 'Zoom',
    guideCamReset: 'Reset camera',
    guideLang: 'Language 日本語/English',
    guideSound: 'Sound',
    guideSoundAlt: 'Sound ON/OFF',
    guidePause: 'Pause',
    guideResume: 'Resume / pause',
    guidePad: 'Left stick move & aim / RT pump / A hover / Right stick camera / Start pause',
    guideFall: 'Falling never kills you — you just land on the ground and climb back what you dropped',
    padIdle: 'Not connected — plug in and it just works',
    padConnected: 'Controller: {name} connected',
    padNone: 'Controller: none (auto-detect)',
    toastPadOn: 'Controller connected — ready to play',
    toastPadOff: 'Controller disconnected',
    toastLang: 'LANGUAGE: {name}',
    toastPump: 'PUMP: hold to full charge, release to launch that way',
    toastAim: 'Leaning reaches sideways — it costs you height',
    toastHover: 'HOVER: once per airtime. Hold it and you glide instead of falling',
    toastFall: 'You landed on the ground — that was {lost}m',
    toastSea: 'Off the edge of the plain — back to the nearest ground',
    toastSummit: 'SUMMIT!',
    statTop: 'TOP',
    statHops: 'HOPS',
    statWind: 'WIND',
    statNone: 'none',
    hintPump: 'E / RT pump',
    hintHover: 'Q / A hover',
    hintAim: 'tilt to aim',
    hintRun: 'SHIFT run',
    hintCam: 'drag camera',
    hintFall: 'fall = land on the ground',
    hintPad: 'gamepad ready',
    clearKicker: 'SUMMIT!',
    clearTitle: 'YOU REACHED THE TOP',
    clearRetry: 'CLIMB AGAIN',
    clearBack: 'BACK TO TITLE',
    pauseTitle: 'PAUSED',
    pauseBack: 'RESUME',
    padFallback: 'Controller',
  },
};

let current = DEFAULT_LANG;

export function setLang(key) {
  if (LANG_MAP.has(key)) current = key;
  return current;
}
export function getLang() {
  return current;
}

// 文字列を取る。{name} のようなプレースホルダーは args で埋める。
export function t(key, args) {
  const table = UI[current] || UI.ja;
  let s = table[key];
  if (s == null) s = UI.ja[key];
  if (s == null) return key;
  if (args) {
    for (const k of Object.keys(args)) s = s.split('{' + k + '}').join(String(args[k]));
  }
  return s;
}
