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

// ---- Firestore 保護データ ---------------------------------------------------
/** /private/discord ドキュメント (allow read: if request.auth != null) */
export interface DiscordDoc {
  inviteUrl: string
  note?: string
}
