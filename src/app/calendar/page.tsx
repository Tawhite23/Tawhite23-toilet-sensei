import type { Metadata } from "next"
import { Suspense } from "react"
import CalendarTabs from "@/components/CalendarTabs"

export const metadata: Metadata = { title: "カレンダー" }

// useSearchParams を使うため Suspense で包む（output: export 必須）
export default function CalendarPage() {
  return (
    <Suspense
      fallback={<div className="mx-auto max-w-3xl px-4 pb-28 pt-8 md:pt-24" aria-busy="true" />}
    >
      <CalendarTabs />
    </Suspense>
  )
}
