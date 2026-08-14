"use client"
import { useEffect, useState, useSyncExternalStore } from "react"
import { liveStore, elapsedLabel } from "./liveClient"
import type { LiveNow } from "./types"

/**
 * リアルタイム配信ステータス。
 * 複数のコンポーネントが同時に呼んでもポーリングは1本に束ねられる
 * （購読者数を liveClient 側で数えているため）。
 */
export function useLiveNow(): { live: LiveNow | null; loaded: boolean } {
  const state = useSyncExternalStore(
    liveStore.subscribe,
    liveStore.getSnapshot,
    liveStore.getServerSnapshot
  )
  return { live: state.data, loaded: state.loaded }
}

/**
 * 配信の経過時間ラベル。1分ごとに再計算する。
 * サーバとクライアントで値がズレるのでマウント後にだけ出す（ハイドレーション不一致の回避）。
 */
export function useElapsed(startedAt: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    if (!startedAt) {
      setLabel(null)
      return
    }
    const update = () => setLabel(elapsedLabel(startedAt, Date.now()))
    update()
    const t = setInterval(update, 60_000)
    return () => clearInterval(t)
  }, [startedAt])

  return label
}
