"use client"
import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"

/**
 * ページ内タブのバー。カレンダーとレポートで共通に使う。
 * - タブバー全面(=ボタンと同じ判定面)で左右スワイプしても切り替えられる。
 *   バーの中に「水」が入っていて、選択中タブの位置に溜まっているイメージ。
 *   スワイプ中は指の動きにその場で追従し、離すと隣のタブへ吸い込まれるように決着する。
 *   タップでの切替挙動そのものは変更しない。
 * - どのタブを選んでいるか（URLとの同期など）は呼び出し側が持つ。
 */
// タブ幅に対してこの割合を超えて指を動かしたら、隣のタブへ切り替える
const SWIPE_COMMIT_RATIO = 0.18

export default function SwipeTabs<K extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: readonly { key: K; label: string }[]
  active: K
  onChange: (next: K) => void
  ariaLabel: string
}) {
  const activeIndex = tabs.findIndex((t) => t.key === active)

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
  // Touch Events ではなく Pointer Events を使う（マウス/トラックパッド/ペン/タッチを一本化するため。
  // Touch Events だけだとデスクトップのマウス操作では一切反応しない）。
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const isHorizontalSwipe = useRef(false)
  const justSwiped = useRef(false)
  const activePointerId = useRef<number | null>(null)
  const [dragX, setDragX] = useState<number | null>(null) // ドラッグ中の水オフセット(px)。null=非ドラッグ

  const commitAndReset = () => {
    if (isHorizontalSwipe.current) {
      const segment = barWidth / tabs.length
      const move = (dragX ?? 0) / (segment || 1)
      let nextIndex = activeIndex
      // 水（インジケータ）は指の動きにそのまま追従して描画しているため、
      // 左へドラッグ(move<0)した先＝1つ左のタブ、右へドラッグ(move>0)した先＝1つ右のタブに決着させる。
      if (move <= -SWIPE_COMMIT_RATIO) nextIndex = Math.max(0, activeIndex - 1)
      else if (move >= SWIPE_COMMIT_RATIO) nextIndex = Math.min(tabs.length - 1, activeIndex + 1)
      if (nextIndex !== activeIndex) onChange(tabs[nextIndex].key)
      justSwiped.current = true
      // 直後に発火しうるタップのclickイベントと競合しないよう、1フレーム遅らせて解除する
      requestAnimationFrame(() => {
        justSwiped.current = false
      })
    }
    dragStart.current = null
    isHorizontalSwipe.current = false
    activePointerId.current = null
    setDragX(null)
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return // 左クリック以外は無視
    dragStart.current = { x: e.clientX, y: e.clientY }
    isHorizontalSwipe.current = false
    activePointerId.current = e.pointerId
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    if (activePointerId.current !== e.pointerId) return
    const start = dragStart.current
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (!isHorizontalSwipe.current) {
      // 横方向の動きが縦より明確に大きい場合だけスワイプとして扱う（縦スクロールを邪魔しない）
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return
      isHorizontalSwipe.current = true
      // ドラッグ確定後は要素外に指/マウスが出てもイベントを追い続ける
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    e.preventDefault()
    // 端のタブでこれ以上進めない方向（先頭タブをさらに左へ／末尾タブをさらに右へ）は
    // 控えめにしか追従させず、引っ張っている感触を出す
    const atStart = activeIndex === 0 && dx < 0
    const atEnd = activeIndex === tabs.length - 1 && dx > 0
    setDragX(atStart || atEnd ? dx * 0.3 : dx)
  }
  const handlePointerEnd = (e: React.PointerEvent) => {
    if (activePointerId.current !== e.pointerId) return
    commitAndReset()
  }

  const segmentWidth = barWidth / tabs.length

  return (
    <div
      ref={barRef}
      role="tablist"
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
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
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => {
            // スワイプで既に切り替わった直後のタップ（タッチ由来のclick）は無視して二重切替を防ぐ
            if (justSwiped.current) {
              justSwiped.current = false
              return
            }
            onChange(t.key)
          }}
          className={`relative z-10 flex-1 whitespace-nowrap rounded-full px-2 py-2 text-[13px] font-bold transition-colors sm:px-4 sm:text-sm ${
            active === t.key ? "text-accent" : "text-ink-dim hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** タブの中身を遅延読み込みしている間の仮表示 */
export function TabSkeleton() {
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
