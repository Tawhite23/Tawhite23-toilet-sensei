"use client"
import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { fetchContents, fmtDuration } from "@/lib/data"
import type { ContentItem } from "@/lib/types"

const WEEK = ["日", "月", "火", "水", "木", "金", "土"]
const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export default function Calendar() {
  const [items, setItems] = useState<ContentItem[]>([])
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => { fetchContents().then((d) => d && setItems(d)) }, [])

  // 日付(ローカル) → その日のコンテンツ
  const byDay = useMemo(() => {
    const m = new Map<string, ContentItem[]>()
    for (const it of items) {
      const k = toKey(new Date(it.date))
      const arr = m.get(k) ?? []
      arr.push(it)
      m.set(k, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.date.localeCompare(b.date))
    return m
  }, [items])

  const y = cursor.getFullYear(), mo = cursor.getMonth()
  const firstDow = new Date(y, mo, 1).getDay()
  const daysInMonth = new Date(y, mo + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const selectedItems = selected ? byDay.get(selected) ?? [] : []

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-8 md:pt-24">
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => { setSelected(null); setCursor(new Date(y, mo - 1, 1)) }}
          aria-label="前の月"
          className="rounded-full border border-base-700 px-4 py-2 text-sm hover:border-accent"
        >←</button>
        <h1 className="text-xl font-bold" aria-live="polite">{y}年{mo + 1}月</h1>
        <button
          onClick={() => { setSelected(null); setCursor(new Date(y, mo + 1, 1)) }}
          aria-label="次の月"
          className="rounded-full border border-base-700 px-4 py-2 text-sm hover:border-accent"
        >→</button>
      </div>

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
                const key = `${y}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                const dayItems = byDay.get(key) ?? []
                const hasLive = dayItems.some((i) => i.type === "live")
                const hasVideo = dayItems.some((i) => i.type === "video")
                const isSel = selected === key
                return (
                  <td key={c}>
                    <button
                      onClick={() => setSelected(isSel ? null : key)}
                      aria-pressed={isSel}
                      aria-label={`${mo + 1}月${day}日 配信${dayItems.filter(i=>i.type==="live").length}件 動画${dayItems.filter(i=>i.type==="video").length}件`}
                      className={`flex aspect-square w-full flex-col items-center justify-center rounded-lg border text-sm transition-colors ${
                        isSel ? "border-accent bg-base-700" : dayItems.length ? "border-base-700 bg-base-800 hover:border-accent" : "border-transparent text-ink-dim"
                      }`}
                    >
                      <span>{day}</span>
                      <span className="mt-0.5 flex h-1.5 gap-1" aria-hidden="true">
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

      <p className="mt-3 flex justify-center gap-4 text-xs text-ink-dim">
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
                {selectedItems.map((it) => (
                  <li key={it.videoId}>
                    <a
                      href={`https://www.youtube.com/watch?v=${it.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block overflow-hidden rounded-xl border border-base-700 bg-base-800 hover:border-accent"
                    >
                      {it.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                      )}
                      <div className="p-3">
                        <span className={`text-[10px] font-bold ${it.type === "live" ? "text-live" : "text-accent"}`}>
                          {it.type === "live" ? "配信" : "動画"}
                          {it.durationSec > 0 && ` · ${fmtDuration(it.durationSec)}`}
                        </span>
                        <p className="mt-1 line-clamp-2 text-sm leading-snug group-hover:text-accent">{it.title}</p>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}
