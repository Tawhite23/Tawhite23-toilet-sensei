"use client"
import { site } from "@/lib/site.config"
import { useLiveNow } from "@/lib/useLiveNow"

/**
 * チャンネルアイコン + 配信中リング。
 *
 * データ源は useLiveNow（Cloudflare Worker の /api/live、未設定なら live.json）。
 * 以前はこのコンポーネント自身が live.json を60秒ポーリングしていたが、
 * 参照先の live.json が15分に1回しか更新されないため実質的に無意味だった。
 * ポーリングの制御は src/lib/liveClient.ts に一本化してある。
 */
export default function LiveRing() {
  const { live } = useLiveNow()
  const isLive = !!live?.isLive

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

  return isLive && live?.videoId ? (
    <a
      href={`https://www.youtube.com/watch?v=${live.videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`配信中: ${live.title ?? "ライブ配信"} を見る`}
      className="rounded-full"
    >
      {icon}
    </a>
  ) : (
    icon
  )
}
