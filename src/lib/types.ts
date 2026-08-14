// ---- 公開データ(JSON)のスキーマ --------------------------------------------

/** live.json: GitHub Actions が15分毎に更新 */
export interface LiveStatus {
  isLive: boolean
  videoId: string | null
  title: string | null
  startedAt: string | null // ISO8601
  checkedAt: string // ISO8601
}

/**
 * Cloudflare Worker (/api/live) が返すリアルタイムのスナップショット。
 * LiveStatus の上位互換で、同接数・サムネ・登録者数まで含む。
 * worker/src/index.ts の LiveSnapshot と同じ形にすること。
 */
export interface LiveNow {
  isLive: boolean
  videoId: string | null
  title: string | null
  /** 同時接続数。配信者が非公開にしている場合は null */
  viewerCount: number | null
  startedAt: string | null // ISO8601
  thumbnail: string | null
  subscriberCount: number | null
  viewCount: number | null
  checkedAt: string // ISO8601
  /** live=上流取得直後 / cache=TTL内 / stale=上流障害時の生き残り / fallback=live.json 経由 */
  source: "live" | "cache" | "stale" | "fallback"
}

/** Worker (/api/config) のポーリング設定。再デプロイ無しでサーバから間隔を変えられる */
export interface LiveRuntimeConfig {
  disabled: boolean
  livePollMs: number
  idlePollMs: number
}

/** contents.json: 動画/配信一覧（配列） */
export interface ContentItem {
  date: string // ISO8601。アーカイブ=actualStartTime、予定=scheduledStartTime(実際の配信予定日)
  type: "live" | "video"
  title: string
  videoId: string
  thumbnail: string | null
  durationSec: number
  /** 未来の配信予定(まだ開始していない)。カレンダーで「予定」バッジ表示 */
  status?: "upcoming"
}

/** report.json: "YYYY-MM" キーの月次集計 */
export interface MonthlyReport {
  liveCount: number
  videoCount: number
  totalDurationSec: number
  subscriberCount: number | null // 月末時点スナップショット。null=データ欠損(補完しない)
  viewCount: number | null // 同上（累計）
}
export type Report = Record<string, MonthlyReport>

// ---- 発言の全文検索用データ（public/data/transcripts, search-index, popular, quotes） ----

/** transcripts/<videoId>.json の1発言 */
export interface TranscriptSegment {
  id: number
  start: number // 秒
  end: number // 秒
  text: string
  yomi?: string // ひらがな読み(pykakasi。無い場合もある)
}

/** transcripts/<videoId>.json */
export interface Transcript {
  videoId: string
  title: string
  date: string // ISO8601
  durationSec: number
  source: "subtitle" | "auto-subtitle" | "whisper" | string
  generatedAt: string
  segments: TranscriptSegment[]
}

/** transcripts/manifest.json の1件 */
export interface TranscriptManifestItem {
  videoId: string
  title: string
  date: string
  thumbnail: string | null
  durationSec: number
  segmentCount: number
  source: string
}
export type TranscriptManifest = TranscriptManifestItem[]

/** search-index.json: MiniSearch の書き出しインデックス(本文は含まない) */
export interface SearchIndexShard {
  year: string
  file: string
  segmentCount: number
}
export interface SearchIndexFile {
  version: number
  generatedAt: string | null
  segmentCount: number
  sharded: boolean
  /** sharded=false のときのみ。MiniSearch.loadJSON に渡す */
  index?: unknown | null
  /** sharded=true のときのみ */
  shards?: SearchIndexShard[]
  year?: string
}

/** quotes.json: 自動抽出した名言候補（五十音索引つき） */
export interface QuoteItem {
  text: string
  videoId: string
  /** 転送量削減のため quotes.json には持たせない（manifest.json から引く） */
  title?: string
  date: string
  segmentId: number
  start: number
  /** 同上（row の算出に使うだけなので出力しない） */
  yomi?: string | null
  /** 五十音の行（あ/か/さ/た/な/は/ま/や/ら/わ/その他） */
  row: string
  score: number
  /** scripts/quote-picks.json で手動指定された「推し名言」 */
  picked?: boolean
}
export interface QuotesFile {
  version: number
  generatedAt: string | null
  segmentCount: number
  /** 行ごとの件数（索引UI用） */
  rows: Record<string, number>
  items: QuoteItem[]
}

/** popular.json: よく出るキーワード/口癖ランキング */
export interface PopularPhrase {
  text: string
  count: number
  videoCount: number
  sample: { videoId: string; start: number }
}
export interface PopularFile {
  version: number
  generatedAt: string | null
  segmentCount: number
  items: PopularPhrase[]
}

/** wiki.json: WIKI「これまでの歩み」。scripts/build-wiki.mjs が日次で更新 */
export interface WikiEntry {
  id: string
  /** fixed=手書きの確定イベント / auto=contents.jsonから導出 / milestone=登録者・再生数の桁上がり */
  kind: "fixed" | "auto" | "milestone"
  date: string // YYYY-MM-DD (JST)
  event: string
  detail?: string
  videoId?: string
  /** 登録者/再生数マイルストーンのみ */
  metric?: "subs" | "views"
  value?: number
  /** 日付がおおよそであることを示す（到達日が特定できない場合） */
  approx?: boolean
  firstSeenAt?: string
}
export interface WikiFile {
  version: number
  generatedAt: string | null
  /** 最下部に固定表示する「現在」の値 */
  current: { ym: string; subscriberCount: number | null; viewCount: number | null } | null
  entries: WikiEntry[]
}

// ---- Firestore 保護データ ---------------------------------------------------
/** /private/discord ドキュメント (allow read: if request.auth != null) */
export interface DiscordDoc {
  inviteUrl: string
  note?: string
}
