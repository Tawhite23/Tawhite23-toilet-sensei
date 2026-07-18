import { site } from "./site.config"
import type { ContentItem, LiveStatus, Report } from "./types"

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

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h > 0 ? `${h}時間${m}分` : `${m}分`
}
