// GitHub Actions 用スクリプト共通ヘルパ（依存ゼロ / Node 18+）
const API_BASE = "https://www.googleapis.com/youtube/v3"

export const API_KEY = process.env.YT_API_KEY
export const CHANNEL_ID = process.env.YT_CHANNEL_ID
if (!API_KEY || !CHANNEL_ID) {
  console.error("環境変数 YT_API_KEY / YT_CHANNEL_ID が必要です")
  process.exit(1)
}

export let quotaUsed = 0

export async function apiGet(endpoint, params, cost) {
  const url = new URL(`${API_BASE}/${endpoint}`)
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v)
  url.searchParams.set("key", API_KEY)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status}: ${await res.text()}`)
  quotaUsed += cost
  return res.json()
}

export function parseDurationSec(iso) {
  if (!iso) return 0
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  const [, d, h, min, s] = m.map((x) => (x ? Number(x) : 0))
  return d * 86400 + h * 3600 + min * 60 + s
}

export function bestThumb(t = {}) {
  return t.maxres?.url || t.standard?.url || t.high?.url || t.medium?.url || t.default?.url || null
}

export function detectType(v) {
  const l = v.liveStreamingDetails
  return l && (l.actualStartTime || l.actualEndTime || l.scheduledStartTime) ? "live" : "video"
}
