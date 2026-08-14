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

type Grain = "month" | "year"
interface Row {
  label: string
  配信回数: number
  動画本数: number
  配信時間h: number
  登録者: number | null
  再生数: number | null
}

export default function ReportCharts() {
  const [report, setReport] = useState<Report | null>(null)
  const [grain, setGrain] = useState<Grain>("month")
  useEffect(() => { fetchReport().then(setReport) }, [])

  const monthly = useMemo<Row[]>(() => {
    if (!report) return []
    return Object.entries(report)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, r]) => ({
        label: ym,
        配信回数: r.liveCount,
        動画本数: r.videoCount,
        配信時間h: Math.round(r.totalDurationSec / 360) / 10,
        // 【2-4】未記録の月は null のまま = グラフに線を引かない(欠損)
        登録者: r.subscriberCount ?? null,
        再生数: r.viewCount ?? null,
      }))
  }, [report])

  /**
   * 年別は「回数/本数/時間は合計」「登録者・再生数はその年で最後に記録された値」。
   * 累積値であるスナップショットを合計してしまわないようにしている。
   */
  const yearly = useMemo<Row[]>(() => {
    const m = new Map<string, Row>()
    for (const r of monthly) {
      const y = r.label.slice(0, 4)
      const cur =
        m.get(y) ??
        { label: `${y}年`, 配信回数: 0, 動画本数: 0, 配信時間h: 0, 登録者: null, 再生数: null }
      cur.配信回数 += r.配信回数
      cur.動画本数 += r.動画本数
      cur.配信時間h = Math.round((cur.配信時間h + r.配信時間h) * 10) / 10
      if (r.登録者 != null) cur.登録者 = r.登録者
      if (r.再生数 != null) cur.再生数 = r.再生数
      m.set(y, cur)
    }
    return [...m.values()]
  }, [monthly])

  const rows = grain === "year" ? yearly : monthly

  // サマリーカードは選択中の期間の集計を出す（既定は最新の月/年）
  const [period, setPeriod] = useState<string>("")
  const activePeriod = period && rows.some((r) => r.label === period) ? period : rows.at(-1)?.label ?? ""
  const active = rows.find((r) => r.label === activePeriod)

  if (!report) return <p className="p-8 text-center text-ink-dim" role="status">読み込み中…</p>

  const hasGap = monthly.some((r) => r.登録者 == null)

  const card = "rounded-2xl border border-base-700 bg-base-800 p-4"
  const tooltipStyle = {
    backgroundColor: "var(--c-surface)",
    border: "1px solid var(--c-border)",
    borderRadius: 8,
    color: "var(--c-ink)",
  }
  const grainBtn = (g: Grain, label: string) => (
    <button
      key={g}
      onClick={() => {
        setGrain(g)
        setPeriod("") // 期間選択は最新にリセット
      }}
      aria-pressed={grain === g}
      className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
        grain === g ? "bg-base-700 text-accent" : "text-ink-dim hover:text-ink"
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 pb-28 pt-8 md:pt-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">活動レポート</h1>
        {/* 月別 / 年別の切り替え（全グラフに反映） */}
        <div
          role="group"
          aria-label="集計単位"
          className="flex gap-1 rounded-full border border-base-700 bg-base-800 p-1"
        >
          {grainBtn("month", "月別")}
          {grainBtn("year", "年別")}
        </div>
      </div>

      {/* サマリーカード: 月別/年別の切り替えと期間選択に連動する
          （登録者は「登録者推移」グラフとWIKIの「現在」に集約したのでここには出さない） */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={activePeriod}
          onChange={(e) => setPeriod(e.target.value)}
          aria-label={grain === "year" ? "集計する年" : "集計する月"}
          className="rounded-full border border-base-700 bg-base-800 px-3 py-1.5 text-xs text-ink-dim focus:border-accent"
        >
          {[...rows].reverse().map((r) => (
            <option key={r.label} value={r.label}>
              {grain === "year" ? r.label : r.label.replace("-", "年") + "月"}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-dim">の集計</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          ["配信回数", `${active?.配信回数 ?? 0}回`],
          ["動画本数", `${active?.動画本数 ?? 0}本`],
          ["配信時間", `${Math.round(active?.配信時間h ?? 0)}時間`],
        ].map(([k, v]) => (
          <div key={k} className={card}>
            <p className="text-xs text-ink-dim">{k}</p>
            <p className="mt-1 text-xl font-black text-accent">{v}</p>
          </div>
        ))}
      </div>

      <section className={card} aria-label={`${grain === "year" ? "年別" : "月別"}の配信回数・動画本数・配信時間`}>
        <h2 className="mb-3 text-sm font-bold text-ink-dim">
          {grain === "year" ? "年別" : "月別"}アクティビティ
        </h2>
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={rows}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={tick} />
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
                <XAxis dataKey="label" tick={tickS} />
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
                <XAxis dataKey="label" tick={tickS} />
                <YAxis tick={tickS} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area dataKey="再生数" connectNulls={false} stroke={C.views} fill={C.views} fillOpacity={0.15} strokeWidth={2} dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>


      <p className="text-xs leading-relaxed text-ink-dim">
        ※ 登録者・再生数は実記録に基づくスナップショット値です（GitHub Actionsで日次記録）。
        {grain === "year" && " 年別表示では、登録者・再生数はその年に最後に記録された値を表示しています（累積値のため合計しません）。"}
        {hasGap && " 記録が無い期間は欠損として表示し、推測値で補完していません。"}
      </p>
    </div>
  )
}
