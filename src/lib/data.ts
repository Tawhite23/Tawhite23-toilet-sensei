import { site } from "./site.config"
import type {
  ContentItem,
  LiveStatus,
  PopularFile,
  Report,
  SearchIndexFile,
  Transcript,
  TranscriptManifest,
} from "./types"

// 公開JSONの取得。dataBaseUrl 未設定時はサイト同梱 /data を読む。
async function getJson<T>(name: string, revalidateSec: number): Promise<T | null> {
  const base = site.dataBaseUrl || "/data"
  try {
    const res = await fetch(`${base}/${name}?t=${Math.floor(Date.now() / (revalidateSec * 1000))}`, {
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export const fetchLive = () => getJson<LiveStatus>("live.json", 60)
export const fetchContents = () => getJson<ContentItem[]>("contents.json", 3600)
export const fetchReport = () => getJson<Report>("report.json", 3600)

// ---- セリフ全文検索用（既存の fetch* と同じ作り。dataBaseUrl 経由で取得） ----
/** 文字起こし済み配信の一覧 */
export const fetchTranscriptManifest = () =>
  getJson<TranscriptManifest>("transcripts/manifest.json", 3600)
/** MiniSearch 書き出しインデックス（本文は含まない） */
export const fetchSearchIndex = () => getJson<SearchIndexFile>("search-index.json", 3600)
/** 年別シャード（search-index.json が sharded=true のとき） */
export const fetchSearchIndexShard = (file: string) => getJson<SearchIndexFile>(file, 3600)
/** 頻出セリフ/口癖ランキング */
export const fetchPopular = () => getJson<PopularFile>("popular.json", 3600)
/** 1配信ぶんのセリフ本文（検索ヒット表示時に遅延取得する） */
export const fetchTranscript = (videoId: string) =>
  getJson<Transcript>(`transcripts/${encodeURIComponent(videoId)}.json`, 3600)

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h > 0 ? `${h}時間${m}分` : `${m}分`
}
