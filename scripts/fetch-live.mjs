// live.json 生成（15分毎 cron 用・超低クォータ設計）
//
// search.list(100u) は使わない。
//   1) channels.list ...................... 1u (uploads プレイリストID)
//   2) playlistItems.list 先頭1ページ ...... 1u (最新50件のID / ライブ中も uploads に載る)
//   3) videos.list 最新10件 ................ 1u (liveBroadcastContent === "live" を判定)
// => 3u/回 × 96回/日 = 288u/日（上限10,000uの3%）
import { writeFile, mkdir } from "node:fs/promises"
import { apiGet, CHANNEL_ID, bestThumb, quotaUsed } from "./lib.mjs"

const ch = await apiGet("channels", { part: "contentDetails", id: CHANNEL_ID }, 1)
const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
if (!uploads) throw new Error("uploads playlist が見つかりません")

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
console.log(`live=${status.isLive} quota=${quotaUsed}u`)
