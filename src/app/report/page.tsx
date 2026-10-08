import type { Metadata } from "next"
import { Suspense } from "react"
import ReportTabs from "@/components/ReportTabs"

export const metadata: Metadata = {
  title: "レポート・リスナー名鑑",
  description:
    "おトイレ先生の配信回数・配信時間・登録者数の推移と、配信のチャットから集計したリスナー名鑑（出席・コメント数）、シーズン別ランキング、配信日報をまとめています（非公式ファンサイト）。",
  alternates: { canonical: "/report/" },
}

// useSearchParams を使うため Suspense で包む（output: export 必須）
export default function ReportPage() {
  return (
    <Suspense
      fallback={<div className="mx-auto max-w-4xl px-4 pb-28 pt-8 md:pt-24" aria-busy="true" />}
    >
      <ReportTabs />
    </Suspense>
  )
}
