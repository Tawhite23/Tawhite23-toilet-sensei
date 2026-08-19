"use client"
import { useCallback, useEffect, useState } from "react"
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth"
import { motion, AnimatePresence } from "framer-motion"
import { auth, googleProvider } from "@/lib/firebase"
import { site } from "@/lib/site.config"
import { useLiveNow } from "@/lib/useLiveNow"
import HeroTitle from "./HeroTitle"
import LiveRing from "./LiveRing"
import { LivePill } from "./LiveStatusCard"
import SocialLinks from "./SocialLinks"
import QuoteSearchCard from "./QuoteSearchCard"
import SenseiChat from "./SenseiChat"

/**
 * トップページ。通常の紹介画面と、AIおトイレ先生との会話モードを切り替える。
 *
 * ■ 会話モードに入る条件
 *   Googleログイン済み、かつ配信中でないこと。
 *
 * ■ 会話モード中の見え方
 *   名前・キャッチコピー・紹介文・SNS・検索カードは「非アクティブ」にする
 *   （薄くして操作もできなくする。消しはしない）。
 *   一方でチャンネルアイコンだけは通常どおり見せる＝話し相手の顔として残す。
 *
 * ■ 通常画面へ戻る条件
 *   1. ログアウトしたとき
 *   2. 配信が始まったとき
 *      本物の配信が始まったらそちらへ誘導すべきで、AIとの会話を続けさせない。
 *      isLive は useLiveNow が60秒間隔で追従しているので自動で戻る。
 */
export default function HomeHero() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [chatting, setChatting] = useState(false)
  const { live } = useLiveNow()
  const isLive = !!live?.isLive

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setReady(true) }), [])

  // ログアウト、または配信開始で通常画面へ戻す
  useEffect(() => {
    if (!user || isLive) setChatting(false)
  }, [user, isLive])

  const login = useCallback(() => {
    signInWithPopup(auth, googleProvider)
      .then(() => setChatting(true))
      .catch(() => {})
  }, [])

  // 会話モード中だけ、紹介まわりを非アクティブにする
  const dim = chatting

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-6 px-6 pb-16 pt-6 text-center md:grid md:grid-cols-[1fr_auto] md:items-center md:gap-16 md:px-16 md:pb-10 md:pt-28 md:text-left lg:px-28 xl:px-40">
      {/* 背景の淡いグラデーション */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_35%,color-mix(in_srgb,var(--c-ink)_4%,transparent),transparent)]"
      />

      {/* アイコンは会話中もそのまま（話し相手の顔として残す） */}
      <div className="flex flex-col items-center gap-3 md:order-2 md:justify-self-end">
        <LiveRing />
        <LivePill hideLabel className="max-w-[15rem] lg:max-w-[17rem]" />
      </div>

      {/* 左カラム。通常の紹介と会話UIを同じ場所に重ねる */}
      <div className="grid w-full min-w-0 md:order-1">
        {/* --- 通常の紹介 --- */}
        <motion.div
          animate={{ opacity: dim ? 0.12 : 1, filter: dim ? "blur(2px)" : "blur(0px)" }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          // 会話中は読み上げ・タブ移動の対象からも外す（見た目だけ薄くしても
          // キーボード操作やスクリーンリーダーには残ってしまうため）
          aria-hidden={dim}
          // React 18 の型では boolean。会話中は中の要素にタブ移動できないようにする
          inert={dim || undefined}
          className={`col-start-1 row-start-1 flex w-full min-w-0 flex-col items-center gap-5 md:items-start ${
            dim ? "pointer-events-none" : ""
          }`}
        >
          <div className="w-full min-w-0">
            <HeroTitle />
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-dim md:mx-0 lg:text-base">
              {site.intro}
            </p>
          </div>
          <SocialLinks />
          <QuoteSearchCard />
        </motion.div>

        {/* --- 会話モード --- */}
        <AnimatePresence>
          {chatting && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="col-start-1 row-start-1 w-full min-w-0 self-center text-left"
            >
              <SenseiChat onClose={() => setChatting(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 会話への導線。会話中は出さない */}
      {ready && !chatting && (
        <div className="md:order-3 md:col-span-2 md:justify-self-center">
          {isLive ? (
            // 配信中はAIより本物へ誘導する
            <p className="text-xs text-ink-dim">
              いま配信中です。AIとの会話は配信が終わってからどうぞ。
            </p>
          ) : !user ? (
            <button
              onClick={login}
              className="rounded-full border border-base-700 bg-base-800 px-5 py-2.5 text-sm font-medium hover:border-accent"
            >
              Googleでログインして AIおトイレ先生と話す
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setChatting(true)}
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-base-900"
              >
                AIおトイレ先生と話す
              </button>
              <button
                onClick={() => signOut(auth).catch(() => {})}
                className="text-xs text-ink-dim underline underline-offset-4 hover:text-accent"
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
