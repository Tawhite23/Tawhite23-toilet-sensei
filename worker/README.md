# otoile-live — リアルタイム配信ステータス / 動画一覧 API

本体サイトは完全静的（Firebase Hosting Spark）で YouTube API キーを置けないため、
配信状態と動画一覧の「鮮度が重要な部分」だけをこの Cloudflare Worker が担当します。

サイト側は `src/lib/site.config.ts` の `liveApiBaseUrl` にこの Worker の URL を入れると
自動的にこちらを読みに行き、**未設定・到達不能なら従来の `live.json` に自動フォールバック**します。
つまりデプロイ前でもサイトは壊れません。

## なぜ Worker が要るのか

| | 従来 (GitHub Actions cron) | この Worker |
|---|---|---|
| 配信状態の更新間隔 | 15分（実際は遅延で35〜40分） | 60秒 |
| 動画/配信一覧の更新間隔 | 6時間 | 5分（直近分のみ） |
| 同時接続数 | 取得していない | 取得する |
| API 消費 | 約375u/日（固定） | 約800〜1400u/日（アクセスが無ければ0u） |

閲覧者が何人いても上流を叩くのは TTL ごとに1回だけです（Cache API に載せた
1本のスナップショットを全員が読む）。閲覧者数と API 呼び出し回数が
連動しないので、バズっても YouTube のクォータは増えません。

日次の集計（`report.json`）や文字起こしは対象外です。分単位で更新する意味が
薄いか、配信後にしか作れないデータのため、従来どおり GitHub Actions が担当します。

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
| `CONTENTS_TTL_SEC` | 300 | 動画/配信一覧を上流に確認しに行く間隔（秒） |
| `CONTENTS_PATCH_SIZE` | 30 | 差分パッチで確認する直近件数（最大50） |
| `CONTENTS_BASE_URL` | (リポジトリのraw URL) | パッチのベースにする完全な一覧のURL |

クォータが逼迫した / 想定外のアクセスが来た場合は、まず `LIVE_TTL_SEC` や
`CONTENTS_TTL_SEC` を上げ、それでも足りなければ `DISABLED=1` にしてください。
サイトは初回1回だけ取得して静止し、`live.json` / `contents.json` の
フォールバックに戻ります（画面は壊れません）。

## /api/contents の設計: 全件取得ではなく差分パッチ

`contents.json` は数百本ぶんの一覧です。毎回全件を取り直すとページング
（`playlistItems.list` を50件ずつ）でクォータもWorkerのサブリクエスト数
（無料枠は1呼び出しあたり50件まで）も膨らみ、チャンネルが育つほど重くなります。

そこで、既存の `data-contents.yml`（6時間毎）が生成する完全な一覧を「ベース」として
GitHub の raw URL からそのまま読み、そこに YouTube API から取った「直近
`CONTENTS_PATCH_SIZE` 件」だけを `videoId` で上書き・先頭追加してパッチします。
新着動画・配信開始/終了・予定→配信中への遷移は直近側に必ず含まれるため、これで
実用上「今の状態」に追いつきます。古い動画の並び替えや削除の検出はしません
（頻度も重要度も低く、6時間毎の再生成で十分追従できるため）。

## クォータ試算

YouTube Data API v3 の上限は 10,000 units/日です。

### 配信ステータス (`/api/live`)

| 状況 | 呼び出し | コスト | 頻度 |
|---|---|---|---|
| 配信中 | `videos.list`（videoId 既知） | 1u | 60秒ごと |
| 非配信中 | `playlistItems.list` + `videos.list` | 2u | 300秒ごと |
| 統計 | `channels.list` | 1u | 600秒ごと |

1日6時間配信の想定で約800u/日。

### 動画/配信一覧 (`/api/contents`)

| 呼び出し | コスト | 頻度 |
|---|---|---|
| `playlistItems.list`(直近30件) + `videos.list`(直近30件) | 2u | 300秒ごと |

アクセスが続く前提の最大値で 2u × (86400/300) = 576u/日。実際はアクセスが
無ければ上流を叩かないため、これより少なくなります。

合計しても既存ワークフロー（約375u/日）と合わせて全体の15%前後です。

節約の要点は2つあります。ひとつは uploads プレイリストIDを `UC…` → `UU…` の
規則で導出して `channels.list` を省いていること。もうひとつは配信中は videoId が
分かっているので探索（2u）をせず `videos.list` 1回（1u）で同接まで取れることです。

## ログ

```bash
npx wrangler tail
```
