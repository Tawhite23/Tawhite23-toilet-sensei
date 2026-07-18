import type { Metadata } from "next"
import Calendar from "@/components/Calendar"

export const metadata: Metadata = { title: "カレンダー" }

export default function CalendarPage() {
  return <Calendar />
}
