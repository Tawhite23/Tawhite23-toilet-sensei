"use client"
import { useEffect, useRef } from "react"
import Lenis from "lenis"
import { motion, useScroll, useTransform } from "framer-motion"
import { site } from "@/lib/site.config"

/** スクロール連動セクション(共通): ビューポート進入でフェード+スライドイン */
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

export default function ProfileScroll() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll()
  const heroScale = useTransform(scrollYProgress, [0, 0.25], [1, 1.15])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0.25])

  // Lenis: 慣性スクロール
  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.1 })
    let raf: number
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); lenis.destroy() }
  }, [])

  return (
    <div ref={ref} className="pb-28 md:pb-12">
      {/* Hero */}
      <section className="relative flex h-[85dvh] items-center justify-center overflow-hidden">
        <motion.div
          style={{ scale: heroScale, opacity: heroOpacity }}
          className="flex flex-col items-center gap-6 px-6 text-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={site.channelIcon}
            alt="おトイレ先生"
            width={160}
            height={160}
            className="h-40 w-40 rounded-full border-2 border-base-700 shadow-[0_0_80px_rgba(56,189,248,0.25)]"
          />
          <div>
            <h1 className="text-4xl font-black tracking-widest sm:text-5xl">おトイレ先生</h1>
            <p className="mt-3 text-accent">{site.tagline}</p>
          </div>
        </motion.div>
        <p className="absolute bottom-8 animate-bounce text-xs text-ink-dim" aria-hidden="true">
          scroll ↓
        </p>
      </section>

      <div className="mx-auto max-w-2xl space-y-24 px-6">
        {/* 世界観 */}
        <Reveal>
          <section aria-labelledby="about">
            <h2 id="about" className="mb-4 text-xs font-bold tracking-[0.3em] text-accent">ABOUT</h2>
            <p className="text-lg font-medium leading-loose">
              27歳、高身長、高イケメン、高優男。<br />
              マイクラ参加型からAPEXランク、ポケモン初見縛りまで——
              「楽しくやりたい事をやりたい放題やる」を貫く配信者。
            </p>
            <p className="mt-4 leading-relaxed text-ink-dim">
              チャーミングポイントは起きれないこと。合言葉は「お前らを笑顔に」。
              ハードコアチャレンジ、建国サーバー、ウォシュレッ島発展プロジェクト……
              視聴者と一緒に作り上げる企画の数々が、このチャンネルの世界。
            </p>
          </section>
        </Reveal>

        {/* Wiki */}
        <Reveal delay={0.1}>
          <section aria-labelledby="wiki">
            <h2 id="wiki" className="mb-4 text-xs font-bold tracking-[0.3em] text-accent">WIKI</h2>
            <a
              href={site.wikiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between rounded-2xl border border-base-700 bg-base-800 p-5 transition-colors hover:border-accent"
            >
              <div>
                <p className="font-bold group-hover:text-accent">おトイレ先生 非公式Wiki</p>
                <p className="mt-1 text-sm text-ink-dim">企画の歴史・名言集・シリーズまとめはこちら</p>
              </div>
              <span aria-hidden="true" className="text-ink-dim group-hover:text-accent">→</span>
            </a>
          </section>
        </Reveal>

        {/* モデレーター */}
        <Reveal delay={0.1}>
          <section aria-labelledby="mods">
            <h2 id="mods" className="mb-4 text-xs font-bold tracking-[0.3em] text-accent">MODERATORS</h2>
            <ul className="grid grid-cols-3 gap-4 sm:grid-cols-6">
              {site.moderators.map((m, i) => (
                <motion.li
                  key={m.name}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  className="flex flex-col items-center gap-2"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-14 w-14 items-center justify-center rounded-full border border-base-700 bg-gradient-to-br from-base-700 to-base-800 text-lg font-black text-accent"
                  >
                    {m.name[0]}
                  </span>
                  <span className="text-center text-xs text-ink-dim">{m.name}</span>
                </motion.li>
              ))}
            </ul>
            <h3 className="mb-3 mt-8 text-[10px] font-bold tracking-[0.3em] text-ink-dim">SUPPORTERS</h3>
            <ul className="flex flex-wrap gap-3">
              {site.supporters.map((s) => (
                <li key={s.name} className="rounded-full border border-base-700 bg-base-800 px-4 py-1.5 text-xs text-ink-dim">
                  {s.name}
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      </div>
    </div>
  )
}
