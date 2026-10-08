"use client"
import { useCallback } from "react"
import dynamic from "next/dynamic"
import { useRouter, useSearchParams } from "next/navigation"
import Calendar from "./Calendar"
import LiveStatusCard from "./LiveStatusCard"
import SwipeTabs, { TabSkeleton } from "./SwipeTabs"

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
 * - タブバーの見た目とスワイプ操作は SwipeTabs（レポートページと共通）。
 */
type Tab = "date" | "quotes" | "meigen"
const TABS: { key: Tab; label: string }[] = [
  { key: "date", label: "日付から探す" },
  { key: "quotes", label: "キーワードから探す" },
  { key: "meigen", label: "名言集" },
]

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

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-8 md:pt-24">
      {/* いま配信中か（リアルタイム）→ いつ配信するか（カレンダー）の順で並べる。
          追跡の仕組みは src/lib/liveClient.ts / worker/ を参照。
          このサイトは「新規ページを作らない」方針なので、配信ステータスは
          既存のカレンダーページの先頭に置いている。 */}
      <LiveStatusCard className="mb-6" />

      <SwipeTabs
        tabs={TABS}
        active={tab}
        onChange={switchTab}
        ariaLabel="アーカイブの探し方（左右スワイプでも切替可）"
      />

      {tab === "date" ? <Calendar /> : tab === "quotes" ? <QuoteSearch /> : <QuoteGallery />}
    </div>
  )
}
