"use client"
import { site } from "@/lib/site.config"
import { useLiveNow } from "@/lib/useLiveNow"

/**
 * チャンネルアイコン + 配信中リング。
 *
 * データ源は useLiveNow（Cloudflare Worker の /api/live、未設定なら live.json）。
 * ポーリングの制御は src/lib/liveClient.ts に一本化してある。
 *
 * クリックしたときの行き先は配信状況で変わる:
 *   配信中   … YouTubeの配信ページへ（本物を優先する）
 *   非配信中 … onIdleClick が渡されていればそれを呼ぶ（AIおトイレ先生との会話）
 */
export default function LiveRing({
  onIdleClick,
  idleLabel = "AIおトイレ先生と話す",
  forceIdle = false,
}: {
  onIdleClick?: () => void
  idleLabel?: string
  /** 配信中でも「非配信中」として扱う。開発時の動作確認用（呼び出し側が制御する） */
  forceIdle?: boolean
}) {
  const { live } = useLiveNow()
  const isLive = !!live?.isLive && !forceIdle

  const icon = (
    <span className={`relative inline-block ${isLive ? "live-ring" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={site.channelIcon}
        alt="おトイレ先生 チャンネルアイコン"
        width={144}
        height={144}
        className="relative z-10 h-32 w-32 rounded-full border-2 border-base-700 sm:h-36 sm:w-36 md:h-56 md:w-56 lg:h-64 lg:w-64"
      />
      {isLive && (
        <span className="absolute -bottom-1 left-1/2 z-20 -translate-x-1/2 rounded-full bg-live px-3 py-0.5 text-xs font-black tracking-widest text-white shadow-lg">
          LIVE
        </span>
      )}
    </span>
  )

  // 配信中は本物へ
  if (isLive && live?.videoId) {
    return (
      <a
        href={`https://www.youtube.com/watch?v=${live.videoId}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`配信中: ${live.title ?? "ライブ配信"} を見る`}
        className="rounded-full"
      >
        {icon}
      </a>
    )
  }

  // 非配信中はAIとの会話へ。押せることが分かるよう、枠と吹き出しで示す。
  if (onIdleClick) {
    return (
      <button
        onClick={onIdleClick}
        aria-label={idleLabel}
        className="group relative rounded-full transition-transform hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span
          aria-hidden="true"
          className="absolute -inset-1.5 rounded-full border border-dashed border-accent/40 opacity-0 transition-opacity group-hover:opacity-100"
        />
        {icon}
        <span className="absolute -bottom-2 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-base-900 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          {idleLabel}
        </span>
      </button>
    )
  }

  return icon
}
