"use client"
import { useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Calendar from "./Calendar"
import QuoteSearch from "./QuoteSearch"

/**
 * /calendar を「日付から探す」「セリフから探す」の2タブに切り替える。
 * - Nav(既存4項目)は変更しない。新規ページも作らない（output: export の制約に合わせ
 *   1ページ + クエリパラメータで表現する）。
 * - タブ状態は ?tab=quotes と双方向同期。URLを開いただけでそのタブが復元される。
 * - QuoteSearch は「セリフから探す」タブが選ばれたときに初めてマウントされるため、
 *   カレンダーだけ見る人には検索インデックスを読み込ませない。
 */
export default function CalendarTabs() {
  const router = useRouter()
  const params = useSearchParams()
  const tab = params.get("tab") === "quotes" ? "quotes" : "date"

  const switchTab = useCallback(
    (next: "date" | "quotes") => {
      const sp = new URLSearchParams(Array.from(params.entries()))
      if (next === "quotes") sp.set("tab", "quotes")
      else {
        sp.delete("tab")
        sp.delete("q")
        sp.delete("v")
        sp.delete("t")
      }
      const qs = sp.toString()
      router.replace(qs ? `/calendar/?${qs}` : "/calendar/", { scroll: false })
    },
    [params, router]
  )

  const tabClass = (active: boolean) =>
    `flex-1 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-colors ${
      active ? "bg-base-700 text-accent" : "text-ink-dim hover:text-ink"
    }`

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-8 md:pt-24">
      <div
        role="tablist"
        aria-label="アーカイブの探し方"
        className="mb-6 flex gap-1 rounded-full border border-base-700 bg-base-800 p-1"
      >
        <button
          role="tab"
          aria-selected={tab === "date"}
          onClick={() => switchTab("date")}
          className={tabClass(tab === "date")}
        >
          日付から探す
        </button>
        <button
          role="tab"
          aria-selected={tab === "quotes"}
          onClick={() => switchTab("quotes")}
          className={tabClass(tab === "quotes")}
        >
          セリフから探す
        </button>
      </div>

      {tab === "date" ? <Calendar /> : <QuoteSearch />}
    </div>
  )
}
