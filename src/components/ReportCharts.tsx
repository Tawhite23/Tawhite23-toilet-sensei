"use client"
import { useEffect, useMemo, useState } from "react"
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip, Legend, CartesianGrid, AreaChart, Area,
} from "recharts"
import { fetchReport } from "@/lib/data"
import type { Report } from "@/lib/types"

// チャート色はCSS変数(テーマ)に追従
const C = {
  live: "var(--c-live)",
  video: "var(--c-accent)",
  hours: "var(--c-warm)",
  subs: "var(--c-warm)",
  views: "var(--c-accent)",
}
const tick = { fill: "var(--c-ink-dim)", fontSize: 11 }
const tickS = { fill: "var(--c-ink-dim)", fontSize: 10 }
const grid = "var(--c-border)"

export default function ReportCharts() {
  const [report, setReport] = useState<Report | null>(null)
  useEffect(() => { fetchReport().then(setReport) }, [])

  const rows = useMemo(() => {
    if (!report) return []
    return Object.entries(report)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, r]) => ({
        ym,
        配信回数: r.liveCount,
        動画本数: r.videoCount,
        配信時間h: Math.round(r.totalDurationSec / 360) / 10,
        // 【2-4】未記録の月は null のまま = グラフに線を引かない(欠損)
        登録者: r.subscriberCount ?? null,
        再生数: r.viewCount ?? null,
      }))
  }, [report])

  if (!report) return <p className="p-8 text-center text-ink-dim" role="status">読み込み中…</p>

  const latest = rows[rows.length - 1]
  const latestSubs = [...rows].reverse().find((r) => r.登録者 != null)?.登録者
  const totals = rows.reduce(
    (a, r) => ({ live: a.live + r.配信回数, video: a.video + r.動画本数, h: a.h + r.配信時間h }),
    { live: 0, video: 0, h: 0 }
  )
  const hasGap = rows.some((r) => r.登録者 == null)

  const card = "rounded-2xl border border-base-700 bg-base-800 p-4"
  const tooltipStyle = {
    backgroundColor: "var(--c-surface)",
    border: "1px solid var(--c-border)",
    borderRadius: 8,
    color: "var(--c-ink)",
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 pb-28 pt-8 md:pt-24">
      <h1 className="text-2xl font-black">活動レポート</h1>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["累計配信", `${totals.live}回`],
          ["累計動画", `${totals.video}本`],
          ["累計配信時間", `${Math.round(totals.h)}時間`],
          ["登録者", latestSubs != null ? latestSubs.toLocaleString() : "-"],
        ].map(([k, v]) => (
          <div key={k} className={card}>
            <p className="text-xs text-ink-dim">{k}</p>
            <p className="mt-1 text-xl font-black text-accent">{v}</p>
          </div>
        ))}
      </div>

      <section className={card} aria-label="月別の配信回数・動画本数・配信時間">
        <h2 className="mb-3 text-sm font-bold text-ink-dim">月別アクティビティ</h2>
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={rows}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey="ym" tick={tick} />
              <YAxis yAxisId="l" tick={tick} />
              <YAxis yAxisId="r" orientation="right" tick={tick} unit="h" />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="l" dataKey="配信回数" fill={C.live} radius={[4, 4, 0, 0]} />
              <Bar yAxisId="l" dataKey="動画本数" fill={C.video} radius={[4, 4, 0, 0]} />
              <Line yAxisId="r" dataKey="配信時間h" stroke={C.hours} strokeWidth={2} dot={false} name="配信時間(h)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className={card} aria-label="登録者数の推移">
          <h2 className="mb-3 text-sm font-bold text-ink-dim">登録者推移</h2>
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={rows}>
                <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                <XAxis dataKey="ym" tick={tickS} />
                <YAxis tick={tickS} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area dataKey="登録者" connectNulls={false} stroke={C.subs} fill={C.subs} fillOpacity={0.15} strokeWidth={2} dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className={card} aria-label="総再生数の推移">
          <h2 className="mb-3 text-sm font-bold text-ink-dim">総再生数推移</h2>
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={rows}>
                <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                <XAxis dataKey="ym" tick={tickS} />
                <YAxis tick={tickS} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area dataKey="再生数" connectNulls={false} stroke={C.views} fill={C.views} fillOpacity={0.15} strokeWidth={2} dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <p className="text-xs text-ink-dim">
        ※ 登録者・再生数は実記録に基づくスナップショット値です（GitHub Actionsで月次記録）。
        {hasGap && " 記録が無い期間は欠損として表示し、推測値で補完していません。"}
      </p>
    </div>
  )
}
