// report.json 生成（月次 cron 用）
// contents.json から月別集計し、channels.list(1u) の現在統計を
// 「当月のスナップショット」として記録する。過去月の登録者/再生数は
// 既存 report.json の値を保持する（=月次実行で推移が積み上がる）。
// 【2-4修正】スナップショット未記録の過去月は null(欠損)とし、現在値で補完しない。
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { apiGet, CHANNEL_ID, quotaUsed } from "./lib.mjs"

const ch = await apiGet("channels", { part: "statistics", id: CHANNEL_ID }, 1)
const stats = ch.items?.[0]?.statistics ?? {}
const subscriberCount = Number(stats.subscriberCount || 0)
const viewCount = Number(stats.viewCount || 0)

const contents = JSON.parse(await readFile("public/data/contents.json", "utf8"))

let prev = {}
try { prev = JSON.parse(await readFile("public/data/report.json", "utf8")) } catch {}

// YouTube Studio から取り込んだ過去実績（scripts/report-backfill.json）。
// 公開APIでは取得できない「日次スナップショット開始前の登録者数」「月別視聴回数」を補う。
// 既存スナップショット(prev)を正とし、それが無い月だけ backfill を使う。
let backfill = {}
try {
  backfill = JSON.parse(await readFile("scripts/report-backfill.json", "utf8")).months ?? {}
} catch {}

const nowYm = new Date().toISOString().slice(0, 7)
const report = {}
for (const c of contents) {
  if (c.status === "upcoming") continue // 予定は実績に含めない
  const ym = c.date.slice(0, 7)
  report[ym] ??= {
    liveCount: 0,
    videoCount: 0,
    totalDurationSec: 0,
    // 当月は現在値、過去月は既存スナップショット→無ければStudio由来のbackfill。それも無ければ欠損(null)。
    subscriberCount:
      ym === nowYm
        ? subscriberCount
        : prev[ym]?.subscriberCount ?? backfill[ym]?.subscriberCount ?? null,
    viewCount: ym === nowYm ? viewCount : prev[ym]?.viewCount ?? null,
    // その月の視聴回数(累計ではない)。Studio由来の固定値なので毎回 backfill を優先する。
    monthlyViews: backfill[ym]?.monthlyViews ?? prev[ym]?.monthlyViews ?? null,
  }
  if (c.type === "live") report[ym].liveCount++
  else report[ym].videoCount++
  report[ym].totalDurationSec += c.durationSec
}

await mkdir("public/data", { recursive: true })
await writeFile("public/data/report.json", JSON.stringify(report, null, 2))
console.log(`report=${Object.keys(report).length}ヶ月 quota=${quotaUsed}u`)
