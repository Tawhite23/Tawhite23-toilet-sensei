"use client"
import { useMemo, useState } from "react"
import { currentSeasonKey, num, rangeStats, seasonLabel, type RangeStat } from "@/lib/listeners"
import type { ListenersFile } from "@/lib/types"
import Avatar from "./Avatar"

// 配信が少なすぎるシーズンは順位に意味が出ないので選択肢に出さない
const MIN_SEASON_STREAMS = 5
const TOP = 10

/** ランキングタブ: シーズン（季節）ごと・全期間の上位。名前を押すとその人の記録が開く */
export default function ListenerRanking({
  data,
  me,
  onOpen,
}: {
  data: ListenersFile
  me: string | null
  onOpen: (key: string) => void
}) {
  const seasons = useMemo(
    () => data.seasons.filter((s) => s.to - s.from + 1 >= MIN_SEASON_STREAMS).reverse(),
    [data]
  )
  const [key, setKey] = useState<string>(seasons[0]?.key ?? "all")
  const season = seasons.find((s) => s.key === key)
  const from = season ? season.from : 0
  const to = season ? season.to : data.streams.length - 1
  const total = to - from + 1
  const nowKey = currentSeasonKey()

  const stats = useMemo(() => rangeStats(data.listeners, from, to), [data, from, to])
  // 出席率は、数回しか来ていない人が100%で並ばないよう、ある程度来た人だけで比べる
  const minForRate = Math.max(3, Math.round(total * 0.1))

  const boards: { title: string; note: string; rows: RangeStat[]; value: (s: RangeStat) => string }[] = [
    {
      title: "出席回数",
      note: "この期間にコメントした配信の数",
      rows: top(stats, (s) => s.attend),
      value: (s) => `${s.attend}回`,
    },
    {
      title: "コメント数",
      note: "この期間のコメントの合計",
      rows: top(stats, (s) => s.comments),
      value: (s) => num(s.comments),
    },
    {
      title: "出席率",
      note: `この期間の配信のうち来た割合（${minForRate}回以上来た人）`,
      rows: top(stats.filter((s) => s.attend >= minForRate), (s) => s.rate),
      value: (s) => `${s.rate}%`,
    },
    {
      title: "連続出席",
      note: "この期間の中での最長の連続出席",
      rows: top(stats, (s) => s.best),
      value: (s) => `${s.best}回`,
    },
    ...(season
      ? [
          {
            title: "ルーキー",
            note: "このシーズンに初めて来た人の出席回数",
            rows: top(stats.filter((s) => s.rookie), (s) => s.attend),
            value: (s: RangeStat) => `${s.attend}回`,
          },
        ]
      : []),
  ]

  const btn = (k: string, label: string, current: boolean) => (
    <button
      key={k}
      onClick={() => setKey(k)}
      aria-pressed={key === k}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
        key === k ? "border-accent text-accent" : "border-base-700 text-ink-dim hover:text-ink"
      }`}
    >
      {label}
      {current && <span className="ml-1.5 rounded bg-live px-1 text-[10px] text-white">開催中</span>}
    </button>
  )

  return (
    <div className="space-y-4">
      <div role="group" aria-label="シーズン" className="flex flex-wrap gap-2">
        {seasons.map((s) => btn(s.key, s.label, s.key === nowKey))}
        {btn("all", "全期間", false)}
      </div>
      <p className="text-xs text-ink-dim">
        {season ? seasonLabel(season) : "全期間"}：配信 {total}本（{data.streams[from].date} 〜 {data.streams[to].date}）
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {boards.map((b) => (
          <section key={b.title} aria-label={`${b.title}のランキング`} className="rounded-2xl border border-base-700 bg-base-800 p-4">
            <h2 className="text-sm font-bold">{b.title}</h2>
            <p className="mt-0.5 text-[11px] text-ink-dim">{b.note}</p>
            {b.rows.length === 0 ? (
              <p className="mt-3 text-xs text-ink-dim">該当なし</p>
            ) : (
              <ol className="mt-3">
                {b.rows.map((s, i) => (
                  <li key={s.listener.key} className="border-t border-base-700 first:border-t-0">
                    <button
                      onClick={() => onOpen(s.listener.key)}
                      className="flex w-full items-center gap-2 py-1.5 text-left text-sm hover:text-accent"
                    >
                      <span
                        className={`w-6 shrink-0 text-center font-black ${i < 3 ? "text-accent" : "text-ink-dim"}`}
                      >
                        {i + 1}
                      </span>
                      <Avatar listener={s.listener} size={24} />
                      <span className="min-w-0 flex-1 truncate">
                        {s.listener.name}
                        {s.listener.key === me && (
                          <span className="ml-1.5 rounded border border-accent px-1 text-[10px] text-accent">自分</span>
                        )}
                      </span>
                      <span className="shrink-0 font-bold">{b.value(s)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

/** 上位10人。同じ値のときはコメントの多い人を先にする */
function top(stats: RangeStat[], by: (s: RangeStat) => number): RangeStat[] {
  return [...stats].sort((a, b) => by(b) - by(a) || b.comments - a.comments).slice(0, TOP)
}
