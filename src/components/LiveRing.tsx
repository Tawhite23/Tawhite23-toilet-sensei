"use client"
import { useEffect, useState } from "react"
import { fetchLive } from "@/lib/data"
import type { LiveStatus } from "@/lib/types"
import { site } from "@/lib/site.config"

/**
 * チャンネルアイコン + 配信中リング。
 * live.json を1分毎にポーリングし、配信中なら回転グラデーションリングと
 * 「LIVE」バッジ(配信ページへのリンク)を表示する。
 */
export default function LiveRing() {
  const [live, setLive] = useState<LiveStatus | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => fetchLive().then((d) => alive && setLive(d))
    load()
    const t = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const isLive = !!live?.isLive
  const icon = (
    <span className={`relative inline-block ${isLive ? "live-ring" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={site.channelIcon}
        alt="おトイレ先生 チャンネルアイコン"
        width={144}
        height={144}
        className="relative z-10 h-32 w-32 rounded-full border-2 border-base-700 sm:h-36 sm:w-36"
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
