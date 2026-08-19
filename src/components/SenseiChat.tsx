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

interface Msg {
  role: "user" | "assistant"
  content: string
  sources?: { text: string; date: string }[]
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

  const [nickname, setNickname] = useState("")
  const [nickSaved, setNickSaved] = useState<string>("")
  const [editingNick, setEditingNick] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setReady(true) }), [])

  // 保存済みの呼び名を読む
  useEffect(() => {
    if (!user) return
    user.getIdToken().then((t) =>
      fetch(api("/api/chat/profile"), { headers: { Authorization: `Bearer ${t}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.nickname) {
            setNickname(d.nickname)
            setNickSaved(d.nickname)
          }
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

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || !user || sending) return
    setInput("")
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
            ? `今日はここまで。1日${d?.limit ?? 20}回までな。また明日来いよ。`
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
          <span className="ml-auto text-ink-dim">残り {remaining} 回</span>
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
        {messages.length === 0 && (
          <p className="py-6 text-center text-xs leading-relaxed text-ink-dim">
            なんでも聞いてみてくれ。過去の配信で話したことなら答えられる。
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div
              className={`inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-accent/15 text-ink"
                  : "border border-base-700 bg-base-900"
              }`}
            >
              {m.content}
            </div>
            {/* 何を根拠に答えたかを出す。作り話と実際の発言を区別できるようにするため */}
            {m.sources && m.sources.length > 0 && (
              <details className="mt-1 text-left">
                <summary className="cursor-pointer text-[11px] text-ink-dim hover:text-accent">
                  参考にした過去の発言 ({m.sources.length})
                </summary>
                <ul className="mt-1 space-y-1">
                  {m.sources.map((s, j) => (
                    <li key={j} className="text-[11px] leading-relaxed text-ink-dim">
                      ({s.date}) {s.text}
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
          onClick={send}
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
