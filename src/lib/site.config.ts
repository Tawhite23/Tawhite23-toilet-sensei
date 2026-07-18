// サイト全体の設定。URL系はここだけ書き換えれば反映される。
export const site = {
  name: "おトイレ先生.JP",
  channelId: "UCmxpPhu7kAWWnoQ_cY0clTQ",
  channelIcon:
    "https://yt3.ggpht.com/n29hqwHkqy3wykQYCjrJiyZTFT9MRwh2_VvKWdZWR3PSjcOMO-9eBD_GToCr2Xc0bRjZItMHZQ=s800-c-k-c0x00ffffff-no-rj",
  tagline: "楽しくやりたい事をやりたい放題やる",
  intro:
    "27歳・高身長・高イケメン・高優男。マイクラ参加型を中心に、APEX・ポケモン・マリカと毎日全力配信。お前らを笑顔に。",

  // 公開データJSONの取得元。
  // GitHub Actions がコミットするリポジトリの raw URL を指定（デプロイを待たず15分毎の live.json が反映される）。
  // 空文字にするとサイト同梱の /data/*.json を読む。
  dataBaseUrl: "https://raw.githubusercontent.com/Tawhite23/toilet-sensei/main/public/data", 
// 例: "https://raw.githubusercontent.com/<owner>/<repo>/main/public/data"

  sns: {
    youtube: "https://www.youtube.com/channel/UCmxpPhu7kAWWnoQ_cY0clTQ",
    x: "https://x.com/CHANGE_ME", // TODO: 本人のXアカウント
    marshmallow:
      "https://marshmallow-qa.com/quv8dzdx4k5rcfv?t=0lJa7j&utm_medium=url_text&utm_source=promotion",
  },

  wikiUrl: "https://wikiwiki.jp/CHANGE_ME", // TODO: 本人のWiki

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
