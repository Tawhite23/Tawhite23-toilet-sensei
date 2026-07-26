"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { motion } from "framer-motion"
import { useRouter, useSearchParams } from "next/navigation"
import Calendar from "./Calendar"

// キーワード検索(MiniSearchを内包)と名言集は、そのタブを開くまで
// JS自体を読み込ませない（コード分割）。カレンダーだけ見る人の初期表示を軽くする。
const QuoteSearch = dynamic(() => import("./QuoteSearch"), {
  ssr: false,
  loading: () => <TabSkeleton />,
})
const QuoteGallery = dynamic(() => import("./QuoteGallery"), {
  ssr: false,
  loading: () => <TabSkeleton />,
})

/**
 * /calendar を3タブに切り替える。
 *   日付から探す（既存カレンダー） / キーワードから探す（全文検索） / 名言集（五十音索引）
 * - Nav(既存4項目)は変更しない。新規ページも作らない（output: export の制約に合わせ
 *   1ページ + クエリパラメータで表現する）。
 * - タブ状態は ?tab=quotes / ?tab=meigen と双方向同期。URLを開くだけで復元される。
 * - 各タブのコンポーネントは選択時に初めてマウントされるため、
 *   カレンダーだけ見る人には検索インデックスや名言データを読み込ませない。
 * - タブバー全面(=ボタンと同じ判定面)で左右スワイプしても切り替えられる。
 *   バーの中に「水」が入っていて、選択中タブの位置に溜まっているイメージ。
 *   スワイプ中は指の動きにその場で追従し、離すと隣のタブへ吸い込まれるように決着する。
 *   タップでの切替挙動そのものは変更しない。
 */
type Tab = "date" | "quotes" | "meigen"
const TABS: { key: Tab; label: string }[] = [
  { key: "date", label: "日付から探す" },
  { key: "quotes", label: "キーワードから探す" },
  { key: "meigen", label: "名言集" },
]
// タブ幅に対してこの割合を超えて指を動かしたら、隣のタブへ切り替える
const SWIPE_COMMIT_RATIO = 0.18

export default function CalendarTabs() {
  const router = useRouter()
  const params = useSearchParams()
  const raw = params.get("tab")
  const tab: Tab = raw === "quotes" ? "quotes" : raw === "meigen" ? "meigen" : "date"
  const activeIndex = TABS.findIndex((t) => t.key === tab)

  const switchTab = useCallback(
    (next: Tab) => {
      const sp = new URLSearchParams(Array.from(params.entries()))
      // タブ固有のパラメータは切り替え時にクリアする
      for (const k of ["q", "v", "t", "row"]) sp.delete(k)
      if (next === "date") sp.delete("tab")
      else sp.set("tab", next)
      const qs = sp.toString()
      router.replace(qs ? `/calendar/?${qs}` : "/calendar/", { scroll: false })
    },
    [params, router]
  )

  // ---- タブバーの実測幅（水の位置をpxで計算するため）
  const barRef = useRef<HTMLDivElement>(null)
  const [barWidth, setBarWidth] = useState(0)
  useEffect(() => {
    const el = barRef.current
    if (!el) return
    const update = () => setBarWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---- スワイプ状態
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const isHorizontalSwipe = useRef(false)
  const justSwiped = useRef(false)
  const [dragX, setDragX] = useState<number | null>(null) // ドラッグ中の水オフセット(px)。null=非ドラッグ

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
    isHorizontalSwipe.current = false
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    const start = touchStart.current
    if (!start) return
    const t = e.touches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (!isHorizontalSwipe.current) {
      // 横方向の動きが縦より明確に大きい場合だけスワイプとして扱う（縦スクロールを邪魔しない）
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return
      isHorizontalSwipe.current = true
    }
    e.preventDefault()
    // 端のタブでこれ以上進めない方向は控えめに追従させ、引っ張っている感触を出す
    const atStart = activeIndex === 0 && dx > 0
    const atEnd = activeIndex === TABS.length - 1 && dx < 0
    setDragX(atStart || atEnd ? dx * 0.3 : dx)
  }
  const handleTouchEnd = () => {
    if (isHorizontalSwipe.current) {
      const segment = barWidth / TABS.length
      const move = (dragX ?? 0) / (segment || 1)
      let nextIndex = activeIndex
      if (move <= -SWIPE_COMMIT_RATIO) nextIndex = Math.min(TABS.length - 1, activeIndex + 1)
      else if (move >= SWIPE_COMMIT_RATIO) nextIndex = Math.max(0, activeIndex - 1)
      if (nextIndex !== activeIndex) switchTab(TABS[nextIndex].key)
      justSwiped.current = true
      // 直後に発火しうるタップのclickイベントと競合しないよう、1フレーム遅らせて解除する
      requestAnimationFrame(() => {
        justSwiped.current = false
      })
    }
    touchStart.current = null
    isHorizontalSwipe.current = false
    setDragX(null)
  }

  const segmentWidth = barWidth / TABS.length

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-8 md:pt-24">
      <div
        ref={barRef}
        role="tablist"
        aria-label="アーカイブの探し方（左右スワイプでも切替可）"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative mb-6 flex touch-pan-y gap-1 overflow-hidden rounded-full border border-base-700 bg-base-800 p-1"
      >
        {/* 「水」インジケータ: 選択中タブの位置に水が溜まっているイメージ。スワイプ中は指に追従する */}
        {barWidth > 0 && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1 rounded-full bg-gradient-to-b from-accent/35 via-accent/20 to-accent/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
            style={{ width: segmentWidth }}
            animate={{ left: activeIndex * segmentWidth + (dragX ?? 0) }}
            transition={dragX !== null ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
          />
        )}
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              // スワイプで既に切り替わった直後のタップ（タッチ由来のclick）は無視して二重切替を防ぐ
              if (justSwiped.current) {
                justSwiped.current = false
                return
              }
              switchTab(t.key)
            }}
            className={`relative z-10 flex-1 whitespace-nowrap rounded-full px-2 py-2 text-[13px] font-bold transition-colors sm:px-4 sm:text-sm ${
              tab === t.key ? "text-accent" : "text-ink-dim hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "date" ? <Calendar /> : tab === "quotes" ? <QuoteSearch /> : <QuoteGallery />}
    </div>
  )
}

function TabSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="h-12 animate-pulse rounded-2xl bg-base-800" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-base-800" />
        ))}
      </div>
    </div>
  )
}
