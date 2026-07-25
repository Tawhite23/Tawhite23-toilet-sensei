"use client"
import { useEffect } from "react"

/**
 * ページ単位のエラーバウンダリ。
 *
 * これが無いと Next.js の既定画面
 * 「Application error: a client-side exception has occurred」
 * だけが表示され、原因がコンソールを開かないと分からなかった。
 * ここでエラーメッセージを画面に出しておくことで、
 * 「実は毎回落ちていたのに気づけない」状態を防ぐ。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 本番ビルドでも必ずコンソールに残す
    console.error("[page error]", error)
  }, [error])

  return (
    <div className="mx-auto max-w-xl px-4 pb-28 pt-16 md:pt-28">
      <div className="rounded-2xl border border-base-700 bg-base-800 p-6">
        <h1 className="text-lg font-black">表示に失敗しました</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          一時的な読み込みエラーの可能性があります。下のボタンで再読み込みしてください。
        </p>
        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-lg border border-base-700 bg-base-900 p-3 text-[11px] leading-relaxed text-ink-dim">
          {error.message || "unknown error"}
          {error.digest ? `\n(digest: ${error.digest})` : ""}
        </pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={reset}
            className="rounded-full border border-accent px-4 py-2 text-sm font-bold text-accent hover:bg-base-700"
          >
            もう一度試す
          </button>
          <a
            href="/"
            className="rounded-full border border-base-700 px-4 py-2 text-sm text-ink-dim hover:border-accent hover:text-ink"
          >
            ホームへ
          </a>
        </div>
      </div>
    </div>
  )
}
