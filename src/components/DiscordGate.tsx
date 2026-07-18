"use client"
import { useEffect, useState } from "react"
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { motion, AnimatePresence } from "framer-motion"
import { auth, db, googleProvider } from "@/lib/firebase"
import type { DiscordDoc } from "@/lib/types"

/**
 * Discord招待ゲート。
 * 未ログイン: 「Googleでログインして招待を見る」ボタンのみ。
 * ログイン後: Firestore /private/discord (ルールで request.auth != null のみ read可)
 * から招待URLを取得して表示する。URLはビルド成果物に含まれない。
 */
export default function DiscordGate() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [invite, setInvite] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setReady(true) }), [])

  useEffect(() => {
    if (!user) { setInvite(null); return }
    getDoc(doc(db, "private", "discord"))
      .then((snap) => {
        if (snap.exists()) setInvite((snap.data() as DiscordDoc).inviteUrl)
        else setError("招待情報が未設定です")
      })
      .catch(() => setError("取得に失敗しました"))
  }, [user])

  if (!ready) return <div className="h-11" aria-hidden="true" />

  return (
    <div className="flex flex-col items-center gap-2">
      <AnimatePresence mode="wait">
        {!user ? (
          <motion.button
            key="login"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={() => signInWithPopup(auth, googleProvider).catch(() => {})}
            className="rounded-full border border-base-700 bg-base-800 px-5 py-2.5 text-sm font-medium text-ink hover:border-accent"
          >
            Googleでログインして Discord 招待を表示
          </motion.button>
        ) : (
          <motion.div
            key="invite"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-2"
          >
            {invite ? (
              <a
                href={invite}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#5865F2] px-6 py-2.5 text-sm font-bold text-white hover:brightness-110"
              >
                {/* Discord 公式ブランドマーク(無改変) */}
                <svg viewBox="0 0 127.14 96.36" width="20" height="16" aria-hidden="true">
                  <path
                    fill="#fff"
                    d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z"
                  />
                </svg>
                Discord サーバーに参加
              </a>
            ) : (
              <p className="text-sm text-ink-dim" role="status">{error ?? "招待を取得中…"}</p>
            )}
            <button
              onClick={() => signOut(auth)}
              className="text-xs text-ink-dim underline underline-offset-4 hover:text-ink"
            >
              ログアウト（{user.displayName ?? "ゲスト"}）
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
