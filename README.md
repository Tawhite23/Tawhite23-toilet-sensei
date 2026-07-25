# おトイレ先生.JP

YouTuber「おトイレ先生」の非公式ファンサイト。Next.js の静的サイトとして構築し、Firebase Hosting で配信しています。

## サイトの特徴

- **ホーム** — チャンネルアイコンを常時表示。配信中は自動でリングエフェクトと「LIVE」バッジが付き、そのままYouTubeの配信ページへ遷移できます。
- **カレンダー** — 過去の配信/動画投稿履歴と、今後の配信予定を月表示で確認できます。
- **レポート** — 累計配信回数・動画本数・配信時間、登録者数と総再生数の推移をグラフで表示します。
- **プロフィール** — チャンネルの紹介、開設からの歩み、モデレーター/サポーターの紹介。
- **セリフ全文検索** — カレンダーページの「セリフから探す」タブで、配信アーカイブの発言を全文検索し、その秒から再生できます（完全クライアントサイド検索）。
- **Discordゲート** — Googleログイン後のみDiscordサーバーの招待リンクを表示（Firebase Auth + Firestore）。

## 技術構成

- [Next.js 14](https://nextjs.org/)（`output: export` による完全静的サイト）/ TypeScript
- Tailwind CSS / Framer Motion / Recharts
- Firebase Authentication（Googleログイン）+ Firestore（招待URLの保護読み取り）
- Firebase Hosting（デプロイ先）
- YouTube Data API v3（配信/動画データの取得）

## データの更新の仕組み

`public/data/*.json` を GitHub Actions が定期実行で更新し、リポジトリに自動コミットしています。サイトは `raw.githubusercontent.com` から直接これらのJSONを読みに行くため、**再デプロイなしで最新データが反映**されます。

| ファイル | 更新頻度 | 内容 | ワークフロー |
| --- | --- | --- | --- |
| `live.json` | 15分毎 | 配信中かどうか、登録者数/再生数(当月分) | `.github/workflows/data-live.yml` |
| `contents.json` | 6時間毎 | 動画/配信の一覧（サムネ・種別・日時など） | `.github/workflows/data-contents.yml` |
| `report.json` | 日次 | 月別の配信回数・動画本数・配信時間・登録者数・再生数の集計 | `.github/workflows/data-report.yml` |
| `transcripts/*.json`, `search-index.json`, `popular.json` | 日次 | セリフ文字起こし・検索インデックス・頻出セリフ | `.github/workflows/data-transcripts.yml` |

いずれも YouTube Data API v3 のクォータ消費を抑えた低コストな実装になっています（詳細は各スクリプト冒頭のコメント参照）。文字起こしワークフローは YouTube Data API を**一切呼びません**（追加クォータ 0u）。

## セリフ全文検索

配信アーカイブの発言を検索し、該当の秒から再生できる機能です。サーバーは使わず、ブラウザ上で [MiniSearch](https://github.com/lucaong/minisearch) による全文検索を行います（月額コストゼロを維持）。

### データの流れ

```
data-transcripts.yml（1日1回 / 手動実行）
  1. scripts/transcribe.py        contents.json の未処理アーカイブを最大2本
                                  → yt-dlpで字幕取得（無ければWhisper）→ セリフへ整形
                                  → public/data/transcripts/<videoId>.json, manifest.json
  2. scripts/build-search-index.mjs  全セリフ → MiniSearch書き出し（本文は含めない）
                                  → public/data/search-index.json
  3. scripts/build-popular.mjs    kuromoji形態素解析 + 2〜4gram集計
                                  → public/data/popular.json
  4. public/data/** のみコミット（deploy.yml は起動しない = 再デプロイ不要）
```

フロントは「セリフから探す」タブを開いたときに初めて `manifest.json` と `search-index.json` を取得します。検索結果の本文は、ヒットした配信の `transcripts/<videoId>.json` を遅延取得して表示します（インデックスの肥大化を防ぐため、インデックスには本文を入れていません）。

### 生成されるファイル

| ファイル | 内容 |
| --- | --- |
| `public/data/transcripts/<videoId>.json` | `{ videoId, title, date, durationSec, source, generatedAt, segments: [{ id, start, end, text, yomi? }] }` |
| `public/data/transcripts/manifest.json` | 文字起こし済み配信の一覧（`videoId` / `title` / `date` / `thumbnail` / `durationSec` / `segmentCount` / `source`） |
| `public/data/transcripts/skipped.json` | 長すぎる等の理由で処理を諦めた動画（毎日リトライしないための記録） |
| `public/data/search-index.json` | MiniSearchの書き出しインデックス。セグメント総数が12万を超えると `search-index-<年>.json` に自動分割 |
| `public/data/popular.json` | 頻出セリフ/口癖ランキング（フロントは上位20件をチップ表示） |

### ローカルでの実行方法

```bash
# 依存（Python 3.11+ / ffmpeg が必要）
pip install -r scripts/requirements.txt
sudo apt-get install -y ffmpeg      # macOS: brew install ffmpeg
npm ci                              # minisearch / kuromoji

# 未処理アーカイブを2本まで文字起こし（字幕優先 → 無ければWhisper）
python scripts/transcribe.py --max 2

# 1本だけ処理 / 再処理
python scripts/transcribe.py --video-id XXXXXXXXXXX
python scripts/transcribe.py --video-id XXXXXXXXXXX --force

# Whisperのモデル・長さ上限を変える（既定: small / 4時間超はスキップ）
python scripts/transcribe.py --video-id XXXXXXXXXXX --whisper-model medium --max-audio-hours 0

# 検索インデックスと人気セリフを再生成
npm run build:search        # = build-search-index.mjs && build-popular.mjs
```

### GitHub Actions からの手動実行

`Actions` → `update-transcripts` → `Run workflow` で以下を指定できます。

| 入力 | 説明 |
| --- | --- |
| `videoId` | この1本だけ処理する（空ならcronと同じバッチ処理） |
| `force` | 既に処理済みでも再処理する |
| `whisperModel` | 字幕が無い場合のWhisperモデル（`tiny`/`base`/`small`/`medium`） |

### 運用メモ

- **掲載を止めたい配信**: `scripts/exclude.txt` に `videoId` を1行追記して `update-transcripts` を手動実行すると、`transcripts/<id>.json` と `manifest.json` のエントリが削除され、検索インデックスからも消えます（以後、処理対象にもなりません）。
- **人気セリフの調整**: `scripts/stopwords.txt` に除外したいフレーズを1行ずつ追記して再生成します（最初は空でOK）。
- **処理時間**: 字幕が取得できる配信は数十秒で完了します。字幕が無くWhisperにフォールバックする場合はCPU実行のため長時間かかるため、1実行あたり最大2本、4時間を超える配信は自動スキップ（`skipped.json` に記録）としています。長尺を処理したい場合は手元PCで `--max-audio-hours 0` を付けて実行し、生成された `public/data/transcripts/` をコミットするのが確実です。
- **音声ファイル**はワークフロー内の一時ディレクトリに置き、処理後に必ず破棄します（リポジトリにはコミットされません）。

## ローカル開発

```bash
npm ci
npm run dev       # http://localhost:3000
```

データ取得スクリプトを手元で動かす場合は環境変数が必要です。

```bash
export YT_API_KEY=xxxxx        # YouTube Data API v3 のAPIキー
export YT_CHANNEL_ID=xxxxx     # 対象チャンネルID

npm run fetch:live       # public/data/live.json を更新
npm run fetch:contents   # public/data/contents.json を更新
npm run build:report     # public/data/report.json を更新
```

セリフ文字起こし（`npm run transcribe` / `npm run build:search`）はAPIキー不要です。詳細は後述の「セリフ全文検索」を参照してください。

本番ビルド（静的書き出し）にはFirebaseの公開設定値（秘匿情報ではありません）も必要です。

```bash
export NEXT_PUBLIC_FB_API_KEY=xxxxx
export NEXT_PUBLIC_FB_AUTH_DOMAIN=xxxxx
export NEXT_PUBLIC_FB_PROJECT_ID=xxxxx
export NEXT_PUBLIC_FB_APP_ID=xxxxx

npm run build   # out/ に静的サイトを出力
```

## GitHub Actions に設定が必要な値

| 種別 | 名前 | 用途 |
| --- | --- | --- |
| Secret | `YT_API_KEY` | YouTube Data API v3 キー |
| Variable | `YT_CHANNEL_ID` | 対象チャンネルID |
| Variable | `NEXT_PUBLIC_FB_API_KEY` / `NEXT_PUBLIC_FB_AUTH_DOMAIN` / `NEXT_PUBLIC_FB_PROJECT_ID` / `NEXT_PUBLIC_FB_APP_ID` | Firebase Web設定（ビルド時に埋め込み） |
| Secret | `FIREBASE_SERVICE_ACCOUNT` / `FIREBASE_SERVICE_ACCOUNT_OTOIRESENSEI_PJ` | Firebase Hosting へのデプロイ用サービスアカウント |

## デプロイ

`main` ブランチへのpush（`public/data/**` の更新は除く）で `deploy.yml` が自動的にビルド・Firebase Hostingへデプロイします。データJSONの15分毎の更新だけでは再デプロイは走らず、サイト側が直接GitHubの生データを参照して最新表示に更新されます。
