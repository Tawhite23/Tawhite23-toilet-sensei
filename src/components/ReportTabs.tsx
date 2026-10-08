"use client"
import { useCallback } from "react"
import dynamic from "next/dynamic"
import { useRouter, useSearchParams } from "next/navigation"
import ReportCharts from "./ReportCharts"
import SwipeTabs, { TabSkeleton } from "./SwipeTabs"

// リスナー名鑑のタブは、開くまで JS もデータ(listeners.json)も読み込ませない。
// 活動レポートだけ見る人の初期表示を重くしないため。
const ListenerSection = dynamic(() => import("./listeners/ListenerSection"), {
  ssr: false,
  loading: () => <TabSkeleton />,
})

/**
 * /report を4タブに切り替える。
 *   活動（チャンネルの数字） / 名鑑（リスナーごとの出席・コメント） / ランキング / 日報（配信ごと）
 * - カレンダーと同じく、新規ページもNavの項目も増やさず 1ページ + クエリパラメータで表現する。
 * - タブ状態は ?tab=listeners / ?tab=ranking / ?tab=daily と双方向同期。
 *   ?l=<キー> でリスナー1人の記録を開いた状態を共有できる（ListenerSection が読む）。
 */
export type ReportTab = "activity" | "listeners" | "ranking" | "daily"
const TABS: { key: ReportTab; label: string }[] = [
  { key: "activity", label: "活動" },
  { key: "listeners", label: "名鑑" },
  { key: "ranking", label: "ランキング" },
  { key: "daily", label: "日報" },
]

export default function ReportTabs() {
  const router = useRouter()
  const params = useSearchParams()
  const raw = params.get("tab")
  const tab: ReportTab = TABS.some((t) => t.key === raw) ? (raw as ReportTab) : "activity"

  const switchTab = useCallback(
    (next: ReportTab) => {
      const sp = new URLSearchParams(Array.from(params.entries()))
      // タブ固有のパラメータは切り替え時にクリアする
      for (const k of ["l", "m"]) sp.delete(k)
      if (next === "activity") sp.delete("tab")
      else sp.set("tab", next)
      const qs = sp.toString()
      router.replace(qs ? `/report/?${qs}` : "/report/", { scroll: false })
    },
    [params, router]
  )

  return (
    <div className="mx-auto max-w-4xl px-4 pb-28 pt-8 md:pt-24">
      <SwipeTabs
        tabs={TABS}
        active={tab}
        onChange={switchTab}
        ariaLabel="レポートの種類（左右スワイプでも切替可）"
      />
      {tab === "activity" ? <ReportCharts /> : <ListenerSection view={tab} />}
    </div>
  )
}
