"use client"
import { useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { attendees, CATEGORY_CLASS, fmtMin, num, streamTags } from "@/lib/listeners"
import type { ListenersFile, ListenerStream } from "@/lib/types"
import Avatar from "./Avatar"

// 「誰のコメントが多かったか」の帯に名前を出す人数。残りは「ほかの人」にまとめる
const SHARE_TOP = 5
const SHARE_OPACITY = [1, 0.8, 0.62, 0.46, 0.32]

const fmtSec = (sec: number) =>
  `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`

/**
 * 日報タブ: 配信1回ごとの振り返り。月を選んで見る（?m=YYYY-MM）。
 * コメントの量の推移ではなく「どんな回だったか・誰が来たか」が分かるようにしている:
 * 一言の説明、タグ、先生のひとこと、誰のコメントが多かったか、初めて来た人、来た人の一覧。
 */
export default function StreamDaily({ data, onOpen }: { data: ListenersFile; onOpen: (key: string) => void }) {
  const router = useRouter()
  const params = useSearchParams()

  const months = useMemo(() => [...new Set(data.streams.map((s) => s.date.slice(0, 7)))].reverse(), [data])
  const raw = params.get("m")
  const month = raw && months.includes(raw) ? raw : months[0]
  const setMonth = (m: string) => {
    const sp = new URLSearchParams(Array.from(params.entries()))
    if (m === months[0]) sp.delete("m")
    else sp.set("m", m)
    router.replace(`/report/?${sp.toString()}`, { scroll: false })
  }

  // 新しい配信を上に。添字はリスナーの出席データ(att)と突き合わせるのに使う
  const rows = useMemo(
    () =>
      data.streams
        .map((s, i) => [s, i] as const)
        .filter(([s]) => s.date.startsWith(month))
        .reverse(),
    [data, month]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          aria-label="表示する月"
          className="rounded-full border border-base-700 bg-base-800 px-3 py-1.5 text-xs text-ink-dim focus:border-accent"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {m.replace("-", "年")}月
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-dim">の配信 {rows.length}本</span>
      </div>

      <ul className="space-y-3">
        {rows.map(([s, i]) => (
          <li key={s.id}>
            <DayCard stream={s} data={data} index={i} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function DayCard({
  stream: s,
  data,
  index,
  onOpen,
}: {
  stream: ListenerStream
  data: ListenersFile
  index: number
  onOpen: (key: string) => void
}) {
  const came = useMemo(() => attendees(data, index), [data, index])
  const tags = useMemo(() => streamTags(data, index), [data, index])
  const top = came.slice(0, SHARE_TOP)
  const others = s.comments - top.reduce((a, t) => a + t.count, 0)
  const newcomers = came.filter((c) => c.first)
  const watch = `https://www.youtube.com/watch?v=${s.id}`
  const chip = "rounded-full border px-2 py-0.5 text-[11px]"
  const label = "mb-1.5 text-[11px] font-bold text-ink-dim"

  return (
    <article className="space-y-4 rounded-2xl border border-base-700 bg-base-800 p-4">
      <div className="flex gap-3">
        <a href={watch} target="_blank" rel="noopener noreferrer" aria-hidden="true" tabIndex={-1} className="w-28 shrink-0 sm:w-44">
          {/* サムネはYouTubeの直リンク（next.config の images.unoptimized と同じ扱い） */}
          <img
            src={`https://i.ytimg.com/vi/${s.id}/mqdefault.jpg`}
            alt=""
            loading="lazy"
            className="aspect-video w-full rounded-lg object-cover"
          />
        </a>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-dim">
            {s.date} {s.start}〜（{fmtMin(s.min)}）
          </p>
          <h2 className="mt-1 text-sm font-bold leading-snug">
            <a href={watch} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
              {s.title}
            </a>
          </h2>
          {/* どんな回だったかの一言（scripts/stream-summaries.json）。タイトルがネタのことも多いので、中身はここで伝える */}
          {s.summary && <p className="mt-1.5 text-sm leading-relaxed text-accent">{s.summary}</p>}
          <ul aria-label="タグ" className="mt-2 flex flex-wrap gap-1.5">
            <li className={`${chip} ${CATEGORY_CLASS[s.cat]}`}>{s.cat}</li>
            {tags.map((t) => (
              <li key={t.label} className={`${chip} border-base-700 text-ink-dim`}>
                <span aria-hidden="true">{t.icon}</span> {t.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-dim">
            <span>
              コメントした人 <b className="text-sm text-ink">{s.chatters}</b>人
            </span>
            <span>
              コメント <b className="text-sm text-ink">{num(s.comments)}</b>件
            </span>
            {s.first !== null && s.first > 0 && (
              <span>
                初めての人 <b className="text-sm text-accent">{s.first}</b>人
              </span>
            )}
          </p>
        </div>
      </div>

      {s.quotes.length > 0 && (
        <section>
          <h3 className={label}>先生のひとこと</h3>
          <ul className="space-y-1.5">
            {s.quotes.map(([text, sec]) => (
              <li key={sec}>
                <a
                  href={`${watch}&t=${sec}s`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-xl bg-base-900 px-3 py-2 text-sm leading-relaxed"
                >
                  「{text}」
                  <span className="ml-1 whitespace-nowrap text-[11px] text-ink-dim group-hover:text-accent">
                    {fmtSec(sec)} から見る ↗
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {top.length > 0 && (
        <section>
          <h3 className={label}>誰のコメントが多かったか</h3>
          {/* 1本の帯を、コメント数の割合で分ける（左から多い順。灰色は「ほかの人」） */}
          <div aria-hidden="true" className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {top.map((t, k) => (
              <i key={t.listener.key} className="bg-accent" style={{ flexGrow: t.count, opacity: SHARE_OPACITY[k] }} />
            ))}
            {others > 0 && <i className="bg-base-700" style={{ flexGrow: others }} />}
          </div>
          <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {top.map((t, k) => (
              <li key={t.listener.key}>
                <button onClick={() => onOpen(t.listener.key)} className="flex items-center gap-1 hover:text-accent">
                  {/* 帯のどの色がこの人かを示す色見本 */}
                  <i
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 rounded-sm bg-accent"
                    style={{ opacity: SHARE_OPACITY[k] }}
                  />
                  <Avatar listener={t.listener} size={20} />
                  {t.listener.name}
                  <span className="text-ink-dim">
                    {t.count}件（{Math.round((t.count / s.comments) * 100)}%）
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {newcomers.length > 0 && (
        <section>
          <h3 className={label}>🌱 この回が初めてで、今は常連の人</h3>
          <ul className="flex flex-wrap gap-1.5">
            {newcomers.map((c) => (
              <li key={c.listener.key}>
                <button
                  onClick={() => onOpen(c.listener.key)}
                  className={`${chip} flex items-center gap-1 border-plan !py-0.5 !pl-0.5 text-plan hover:bg-base-700`}
                >
                  <Avatar listener={c.listener} size={18} />
                  {c.listener.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-t border-base-700 pt-3 text-xs">
        {came.length > SHARE_TOP && (
          <details className="w-full min-w-0 sm:w-auto sm:flex-1">
            <summary className="cursor-pointer text-ink-dim hover:text-ink">
              この回に来た人を全員見る（名鑑に載っている {came.length}人）
            </summary>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {came.map((c) => (
                <li key={c.listener.key}>
                  <button onClick={() => onOpen(c.listener.key)} className="flex items-center gap-1 hover:text-accent">
                    <Avatar listener={c.listener} size={18} />
                    {c.listener.name} <span className="text-ink-dim">{c.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        {s.peak && (
          <a
            href={`${watch}&t=${s.peak[0] * 60}s`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto shrink-0 text-ink-dim underline-offset-4 hover:text-accent hover:underline"
          >
            チャットがいちばん動いた場面（{fmtMin(s.peak[0])}）↗
          </a>
        )}
      </div>
    </article>
  )
}
