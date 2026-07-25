"use client"

/**
 * レイアウト自体が壊れた場合の最終フォールバック。
 * error.tsx で拾えない範囲（RootLayout 内の例外）をここで受ける。
 * globals.css が当たらない可能性があるため、素のstyleで最小限だけ描く。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ja">
      <body style={{ background: "#0f0e0d", color: "#f5f1ea", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ margin: "0 auto", maxWidth: 640, padding: "64px 16px" }}>
          <h1 style={{ fontSize: 18, fontWeight: 900 }}>表示に失敗しました</h1>
          <pre
            style={{
              marginTop: 16,
              whiteSpace: "pre-wrap",
              fontSize: 11,
              lineHeight: 1.7,
              opacity: 0.75,
            }}
          >
            {error.message || "unknown error"}
            {error.digest ? `\n(digest: ${error.digest})` : ""}
          </pre>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              borderRadius: 999,
              border: "1px solid #e2761b",
              background: "transparent",
              color: "#e2761b",
              fontWeight: 700,
            }}
          >
            もう一度試す
          </button>
        </div>
      </body>
    </html>
  )
}
