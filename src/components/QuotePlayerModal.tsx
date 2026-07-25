"use client"
import { useEffect } from "react"
import type { Transcript } from "@/lib/types"
import { fmtTime, splitForHighlight } from "@/lib/quoteSearch"

/**
 * 発言のその秒から再生するモーダル。
 * キーワード検索(QuoteSearch)と名言集(QuoteGallery)の両方から使う共通コンポーネント。
 */
// ---------------------------------------------------------------- モーダル
export default function QuotePlayerModal({
  videoId,
  segId,
  transcript,
  parts,
  flatHits,
  onClose,
  onJump,
}: {
  videoId: string
  segId: number
  transcript?: Transcript
  parts: string[]
  flatHits: { videoId: string; segId: number }[]
  onClose: () => void
  onJump: (videoId: string, segId: number, start: number) => void
}) {
  const segments = transcript?.segments ?? []
  const index = segments.findIndex((s) => s.id === segId)
  const current = index >= 0 ? segments[index] : segments[0]
  const start = Math.max(0, Math.floor(current?.start ?? 0))
  const around = index >= 0 ? segments.slice(Math.max(0, index - 3), index + 4) : segments.slice(0, 5)

  const pos = flatHits.findIndex((h) => h.videoId === videoId && h.segId === segId)
  const prev = pos > 0 ? flatHits[pos - 1] : null
  const next = pos >= 0 && pos < flatHits.length - 1 ? flatHits[pos + 1] : null

  const jumpTo = (target: { videoId: string; segId: number } | null) => {
    if (!target) return
    const s =
      target.videoId === videoId
        ? segments.find((x) => x.id === target.segId)?.start ?? 0
        : 0
    onJump(target.videoId, target.segId, s)
  }

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="発言の再生"
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-base-700 bg-base-800 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-base-700 p-3">
          <p className="truncate text-sm font-bold">{transcript?.title ?? videoId}</p>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="shrink-0 rounded-full border border-base-700 px-3 py-1 text-xs text-ink-dim hover:border-accent hover:text-ink"
          >
            閉じる
          </button>
        </div>

        <div className="aspect-video w-full bg-black">
          {/* start= でその秒から再生 */}
          <iframe
            key={`${videoId}-${start}`}
            src={`https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1&rel=0`}
            title="配信アーカイブ"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-base-700 p-3 text-xs">
          <button
            onClick={() => jumpTo(prev)}
            disabled={!prev}
            className="rounded-full border border-base-700 px-3 py-1.5 text-ink-dim hover:border-accent hover:text-ink disabled:opacity-40"
          >
            ← 前のヒット
          </button>
          <button
            onClick={() => jumpTo(next)}
            disabled={!next}
            className="rounded-full border border-base-700 px-3 py-1.5 text-ink-dim hover:border-accent hover:text-ink disabled:opacity-40"
          >
            次のヒット →
          </button>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}&t=${start}s`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto rounded-full border border-base-700 px-3 py-1.5 text-ink-dim hover:border-accent hover:text-accent"
          >
            YouTubeで開く ↗
          </a>
        </div>

        {/* 前後の発言 */}
        <ul className="p-3">
          {around.map((s) => (
            <li
              key={s.id}
              className={`flex items-start gap-3 rounded-lg px-2 py-1.5 text-sm ${
                s.id === current?.id ? "bg-base-700/60" : ""
              }`}
            >
              <button
                onClick={() => onJump(videoId, s.id, s.start)}
                className="mt-0.5 shrink-0 font-mono text-[11px] text-accent hover:underline"
              >
                {fmtTime(s.start)}
              </button>
              <span className="leading-relaxed">
                {splitForHighlight(s.text, parts).map((p, i) =>
                  p.hit ? (
                    <mark key={i} className="rounded bg-accent/25 px-0.5 text-ink">
                      {p.t}
                    </mark>
                  ) : (
                    <span key={i}>{p.t}</span>
                  )
                )}
              </span>
            </li>
          ))}
          {!transcript && (
            <li className="px-2 py-3 text-xs text-ink-dim">発言を読み込み中…</li>
          )}
        </ul>
      </div>
    </div>
  )
}
