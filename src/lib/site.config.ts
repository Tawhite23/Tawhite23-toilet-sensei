// サイト全体の設定。URL系はここだけ書き換えれば反映される。
export const site = {
  name: "おトイレ先生.JP",
  // SEO/OGP・sitemap.xml・robots.txt で使う本番URL(末尾スラッシュなし)。
  // Firebase Hosting (Spark/無料枠) のデフォルトドメイン。.firebaserc の projects.default と一致させること。
  siteUrl: "https://otoiresensei-pj.web.app",
  channelId: "UCmxpPhu7kAWWnoQ_cY0clTQ",
  channelIcon:
    "https://yt3.ggpht.com/n29hqwHkqy3wykQYCjrJiyZTFT9MRwh2_VvKWdZWR3PSjcOMO-9eBD_GToCr2Xc0bRjZItMHZQ=s800-c-k-c0x00ffffff-no-rj",
  tagline: "楽しくやりたい事をやりたい放題やる",
  intro:
    "27歳・高身長・高イケメン・高優男。マイクラ参加型を中心に、APEX・ポケモン・マリカと毎日全力配信。お前らを笑顔に。",

  /** 配信者本人の呼称。SEOの「表記ゆれ」対策で構造化データの alternateName に入れる */
  personName: "おトイレ先生",
  /**
   * 表記ゆれの一覧。ローマ字表記でしかヒットしない状態を避けるため、
   * 構造化データ(JSON-LD)の alternateName としてまとめて申告する。
   */
  aliases: ["おトイレ先生", "otoiresensei", "オトイレ先生", "お手洗い先生", "おトイレせんせい"],
  /**
   * <meta name="description"> の既定値。
   * ★重要: 必ず「おトイレ先生」を含めること。
   *   以前は intro をそのまま使っていたが、intro には配信者名が一度も出てこないため、
   *   「おトイレ先生」で検索したときに手掛かりが無かった（ローマ字はURLに含まれるので拾われていた）。
   */
  description:
    "おトイレ先生（otoiresensei）の非公式ファンサイト。配信アーカイブのセリフ全文検索、配信カレンダー、名言集、活動レポート、プロフィールWIKIをまとめています。",

  // 公開データJSONの取得元。
  // GitHub Actions がコミットするリポジトリの raw URL を指定（デプロイを待たず15分毎の live.json が反映される）。
  // 空文字にするとサイト同梱の /data/*.json を読む。
  dataBaseUrl: "https://raw.githubusercontent.com/Tawhite23/Tawhite23-toilet-sensei/main/public/data",
// 例: "https://raw.githubusercontent.com/<owner>/<repo>/main/public/data"

  /**
   * リアルタイム配信ステータス API (Cloudflare Worker) のベースURL。末尾スラッシュなし。
   *
   * ★ここが空文字の間は、従来どおり live.json（15分毎のcron生成）にフォールバックする。
   *   つまり未設定でもサイトは壊れない。Worker をデプロイしたら URL を入れること。
   *
   * なぜ必要か: 本体は静的エクスポートで YouTube API キーを置けないため、
   *   cron でJSONを作るしかなく、更新が15分（実際は遅延して35〜40分）遅れていた。
   *   Worker を挟むと60秒更新になり、同接数も表示できる。
   *   デプロイ手順は worker/README.md を参照。
   * 例: "https://otoile-live.<subdomain>.workers.dev"
   */
  liveApiBaseUrl: "https://otoile-live.otoiresensei.workers.dev",

  sns: {
    youtube: "https://www.youtube.com/channel/UCmxpPhu7kAWWnoQ_cY0clTQ",
    x: "https://x.com/CHANGE_ME", // TODO: 本人のXアカウント
    marshmallow:
      "https://marshmallow-qa.com/quv8dzdx4k5rcfv?t=0lJa7j&utm_medium=url_text&utm_source=promotion",
  },

  // プロフィール内蔵WIKI「これまでの歩み」の**フォールバック**。
  // 通常は public/data/wiki.json（scripts/build-wiki.mjs が日次生成）を表示し、
  // それが取得できないときだけこの配列が使われる。
  // 確定イベント（チャンネル開設日など）を増やしたい場合は
  // scripts/wiki-fixed.json に追記すること（そちらが本番の入力）。
  wikiHistory: [
    { date: "2014年12月20日", event: "チャンネル開設", detail: "YouTubeチャンネルの開設日" },
    { date: "2025年8月23日", event: "現存する最も古い配信", detail: "これより前の配信は非公開または削除済み" },
    { date: "2025年10月11日", event: "現存する最も古い参加型マイクラ配信", detail: "タイトルが#12のため、それ以前は非公開または削除済み" },
  ],

  moderators: [
    { name: "ななニキ" },
    { name: "みけくん" },
    { name: "あかりニキ" },
    { name: "カカロッコ" },
    { name: "柴ニキ" },
    { name: "カキニキ" },
  ],
  supporters: [{ name: "ニョッキニキ" }, { name: "9ニキ" }, { name: "なおニキ" }],
} as const
