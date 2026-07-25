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
| `wiki.json` | 日次 | WIKI「これまでの歩み」年表（登録者・再生数の桁上がりを自動追記） | `.github/workflows/data-report.yml` |
| `transcripts/*.json`, `search-index.json`, `popular.json` | 日次 | セリフ文字起こし・検索インデックス・頻出セリフ | `.github/workflows/data-transcripts.yml` |

いずれも YouTube Data API v3 のクォータ消費を抑えた低コストな実装になっています（詳細は各スクリプト冒頭のコメント参照）。文字起こしワークフローは YouTube Data API を**一切呼びません**（追加クォータ 0u）。

## WIKI「これまでの歩み」の自動更新

プロフィールページのWIKIセクションは `public/data/wiki.json` を読んで描画します。
このファイルは `scripts/build-wiki.mjs` が **日次で自動生成**します（YouTube Data API は呼ばないので追加クォータ 0u）。

**自動で追記されるもの**

| 種類 | 内容 | 判定方法 |
| --- | --- | --- |
| マイルストーン | 「チャンネル登録者 400人 達成」「総再生数 20万回 達成」など | 最上位桁が繰り上がった時点。刻み幅は `10^floor(log10(n))`（339人なら100刻み、11万回なら10万刻み） |
| 現存最古の記録 | 「現存する最も古い配信」「現存する最も古い参加型マイクラ配信」「現存する最も古い動画投稿」 | `contents.json` の最古エントリ。タイトルの `#N` から「#1〜#(N-1)は非公開または削除済み」と注記 |
| 現在 | 年表の最下部に常駐。いまの登録者数と総再生数 | `report.json` の最新スナップショット |

**手で書く確定イベント**は `scripts/wiki-fixed.json` に追記します（チャンネル開設日など、データから導けないもの）。

```jsonc
[
  { "id": "channel-open", "date": "2014-12-20", "event": "チャンネル開設", "detail": "..." }
]
```

一度記録したマイルストーンは日付・文面ごと保持されるため、後から履歴が書き換わることはありません。
初回実行時に「すでに達成済み」だったぶんは到達日が不明なため、`2026年7月ごろ` のようにおおよその表記になります。

```bash
npm run build:wiki      # 手元で生成/確認する場合
```

なお `src/lib/site.config.ts` の `wikiHistory` は `wiki.json` が読めなかった場合のフォールバックです。

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
| `public/data/transcripts/failures.json` | 取得に失敗した動画と連続失敗回数（3回でバッチ対象から一旦外れます） |
| `public/data/transcripts/needs-whisper.json` | 字幕が無くCIでは処理できない動画（手元PCでの実行待ちリスト） |
| `public/data/search-index.json` | MiniSearchの書き出しインデックス。セグメント総数が12万を超えると `search-index-<年>.json` に自動分割 |
| `public/data/popular.json` | 頻出セリフ/口癖ランキング（フロントは上位20件をチップ表示） |

### ローカルでの実行方法

```bash
# 依存（Python 3.11+ / ffmpeg / Node 20+ が必要）
pip install -r scripts/requirements.txt   # yt-dlp[default] = EJSスクリプト同梱
sudo apt-get install -y ffmpeg      # macOS: brew install ffmpeg / Windows: winget install Gyan.FFmpeg
npm ci                              # minisearch / kuromoji

# 未処理アーカイブを2本まで文字起こし（字幕優先 → 無ければWhisper）
python scripts/transcribe.py --max 2

# 1本だけ処理 / 再処理
python scripts/transcribe.py --video-id XXXXXXXXXXX
python scripts/transcribe.py --video-id XXXXXXXXXXX --force

# Whisperのモデル・長さ上限を変える（既定: small / 4時間超はスキップ）
python scripts/transcribe.py --video-id XXXXXXXXXXX --whisper-model medium --max-audio-hours 0
```

**コミットするのは `public/data/transcripts` フォルダだけにする。**

```bash
git add public/data/transcripts
git commit -m "chore(data): add transcripts (local whisper)"
git pull --rebase
git push
```

`popular.json` / `search-index.json` / `quotes.json`（集計ファイル）は**手元では生成もコミットもしない**。
push したら GitHub の `Actions` タブ → `update-transcripts` → `Run workflow`（`videoId` は空でOK）で手動実行すると、
最新の `transcripts/` から集計ファイルをCI側だけが作り直してコミットしてくれる。

こうする理由: 以前は手元PCでも `npm run build:search` を実行してこの3ファイルをコミットしていたため、
CIも同じファイルを別タイミングで再生成・コミットしてしまい、`git pull` のたびに毎回コンフリクトが起きていた。
集計ファイルの書き込みをCI側だけに一本化することで、このコンフリクトはもう起きなくなる。

（手元でプレビューだけしたい場合は `npm run build:search` を実行してもよいが、その場合も
`git add public/data/transcripts` だけをステージし、集計ファイル側の変更は `git checkout -- public/data/popular.json public/data/search-index*.json public/data/quotes.json` で元に戻してからコミットすること。）

### GitHub Actions からの手動実行

`Actions` → `update-transcripts` → `Run workflow` で以下を指定できます。

| 入力 | 説明 |
| --- | --- |
| `videoId` | この1本だけ処理する（空ならcronと同じバッチ処理） |
| `force` | 既に処理済みでも再処理する |
| `whisperModel` | 字幕が無い場合のWhisperモデル（`tiny`/`base`/`small`/`medium`） |
| `retryFailed` | 連続失敗で後回しにした動画も再挑戦する |

### "Requested format is not available" が出る場合（JSチャレンジ / EJS）

yt-dlp は YouTube の JavaScript チャレンジ（署名・n challenge）を解くために、**外部のJSランタイムと解決スクリプト**を必要とします。これが揃っていないと「利用可能な形式がない」状態になり、`Requested format is not available` で失敗します。必要なものは2つです。

1. **解決スクリプト（yt-dlp-ejs）**: `pip install -U "yt-dlp[default]"` のように `[default]` を付けてインストールすると同梱されます（`scripts/requirements.txt` は対応済み）。
2. **JSランタイム**: Node 20+ または Deno が PATH にあること。スクリプトは自動で `--js-runtimes node` を付けます（`YTDLP_JS_RUNTIME=deno` で変更可）。Node はこのプロジェクトの開発にもともと必要なので、通常は追加作業は不要です。

なお字幕だけを取る場合は形式の有無と無関係なため、`--ignore-no-formats-error` を付けて字幕取得は成功するようにしています（Whisperにフォールバックする=音声DLが必要な場合のみJSランタイムが必須）。

参考: [yt-dlp Wiki: EJS](https://github.com/yt-dlp/yt-dlp/wiki/EJS)

### 運用の実態（重要）

検証の結果、**GitHub Actions からは「字幕がある配信」しか取得できない**ことが分かっています。

| 配信の種類 | CI（自動実行） | 手元PC |
| --- | --- | --- |
| 字幕（自動字幕含む）がある | ✅ 完全自動で処理される | ✅ |
| 字幕が無い（Whisperで音声から起こす） | ❌ 音声DLがブロックされる | ✅ 家庭用回線なら成功する |
| 4時間を超える長尺 | ❌ 時間の都合でスキップ | ✅ `--max-audio-hours 0` を付ければ可 |

そのためCIは `--subs-only` モードで動きます。**字幕がある配信だけを処理し、字幕が無い配信は `transcripts/needs-whisper.json` に記録して即座に次の候補へ進みます。** 字幕チェックは1本十数秒で終わるので、1回の実行で最大10本を走査します。

この仕組みが無いと、「新しい配信が字幕なし」の場合に毎回その2本で枠が埋まってしまい、**字幕がある配信がいつまでも処理されない**という問題が起きます（実際に発生しました）。

字幕が無い配信の取得失敗は**解消できない制約**と分かっているため、スクリプトはこのケースを想定内として扱い、**ワークフローを失敗させません**（毎日赤い✕が出て通知が埋もれるのを避けるため）。ジョブが失敗するのは、ボット判定・環境不備・コード不具合といった「対処が必要な異常」のときだけです。あえて厳しく扱いたい場合は `--strict` を付けてください。

`needs-whisper.json` に溜まった配信を文字起こししたいときは、手元PCで以下を実行してコミットします（`--subs-only` を付けないので、字幕なしはWhisperで処理されます）。

```bat
python scripts/transcribe.py --max 3
npm run build:search
```

なお、手元とCIの両方が `public/data` の生成物をコミットするため、手元で作業する際は**先に `git pull` してから**実行するとコンフリクトを避けられます。もしコンフリクトしたら、生成物（`search-index.json` / `popular.json` / `quotes.json`）は手で直さず、どちらかを選んでマージを完了させたあと `npm run build:search` で作り直すのが確実です。

### "No video formats found!" が出る場合（PO Token）

字幕が無い配信はWhisperのために音声そのものをダウンロードする必要があり、これはEJS対応だけでは足りず、YouTubeが要求する**PO Token**（正規のアクセスであることを証明するトークン）が必要になることがあります。特に字幕が無い配信でよく発生します（字幕がある配信はこの問題の影響を受けません）。

対策として [bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider) を導入しています。`scripts/requirements.txt` でPythonプラグイン本体を、`scripts/setup-pot.sh`（Windowsは `scripts/setup-pot.ps1`）でトークン生成用のNode.jsスクリプトをセットアップします。ワークフローでは自動実行されるため、通常は何もしなくて大丈夫です。

ローカルで字幕なし配信を処理したい場合は、初回のみ以下を実行してください（Node.js 20+ が必要）。

```bat
pip install -r scripts\requirements.txt
powershell -ExecutionPolicy Bypass -File scripts\setup-pot.ps1
```

**注意点**: このプロバイダはYouTube側の内部実装を利用してトークンを生成する仕組みのため、YouTubeの仕様変更によって将来また動かなくなる可能性があります。その場合もこのプロジェクトの設計上、失敗時はワークフローが失敗として通知されるので気づけます。気づいたら `pip install -U bgutil-ytdlp-pot-provider` と `scripts/setup-pot.sh`（or `.ps1`）の再実行、または本Wikiの更新を確認してください。

参考: [yt-dlp Wiki: PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide)

### YouTubeのボット判定（"Sign in to confirm you're not a bot"）への対処

GitHub Actions のIPアドレスはデータセンター帯のため、YouTubeからボットとみなされて
字幕取得・音声ダウンロードがどちらも拒否されることがあります。スクリプトは次の順で回避を試みます。

1. **player_client の切替**（自動・設定不要）: `android_vr` → `tv` → `mweb` → `web_safari` → `default` の順に試行。環境変数 `YTDLP_PLAYER_CLIENTS` で順序を上書きできます（例: `YTDLP_PLAYER_CLIENTS=tv,default`）。
2. **yt-dlp の自動更新**: 回避策は頻繁に更新されるため、ワークフローは毎回 `pip install -U yt-dlp` を実行します。
3. **Cookie を渡す**（任意・CIの成功率を上げたい場合）: GitHub の Secret `YT_COOKIES` に Netscape形式 `cookies.txt` の中身を貼っておくと、Cookie付きで取得を試みます。手順は下記「Cookieの設定手順」を参照してください。
4. **それでも通らない場合は手元PCで実行**（最も確実）: 家庭用回線からは通常ブロックされません。

### Cookieの設定手順（YT_COOKIES）

**必ずサブ垢（普段使いではない捨ててもいいGoogleアカウント）を新規に作って使ってください。** データセンターのIP(GitHub Actions)からアクセスするとYouTube側にアカウント制限をかけられるリスクがあるためです。メインアカウントは使わないでください。

1. **サブ垢を作る**: [https://accounts.google.com/signup](https://accounts.google.com/signup) から新規にGoogleアカウントを作成します。
2. **そのアカウントでブラウザにログインする**: ChromeやEdgeで一度ログアウトし、作成したサブ垢でログインし直します（もしくはブラウザのプロファイル機能で別プロファイルとしてログイン）。[https://www.youtube.com](https://www.youtube.com) を開いて、ログインできていることを確認してください。
3. **手元PCで cookies.txt を書き出す**: `scripts/requirements.txt` の yt-dlp が入った状態で、CMDから以下を実行します（`chrome` の部分は使っているブラウザに合わせて `edge` / `firefox` などに変更可）。ブラウザは一旦閉じてから実行してください（開いたままだとCookieファイルがロックされ失敗することがあります）。

   ```bat
   cd C:\Users\user\yt-wiki\Tawhite23-toilet-sensei
   python -m yt_dlp --cookies-from-browser chrome --cookies cookies.txt --skip-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
   ```

   成功すると、フォルダ内に `cookies.txt` というファイルができます。
4. **GitHubにSecretとして登録する**:
   - ブラウザで `https://github.com/Tawhite23/Tawhite23-toilet-sensei/settings/secrets/actions` を開く
   - 「New repository secret」をクリック
   - Name: `YT_COOKIES`
   - Secret: `cookies.txt` の中身をテキストエディタで開き、**全文をそのままコピペ**
   - 「Add secret」で保存
5. **ローカルの cookies.txt を削除する**: ログイン情報を含むファイルなので、Secretに登録したら手元のファイルは削除し、絶対にコミットしないでください（`.gitignore` には含まれていますが念のため）。

   ```bat
   del cookies.txt
   ```

6. **動作確認**: GitHubの `Actions` タブ → `update-transcripts` → `Run workflow` を手動実行し、成功するか確認します。

**Cookieはいずれ期限切れになります。** その時はまた `update-transcripts` が失敗（今回の修正で赤い✕が出るようになっています）するので、気づいたら1〜5の手順をやり直してSecretを更新してください。

```bash
python scripts/transcribe.py --max 3          # 未処理を3本処理
npm run build:search                          # インデックス再生成
git add public/data && git commit -m "chore(data): add transcripts" && git push
```

連続3回失敗した動画は `failures.json` に記録され、いったんバッチ対象から外れて他の配信の処理が進みます。再挑戦させたい場合は手動実行で `retryFailed` にチェックを入れてください。

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
