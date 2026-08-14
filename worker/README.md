# otoile-live — リアルタイム配信ステータス API

本体サイトは完全静的（Firebase Hosting Spark）で YouTube API キーを置けないため、
配信状態だけをこの Cloudflare Worker が担当します。

サイト側は `src/lib/site.config.ts` の `liveApiBaseUrl` にこの Worker の URL を入れると
自動的にこちらを読みに行き、**未設定・到達不能なら従来の `live.json` に自動フォールバック**します。
つまりデプロイ前でもサイトは壊れません。

## なぜ Worker が要るのか

| | 従来 (GitHub Actions cron) | この Worker |
|---|---|---|
| 更新間隔 | 15分（実際は遅延で35〜40分） | 60秒 |
| 同時接続数 | 取得していない | 取得する |
| API 消費 | 288u/日（固定） | 約800u/日（アクセスが無ければ0u） |

閲覧者が何人いても上流を叩くのは TTL ごとに1回だけです（Cache API に載せた
1本のスナップショットを全員が読む）。閲覧者数と API 呼び出し回数が
連動しないので、バズっても YouTube のクォータは増えません。

## デプロイ手順

Cloudflare アカウント（無料）が必要です。所要 5 分程度。

```bash
cd worker
npm install
```

ログインします（ブラウザが開きます）。

```bash
npx wrangler login
```

YouTube Data API のキーを **secret** として登録します（`wrangler.toml` には書かないこと）。
GitHub Actions で使っているものと同じキーで構いません。

```bash
npx wrangler secret put YT_API_KEY
```

デプロイします。

```bash
npx wrangler deploy
```

出力される `https://otoile-live.<あなたのサブドメイン>.workers.dev` を
`src/lib/site.config.ts` の `liveApiBaseUrl` に貼り付けてサイトを再デプロイすれば完了です。

動作確認:

```bash
curl https://otoile-live.<あなたのサブドメイン>.workers.dev/api/live
```

## 運用（再デプロイ不要のつまみ）

Cloudflare ダッシュボード → Workers & Pages → otoile-live → Settings → Variables
から以下を変更すると、サイトを再ビルドせずに挙動を変えられます。

| 変数 | 既定 | 意味 |
|---|---|---|
| `LIVE_TTL_SEC` | 60 | 配信中に上流を叩く間隔（秒） |
| `IDLE_TTL_SEC` | 300 | 非配信中に上流を叩く間隔（秒） |
| `STATS_TTL_SEC` | 600 | 登録者数・総再生数の更新間隔（秒） |
| `CLIENT_LIVE_POLL_MS` | 60000 | 配信中のブラウザ側ポーリング間隔（ミリ秒） |
| `CLIENT_IDLE_POLL_MS` | 300000 | 非配信中のブラウザ側ポーリング間隔（ミリ秒） |
| `DISABLED` | 0 | **緊急ブレーキ**。`1` にすると全閲覧者のポーリングが止まる |

クォータが逼迫した / 想定外のアクセスが来た場合は、まず `LIVE_TTL_SEC` を上げ、
それでも足りなければ `DISABLED=1` にしてください。サイトは初回1回だけ取得して
静止し、`live.json` のフォールバックに戻ります（画面は壊れません）。

## クォータ試算

YouTube Data API v3 の上限は 10,000 units/日です。

| 状況 | 呼び出し | コスト | 頻度 |
|---|---|---|---|
| 配信中 | `videos.list`（videoId 既知） | 1u | 60秒ごと |
| 非配信中 | `playlistItems.list` + `videos.list` | 2u | 300秒ごと |
| 統計 | `channels.list` | 1u | 600秒ごと |

1日6時間配信の想定で **約800u/日**。既存のワークフロー（約375u/日）と
合わせても全体の12%程度です。

節約の要点は2つあります。ひとつは uploads プレイリストIDを `UC…` → `UU…` の
規則で導出して `channels.list` を省いていること。もうひとつは配信中は videoId が
分かっているので探索（2u）をせず `videos.list` 1回（1u）で同接まで取れることです。

## ログ

```bash
npx wrangler tail
```
