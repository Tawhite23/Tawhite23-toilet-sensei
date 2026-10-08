"use client"
import { useMemo, useState } from "react"
import { attendanceCalendar, num } from "@/lib/listeners"
import { site } from "@/lib/site.config"
import type { Listener, ListenersFile } from "@/lib/types"
import { useLiveNow } from "@/lib/useLiveNow"
import Avatar from "./Avatar"
import AttendanceGrid, { AttendanceLegend } from "./AttendanceGrid"
import TitleChips from "./TitleChips"

type Sort = "attend" | "comments" | "rate" | "streak" | "recent" | "new"
const SORTS: { key: Sort; label: string }[] = [
  { key: "attend", label: "出席が多い順" },
  { key: "comments", label: "コメントが多い順" },
  { key: "rate", label: "出席率が高い順" },
  { key: "streak", label: "連続出席中" },
  { key: "recent", label: "最近来た順" },
  { key: "new", label: "新しく来た順" },
]
// 1枚のカードに1年ぶん(約370マス)の出席カレンダーを描くので、一度に出す人数は控えめにする
const PAGE = 20

const last = (l: Listener) => l.att[l.att.length - 1][0]
const COMPARE: Record<Sort, (a: Listener, b: Listener) => number> = {
  attend: (a, b) => b.attend - a.attend || b.comments - a.comments,
  comments: (a, b) => b.comments - a.comments,
  rate: (a, b) => b.rate - a.rate || b.attend - a.attend,
  streak: (a, b) => b.streak - a.streak || b.attend - a.attend,
  recent: (a, b) => last(b) - last(a) || b.attend - a.attend,
  new: (a, b) => b.att[0][0] - a.att[0][0] || b.attend - a.attend,
}

/** 名鑑タブ: リスナーごとに、この1年の出席カレンダーを並べる。名前で探す・並べ替える・名前を押すと詳しい記録が開く */
export default function ListenerBook({
  data,
  me,
  onOpen,
}: {
  data: ListenersFile
  me: string | null
  onOpen: (key: string) => void
}) {
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<Sort>("attend")
  const [shown, setShown] = useState(PAGE)
  const { live } = useLiveNow()

  const mine = useMemo(() => data.listeners.find((l) => l.key === me), [data, me])
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const hit = needle ? data.listeners.filter((l) => l.name.toLowerCase().includes(needle)) : data.listeners
    return [...hit].sort(COMPARE[sort])
  }, [data, q, sort])
  const visible = list.slice(0, shown)

  return (
    <div className="space-y-4">
      {/* 自分の記録。常連が「続きを伸ばしに配信へ行く」きっかけになる場所なので一番上に置く */}
      {mine ? (
        <section
          aria-label="あなたの記録"
          className="rounded-2xl border border-accent bg-base-800 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-accent">あなたの記録</p>
            <button
              onClick={() => onOpen(mine.key)}
              className="rounded-full border border-base-700 px-3 py-1 text-xs text-ink-dim hover:border-accent hover:text-ink"
            >
              詳しく見る
            </button>
          </div>
          <p className="mt-1 flex items-center gap-2.5 text-lg font-black">
            <Avatar listener={mine} size={40} />
            <span className="truncate">{mine.name}</span>
          </p>
          <p className="mt-1 text-sm text-ink-dim">
            出席 <b className="text-ink">{mine.attend}</b>回・出席率 <b className="text-ink">{mine.rate}</b>%・
            {mine.streak > 0 ? (
              <>
                いま <b className="text-ink">{mine.streak}</b>回連続で出席中
              </>
            ) : (
              <>最長 <b className="text-ink">{mine.best}</b>回連続</>
            )}
          </p>
          <a
            href={live?.isLive && live.videoId ? `https://www.youtube.com/watch?v=${live.videoId}` : site.sns.youtube}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded-full bg-accent px-4 py-2 text-xs font-bold text-base-900 hover:opacity-90"
          >
            {live?.isLive
              ? "いま配信中！コメントして出席をつける ↗"
              : mine.streak > 0
                ? "次の配信で連続出席を伸ばす ↗"
                : "次の配信でコメントして出席をつける ↗"}
          </a>
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed border-base-700 p-3 text-xs leading-relaxed text-ink-dim">
          自分のカードを開いて「自分の記録に登録」を押すと、次からここに自分の出席が表示されます。
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setShown(PAGE)
          }}
          placeholder="名前で探す"
          aria-label="リスナーの名前で探す"
          className="min-w-0 flex-1 rounded-full border border-base-700 bg-base-800 px-4 py-2 text-sm placeholder:text-ink-dim focus:border-accent"
        />
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as Sort)
            setShown(PAGE)
          }}
          aria-label="並べ替え"
          className="rounded-full border border-base-700 bg-base-800 px-3 py-2 text-xs text-ink-dim focus:border-accent"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="p-6 text-center text-sm text-ink-dim">
          見つかりませんでした。名鑑に載るのは、{data.minAttend}回以上の配信でコメントした方です。
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((l) => (
            <li key={l.key}>
              <ListenerCard listener={l} data={data} isMe={l.key === me} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}

      {shown < list.length && (
        <button
          onClick={() => setShown((s) => s + PAGE)}
          className="mx-auto block rounded-full border border-base-700 bg-base-800 px-6 py-2.5 text-sm font-bold hover:border-accent"
        >
          もっと見る（残り {list.length - shown}人）
        </button>
      )}
    </div>
  )
}

function ListenerCard({
  listener: l,
  data,
  isMe,
  onOpen,
}: {
  listener: Listener
  data: ListenersFile
  isMe: boolean
  onOpen: (key: string) => void
}) {
  const weeks = useMemo(() => attendanceCalendar(l, data, { kind: "recent" }), [l, data])
  // 1日に2回配信があった日は2回と数える（通算の出席回数と同じ数え方）
  const year = useMemo(() => {
    const from = weeks[0].find((c) => c)!.date
    return l.att.reduce(
      (a, [i, c]) => (data.streams[i].date >= from ? { attend: a.attend + 1, comments: a.comments + c } : a),
      { attend: 0, comments: 0 }
    )
  }, [weeks, l, data])

  return (
    <article className={`rounded-2xl border bg-base-800 p-4 ${isMe ? "border-accent" : "border-base-700"}`}>
      <div className="flex items-center justify-between gap-x-4">
        <h2 className="min-w-0 text-base font-bold">
          <button onClick={() => onOpen(l.key)} className="flex max-w-full items-center gap-2.5 text-left hover:text-accent">
            <Avatar listener={l} size={36} />
            <span className="truncate">{l.name}</span>
          </button>
        </h2>
        <button
          onClick={() => onOpen(l.key)}
          className="shrink-0 rounded-full border border-base-700 px-3 py-1 text-xs text-ink-dim hover:border-accent hover:text-ink"
        >
          詳しく見る
        </button>
      </div>
      <p className="mb-3 mt-2 text-xs text-ink-dim">
        この1年で <b className="text-sm text-accent">{year.attend}</b>回 出席
        <span className="ml-3">
          通算 {l.attend}回・出席率 {l.rate}%・コメント {num(l.comments)}件
        </span>
      </p>

      <AttendanceGrid weeks={weeks} />

      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <TitleChips listener={l} data={data} />
        <AttendanceLegend />
      </div>
    </article>
  )
}
