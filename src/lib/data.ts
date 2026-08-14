import { site } from "./site.config"
import type {
  ContentItem,
  LiveStatus,
  PopularFile,
  QuotesFile,
  Report,
  SearchIndexFile,
  Transcript,
  TranscriptManifest,
  WikiFile,
} from "./types"

// 公開JSONの取得。dataBaseUrl 未設定時はサイト同梱 /data を読む。
// URLに revalidateSec 単位のバケット値(?t=)を積むことでキャッシュキーを世代管理しているため、
// fetch 自体は cache: "no-store" にしない（同一URLならブラウザ/HTTPキャッシュを使わせて
// search-index.json など大きいファイルの再ダウンロードを避ける）。
async function getJson<T>(name: string, revalidateSec: number): Promise<T | null> {
  const base = site.dataBaseUrl || "/data"
  try {
    const res = await fetch(`${base}/${name}?t=${Math.floor(Date.now() / (revalidateSec * 1000))}`)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export const fetchLive = () => getJson<LiveStatus>("live.json", 60)

/**
 * 動画/配信一覧。Cloudflare Worker の /api/contents を優先する。
 * こちらは直近分をYouTube APIで差分パッチ済みなので、6時間毎cronの contents.json
 * (worker/README.md 参照) より新着・配信中/予定の反映が速い。
 * liveApiBaseUrl 未設定、または Worker が失敗した場合は contents.json にフォールバックする。
 */
export async function fetchContents(): Promise<ContentItem[] | null> {
  const base = site.liveApiBaseUrl?.replace(/\/$/, "")
  if (base) {
    try {
      const res = await fetch(`${base}/api/contents`, {
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) return data as ContentItem[]
      }
    } catch {
      // フォールバックへ
    }
  }
  return getJson<ContentItem[]>("contents.json", 3600)
}

export const fetchReport = () => getJson<Report>("report.json", 3600)
/** WIKI「これまでの歩み」（登録者・再生数のマイルストーンを日次で自動追記） */
export const fetchWiki = () => getJson<WikiFile>("wiki.json", 3600)

// ---- 発言検索・名言集用（既存の fetch* と同じ作り。dataBaseUrl 経由で取得） ----
/** 文字起こし済み配信の一覧 */
export const fetchTranscriptManifest = () =>
  getJson<TranscriptManifest>("transcripts/manifest.json", 3600)
/** MiniSearch 書き出しインデックス（本文は含まない） */
export const fetchSearchIndex = () => getJson<SearchIndexFile>("search-index.json", 3600)
/** 年別シャード（search-index.json が sharded=true のとき） */
export const fetchSearchIndexShard = (file: string) => getJson<SearchIndexFile>(file, 3600)
/** よく出るキーワード/口癖ランキング */
export const fetchPopular = () => getJson<PopularFile>("popular.json", 3600)
/** 自動抽出した名言候補（五十音索引つき）*/
export const fetchQuotes = () => getJson<QuotesFile>("quotes.json", 3600)
/** 1配信ぶんの発言本文（検索ヒット表示時に遅延取得する） */
export const fetchTranscript = (videoId: string) =>
  getJson<Transcript>(`transcripts/${encodeURIComponent(videoId)}.json`, 3600)

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h > 0 ? `${h}時間${m}分` : `${m}分`
}
