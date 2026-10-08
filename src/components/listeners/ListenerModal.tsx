"use client"
import { useEffect, useMemo, useState } from "react"
import { attendanceCalendar, companions, num, type CalendarRange, type DayCell } from "@/lib/listeners"
import type { Listener, ListenersFile } from "@/lib/types"
import Avatar from "./Avatar"
import AttendanceGrid, { AttendanceLegend } from "./AttendanceGrid"
import TitleChips from "./TitleChips"

/**
 * リスナー1人の記録。名鑑・ランキング・日報のどこから名前を押してもこれが開く。
 * URLの ?l=<キー> と対応しているので、開いた状態のままリンクを共有できる。
 */
export default function ListenerModal({
  listener: l,
  data,
  isMe,
  onToggleMe,
  onOpen,
  onClose,
}: {
  listener: Listener
  data: ListenersFile
  isMe: boolean
  onToggleMe: () => void
  onOpen: (key: string) => void
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  // 出席カレンダーの表示範囲（この1年 / 年ごと）と、押して選んだ日
  const [range, setRange] = useState<CalendarRange>({ kind: "recent" })
  const [day, setDay] = useState<DayCell | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [onClose])
  useEffect(() => {
    setCopied(false)
    setRange({ kind: "recent" })
    setDay(null)
  }, [l.key])

  const weeks = useMemo(() => attendanceCalendar(l, data, range), [l, data, range])
  const years = useMemo(() => {
    const first = Number(data.streams[l.att[0][0]].date.slice(0, 4))
    const last = Number(data.streams[data.streams.length - 1].date.slice(0, 4))
    return Array.from({ length: last - first + 1 }, (_, i) => last - i)
  }, [l, data])
  const ranges: CalendarRange[] = [{ kind: "recent" }, ...years.map((year) => ({ kind: "year" as const, year }))]
  const rangeId = (r: CalendarRange) => (r.kind === "recent" ? "recent" : String(r.year))
  const mine = useMemo(() => new Map(l.att), [l])
  const friends = useMemo(() => companions(l, data), [l, data])
  // listeners は出席回数の多い順に並んでいる
  const rank = data.listeners.findIndex((x) => x.key === l.key) + 1
  const first = data.streams[l.att[0][0]]
  const last = data.streams[l.att[l.att.length - 1][0]]

  const copyLink = () => {
    navigator.clipboard
      ?.writeText(location.href)
      .then(() => setCopied(true))
      .catch(() => {})
  }
  const pill =
    "rounded-full border border-base-700 px-3 py-1.5 text-xs text-ink-dim hover:border-accent hover:text-ink"

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${l.name} の記録`}
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-[52rem] overflow-y-auto rounded-t-2xl border border-base-700 bg-base-800 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-base-700 p-3">
          <p className="truncate text-sm font-bold">{l.name}</p>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="shrink-0 rounded-full border border-base-700 px-3 py-1 text-xs text-ink-dim hover:border-accent hover:text-ink"
          >
            閉じる
          </button>
        </div>

        <div className="space-y-5 p-4">
          <div className="flex items-start gap-3.5">
            <Avatar listener={l} size={64} />
            <div className="min-w-0 flex-1">
              <p className="break-all text-xl font-black">{l.name}</p>
              <div className="mt-2">
                <TitleChips listener={l} data={data} />
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              ["出席", `${l.attend}回`],
              ["出席率", `${l.rate}%`],
              ["コメント", num(l.comments)],
              ["1回あたり", `${Math.round((l.comments / l.attend) * 10) / 10}件`],
              ["いまの連続", `${l.streak}回`],
              ["最長の連続", `${l.best}回`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-base-900 p-2.5">
                <dt className="text-[11px] text-ink-dim">{k}</dt>
                <dd className="mt-0.5 text-lg font-black text-accent">{v}</dd>
              </div>
            ))}
          </dl>

          <p className="text-xs leading-relaxed text-ink-dim">
            出席回数 第{rank}位（{data.listeners.length}人中）・初めて来た日 {first.date}・最後に来た日 {last.date}
            <br />
            出席率は、初めて来た回から後の配信のうち、コメントした回の割合です。
          </p>

          <section aria-label="出席カレンダー">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-ink-dim">出席カレンダー</h2>
              <div role="group" aria-label="表示する期間" className="flex gap-1">
                {ranges.map((r) => {
                  const on = rangeId(r) === rangeId(range)
                  return (
                    <button
                      key={rangeId(r)}
                      onClick={() => {
                        setRange(r)
                        setDay(null)
                      }}
                      aria-pressed={on}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                        on ? "border-accent text-accent" : "border-base-700 text-ink-dim hover:text-ink"
                      }`}
                    >
                      {r.kind === "recent" ? "この1年" : `${r.year}年`}
                    </button>
                  )
                })}
              </div>
            </div>
            <AttendanceGrid weeks={weeks} picked={day?.date} onPick={setDay} />
            <div className="mt-2 flex justify-end">
              <AttendanceLegend />
            </div>
            {day ? (
              <ul className="mt-2 space-y-1.5 rounded-xl bg-base-900 p-3 text-xs">
                {day.streams.map((i) => (
                  <li key={i}>
                    <span className="text-ink-dim">
                      {day.date} {data.streams[i].start}〜 ・
                      {mine.has(i) ? (
                        <span className="text-accent"> 出席（コメント {mine.get(i)}件）</span>
                      ) : (
                        " 欠席"
                      )}
                    </span>
                    <a
                      href={`https://www.youtube.com/watch?v=${data.streams[i].id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-bold hover:text-accent"
                    >
                      {data.streams[i].title} ↗
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11px] text-ink-dim">配信のあった日のマスを押すと、その日の配信が見られます。</p>
            )}
          </section>

          {friends.length > 0 && (
            <section aria-label="よく同じ配信にいる人">
              <h2 className="mb-2 text-sm font-bold text-ink-dim">よく同じ配信にいる人</h2>
              <ul className="flex flex-wrap gap-1.5">
                {friends.map(({ listener: o, count }) => (
                  <li key={o.key}>
                    <button onClick={() => onOpen(o.key)} className={`${pill} flex items-center gap-1.5 !py-1 !pl-1`}>
                      <Avatar listener={o} size={22} />
                      {o.name} <span className="text-accent">{count}回</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-wrap gap-2 border-t border-base-700 pt-4">
            <button
              onClick={onToggleMe}
              aria-pressed={isMe}
              className={
                isMe
                  ? "rounded-full border border-accent px-3 py-1.5 text-xs font-bold text-accent"
                  : "rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-base-900 hover:opacity-90"
              }
            >
              {isMe ? "✓ 自分の記録に登録中（押すと解除）" : "自分の記録に登録"}
            </button>
            <button onClick={copyLink} className={pill}>
              {copied ? "コピーしました" : "この記録のリンクをコピー"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
