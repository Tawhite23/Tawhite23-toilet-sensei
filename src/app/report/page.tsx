import type { Metadata } from "next"
import ReportCharts from "@/components/ReportCharts"

export const metadata: Metadata = {
  title: "活動レポート",
  description:
    "おトイレ先生の配信回数・動画本数・配信時間、チャンネル登録者数と総再生数の推移をまとめた活動レポートです（非公式ファンサイト）。",
  alternates: { canonical: "/report/" },
}

export default function ReportPage() {
  return <ReportCharts />
}
