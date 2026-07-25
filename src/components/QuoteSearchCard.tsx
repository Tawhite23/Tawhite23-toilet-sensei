"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { fetchPopular } from "@/lib/data"
import type { PopularPhrase } from "@/lib/types"

/**
 * ホームの発見性導線カード。
 * popular.json（軽量）だけを読み、よく出るキーワードを2〜3個チップで見せて
 * /calendar?tab=quotes&q=... へ送る。検索インデックス本体は読み込まない。
 */
export default function QuoteSearchCard() {
  const [items, setItems] = useState<PopularPhrase[]>([])

  useEffect(() => {
    fetchPopular().then((p) => setItems(p?.items?.slice(0, 3) ?? []))
  }, [])

  return (
    <Link
      href="/calendar/?tab=quotes"
      className="group block w-full max-w-md rounded-2xl border border-base-700 bg-base-800 p-3 text-left transition-colors hover:border-accent"
    >
      <p className="flex items-center gap-1.5 text-xs font-bold group-hover:text-accent">
        <span aria-hidden="true">🔍</span> キーワードから探す
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-dim">
        配信アーカイブの発言を全文検索。名言集もあります。
      </p>
      {items.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {items.map((p) => (
            <li key={p.text}>
              {/* チップ自体は個別クエリへ遷移（カードのLink内なので span + 明示的な遷移） */}
              <span
                role="link"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  window.location.href = `/calendar/?tab=quotes&q=${encodeURIComponent(p.text)}`
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    e.stopPropagation()
                    window.location.href = `/calendar/?tab=quotes&q=${encodeURIComponent(p.text)}`
                  }
                }}
                className="inline-block cursor-pointer rounded-full border border-base-700 px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-accent"
              >
                {p.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Link>
  )
}
