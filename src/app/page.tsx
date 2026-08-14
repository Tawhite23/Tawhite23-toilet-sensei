import type { Metadata } from "next"
import HeroTitle from "@/components/HeroTitle"
import LiveRing from "@/components/LiveRing"
import { LivePill } from "@/components/LiveStatusCard"
import SocialLinks from "@/components/SocialLinks"
import DiscordGate from "@/components/DiscordGate"
import QuoteSearchCard from "@/components/QuoteSearchCard"
import { site } from "@/lib/site.config"

export const metadata: Metadata = {
  // トップは layout の default タイトル（「おトイレ先生 非公式ファンサイト」）をそのまま使う
  description: site.description,
  alternates: { canonical: "/" },
}

// トップ: 基本は1画面完結(スクロール不要)
// 【2-2】スマホ(<768px): 従来どおり縦積み中央寄せ(アイコン→名前→紹介→SNS)
//        PC(md/768px以上): 2カラム。左=テキスト+SNS+Discord / 右=大きめアイコン
//
// 高さの扱い:
//   md以上は上部にヘッダーが固定で乗るため、pt でその分の逃げを作る(md:pt-28)。
//   これが無いと、ウィンドウが低いときに中央寄せされた内容が上へはみ出し、
//   h1「おトイレ先生」がヘッダーの下に潜り込む。
//   さらに h-dvh + overflow-hidden だと、はみ出した分がそのまま切り取られてしまうので
//   min-h-dvh にして「入りきらないときだけスクロールできる」ようにしている。
export default function Home() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-6 px-6 pb-16 pt-6 text-center md:grid md:grid-cols-[1fr_auto] md:items-center md:gap-16 md:px-16 md:pb-10 md:pt-28 md:text-left lg:px-28 xl:px-40">
      {/* 背景の淡いグラデーション */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_35%,color-mix(in_srgb,var(--c-ink)_4%,transparent),transparent)]"
      />
      <div className="flex flex-col items-center gap-3 md:order-2 md:justify-self-end">
        <LiveRing />
        {/* 配信中のときだけ出る1行バナー。アイコンとリングの直下に置く。
            （テキスト側の先頭に置くと、上部固定のヘッダーと重なってしまう） */}
        <LivePill hideLabel className="max-w-[15rem] lg:max-w-[17rem]" />
      </div>
      <div className="flex w-full min-w-0 flex-col items-center gap-5 md:order-1 md:items-start">
        <div className="w-full min-w-0">
          <HeroTitle />
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-dim md:mx-0 lg:text-base">
            {site.intro}
          </p>
        </div>
        <SocialLinks />
        <DiscordGate />
        {/* 発見性導線: キーワード全文検索・名言集へ */}
        <QuoteSearchCard />
      </div>
    </div>
  )
}
