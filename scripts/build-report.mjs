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
// 公開APIでは取得できない「日次スナップショット開始前の登録者数・累計再生数」を補う。
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
    // 登録者: 当月はAPI実測値。過去月は既存スナップショット→無ければStudio由来のbackfill。
    // （StudioとAPIでほぼ一致するため、そのまま1本の系列として繋がる）
    subscriberCount:
      ym === nowYm
        ? subscriberCount
        : prev[ym]?.subscriberCount ?? backfill[ym]?.subscriberCount ?? null,
    // 総再生数: Studio基準(非公開/削除済みも含む)を正とし、APIの値では上書きしない。
    // backfillに無い月だけAPI実測値を使う（後段の単調増加ガードで不整合を弾く）。
    viewCount:
      backfill[ym]?.cumulativeViews ??
      (ym === nowYm ? viewCount : prev[ym]?.viewCount ?? null),
  }
  if (c.type === "live") report[ym].liveCount++
  else report[ym].videoCount++
  report[ym].totalDurationSec += c.durationSec
}

/**
 * 単調増加ガード。
 * 総再生数・登録者数はどちらも累計値なので、時系列で減ることはありえない。
 * Studio基準(backfill)とAPI基準は母数が違うため、両者が混ざる境目で見かけ上の減少が
 * 起きうる。その場合は「その月は欠損」として扱い、グラフに右肩下がりを描かせない。
 * （backfillを最新月まで更新すれば、その月から再び値が入る）
 */
for (const key of ["viewCount", "subscriberCount"]) {
  let last = null
  for (const ym of Object.keys(report).sort()) {
    const v = report[ym][key]
    if (v == null) continue
    if (last != null && v < last) report[ym][key] = null
    else last = v
  }
}

await mkdir("public/data", { recursive: true })
await writeFile("public/data/report.json", JSON.stringify(report, null, 2))
console.log(`report=${Object.keys(report).length}ヶ月 quota=${quotaUsed}u`)
