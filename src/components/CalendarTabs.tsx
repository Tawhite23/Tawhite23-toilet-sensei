"use client"
import { useCallback } from "react"
import dynamic from "next/dynamic"
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
 */
type Tab = "date" | "quotes" | "meigen"

export default function CalendarTabs() {
  const router = useRouter()
  const params = useSearchParams()
  const raw = params.get("tab")
  const tab: Tab = raw === "quotes" ? "quotes" : raw === "meigen" ? "meigen" : "date"

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

  const tabClass = (active: boolean) =>
    `flex-1 whitespace-nowrap rounded-full px-2 py-2 text-[13px] font-bold transition-colors sm:px-4 sm:text-sm ${
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
          キーワードから探す
        </button>
        <button
          role="tab"
          aria-selected={tab === "meigen"}
          onClick={() => switchTab("meigen")}
          className={tabClass(tab === "meigen")}
        >
          名言集
        </button>
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
