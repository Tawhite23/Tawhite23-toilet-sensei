"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { fetchListenerProfiles, fetchListeners } from "@/lib/data"
import { loadMe, num, saveMe } from "@/lib/listeners"
import { site } from "@/lib/site.config"
import type { ListenersFile } from "@/lib/types"
import type { ReportTab } from "../ReportTabs"
import ListenerBook from "./ListenerBook"
import ListenerModal from "./ListenerModal"
import ListenerRanking from "./ListenerRanking"
import StreamDaily from "./StreamDaily"

const HEADINGS: Record<Exclude<ReportTab, "activity">, [string, string]> = {
  listeners: ["リスナー名鑑", "配信でコメントした回を「出席」として、リスナーごとの記録をまとめています。"],
  ranking: ["ランキング", "シーズン（季節）ごとの出席・コメントの上位10人です。"],
  daily: ["配信日報", "配信ごとのコメントの盛り上がりを振り返れます。"],
}

/**
 * レポートページの 名鑑 / ランキング / 日報 タブの共通の器。
 * 3つのタブは同じ listeners.json を見ているので、データの取得・
 * リスナー1人の記録を開くモーダル（?l=<キー>）・「自分の記録」の登録はここで持つ。
 */
export default function ListenerSection({ view }: { view: Exclude<ReportTab, "activity"> }) {
  const router = useRouter()
  const params = useSearchParams()
  const [data, setData] = useState<ListenersFile | null | undefined>(undefined)
  const [me, setMe] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchListeners().then((file) => {
      if (!alive) return
      setData(file)
      if (!file) return
      // 名前とアイコンは、取れたら最新のものに差し替える（集計のあとに変えた人のため）。
      // 取れなくても集計時の値で表示できるので、待たずに先に描く。
      fetchListenerProfiles().then((profiles) => {
        if (!alive || !profiles) return
        setData({
          ...file,
          listeners: file.listeners.map((l) => {
            const p = profiles[l.key]
            if (!p) return l
            // YouTube API はハンドルを小文字にして返す（@9IQ0919 → @9iq0919）。
            // 大文字小文字が違うだけなら、チャットに出ていたとおりの集計時の表記を残す。
            const renamed = !!p[0] && p[0].toLowerCase() !== l.name.toLowerCase()
            return { ...l, name: renamed ? p[0] : l.name, icon: p[1] || l.icon }
          }),
        })
      })
    })
    setMe(loadMe())
    return () => {
      alive = false
    }
  }, [])

  const openKey = params.get("l")
  const opened = useMemo(
    () => (openKey ? data?.listeners.find((l) => l.key === openKey) : undefined),
    [data, openKey]
  )
  const open = useCallback(
    (key: string | null) => {
      const sp = new URLSearchParams(Array.from(params.entries()))
      if (key) sp.set("l", key)
      else sp.delete("l")
      router.replace(`/report/?${sp.toString()}`, { scroll: false })
    },
    [params, router]
  )
  const toggleMe = useCallback((key: string) => {
    setMe((cur) => {
      const next = cur === key ? null : key
      saveMe(next)
      return next
    })
  }, [])

  if (data === undefined) return <p className="p-8 text-center text-ink-dim" role="status">読み込み中…</p>
  if (!data || data.streams.length === 0)
    return <p className="p-8 text-center text-ink-dim">データを読み込めませんでした。時間をおいてもう一度開いてください。</p>

  const streams = data.streams
  const totalComments = streams.reduce((a, s) => a + s.comments, 0)
  const avgChatters = Math.round(streams.reduce((a, s) => a + s.chatters, 0) / streams.length)
  const [title, lead] = HEADINGS[view]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">{title}</h1>
        <p className="mt-1 text-xs leading-relaxed text-ink-dim">
          {lead}
          <br />
          集計期間 {streams[0].date} 〜 {streams.at(-1)!.date}（配信 {num(streams.length)}本）
        </p>
      </div>

      {/* 全体の数字は名鑑タブだけ（ランキングと日報は、開いてすぐ本題が見えるほうがよい） */}
      {view === "listeners" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["コメントした人", `${num(data.totalChatters)}人`],
            ["コメント", `${num(totalComments)}件`],
            ["1配信あたり", `${avgChatters}人`],
            [`${data.minAttend}回以上来た人`, `${num(data.listeners.length)}人`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-base-700 bg-base-800 p-3 sm:p-4">
              <p className="text-xs text-ink-dim">{k}</p>
              <p className="mt-1 text-xl font-black text-accent">{v}</p>
            </div>
          ))}
        </div>
      )}

      {view === "listeners" ? (
        <ListenerBook data={data} me={me} onOpen={open} />
      ) : view === "ranking" ? (
        <ListenerRanking data={data} me={me} onOpen={open} />
      ) : (
        <StreamDaily data={data} onOpen={open} />
      )}

      <p className="text-xs leading-relaxed text-ink-dim">
        ※ 配信アーカイブの公開チャットから集計しています（データ作成: {data.generated}）。
        見ているだけの方は数えられません。名鑑とランキングに載るのは、{data.minAttend}回以上の配信でコメントした方です。
        名前とアイコンは最後にコメントしたときのもので、コメントの本文は載せていません。
        <br />
        ※ {site.listenerOptOut.text}
        {site.listenerOptOut.url && (
          <>
            {" "}
            <a
              href={site.listenerOptOut.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-accent"
            >
              {site.listenerOptOut.linkLabel} ↗
            </a>
          </>
        )}
      </p>

      {opened && (
        <ListenerModal
          listener={opened}
          data={data}
          isMe={me === opened.key}
          onToggleMe={() => toggleMe(opened.key)}
          onOpen={open}
          onClose={() => open(null)}
        />
      )}
    </div>
  )
}
