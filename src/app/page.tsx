import LiveRing from "@/components/LiveRing"
import SocialLinks from "@/components/SocialLinks"
import DiscordGate from "@/components/DiscordGate"
import { site } from "@/lib/site.config"

// トップ: 1画面完結(100dvh, スクロール不要)
// 【2-2】スマホ(<768px): 従来どおり縦積み中央寄せ(アイコン→名前→紹介→SNS)
//        PC(md/768px以上): 2カラム。左=テキスト+SNS+Discord / 右=大きめアイコン
export default function Home() {
  return (
    <div className="relative flex h-dvh flex-col items-center justify-center gap-6 overflow-hidden px-6 pb-16 text-center md:grid md:grid-cols-[1fr_auto] md:items-center md:gap-16 md:px-16 md:pb-0 md:text-left lg:px-28 xl:px-40">
      {/* 背景の淡いグラデーション */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_35%,color-mix(in_srgb,var(--c-ink)_4%,transparent),transparent)]"
      />
      <div className="md:order-2 md:justify-self-end">
        <LiveRing />
      </div>
      <div className="flex flex-col items-center gap-6 md:order-1 md:items-start">
        <div>
          <h1 className="text-3xl font-black tracking-wide sm:text-4xl lg:text-5xl">おトイレ先生</h1>
          <p className="mt-1 text-sm font-medium text-accent lg:text-base">{site.tagline}</p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-dim md:mx-0 lg:text-base">
            {site.intro}
          </p>
        </div>
        <SocialLinks />
        <DiscordGate />
      </div>
    </div>
  )
}
