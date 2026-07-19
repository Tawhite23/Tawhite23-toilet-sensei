"use client"
import { useEffect, useState } from "react"

/**
 * ライト/ダーク切替トグル(ナビ内・アイコンのみ)。
 * 白/黒の直接的な表現は使わず、水流アイコンで表現(ホバーでツールチップ)。
 * html要素の .light / .dark クラスを付け替え、localStorage に永続化。
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null)

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark")
  }, [])

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light"
    const el = document.documentElement
    el.classList.remove("light", "dark")
    el.classList.add(next)
    try { localStorage.setItem("theme", next) } catch {}
    setTheme(next)
  }

  return (
    <button
      onClick={toggle}
      aria-label="表示モードを切り替え"
      title="モード切替"
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
