"use client"
import { useEffect, useState } from "react"
import { fetchWiki } from "@/lib/data"
import { site } from "@/lib/site.config"
import type { WikiEntry, WikiFile } from "@/lib/types"

/**
 * WIKI「これまでの歩み」年表。
 * - wiki.json（GitHub Actions が日次生成）を読む。取得できない場合は
 *   site.config.ts の wikiHistory にフォールバックして必ず何か出す。
 * - 登録者/再生数の桁が繰り上がる（例: 300人→400人、10万→20万再生）と
 *   自動で1行追加される。
 * - 最下部の「現在」は常にKEEPされ、いま何人・何回なのかが分かる。
 */

const fmtDate = (d: string, approx?: boolean) => {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return d
  const label = `${m[1]}年${Number(m[2])}月${Number(m[3])}日`
  return approx ? `${m[1]}年${Number(m[2])}月ごろ` : label
}

const badge = (e: WikiEntry) => {
  if (e.kind === "milestone") return e.metric === "subs" ? "登録者" : "再生数"
  if (e.kind === "auto") return "記録"
  return null
}

export default function WikiTimeline() {
  const [wiki, setWiki] = useState<WikiFile | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    fetchWiki()
      .then((w) => alive && setWiki(w))
      .finally(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [])

  const entries = wiki?.entries ?? []
  const useFallback = loaded && entries.length === 0

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-base-700 bg-base-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-base-700 text-left text-xs text-ink-dim">
              <th scope="col" className="px-4 py-3 font-bold">時期</th>
              <th scope="col" className="px-4 py-3 font-bold">出来事</th>
            </tr>
          </thead>
          <tbody>
            {!loaded && (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-xs text-ink-dim">
                  読み込み中…
                </td>
              </tr>
            )}

            {useFallback &&
              site.wikiHistory.map((h) => (
                <tr key={h.event} className="border-b border-base-700 last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-ink-dim">{h.date}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{h.event}</p>
                    {h.detail && <p className="mt-0.5 text-xs text-ink-dim">{h.detail}</p>}
                  </td>
                </tr>
              ))}

            {entries.map((e) => (
              <tr key={e.id} className="border-b border-base-700 last:border-b-0">
                <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-ink-dim">
                  {fmtDate(e.date, e.approx)}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">
                    {badge(e) && (
                      <span className="mr-2 rounded border border-base-700 px-1.5 py-px text-[10px] font-bold text-accent">
                        {badge(e)}
                      </span>
                    )}
                    {e.event}
                  </p>
                  {e.detail && <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">{e.detail}</p>}
                  {e.videoId && (
                    <a
                      href={`https://www.youtube.com/watch?v=${e.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-[11px] text-ink-dim underline underline-offset-4 hover:text-accent"
                    >
                      該当の配信を見る ↗
                    </a>
                  )}
                </td>
              </tr>
            ))}

            {/* 最下部に常駐する「現在」 */}
            {wiki?.current && (
              <tr className="border-t-2 border-accent bg-base-700/30">
                <td className="whitespace-nowrap px-4 py-3 align-top text-xs font-bold text-accent">
                  現在
                </td>
                <td className="px-4 py-3">
                  <p className="font-bold">
                    チャンネル登録者{" "}
                    <span className="text-accent">
                      {wiki.current.subscriberCount?.toLocaleString("ja-JP") ?? "-"}
                    </span>
                    人 / 総再生数{" "}
                    <span className="text-accent">
                      {wiki.current.viewCount?.toLocaleString("ja-JP") ?? "-"}
                    </span>
                    回
                  </p>
                  <p className="mt-0.5 text-xs text-ink-dim">
                    {wiki.current.ym.replace("-", "年")}月時点の記録。桁が繰り上がるたびに上の年表へ1行追加されます。
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-dim">
        ※ 削除・非公開になった配信は確認できないため、「現存する最も古い〜」として記録しています。
        {wiki?.generatedAt && ` 最終更新: ${wiki.generatedAt.slice(0, 10)}`}
      </p>
    </div>
  )
}
