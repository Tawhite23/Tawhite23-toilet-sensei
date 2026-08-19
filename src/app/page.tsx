import type { Metadata } from "next"
import HomeHero from "@/components/HomeHero"
import { site } from "@/lib/site.config"

export const metadata: Metadata = {
  // トップは layout の default タイトル（「おトイレ先生 非公式ファンサイト」）をそのまま使う
  description: site.description,
  alternates: { canonical: "/" },
}

// トップ: 基本は1画面完結(スクロール不要)
// 【2-2】スマホ(<768px): 縦積み中央寄せ(アイコン→名前→紹介→SNS)
//        PC(md/768px以上): 2カラム。左=テキスト+SNS / 右=大きめアイコン
//
// 中身は HomeHero（クライアント側）に持たせている。
// ログイン状態と配信状態によって「通常の紹介」と「AIおトイレ先生との会話」を
// 切り替える必要があり、どちらも実行時にしか分からないため。
export default function Home() {
  return <HomeHero />
}
