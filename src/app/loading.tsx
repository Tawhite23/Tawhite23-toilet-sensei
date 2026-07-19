// 【3-2】ローディング: トイレットペーパーがくるくる回る簡易アニメ
export default function Loading() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4" role="status" aria-label="読み込み中">
      <svg viewBox="0 0 64 64" width="72" height="72" className="animate-spin-slow" aria-hidden="true">
        <circle cx="32" cy="32" r="26" fill="var(--c-paper)" stroke="var(--c-border)" strokeWidth="3" />
        <circle cx="32" cy="32" r="9" fill="var(--c-bg)" stroke="var(--c-border)" strokeWidth="2" />
        <path d="M32 6 A26 26 0 0 1 58 32" fill="none" stroke="var(--c-ink-dim)" strokeWidth="2" strokeDasharray="4 6" strokeLinecap="round" />
      </svg>
      <p className="text-sm text-ink-dim">くるくる読み込み中…</p>
    </div>
  )
}
