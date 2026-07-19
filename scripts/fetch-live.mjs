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
const subscriberCount = Number(stats.subscriberCount || 0)
const viewCount = Number(stats.viewCount || 0)
if (subscriberCount > 0) {
  let report = {}
  try { report = JSON.parse(await readFile("public/data/report.json", "utf8")) } catch {}
  const nowYm = new Date().toISOString().slice(0, 7)
  report[nowYm] ??= { liveCount: 0, videoCount: 0, totalDurationSec: 0, subscriberCount: null, viewCount: null }
  report[nowYm].subscriberCount = subscriberCount
  report[nowYm].viewCount = viewCount
  await writeFile("public/data/report.json", JSON.stringify(report, null, 2))
}

console.log(`live=${status.isLive} subs=${subscriberCount} quota=${quotaUsed}u`)
