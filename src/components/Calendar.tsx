"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { fetchContents, fmtDuration } from "@/lib/data"
import type { ContentItem } from "@/lib/types"

const WEEK = ["日", "月", "火", "水", "木", "金", "土"]
const pad = (n: number) => String(n).padStart(2, "0")

/**
 * 日時はすべて日本時間(JST)で扱う。
 * 閲覧者の端末タイムゾーンに依存すると「日付」「時間帯」がズレるため、
 * UTC+9 に寄せた Date を作り UTC系ゲッターで読む方式に統一している。
 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const toJst = (iso: string) => new Date(new Date(iso).getTime() + JST_OFFSET_MS)
const jstDayKey = (iso: string) => {
  const d = toJst(iso)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
const jstHour = (iso: string) => toJst(iso).getUTCHours()
const jstTimeLabel = (iso: string) => {
  const d = toJst(iso)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** 未来の配信予定か（status優先。保険として未来日付のliveも予定扱い） */
const isUpcoming = (it: ContentItem) =>
  it.status === "upcoming" ||
  (it.type === "live" && it.durationSec === 0 && new Date(it.date).getTime() > Date.now())

type Cursor = { y: number; mo: number } // mo は 0-11
/** カレンダー表示の切り替え。grid=日付マス / hours=日付×時間帯 */
type View = "grid" | "hours"

export default function Calendar() {
  const [items, setItems] = useState<ContentItem[]>([])
  /**
   * 「今月」は端末の時計に依存するため、サーバー側の事前レンダリング結果と
   * 食い違ってハイドレーションエラー（= client-side exception）になりうる。
   * そのためマウント後に初めて確定させる。
   */
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<View>("grid")

  useEffect(() => {
    const now = new Date(Date.now() + JST_OFFSET_MS)
    setCursor({ y: now.getUTCFullYear(), mo: now.getUTCMonth() })
  }, [])

  useEffect(() => {
    fetchContents().then((d) => d && setItems(d))
  }, [])

  // 日付(JST) → その日のコンテンツ
  // 【2-3】予定(upcoming)は date=実際の配信予定日 で登録される
  const byDay = useMemo(() => {
    const m = new Map<string, ContentItem[]>()
    for (const it of items) {
      if (!it?.date) continue
      const k = jstDayKey(it.date)
      const arr = m.get(k) ?? []
      arr.push(it)
      m.set(k, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.date.localeCompare(b.date))
    return m
  }, [items])

  // 表示中の月の「配信開始時刻」を0-23時で集計（ゴールデンタイム可視化用）
  const hourStats = useMemo(() => {
    const counts = new Array<number>(24).fill(0)
    if (!cursor) return { counts, max: 0, total: 0, peak: [] as number[] }
    const ym = `${cursor.y}-${pad(cursor.mo + 1)}`
    let total = 0
    for (const it of items) {
      if (!it?.date || isUpcoming(it) || it.type !== "live") continue
      if (jstDayKey(it.date).slice(0, 7) !== ym) continue
      counts[jstHour(it.date)]++
      total++
    }
    const max = Math.max(0, ...counts)
    const peak = max > 0 ? counts.map((c, h) => (c === max ? h : -1)).filter((h) => h >= 0) : []
    return { counts, max, total, peak }
  }, [items, cursor])

  if (!cursor) return <CalendarSkeleton />

  const { y, mo } = cursor
  const firstDow = new Date(Date.UTC(y, mo, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate()
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const selectedItems = selected ? byDay.get(selected) ?? [] : []
  const move = (delta: number) => {
    setSelected(null)
    const d = new Date(Date.UTC(y, mo + delta, 1))
    setCursor({ y: d.getUTCFullYear(), mo: d.getUTCMonth() })
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => move(-1)}
          aria-label="前の月"
          className="rounded-full border border-base-700 px-4 py-2 text-sm hover:border-accent"
        >←</button>
        <h1 className="text-xl font-bold" aria-live="polite">{y}年{mo + 1}月</h1>
        <button
          onClick={() => move(1)}
          aria-label="次の月"
          className="rounded-full border border-base-700 px-4 py-2 text-sm hover:border-accent"
        >→</button>
      </div>

      {/* 表示切り替え: 日付マス / 日付×時間帯 */}
      <div
        role="group"
        aria-label="カレンダーの表示形式"
        className="mb-4 flex gap-1 rounded-full border border-base-700 bg-base-800 p-1"
      >
        {([["grid", "日付"], ["hours", "時間帯"]] as [View, string][]).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              view === v ? "bg-base-700 text-accent" : "text-ink-dim hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "hours" ? (
        <DayHours
          y={y}
          mo={mo}
          daysInMonth={daysInMonth}
          byDay={byDay}
          selected={selected}
          onSelect={(k) => setSelected(selected === k ? null : k)}
          peak={hourStats.peak}
        />
      ) : (
      <table className="w-full table-fixed border-separate border-spacing-1" role="grid">
        <thead>
          <tr>
            {WEEK.map((w, i) => (
              <th key={w} scope="col" className={`pb-1 text-xs font-medium ${i === 0 ? "text-live" : i === 6 ? "text-accent" : "text-ink-dim"}`}>
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.ceil(cells.length / 7) }, (_, r) => (
            <tr key={r}>
              {cells.slice(r * 7, r * 7 + 7).concat(Array(7).fill(null)).slice(0, 7).map((day, c) => {
                if (day === null) return <td key={c} aria-hidden="true" />
                const key = `${y}-${pad(mo + 1)}-${pad(day)}`
                const dayItems = byDay.get(key) ?? []
                const upcoming = dayItems.filter(isUpcoming)
                const done = dayItems.filter((i) => !isUpcoming(i))
                const hasLive = done.some((i) => i.type === "live")
                const hasVideo = done.some((i) => i.type === "video")
                const hasPlan = upcoming.length > 0
                const isSel = selected === key
                return (
                  <td key={c}>
                    <button
                      onClick={() => setSelected(isSel ? null : key)}
                      aria-pressed={isSel}
                      aria-label={`${mo + 1}月${day}日 配信予定${upcoming.length}件 配信${done.filter(i=>i.type==="live").length}件 動画${done.filter(i=>i.type==="video").length}件`}
                      className={`flex aspect-square w-full flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                        isSel
                          ? "border border-accent bg-base-700"
                          : hasPlan
                            ? "border border-dashed border-plan bg-base-800 hover:border-accent"
                            : dayItems.length
                              ? "border border-base-700 bg-base-800 hover:border-accent"
                              : "border border-transparent text-ink-dim"
                      }`}
                    >
                      <span>{day}</span>
                      <span className="mt-0.5 flex h-1.5 gap-1" aria-hidden="true">
                        {hasPlan && <span className="h-1.5 w-1.5 rounded-full bg-plan" />}
                        {hasLive && <span className="h-1.5 w-1.5 rounded-full bg-live" />}
                        {hasVideo && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                      </span>
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      )}

      <p className="mt-3 flex justify-center gap-4 text-xs text-ink-dim">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-plan" aria-hidden="true" />配信予定</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-live" aria-hidden="true" />配信アーカイブ</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-accent" aria-hidden="true" />動画投稿</span>
      </p>

      <AnimatePresence>
        {selected && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6 overflow-hidden"
            aria-label={`${selected} のコンテンツ一覧`}
          >
            <h2 className="mb-3 text-sm font-bold text-ink-dim">{selected}</h2>
            {selectedItems.length === 0 ? (
              <p className="text-sm text-ink-dim">この日の投稿はありません。</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {selectedItems.map((it) => {
                  const plan = isUpcoming(it)
                  return (
                    <li key={it.videoId}>
                      <a
                        href={`https://www.youtube.com/watch?v=${it.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`group block overflow-hidden rounded-xl bg-base-800 hover:border-accent ${
                          plan ? "border-2 border-dashed border-plan" : "border border-base-700"
                        }`}
                      >
                        {it.thumbnail && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                        )}
                        <div className="p-3">
                          <span className={`text-[10px] font-bold ${plan ? "text-plan" : it.type === "live" ? "text-live" : "text-accent"}`}>
                            {plan ? (
                              <span className="mr-1 inline-block rounded border border-plan px-1.5 py-px">予定</span>
                            ) : (
                              it.type === "live" ? "配信" : "動画"
                            )}
                            {/* 開始時刻(JST)を常に表示 → 時間帯グラフと突き合わせられる */}
                            {` ${jstTimeLabel(it.date)}`}
                            {plan
                              ? " 開始予定"
                              : it.durationSec > 0 && ` · ${fmtDuration(it.durationSec)}`}
                          </span>
                          <p className="mt-1 line-clamp-2 text-sm leading-snug group-hover:text-accent">{it.title}</p>
                        </div>
                      </a>
                      {/* 発見性導線: この配信の発言検索へ（1ページ+クエリで表現） */}
                      {!plan && it.type === "live" && (
                        <Link
                          href={`/calendar/?tab=quotes&v=${it.videoId}`}
                          className="mt-1 inline-flex items-center gap-1 px-1 text-[11px] text-ink-dim underline underline-offset-4 hover:text-accent"
                        >
                          この配信の発言を検索 →
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * 「時間帯」表示: 左に日付、右にその日配信していた時間帯を横帯で描く。
 * カレンダーの表示切り替えとして扱うため、日付の並びはそのまま1日〜末日。
 * 帯は 0:00〜24:00(日本時間) を横幅100%に対応させ、
 * 配信の開始時刻から配信時間ぶんの長さで置く（日を跨ぐ分は24時で切る）。
 * 最も配信が始まりやすい時間帯(ゴールデンタイム)は背景を薄く塗って示す。
 */
function DayHours({
  y,
  mo,
  daysInMonth,
  byDay,
  selected,
  onSelect,
  peak,
}: {
  y: number
  mo: number
  daysInMonth: number
  byDay: Map<string, ContentItem[]>
  selected: string | null
  onSelect: (key: string) => void
  peak: number[]
}) {
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const hasAny = days.some((d) => (byDay.get(`${y}-${pad(mo + 1)}-${pad(d)}`) ?? []).length > 0)

  return (
    <section aria-label={`${y}年${mo + 1}月の日付別 配信時間帯`}>
      {/* 目盛り(0-24時) */}
      <div className="mb-1 flex items-end gap-2">
        <span className="w-14 shrink-0 text-[10px] text-ink-dim">日付</span>
        <div className="relative h-4 flex-1" aria-hidden="true">
          {[0, 6, 12, 18, 24].map((h) => (
            <span
              key={h}
              className="absolute top-0 -translate-x-1/2 text-[10px] text-ink-dim"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {h}
            </span>
          ))}
        </div>
      </div>

      {!hasAny && (
        <p className="rounded-2xl border border-dashed border-base-700 p-6 text-center text-sm text-ink-dim">
          この月の記録はまだありません。
        </p>
      )}

      <ul className="space-y-[3px]">
        {days.map((d) => {
          const key = `${y}-${pad(mo + 1)}-${pad(d)}`
          const items = byDay.get(key) ?? []
          const dow = new Date(Date.UTC(y, mo, d)).getUTCDay()
          const isSel = selected === key
          return (
            <li key={d}>
              <button
                onClick={() => onSelect(key)}
                aria-pressed={isSel}
                aria-label={`${mo + 1}月${d}日 ${items.length}件`}
                className={`flex w-full items-center gap-2 rounded-lg py-0.5 pr-1 text-left transition-colors ${
                  isSel ? "bg-base-700" : "hover:bg-base-800"
                }`}
              >
                <span
                  className={`w-14 shrink-0 pl-1 text-[11px] tabular-nums ${
                    dow === 0 ? "text-live" : dow === 6 ? "text-accent" : "text-ink-dim"
                  }`}
                >
                  {d}日({WEEK[dow]})
                </span>

                {/* 24時間トラック */}
                <span className="relative block h-5 flex-1 overflow-hidden rounded bg-base-800">
                  {/* ゴールデンタイムの背景 */}
                  {peak.map((h) => (
                    <span
                      key={`p${h}`}
                      aria-hidden="true"
                      className="absolute inset-y-0 bg-accent/10"
                      style={{ left: `${(h / 24) * 100}%`, width: `${(1 / 24) * 100}%` }}
                    />
                  ))}
                  {/* 3時間ごとの区切り */}
                  {[3, 6, 9, 12, 15, 18, 21].map((h) => (
                    <span
                      key={`g${h}`}
                      aria-hidden="true"
                      className="absolute inset-y-0 w-px bg-base-700"
                      style={{ left: `${(h / 24) * 100}%` }}
                    />
                  ))}

                  {items.map((it) => {
                    const plan = isUpcoming(it)
                    const jst = toJst(it.date)
                    const startH = jst.getUTCHours() + jst.getUTCMinutes() / 60
                    // 予定と動画投稿は長さを持たないので、細い印として最小幅で置く
                    const hours = plan || it.type === "video" ? 0 : it.durationSec / 3600
                    const width = Math.max(hours, 0.35)
                    const left = (startH / 24) * 100
                    const w = Math.min(width / 24, 1 - startH / 24) * 100
                    return (
                      <span
                        key={it.videoId}
                        title={`${jstTimeLabel(it.date)} ${it.title}`}
                        className={`absolute inset-y-[3px] rounded-sm ${
                          plan
                            ? "border border-dashed border-plan bg-transparent"
                            : it.type === "live"
                              ? "bg-live"
                              : "bg-accent"
                        }`}
                        style={{ left: `${left}%`, width: `${Math.max(w, 1.2)}%` }}
                      />
                    )
                  })}
                </span>

                <span className="w-6 shrink-0 text-right text-[10px] text-ink-dim tabular-nums">
                  {items.length || ""}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {peak.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-ink-dim">
          <span className="mr-1 inline-block h-2 w-3 rounded-sm bg-accent/30" aria-hidden="true" />
          この月のゴールデンタイム（配信が始まりやすい時間帯）は
          <span className="mx-1 font-bold text-accent">
            {peak.map((h) => `${pad(h)}:00〜${pad((h + 1) % 24)}:00`).join(" / ")}
          </span>
          です。帯の長さは配信時間、点線は配信予定です。
        </p>
      )}
    </section>
  )
}

function CalendarSkeleton() {
  return (
    <div aria-busy="true" aria-label="カレンダーを読み込み中">
      <div className="mb-4 h-10 animate-pulse rounded-full bg-base-800" />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-lg bg-base-800" />
        ))}
      </div>
      <div className="mt-6 h-40 animate-pulse rounded-2xl bg-base-800" />
    </div>
  )
}
