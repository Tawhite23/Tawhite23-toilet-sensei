"use client"
import { useEffect, useRef, useState } from "react"

/**
 * ライト/ダーク切替トグル(ナビ内・アイコンのみ)。
 * 白/黒の直接的な表現は使わず、水流アイコンで表現(ホバーでツールチップ)。
 * html要素の .light / .dark クラスを付け替え、localStorage に永続化。
 * タップだけでなく、ボタン全面での左右スワイプでも切り替えられる
 * （ボタン自体が小さいアイコンなので、当たり判定はボタンの全面を使う）。
 */
const SWIPE_THRESHOLD_PX = 24

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null)
  const touchStartX = useRef<number | null>(null)
  const swiped = useRef(false)

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark")
  }, [])

  const apply = (next: "light" | "dark") => {
    const el = document.documentElement
    el.classList.remove("light", "dark")
    el.classList.add(next)
    try { localStorage.setItem("theme", next) } catch {}
    setTheme(next)
  }

  const toggle = () => {
    apply(theme === "light" ? "dark" : "light")
  }

  // スワイプでの切替: 右スワイプ→light、左スワイプ→dark（向きは直感的な方向に統一）
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    swiped.current = false
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || swiped.current) return
    const dx = e.touches[0].clientX - touchStartX.current
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return
    swiped.current = true
    apply(dx > 0 ? "light" : "dark")
  }
  const handleTouchEnd = () => {
    touchStartX.current = null
  }

  return (
    <button
      onClick={() => {
        // スワイプ操作で既に切り替わった直後のクリック（タッチ由来）は無視して二重切替を防ぐ
        if (swiped.current) {
          swiped.current = false
          return
        }
        toggle()
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-label="表示モードを切り替え（左右スワイプでも切替可）"
      title="モード切替（左右スワイプ可）"
      className="flex items-center rounded-full px-2.5 py-3 text-ink-dim opacity-70 transition-all hover:opacity-100 hover:text-ink md:py-2"
    >
      {/* 水流アイコン */}
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          d="M12 3 C12 3 5 10.5 5 15 a7 7 0 0 0 14 0 C19 10.5 12 3 12 3 Z"
          fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
        />
        <path d="M8.5 15.5 a3.5 3.5 0 0 0 3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M9 9.5 q3 1.5 6 0 M8 12.5 q4 2 8 0" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      </svg>
    </button>
  )
}
