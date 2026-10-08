"use client"
import { useEffect, useRef } from "react"
import type { DayCell } from "@/lib/listeners"

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"]
// 出席した日の濃さ（コメントの多さ）。このサイトの色はCSS変数なので、透明度は style で付ける
const LEVEL_OPACITY = [1, 0.35, 0.55, 0.78, 1]

const cellClass = (c: DayCell) =>
  c.level > 0 ? "bg-accent" : c.streams.length > 0 ? "bg-base-700" : "bg-base-900"
const cellTitle = (c: DayCell) =>
  c.level > 0
    ? `${c.date}（${WEEKDAYS[new Date(c.date).getUTCDay()]}） 出席・コメント${c.comments}件`
    : c.streams.length > 0
      ? `${c.date}（${WEEKDAYS[new Date(c.date).getUTCDay()]}） 配信あり・欠席`
      : `${c.date}（${WEEKDAYS[new Date(c.date).getUTCDay()]}） 配信なし`

/**
 * 出席カレンダー。1日1マスで、縦が日〜土、横が週（GitHubの草と同じ並び）。
 * 「配信がなかった日」と「配信はあったが来なかった日」を色で分けている。
 * 幅が足りない画面では横スクロールにし、最初から右端（新しい側）を見せる。
 */
export default function AttendanceGrid({
  weeks,
  picked,
  onPick,
}: {
  weeks: (DayCell | null)[][]
  picked?: string | null
  /** 配信のあった日を押したとき（渡さなければマスは押せない） */
  onPick?: (cell: DayCell) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [weeks])

  let prevMonth = ""
  return (
    <div className="flex gap-1.5">
      <div aria-hidden="true" className="flex shrink-0 flex-col gap-[3px] pt-[19px] text-[10px] leading-[11px] text-ink-dim">
        {WEEKDAYS.map((w, i) => (
          <span key={w} className="h-[11px]">
            {i % 2 === 1 ? w : ""}
          </span>
        ))}
      </div>
      <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto pb-1">
        <div className="flex w-max gap-[3px]">
          {weeks.map((week, wi) => {
            const first = week.find((c) => c)!
            const month = first.date.slice(0, 7)
            // 月の最初の週にだけ月名を出す（先頭の列は半端な週のことがあるので、次の月名と近すぎるときは出さない）
            const label = month !== prevMonth && !(wi === 0 && Number(first.date.slice(8)) > 14)
            prevMonth = month
            return (
              <div key={wi} className="flex w-[11px] flex-col gap-[3px]">
                <span aria-hidden="true" className="h-4 whitespace-nowrap text-[10px] leading-4 text-ink-dim">
                  {label ? `${Number(month.slice(5))}月` : ""}
                </span>
                {week.map((c, di) =>
                  !c ? (
                    <span key={di} className="h-[11px]" />
                  ) : onPick && c.streams.length > 0 ? (
                    <button
                      key={di}
                      onClick={() => onPick(c)}
                      title={cellTitle(c)}
                      aria-label={cellTitle(c)}
                      aria-pressed={picked === c.date}
                      className={`h-[11px] rounded-[2px] ${cellClass(c)} ${
                        picked === c.date ? "outline outline-2 outline-offset-1 outline-ink" : ""
                      }`}
                      style={{ opacity: LEVEL_OPACITY[c.level] }}
                    />
                  ) : (
                    <span
                      key={di}
                      title={cellTitle(c)}
                      className={`h-[11px] rounded-[2px] ${cellClass(c)}`}
                      style={{ opacity: LEVEL_OPACITY[c.level] }}
                    />
                  )
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** マスの色の説明 */
export function AttendanceLegend() {
  const box = "inline-block h-[11px] w-[11px] rounded-[2px] align-[-1px]"
  return (
    <p className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-ink-dim">
      <span>
        <i className={`${box} border border-base-700 bg-base-900`} /> 配信なし
      </span>
      <span>
        <i className={`${box} bg-base-700`} /> 欠席
      </span>
      <span className="flex items-center gap-[3px]">
        出席 少
        {LEVEL_OPACITY.slice(1).map((o) => (
          <i key={o} className={`${box} bg-accent`} style={{ opacity: o }} />
        ))}
        多
      </span>
    </p>
  )
}
