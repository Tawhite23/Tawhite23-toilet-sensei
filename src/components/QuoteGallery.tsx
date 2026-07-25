"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { fetchQuotes, fetchTranscript } from "@/lib/data"
import type { QuoteItem, Transcript } from "@/lib/types"
import { fmtTime } from "@/lib/quoteSearch"
import QuotePlayerModal from "./QuotePlayerModal"

/**
 * 名言集（五十音索引つき）。
 * - quotes.json（自動抽出した名言候補）を読み、発言の読みの頭文字で「あ行〜わ行」に分類して表示
 * - キーワード検索と違い、こちらは「頻度が低くても印象的な、長さのある言い切り」を集めたもの
 * - 行の選択は ?row= と双方向同期（シェア用）。再生モーダルは ?v= / ?t=
 * - 名言集タブを開いたときに初めて quotes.json を取得する
 */

const ROWS = ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ", "その他"] as const
type SortMode = "score" | "newest" | "long"

export default function QuoteGallery() {
  const router = useRouter()
  const params = useSearchParams()
  const urlRow = params.get("row") ?? ""

  const [items, setItems] = useState<QuoteItem[] | null>(null)
  const [rows, setRows] = useState<Record<string, number>>({})
  const [row, setRow] = useState(urlRow)
  const [sort, setSort] = useState<SortMode>("score")
  const [loading, setLoading] = useState(true)

  const [texts, setTexts] = useState<Record<string, Transcript>>({})
  const fetching = useRef<Set<string>>(new Set())
  const [modal, setModal] = useState<{ videoId: string; segId: number } | null>(null)

  useEffect(() => {
    let alive = true
    fetchQuotes()
      .then((q) => {
        if (!alive) return
        setItems(q?.items ?? [])
        setRows(q?.rows ?? {})
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const syncUrl = useCallback(
    (next: { row?: string; v?: string; t?: string }) => {
      const sp = new URLSearchParams(Array.from(params.entries()))
      sp.set("tab", "quotes")
      const set = (k: string, val?: string) => {
        if (val === undefined) return
        if (val) sp.set(k, val)
        else sp.delete(k)
      }
      set("row", next.row)
      set("v", next.v)
      set("t", next.t)
      router.replace(`/calendar/?${sp.toString()}`, { scroll: false })
    },
    [params, router]
  )

  const selectRow = (r: string) => {
    const next = row === r ? "" : r
    setRow(next)
    syncUrl({ row: next })
  }

  const shown = useMemo(() => {
    let list = [...(items ?? [])]
    if (row) list = list.filter((q) => q.row === row)
    if (sort === "newest") list.sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    else if (sort === "long") list.sort((a, b) => b.text.length - a.text.length)
    else list.sort((a, b) => b.score - a.score)
    return list
  }, [items, row, sort])

  // モーダル対象の本文を遅延取得（前後の発言表示のため）
  useEffect(() => {
    const v = modal?.videoId
    if (!v || texts[v] || fetching.current.has(v)) return
    fetching.current.add(v)
    fetchTranscript(v).then((doc) => {
      if (doc) setTexts((prev) => ({ ...prev, [v]: doc }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal?.videoId])

  const openModal = (q: QuoteItem) => {
    setModal({ videoId: q.videoId, segId: q.segmentId })
    syncUrl({ v: q.videoId, t: String(Math.floor(q.start)) })
  }
  const closeModal = () => {
    setModal(null)
    syncUrl({ v: "", t: "" })
  }

  // モーダルの「前/次」用に、表示中の並びをそのまま渡す
  const flatHits = useMemo(
    () => shown.map((q) => ({ videoId: q.videoId, segId: q.segmentId })),
    [shown]
  )

  if (loading) return <Skeleton />

  if (!items?.length) {
    return (
      <p className="rounded-2xl border border-dashed border-base-700 p-6 text-center text-sm text-ink-dim">
        名言データの生成待ちです。文字起こしが増えると、ここに名言が並びます。
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-ink-dim">
        配信の中から「らしい」発言を自動で抽出したコーナーです。読みの頭文字で引けます。
      </p>

      {/* 五十音索引 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-bold tracking-[0.2em] text-ink-dim">五十音索引</p>
          {row && (
            <button
              onClick={() => selectRow(row)}
              className="text-[11px] text-ink-dim underline underline-offset-4 hover:text-ink"
            >
              すべて表示
            </button>
          )}
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {ROWS.map((r) => {
            const n = rows[r] ?? 0
            const active = row === r
            return (
              <li key={r}>
                <button
                  onClick={() => selectRow(r)}
                  disabled={n === 0}
                  aria-pressed={active}
                  className={`min-w-[2.75rem] rounded-lg border px-2 py-2 text-sm font-bold transition-colors ${
                    active
                      ? "border-accent bg-base-700 text-accent"
                      : n === 0
                        ? "border-transparent text-ink-dim opacity-30"
                        : "border-base-700 bg-base-800 text-ink hover:border-accent"
                  }`}
                >
                  {r}
                  <span className="ml-1 text-[10px] font-normal opacity-60">{n}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* 並び順 */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          aria-label="並び順"
          className="rounded-full border border-base-700 bg-base-800 px-3 py-1.5 text-ink-dim focus:border-accent"
        >
          <option value="score">おすすめ順</option>
          <option value="newest">新しい順</option>
          <option value="long">長い順</option>
        </select>
        <span className="text-ink-dim">
          {row ? `「${row}行」` : "全"} {shown.length} 件
        </span>
      </div>

      {/* 名言カード */}
      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((q) => (
          <li key={`${q.videoId}#${q.segmentId}`}>
            <button
              onClick={() => openModal(q)}
              className="flex h-full w-full flex-col justify-between gap-2 rounded-2xl border border-base-700 bg-base-800 p-4 text-left transition-colors hover:border-accent"
            >
              <p className="text-[15px] font-medium leading-relaxed">
                <span aria-hidden="true" className="mr-1 text-accent">
                  “
                </span>
                {q.text}
                <span aria-hidden="true" className="ml-1 text-accent">
                  ”
                </span>
              </p>
              <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-dim">
                <span className="rounded border border-base-700 px-1.5 py-0.5 font-mono text-accent">
                  {fmtTime(q.start)}
                </span>
                <span className="truncate">{q.title}</span>
                <span>{(q.date || "").slice(0, 10)}</span>
                {q.picked && (
                  <span className="rounded-full border border-accent px-1.5 py-0.5 text-accent">推し</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="border-t border-base-700 pt-4 text-[11px] leading-relaxed text-ink-dim">
        ※ 本サイトは非公式のファンサイトです。文字起こしはAIによる自動生成のため、
        誤認識・聞き取り誤りを含みます。名言の抽出も自動判定なので、正確な内容は元の配信アーカイブをご確認ください。
      </p>

      {modal && (
        <QuotePlayerModal
          videoId={modal.videoId}
          segId={modal.segId}
          transcript={texts[modal.videoId]}
          parts={[]}
          flatHits={flatHits}
          onClose={closeModal}
          onJump={(videoId, segId, start) => {
            setModal({ videoId, segId })
            syncUrl({ v: videoId, t: String(Math.floor(start)) })
          }}
        />
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="名言を読み込み中">
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }).map((_, i) => (
          <div key={i} className="h-10 w-11 animate-pulse rounded-lg bg-base-800" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-base-800" />
        ))}
      </div>
    </div>
  )
}
