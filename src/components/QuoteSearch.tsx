"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type MiniSearch from "minisearch"
import {
  fetchPopular,
  fetchTranscript,
  fetchTranscriptManifest,
} from "@/lib/data"
import type {
  PopularPhrase,
  Transcript,
  TranscriptManifestItem,
} from "@/lib/types"
import QuotePlayerModal from "./QuotePlayerModal"
import {
  fmtTime,
  highlightParts,
  loadSearchIndexes,
  searchAll,
  splitForHighlight,
  type IndexedHit,
} from "@/lib/quoteSearch"

/**
 * 配信アーカイブのキーワード全文検索。
 * - 完全にクライアント側で検索（サーバなし / MiniSearch）
 * - manifest / search-index / popular はこのコンポーネントのマウント時に初めて取得する
 *   （= 「キーワードから探す」タブを開くまで読み込まない）
 * - 本文は search-index に含まれないため、ヒットした配信の transcripts/<id>.json を遅延取得
 * - 検索語・選択動画・秒数は URLクエリ(?q= / ?v= / ?t=)と双方向同期（シェア用）
 *
 * 将来 /quotes へ切り出せるよう、ページ側からは差し込むだけで動く独立実装にしている。
 */

type SortMode = "relevance" | "newest"

const MAX_VIDEO_GROUPS = 12
const MAX_HITS_PER_VIDEO = 30
const DEBOUNCE_MS = 200

export default function QuoteSearch() {
  const router = useRouter()
  const params = useSearchParams()

  // ---- URLクエリ → 初期状態
  const urlQ = params.get("q") ?? ""
  const urlV = params.get("v") ?? ""
  const urlT = params.get("t") ?? ""

  const [input, setInput] = useState(urlQ)
  const [query, setQuery] = useState(urlQ)
  const [videoFilter, setVideoFilter] = useState(urlV)
  const [monthFilter, setMonthFilter] = useState("")
  const [sort, setSort] = useState<SortMode>("relevance")

  const [manifest, setManifest] = useState<TranscriptManifestItem[] | null>(null)
  const [popular, setPopular] = useState<PopularPhrase[]>([])
  const [engines, setEngines] = useState<MiniSearch[] | null>(null)
  const [segmentCount, setSegmentCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  /** videoId -> 本文（遅延取得のキャッシュ） */
  const [texts, setTexts] = useState<Record<string, Transcript>>({})
  const fetching = useRef<Set<string>>(new Set())

  // モーダル（再生）
  const [modal, setModal] = useState<{ videoId: string; segId: number; start: number } | null>(
    urlV && urlT ? { videoId: urlV, segId: -1, start: Number(urlT) || 0 } : null
  )

  // ---- 初回ロード（タブを開いた時点で初めて走る）
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [m, p, idx] = await Promise.all([
          fetchTranscriptManifest(),
          fetchPopular(),
          loadSearchIndexes(),
        ])
        if (!alive) return
        setManifest(m ?? [])
        setPopular(p?.items ?? [])
        setEngines(idx.engines)
        setSegmentCount(idx.segmentCount)
      } catch {
        if (alive) setLoadError("検索データの読み込みに失敗しました")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // ---- 入力のデバウンス
  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [input])

  // ---- 状態 → URLクエリ（双方向同期。履歴を汚さないよう replace）
  const syncUrl = useCallback(
    (next: { q?: string; v?: string; t?: string }) => {
      const sp = new URLSearchParams(Array.from(params.entries()))
      sp.set("tab", "quotes")
      const set = (k: string, val: string | undefined) => {
        if (val === undefined) return
        if (val) sp.set(k, val)
        else sp.delete(k)
      }
      set("q", next.q)
      set("v", next.v)
      set("t", next.t)
      router.replace(`/calendar/?${sp.toString()}`, { scroll: false })
    },
    [params, router]
  )

  useEffect(() => {
    if (query !== urlQ) syncUrl({ q: query })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    if (videoFilter !== urlV && !modal) syncUrl({ v: videoFilter })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFilter])

  // ---- URL(戻る/共有リンク)からの変更を取り込む
  useEffect(() => {
    if (urlQ !== query) {
      setInput(urlQ)
      setQuery(urlQ)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ])

  const manifestById = useMemo(() => {
    const m = new Map<string, TranscriptManifestItem>()
    for (const it of manifest ?? []) m.set(it.videoId, it)
    return m
  }, [manifest])

  const months = useMemo(() => {
    const set = new Set<string>()
    for (const it of manifest ?? []) {
      const ym = (it.date || "").slice(0, 7)
      if (ym) set.add(ym)
    }
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [manifest])

  // ---- 検索実行
  const hits = useMemo<IndexedHit[]>(() => {
    if (!engines || !query) return []
    return searchAll(engines, query)
  }, [engines, query])

  // ---- 絞り込み＋配信ごとのグルーピング
  const groups = useMemo(() => {
    const filtered = hits.filter((h) => {
      if (videoFilter && h.v !== videoFilter) return false
      if (monthFilter) {
        const d = manifestById.get(h.v)?.date ?? ""
        if (d.slice(0, 7) !== monthFilter) return false
      }
      return true
    })
    const byVideo = new Map<string, IndexedHit[]>()
    for (const h of filtered) {
      const arr = byVideo.get(h.v) ?? []
      arr.push(h)
      byVideo.set(h.v, arr)
    }
    let list = [...byVideo.entries()].map(([videoId, items]) => ({
      videoId,
      meta: manifestById.get(videoId),
      items: items.sort((a, b) => a.s - b.s).slice(0, MAX_HITS_PER_VIDEO),
      topScore: Math.max(...items.map((i) => i.score)),
      total: items.length,
    }))
    list =
      sort === "newest"
        ? list.sort((a, b) => (b.meta?.date ?? "").localeCompare(a.meta?.date ?? ""))
        : list.sort((a, b) => b.topScore - a.topScore)
    return list.slice(0, MAX_VIDEO_GROUPS)
  }, [hits, videoFilter, monthFilter, manifestById, sort])

  // ---- 表示に必要な配信の本文だけ遅延取得
  useEffect(() => {
    const need = groups.map((g) => g.videoId).filter((v) => !texts[v] && !fetching.current.has(v))
    if (!need.length) return
    for (const v of need) fetching.current.add(v)
    let alive = true
    ;(async () => {
      const loaded = await Promise.all(need.map((v) => fetchTranscript(v).catch(() => null)))
      if (!alive) return
      setTexts((prev) => {
        const next = { ...prev }
        loaded.forEach((doc, i) => {
          if (doc) next[need[i]] = doc
        })
        return next
      })
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups])

  // モーダル対象の本文も確保
  useEffect(() => {
    const v = modal?.videoId
    if (!v || texts[v] || fetching.current.has(v)) return
    fetching.current.add(v)
    fetchTranscript(v).then((doc) => {
      if (doc) setTexts((prev) => ({ ...prev, [v]: doc }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal?.videoId])

  const parts = useMemo(() => highlightParts(query), [query])

  const segText = (videoId: string, segId: number) =>
    texts[videoId]?.segments.find((s) => s.id === segId)?.text ?? ""

  const idToSegId = (id: string) => Number(id.split("#")[1] ?? -1)

  // モーダルの前後移動用に、現在の絞り込み後ヒットをフラットに並べる
  const flatHits = useMemo(
    () => groups.flatMap((g) => g.items.map((h) => ({ videoId: g.videoId, segId: idToSegId(h.id) }))),
    [groups]
  )

  const openModal = (videoId: string, segId: number, start: number) => {
    setModal({ videoId, segId, start })
    syncUrl({ v: videoId, t: String(Math.floor(start)) })
  }
  const closeModal = () => {
    setModal(null)
    syncUrl({ v: videoFilter, t: "" })
  }

  const runQuery = (q: string) => {
    setInput(q)
    setQuery(q)
  }

  // ---- 初回ロード中: スケルトン
  if (loading) return <Skeleton />

  const hasData = (manifest?.length ?? 0) > 0 && segmentCount > 0

  return (
    <div className="space-y-5">
      {/* 検索窓 */}
      <div className="relative">
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={hasData ? "キーワードで検索（例: お前らを笑顔に）" : "準備中…"}
          aria-label="配信アーカイブをキーワードで検索"
          disabled={!hasData}
          className="w-full rounded-2xl border border-base-700 bg-base-800 px-4 py-3 pr-10 text-sm text-ink placeholder:text-ink-dim focus:border-accent disabled:opacity-60"
        />
        <span aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-dim">
          🔍
        </span>
      </div>

      {/* よく出るキーワードのチップ（検索窓の直下・クリックで検索） */}
      {popular.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-bold tracking-[0.2em] text-ink-dim">よく出るキーワード</p>
          <ul className="flex flex-wrap gap-2">
            {popular.slice(0, 20).map((p) => (
              <li key={p.text}>
                <button
                  onClick={() => runQuery(p.text)}
                  className="rounded-full border border-base-700 bg-base-800 px-3 py-1.5 text-xs text-ink-dim transition-colors hover:border-accent hover:text-accent"
                >
                  {p.text}
                  <span className="ml-1.5 text-[10px] opacity-60">{p.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 絞り込み / 並び順 */}
      {hasData && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            aria-label="年月で絞り込む"
            className="rounded-full border border-base-700 bg-base-800 px-3 py-1.5 text-ink-dim focus:border-accent"
          >
            <option value="">すべての年月</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m.replace("-", "年")}月
              </option>
            ))}
          </select>
          <select
            value={videoFilter}
            onChange={(e) => setVideoFilter(e.target.value)}
            aria-label="配信で絞り込む"
            className="max-w-[60%] rounded-full border border-base-700 bg-base-800 px-3 py-1.5 text-ink-dim focus:border-accent"
          >
            <option value="">すべての配信</option>
            {(manifest ?? []).map((m) => (
              <option key={m.videoId} value={m.videoId}>
                {(m.date || "").slice(0, 10)} {m.title.slice(0, 30)}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            aria-label="並び順"
            className="rounded-full border border-base-700 bg-base-800 px-3 py-1.5 text-ink-dim focus:border-accent"
          >
            <option value="relevance">関連度順</option>
            <option value="newest">新しい順</option>
          </select>
          {(videoFilter || monthFilter) && (
            <button
              onClick={() => {
                setVideoFilter("")
                setMonthFilter("")
              }}
              className="text-ink-dim underline underline-offset-4 hover:text-ink"
            >
              絞り込み解除
            </button>
          )}
        </div>
      )}

      {/* 状態表示 */}
      {loadError && <p className="text-sm text-live">{loadError}</p>}
      {!hasData && !loadError && (
        <p className="rounded-2xl border border-dashed border-base-700 p-6 text-center text-sm text-ink-dim">
          文字起こしデータの生成待ちです。準備ができ次第、ここでキーワード検索ができるようになります。
        </p>
      )}

      {hasData && query && (
        <p className="text-xs text-ink-dim" aria-live="polite">
          「{query}」の検索結果 {hits.length.toLocaleString()} 件
          {groups.length > 0 && ` / ${groups.length} 配信`}
        </p>
      )}

      {/* 結果（配信ごとにグルーピング） */}
      {hasData && query && groups.length === 0 && (
        <div className="rounded-2xl border border-dashed border-base-700 p-6 text-center">
          <p className="text-sm text-ink-dim">
            「{query}」に一致する発言は見つかりませんでした。
          </p>
          {popular.length > 0 && (
            <>
              <p className="mt-4 text-xs text-ink-dim">こちらはよく出るキーワードです：</p>
              <ul className="mt-2 flex flex-wrap justify-center gap-2">
                {popular.slice(0, 10).map((p) => (
                  <li key={p.text}>
                    <button
                      onClick={() => runQuery(p.text)}
                      className="rounded-full border border-base-700 bg-base-800 px-3 py-1.5 text-xs text-ink-dim hover:border-accent hover:text-accent"
                    >
                      {p.text}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <ul className="space-y-4">
        {groups.map((g) => (
          <li key={g.videoId} className="overflow-hidden rounded-2xl border border-base-700 bg-base-800">
            <div className="flex items-start gap-3 border-b border-base-700 p-3">
              {g.meta?.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={g.meta.thumbnail}
                  alt=""
                  loading="lazy"
                  className="hidden aspect-video w-28 shrink-0 rounded-lg object-cover sm:block"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{g.meta?.title ?? g.videoId}</p>
                <p className="mt-0.5 text-[11px] text-ink-dim">
                  {(g.meta?.date || "").slice(0, 10)} ・ ヒット {g.total} 件
                </p>
              </div>
            </div>
            <ul>
              {g.items.map((h) => {
                const segId = idToSegId(h.id)
                const text = segText(g.videoId, segId)
                return (
                  <li key={h.id} className="border-b border-base-700 last:border-b-0">
                    <button
                      onClick={() => openModal(g.videoId, segId, h.s)}
                      className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-base-700/50"
                    >
                      <span className="mt-0.5 shrink-0 rounded border border-base-700 px-1.5 py-0.5 font-mono text-[11px] text-accent">
                        {fmtTime(h.s)}
                      </span>
                      <span className="text-sm leading-relaxed">
                        {text ? (
                          splitForHighlight(text, parts).map((p, i) =>
                            p.hit ? (
                              <mark key={i} className="rounded bg-accent/25 px-0.5 text-ink">
                                {p.t}
                              </mark>
                            ) : (
                              <span key={i}>{p.t}</span>
                            )
                          )
                        ) : (
                          <span className="inline-block h-4 w-40 animate-pulse rounded bg-base-700" />
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>

      {/* 免責 */}
      <p className="border-t border-base-700 pt-4 text-[11px] leading-relaxed text-ink-dim">
        ※ 本サイトは非公式のファンサイトです。文字起こしはAIによる自動生成のため、
        誤認識・聞き取り誤りを含みます。正確な内容は元の配信アーカイブをご確認ください。
        {segmentCount > 0 && ` （収録発言 ${segmentCount.toLocaleString()} 件）`}
      </p>

      {/* 再生モーダル */}
      {modal && (
        <QuotePlayerModal
          videoId={modal.videoId}
          segId={modal.segId}
          startSec={modal.start}
          transcript={texts[modal.videoId]}
          parts={parts}
          flatHits={flatHits}
          onClose={closeModal}
          onJump={(videoId, segId, start) => openModal(videoId, segId, start)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- スケルトン
function Skeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="検索データを読み込み中">
      <div className="h-12 animate-pulse rounded-2xl bg-base-800" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-7 w-24 animate-pulse rounded-full bg-base-800" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-base-800" />
        ))}
      </div>
    </div>
  )
}
