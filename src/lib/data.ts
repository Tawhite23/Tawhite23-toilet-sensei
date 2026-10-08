import { site } from "./site.config"
import type {
  ContentItem,
  ListenersFile,
  LiveStatus,
  PopularFile,
  Report,
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
// 検索インデックスと名言集は Cloudflare Worker + D1 へ移行済み。
// src/lib/quoteSearch.ts の searchQuotes / fetchQuoteGallery を使うこと。
// （search-index.json は最大97MBまで肥大する見込みだったため廃止した）
/** よく出るキーワード/口癖ランキング */
export const fetchPopular = () => getJson<PopularFile>("popular.json", 3600)
/** 1配信ぶんの発言本文（検索ヒット表示時に遅延取得する） */
export const fetchTranscript = (videoId: string) =>
  getJson<Transcript>(`transcripts/${encodeURIComponent(videoId)}.json`, 3600)

/**
 * リスナー名鑑。手元PCで集計してコミットするファイルなので、main に載る前
 * （プレビュー確認中・ローカル開発中）は dataBaseUrl 側にまだ存在しない。
 * その間も表示できるよう、取れなければサイト同梱の /data を読む。
 * 名鑑・ランキング・日報の3タブで使い回すため、取得は1回だけにする。
 */
let listenersPromise: Promise<ListenersFile | null> | null = null
export function fetchListeners(): Promise<ListenersFile | null> {
  listenersPromise ??= getJson<ListenersFile>("listeners.json", 3600).then(async (remote) => {
    if (remote || !site.dataBaseUrl) return remote
    try {
      const res = await fetch("/data/listeners.json")
      return res.ok ? ((await res.json()) as ListenersFile) : null
    } catch {
      return null
    }
  })
  return listenersPromise
}

/**
 * リスナーの最新の名前とアイコン（キー → [名前, アイコンのURL]）。Cloudflare Worker が
 * YouTube から取り直したもの。listeners.json は集計したときの値なので、取れたらこちらで上書きする。
 * Worker 未設定・失敗時は null（listeners.json の値のまま表示する）。
 */
export async function fetchListenerProfiles(): Promise<Record<string, [string, string]> | null> {
  const base = site.liveApiBaseUrl?.replace(/\/$/, "")
  if (!base) return null
  try {
    const res = await fetch(`${base}/api/listeners/profiles`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = (await res.json()) as { profiles?: Record<string, [string, string]> }
    return data.profiles ?? null
  } catch {
    return null
  }
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h > 0 ? `${h}時間${m}分` : `${m}分`
}
