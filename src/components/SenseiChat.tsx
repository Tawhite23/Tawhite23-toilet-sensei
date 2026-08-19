"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { onAuthStateChanged, type User } from "firebase/auth"
import { auth } from "@/lib/firebase"
import { site } from "@/lib/site.config"

/**
 * AIおトイレ先生（RAGチャット）。
 *
 * - Googleログイン必須。Worker側でIDトークンを検証している
 *   （チャットはLLMの従量課金を伴うため、誰でも叩ける状態にはできない）。
 * - 返答はWorkerが D1(FTS5) から実際の配信での発言を検索し、それを material にして作る。
 * - 呼び名は本人に入力してもらう。ログイン名からの推測はしない
 *   （別人と取り違える恐れがあり、プライバシー上も避けたい）。
 *
 * ★これは本人ではなくAIによる再現です。UI上でも必ず明示すること。
 */

interface Source {
  text: string
  date: string
  videoId?: string
  /** 発言の開始秒。YouTubeの該当箇所へ飛ぶのに使う */
  start?: number
}

interface Msg {
  role: "user" | "assistant"
  content: string
  sources?: Source[]
}

/** mm:ss 表記 */
const fmtTime = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`
}

const api = (path: string) => `${site.liveApiBaseUrl?.replace(/\/$/, "")}${path}`

export default function SenseiChat({ onClose }: { onClose?: () => void }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)

  const [greeting, setGreeting] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])

  const [nickname, setNickname] = useState("")
  const [nickSaved, setNickSaved] = useState<string>("")
  const [editingNick, setEditingNick] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setReady(true) }), [])

  // 会話の入口をまとめて取る（挨拶・おすすめ質問・呼び名・残り回数）。
  // 空の入力欄をいきなり見せると「何を聞けばいいか分からない」で終わるため、
  // 先方から話しかけ、質問の候補も出す。この取得にLLMは使わないので費用は0。
  useEffect(() => {
    if (!user) return
    user.getIdToken().then((t) =>
      fetch(api("/api/chat/intro"), { headers: { Authorization: `Bearer ${t}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return
          if (d.nickname) {
            setNickname(d.nickname)
            setNickSaved(d.nickname)
          }
          if (d.greeting) setGreeting(d.greeting)
          if (Array.isArray(d.suggestions)) setSuggestions(d.suggestions)
          if (typeof d.remaining === "number") setRemaining(d.remaining)
        })
        .catch(() => {})
    )
  }, [user])

  // 新しい発言が増えたら最下部へ
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, sending])

  const saveNickname = useCallback(async () => {
    if (!user) return
    const t = await user.getIdToken()
    const res = await fetch(api("/api/chat/profile"), {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ nickname: nickname.trim().slice(0, 24) }),
    })
    if (res.ok) {
      const d = await res.json()
      setNickSaved(d.nickname ?? "")
      setEditingNick(false)
    }
  }, [user, nickname])

  const send = useCallback(async (preset?: string) => {
    const text = (preset ?? input).trim()
    if (!text || !user || sending) return
    setInput("")
    setSuggestions([])
    setError(null)
    setSending(true)
    setMessages((m) => [...m, { role: "user", content: text }])

    try {
      const t = await user.getIdToken()
      const res = await fetch(api("/api/chat"), {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          message: text,
          // 直近のやり取りだけ渡す（長くすると費用が上がるためサーバ側でも切っている）
          history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (res.status === 429) {
        const d = await res.json().catch(() => ({}))
        setError(
          d?.scope === "user"
            ? `今日はここまで。1日${d?.limit ?? 20}回までな。日付が変わったらまた来いよ。`
            : "今ちょっと混み合ってる。しばらくしてからな。"
        )
        return
      }
      if (!res.ok) {
        setError("うまく返せなかった。もう一回聞いてくれ。")
        return
      }
      const d = await res.json()
      setMessages((m) => [
        ...m,
        { role: "assistant", content: d.reply, sources: d.sources },
      ])
      if (typeof d.remaining === "number") setRemaining(d.remaining)
    } catch {
      setError("通信に失敗した。電波かな。")
    } finally {
      setSending(false)
    }
  }, [input, user, sending, messages])

  if (!ready) return <div className="h-64" aria-hidden="true" />

  // 未ログインのときの入口はトップページ側(HomeHero)が出すので、ここでは描かない
  if (!user) return null

  // ---- ログイン済み -------------------------------------------------------
  return (
    <div className="rounded-2xl border border-base-700 bg-base-800">
      {/* 呼び名の設定 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-base-700 px-4 py-2.5 text-xs">
        <span className="text-ink-dim">配信での呼ばれ方:</span>
        {editingNick || !nickSaved ? (
          <>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveNickname()}
              placeholder="例: ○○ニキ"
              maxLength={24}
              className="w-36 rounded-full border border-base-700 bg-base-900 px-3 py-1 text-xs focus:border-accent"
            />
            <button
              onClick={saveNickname}
              className="rounded-full border border-accent px-3 py-1 text-xs font-bold text-accent"
            >
              保存
            </button>
          </>
        ) : (
          <>
            <span className="font-bold text-accent">{nickSaved}</span>
            <button
              onClick={() => setEditingNick(true)}
              className="text-ink-dim underline underline-offset-2 hover:text-accent"
            >
              変更
            </button>
          </>
        )}
        {remaining != null && (
          <span
            className={`ml-auto ${remaining <= 3 ? "font-bold text-live" : "text-ink-dim"}`}
            title="1日に話せる回数。日付が変わると戻ります"
          >
            残り {remaining} 回
          </span>
        )}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="会話を閉じてトップへ戻る"
            className={`${remaining != null ? "" : "ml-auto "}rounded-full border border-base-700 px-3 py-1 text-ink-dim hover:border-accent hover:text-accent`}
          >
            閉じる
          </button>
        )}
      </div>

      {/* 会話 */}
      <div ref={listRef} className="max-h-[26rem] space-y-3 overflow-y-auto px-4 py-4">
        {/* 会話の入口。先生から話しかけ、質問の候補も出す */}
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={site.channelIcon}
                alt=""
                className="mt-0.5 h-8 w-8 shrink-0 rounded-full border border-base-700"
              />
              <div className="inline-block max-w-[85%] rounded-2xl border border-base-700 bg-base-900 px-3.5 py-2 text-sm leading-relaxed">
                {greeting ?? "お、来たか。何の話する？"}
              </div>
            </div>
            {suggestions.length > 0 && (
              <div className="pl-10">
                <p className="mb-1.5 text-[11px] text-ink-dim">こんなことが聞けるぞ</p>
                <ul className="flex flex-wrap gap-2">
                  {suggestions.map((q) => (
                    <li key={q}>
                      <button
                        onClick={() => send(q)}
                        className="rounded-full border border-base-700 bg-base-900 px-3 py-1.5 text-left text-xs text-ink-dim transition-colors hover:border-accent hover:text-accent"
                      >
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={m.role === "user" ? "" : "flex items-start gap-2"}>
              {m.role === "assistant" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={site.channelIcon}
                  alt=""
                  className="mt-0.5 h-8 w-8 shrink-0 rounded-full border border-base-700"
                />
              )}
              <div
                className={`inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-accent/15 text-ink"
                    : "border border-base-700 bg-base-900"
                }`}
              >
                {m.content}
              </div>
            </div>
            {/* 何を根拠に答えたかを出す。作り話と実際の発言を区別できるようにするため */}
            {m.sources && m.sources.length > 0 && (
              <details className="mt-1 pl-10 text-left">
                <summary className="cursor-pointer text-[11px] text-ink-dim hover:text-accent">
                  この発言のもとになった配信 ({m.sources.length})
                </summary>
                <ul className="mt-1 space-y-1.5">
                  {m.sources.map((src, j) => (
                    <li key={j} className="text-[11px] leading-relaxed text-ink-dim">
                      {src.videoId ? (
                        // 実際の配信の該当秒数へ直接飛べるようにする。
                        // 「本当にそう言っていた」を利用者自身が確かめられる。
                        <a
                          href={`https://www.youtube.com/watch?v=${src.videoId}&t=${Math.max(0, (src.start ?? 0) - 3)}s`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-accent"
                        >
                          <span className="mr-1.5 font-mono text-accent">
                            {fmtTime(src.start ?? 0)}
                          </span>
                          {src.text}
                          <span className="ml-1 opacity-60">↗</span>
                        </a>
                      ) : (
                        <>
                          ({src.date}) {src.text}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
        {sending && <p className="text-xs text-ink-dim">…考え中</p>}
        {error && <p className="text-xs text-live">{error}</p>}
      </div>

      {/* 入力 */}
      <div className="flex gap-2 border-t border-base-700 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && send()}
          placeholder="先生に聞いてみる"
          maxLength={400}
          disabled={sending}
          className="flex-1 rounded-full border border-base-700 bg-base-900 px-4 py-2 text-sm focus:border-accent disabled:opacity-60"
        />
        <button
          onClick={() => send()}
          disabled={sending || !input.trim()}
          className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-base-900 disabled:opacity-40"
        >
          送信
        </button>
      </div>

      <p className="border-t border-base-700 px-4 py-2 text-[11px] leading-relaxed text-ink-dim">
        ※ ご本人ではありません。過去の配信データをもとにAIが生成した非公式の再現で、
        実際の発言や見解とは異なります。
      </p>
    </div>
  )
}
