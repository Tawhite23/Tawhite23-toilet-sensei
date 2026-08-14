// live.json 生成（15分毎 cron 用・超低クォータ設計）
//
// search.list(100u) は使わない。
//   1) channels.list ...................... 1u (uploads プレイリストID + statistics)
//   2) playlistItems.list 先頭1ページ ...... 1u (最新50件のID / ライブ中も uploads に載る)
//   3) videos.list 最新10件 ................ 1u (liveBroadcastContent === "live" を判定)
// => 3u/回 × 96回/日 = 288u/日（上限10,000uの3%）
// 【15分毎に登録者数を反映】channels.list は part を増やしてもクォータ消費は変わらない(1u)ため、
// statistics を同時取得して report.json の当月スナップショットも毎回更新する。
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { apiGet, CHANNEL_ID, bestThumb, quotaUsed } from "./lib.mjs"

const ch = await apiGet("channels", { part: "contentDetails,statistics", id: CHANNEL_ID }, 1)
const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
if (!uploads) throw new Error("uploads playlist が見つかりません")
const stats = ch.items?.[0]?.statistics ?? {}

const pl = await apiGet(
  "playlistItems",
  { part: "contentDetails", playlistId: uploads, maxResults: 50 },
  1
)
const latestIds = pl.items.slice(0, 10).map((i) => i.contentDetails.videoId)

const vs = await apiGet(
  "videos",
  { part: "snippet,liveStreamingDetails", id: latestIds.join(",") },
  1
)
const liveNow = vs.items.find((v) => v.snippet.liveBroadcastContent === "live")

const status = {
  isLive: !!liveNow,
  videoId: liveNow?.id ?? null,
  title: liveNow?.snippet.title ?? null,
  startedAt: liveNow?.liveStreamingDetails?.actualStartTime ?? null,
  checkedAt: new Date().toISOString(),
}

await mkdir("public/data", { recursive: true })
await writeFile("public/data/live.json", JSON.stringify(status, null, 2))

// 登録者数/再生数を当月スナップショットとして即時反映(日次の update-report を待たない)
//
// 【重要】viewCount は build-report.mjs と同じ優先順位に必ず従うこと。
//   Studio基準(backfillのcumulativeViews。非公開/削除済みも含む累計)を正とし、
//   公開APIのviewCount(現存する公開動画のみの合計)では上書きしない。
//   母数が違うため、backfillがある月にAPI実測値をそのまま書くと
//   report.json 上で値が下がって見え(例: 146,968→121,676)、レポートのグラフに
//   右肩下がりを描いてしまう。過去これを回避せず直書きしていたのが実際のバグで、
//   15分毎に走るこのスクリプトが日次の build-report.mjs の結果を都度踏み潰していた。
const subscriberCount = Number(stats.subscriberCount || 0)
const viewCountFromApi = Number(stats.viewCount || 0)
if (subscriberCount > 0) {
  let report = {}
  try { report = JSON.parse(await readFile("public/data/report.json", "utf8")) } catch {}

  let backfill = {}
  try {
    backfill = JSON.parse(await readFile("scripts/report-backfill.json", "utf8")).months ?? {}
  } catch {}

  const nowYm = new Date().toISOString().slice(0, 7)
  report[nowYm] ??= { liveCount: 0, videoCount: 0, totalDurationSec: 0, subscriberCount: null, viewCount: null }
  report[nowYm].subscriberCount = subscriberCount

  const viewCount = backfill[nowYm]?.cumulativeViews ?? viewCountFromApi
  // 単調増加ガード(build-report.mjsと同じ考え方)。直前の月を下回るなら欠損として扱う
  const prevYm = Object.keys(report)
    .filter((k) => k < nowYm && report[k].viewCount != null)
    .sort()
    .at(-1)
  const prevViewCount = prevYm ? report[prevYm].viewCount : null
  report[nowYm].viewCount = prevViewCount != null && viewCount < prevViewCount ? null : viewCount

  await writeFile("public/data/report.json", JSON.stringify(report, null, 2))
}

console.log(`live=${status.isLive} subs=${subscriberCount} quota=${quotaUsed}u`)
