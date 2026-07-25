import type { Metadata } from "next"
import ProfileScroll from "@/components/ProfileScroll"

export const metadata: Metadata = {
  title: "プロフィール",
  description:
    "おトイレ先生のプロフィールと、チャンネル開設からの歩みを記録したWIKI年表です（非公式ファンサイト）。",
  alternates: { canonical: "/profile/" },
}

export default function ProfilePage() {
  return <ProfileScroll />
}
