// contents.json 生成（6時間毎 cron 用）
// channels.list(1u) + playlistItems ページング(1u/50件) + videos.list(1u/50件)
// 461本で約 21u/回 × 4回/日 = 84u/日
import { writeFile, mkdir } from "node:fs/promises"
import { apiGet, CHANNEL_ID, bestThumb, detectType, parseDurationSec, quotaUsed } from "./lib.mjs"

const ch = await apiGet(
  "channels",
  { part: "snippet,statistics,contentDetails", id: CHANNEL_ID },
  1
)
const channel = ch.items?.[0]
if (!channel) throw new Error("チャンネルが見つかりません")
const uploads = channel.contentDetails.relatedPlaylists.uploads

const ids = []
let pageToken
do {
  const pl = await apiGet(
    "playlistItems",
    { part: "contentDetails", playlistId: uploads, maxResults: 50, pageToken },
    1
  )
  ids.push(...pl.items.map((i) => i.contentDetails.videoId))
  pageToken = pl.nextPageToken
} while (pageToken)

const contents = []
for (let i = 0; i < ids.length; i += 50) {
  const vs = await apiGet(
    "videos",
    { part: "snippet,contentDetails,liveStreamingDetails", id: ids.slice(i, i + 50).join(",") },
    1
  )
  for (const v of vs.items) {
    const live = v.liveStreamingDetails
    // 【2-3修正】配信予定(まだ開始していない配信)は「実際の配信予定日」
    // (scheduledStartTime) をdateに使い、status:"upcoming" を付与する。
    // publishedAt(=予定を設定した日)は使わない。
    const isUpcoming =
      v.snippet.liveBroadcastContent === "upcoming" ||
      (!!live?.scheduledStartTime && !live?.actualStartTime && !live?.actualEndTime)
    const date = isUpcoming
      ? live.scheduledStartTime
      : live?.actualStartTime ?? v.snippet.publishedAt
    contents.push({
      date,
      type: detectType(v),
      title: v.snippet.title,
      videoId: v.id,
      thumbnail: bestThumb(v.snippet.thumbnails),
      durationSec: parseDurationSec(v.contentDetails?.duration),
      ...(isUpcoming ? { status: "upcoming" } : {}),
    })
  }
}
contents.sort((a, b) => b.date.localeCompare(a.date))

await mkdir("public/data", { recursive: true })
await writeFile("public/data/contents.json", JSON.stringify(contents, null, 2))
console.log(`contents=${contents.length}件 quota=${quotaUsed}u`)
