import LiveRing from "@/components/LiveRing"
import SocialLinks from "@/components/SocialLinks"
import DiscordGate from "@/components/DiscordGate"
import { site } from "@/lib/site.config"

// トップ: 1画面完結(100dvh, スクロール不要)
export default function Home() {
  return (
    <div className="relative flex h-dvh flex-col items-center justify-center gap-6 overflow-hidden px-6 pb-16 text-center md:pb-0">
      {/* 背景の淡いグラデーション */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_35%,rgba(56,189,248,0.12),transparent),radial-gradient(40%_35%_at_70%_75%,rgba(244,114,182,0.08),transparent)]"
      />
      <LiveRing />
      <div>
        <h1 className="text-3xl font-black tracking-wide sm:text-4xl">おトイレ先生</h1>
        <p className="mt-1 text-sm font-medium text-accent">{site.tagline}</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-dim">
          {site.intro}
        </p>
      </div>
      <SocialLinks />
      <DiscordGate />
    </div>
  )
}
