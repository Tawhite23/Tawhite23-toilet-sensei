// ---- 公開データ(JSON)のスキーマ --------------------------------------------

/** live.json: GitHub Actions が15分毎に更新 */
export interface LiveStatus {
  isLive: boolean
  videoId: string | null
  title: string | null
  startedAt: string | null // ISO8601
  checkedAt: string // ISO8601
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
  viewCount: number | null // 同上
}
export type Report = Record<string, MonthlyReport>

// ---- セリフ全文検索用データ（public/data/transcripts, search-index, popular） -----

/** transcripts/<videoId>.json の1セリフ */
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

/** popular.json: 頻出セリフ/口癖ランキング */
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

// ---- Firestore 保護データ ---------------------------------------------------
/** /private/discord ドキュメント (allow read: if request.auth != null) */
export interface DiscordDoc {
  inviteUrl: string
  note?: string
}
