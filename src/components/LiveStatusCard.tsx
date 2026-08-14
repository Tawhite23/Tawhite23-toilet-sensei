"use client"
import { useEffect, useState } from "react"
import { site } from "@/lib/site.config"
import { useElapsed, useLiveNow } from "@/lib/useLiveNow"
import type { LiveNow } from "@/lib/types"

/**
 * リアルタイムの配信ステータスカード（アクティブ追跡のYouTube LIVE版）。
 * 配信中はタイトル・同時接続数・経過時間を60秒間隔で更新する。
 *
 * kickers.tokyo のメンバー一覧と同じ役割だが、追跡対象は本チャンネル1つなので
 * 一覧ではなく1枚のカードとして、トップとメンバーページの両方に置いている。
 */

/** 「◯秒前に更新」。最終確認時刻からの経過を10秒ごとに描き直す */
function useFreshness(checkedAt: string | undefined) {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    if (!checkedAt) {
      setLabel(null)
      return
    }
    const update = () => {
      const sec = Math.max(0, Math.floor((Date.now() - Date.parse(checkedAt)) / 1000))
      if (sec < 60) setLabel(`${sec}秒前`)
      else if (sec < 3600) setLabel(`${Math.floor(sec / 60)}分前`)
      else setLabel(`${Math.floor(sec / 3600)}時間前`)
    }
    update()
    const t = setInterval(update, 10_000)
    return () => clearInterval(t)
  }, [checkedAt])
  return label
}

function Pulse() {
  return (
    <span className="relative flex h-2 w-2" aria-hidden="true">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-70" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
    </span>
  )
}

function LiveBody({ live }: { live: LiveNow }) {
  const elapsed = useElapsed(live.startedAt)

  return (
    <a
      href={`https://www.youtube.com/watch?v=${live.videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
    >
      <div className="flex items-center gap-2">
        <Pulse />
        <span className="text-xs font-black tracking-[0.2em] text-live">LIVE</span>
        {elapsed && <span className="text-xs text-ink-dim">配信開始から {elapsed}</span>}
      </div>

      <p className="mt-2 line-clamp-2 text-base font-bold leading-snug transition-colors group-hover:text-accent">
        {live.title ?? "ライブ配信中"}
      </p>

      {live.thumbnail && (
        <div className="mt-3 overflow-hidden rounded-lg border border-base-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={live.thumbnail}
            alt=""
            className="w-full transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      )}

      {live.viewerCount != null && (
        <p className="mt-3 flex items-baseline gap-1.5">
          <span className="text-2xl font-black tabular-nums text-accent">
            {live.viewerCount.toLocaleString("ja-JP")}
          </span>
          <span className="text-xs text-ink-dim">人が視聴中</span>
        </p>
      )}

      <span className="mt-3 inline-block text-xs text-ink-dim underline underline-offset-4 group-hover:text-accent">
        YouTubeで見る ↗
      </span>
    </a>
  )
}

/**
 * トップページ用の小型版。
 * トップは1画面完結(h-dvh, スクロール不要)の設計なので、カードを置くと溢れる。
 * 配信中のときだけ1行のバナーとして現れ、非配信時は何も描かない。
 *
 * @param hideLabel チャンネルアイコンの「LIVE」バッジの真下に置くときに指定する。
 *   すぐ上に同じ文字が出て二重になるため、こちら側のラベルを省く。
 */
export function LivePill({
  className = "",
  hideLabel = false,
}: {
  className?: string
  hideLabel?: boolean
}) {
  const { live } = useLiveNow()
  const elapsed = useElapsed(live?.startedAt ?? null)

  if (!live?.isLive || !live.videoId) return null

  return (
    <a
      href={`https://www.youtube.com/watch?v=${live.videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`配信中: ${live.title ?? "ライブ配信"} を見る`}
      className="group flex max-w-full items-center gap-2 rounded-full border border-live/40 bg-live/10 px-3 py-1.5 transition-colors hover:border-live"
    >
      <Pulse />
      {!hideLabel && (
        <span className="text-[11px] font-black tracking-widest text-live">LIVE</span>
      )}
      <span className="min-w-0 truncate text-xs font-medium text-ink group-hover:text-accent">
        {live.title ?? "ライブ配信中"}
      </span>
      {live.viewerCount != null && (
        <span className="shrink-0 text-xs font-bold tabular-nums text-accent">
          {live.viewerCount.toLocaleString("ja-JP")}人
        </span>
      )}
      {elapsed && <span className="hidden shrink-0 text-[11px] text-ink-dim sm:inline">{elapsed}</span>}
    </a>
  )
}

export default function LiveStatusCard({ className = "" }: { className?: string }) {
  const { live, loaded } = useLiveNow()
  const freshness = useFreshness(live?.checkedAt)

  return (
    <section
      aria-label="配信ステータス"
      // aria-live は付けない。60秒毎の更新でカード全文（同接数を含む）が
      // 毎回読み上げられてしまい、スクリーンリーダーでは邪魔にしかならないため。
      className={`rounded-2xl border border-base-700 bg-base-800 p-4 ${className}`}
    >
      {!loaded && <p className="text-sm text-ink-dim">配信状況を確認中…</p>}

      {loaded && live?.isLive && live.videoId && <LiveBody live={live} />}

      {loaded && !live?.isLive && (
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-ink-dim/50" aria-hidden="true" />
            <span className="text-xs font-bold tracking-[0.2em] text-ink-dim">OFFLINE</span>
          </div>
          <p className="mt-2 text-sm text-ink-dim">いまは配信していません。</p>
          <a
            href={site.sns.youtube}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-xs text-ink-dim underline underline-offset-4 hover:text-accent"
          >
            チャンネルを見る ↗
          </a>
        </div>
      )}

      {loaded && freshness && (
        <p className="mt-3 border-t border-base-700 pt-2 text-[11px] text-ink-dim">
          {freshness}に更新
          {/* live.json 経由（Worker未デプロイ）のときは更新が遅いことを正直に出す */}
          {live?.source === "fallback" && "（15分間隔の定期更新）"}
        </p>
      )}
    </section>
  )
}
