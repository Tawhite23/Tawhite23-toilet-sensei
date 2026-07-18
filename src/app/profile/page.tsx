import type { Metadata } from "next"
import ProfileScroll from "@/components/ProfileScroll"

export const metadata: Metadata = { title: "プロフィール" }

export default function ProfilePage() {
  return <ProfileScroll />
}
