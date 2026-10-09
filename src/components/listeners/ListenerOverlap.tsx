"use client"
import { useEffect, useState } from "react"
import { fetchOverlap } from "@/lib/data"
import { num } from "@/lib/listeners"
import type { OverlapFile } from "@/lib/types"

type Mode = "commented" | "subscribed"

/**
 * どこリス？タブ: 配信でコメントした人が、ほかのどの配信者のところにいるか。
 *   コメントした配信者 … この1週間に、ほかの配信者のチャットにもコメントしていた人数（見て回れた範囲）
 *   登録チャンネル   … 登録しているチャンネル（登録先を公開している人だけ）
 * 出すのはチャンネルごとの人数だけ（誰がいたかはデータにも入っていない）。
 * どちらも全員を調べられるわけではないので、何を数えたかを必ず一緒に見せる。
 */
export default function ListenerOverlap() {
  const [data, setData] = useState<OverlapFile | null | undefined>(undefined)
  const [mode, setMode] = useState<Mode>("commented")
  const [regularOnly, setRegularOnly] = useState(false)
  useEffect(() => {
    fetchOverlap().then(setData)
  }, [])

  if (data === undefined) return <p className="p-8 text-center text-ink-dim" role="status">読み込み中…</p>
  // 古い形のデータ（ブラウザに残っていたものなど）でも画面ごと落ちないよう、中身を確かめてから使う
  if (!data?.commented?.channels || !data.subscribed?.channels)
    return <p className="p-8 text-center text-ink-dim">データを読み込めませんでした。時間をおいてもう一度開いてください。</p>

  const commented = mode === "commented"
  const source = commented ? data.commented.channels : data.subscribed.channels
  // 割合の分母: コメントは「うちでコメントした人」全体、登録は「登録先を公開している人」
  const base = commented
    ? regularOnly ? data.regulars : data.chatters
    : regularOnly ? data.subscribed.publicRegular : data.subscribed.public
  const rows = source
    .map((c) => ({ ...c, count: regularOnly ? c.regular : c.n }))
    // 常連だけに絞っても同じ下限を使う（人数が少ないほど個人が推測されやすいため）
    .filter((c) => c.count >= data.minPeople)
    .sort((a, b) => b.count - a.count || b.n - a.n)
  const max = Math.max(1, ...rows.map((c) => c.count))

  const seg = "flex gap-1 rounded-full border border-base-700 bg-base-800 p-1"
  const btn = (on: boolean, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
        on ? "bg-base-700 text-accent" : "text-ink-dim hover:text-ink"
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">どこリス？</h1>
        <p className="mt-1 text-xs leading-relaxed text-ink-dim">
          おトイレ先生の配信でコメントした{num(data.chatters)}人（うち常連{num(data.regulars)}人）が、
          ほかのどの配信者のところにいるかを人数で数えました。
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="何を数えるか" className={seg}>
          {btn(commented, "コメントした配信者", () => setMode("commented"))}
          {btn(!commented, "登録チャンネル", () => setMode("subscribed"))}
        </div>
        <div role="group" aria-label="数える範囲" className={seg}>
          {btn(!regularOnly, "全員", () => setRegularOnly(false))}
          {btn(regularOnly, "常連だけ", () => setRegularOnly(true))}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-ink-dim">
        {commented ? (
          <>
            この{data.commented.days}日間に、ほかの配信者の配信でもコメントしていた{regularOnly ? "常連" : "人"}の数です
            （{data.commented.at.slice(0, 10)} までの{data.commented.days}日間。配信のあった{num(data.commented.checked)}チャンネル・
            {num(data.commented.streams)}本のチャットを見ました）。
          </>
        ) : (
          <>
            登録チャンネルを公開している{regularOnly ? "常連" : "人"} {base}人のうち、そのチャンネルも登録している人数です。
          </>
        )}
      </p>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-base-700 bg-base-800 p-6 text-center text-sm text-ink-dim">
          {data.minPeople}人以上が重なるチャンネルはありませんでした。
        </p>
      ) : (
        <ol className="rounded-2xl border border-base-700 bg-base-800 px-4 py-1">
          {rows.map((c, i) => (
            <li key={c.id} className="border-t border-base-700 py-2.5 first:border-t-0">
              <a
                href={`https://www.youtube.com/channel/${c.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3"
              >
                <span className={`w-6 shrink-0 text-center text-sm font-black ${i < 3 ? "text-accent" : "text-ink-dim"}`}>
                  {i + 1}
                </span>
                {c.icon ? (
                  <img
                    src={`${c.icon}=s72-c-k-c0x00ffffff-no-rj`}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-9 w-9 shrink-0 rounded-full bg-base-700 object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-base-700 text-sm font-bold text-ink-dim"
                  >
                    {c.title.slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-bold group-hover:text-accent">{c.title}</span>
                    <span className="shrink-0 text-sm">
                      <b>{c.count}</b>人
                      {/* 割合は登録チャンネルのときだけ（コメントは分母が575人で、どれも1%前後になり意味がない） */}
                      {!commented && (
                        <span className="ml-1 text-[11px] text-ink-dim">{Math.round((c.count / base) * 100)}%</span>
                      )}
                    </span>
                  </span>
                  {/* 棒の長さは1位を100%にした人数の比 */}
                  <span aria-hidden="true" className="mt-1.5 block h-2 overflow-hidden rounded-full bg-base-900">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${(c.count / max) * 100}%` }} />
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}

      <p className="text-xs leading-relaxed text-ink-dim">
        {commented ? (
          <>
            ※ すべての配信者を見ているわけではありません。リスナーの登録先や「参加型」の検索から候補にしたチャンネルだけです。
            コメントの多い大きな配信は、チャットの最初のほうしか見られていません。
          </>
        ) : (
          <>※ YouTubeで登録チャンネルを公開している人だけを数えています。公開していない人のほうが多いので、目安として見てください。</>
        )}
        <br />
        ※ 載せているのは人数だけで、誰がいたかは載せていません。{data.minPeople}人未満のチャンネルは表示していません（データ作成:{" "}
        {data.generated}）。
      </p>
    </div>
  )
}
