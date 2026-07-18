import type { Metadata } from "next"
import ReportCharts from "@/components/ReportCharts"

export const metadata: Metadata = { title: "活動レポート" }

export default function ReportPage() {
  return <ReportCharts />
}
