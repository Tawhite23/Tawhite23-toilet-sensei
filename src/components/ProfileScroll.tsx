"use client"
import { useEffect, useRef } from "react"
import Lenis from "lenis"
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion"
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

// ============================================================
// 【3-1/v2-4】トイレットペーパー全面背景。
// ページ上部のロールから、スクロール量に正比例して紙が全面に敷かれ、
// 上スクロールで巻き戻る。コンテンツはこの紙の上(z-10)に乗る。
// 紙面左端にセクション案内を印字。transform/opacityのみ = 軽量。
// ============================================================
const RAIL_SECTIONS = [
  { at: 0.16, label: "▶ ABOUT" },
  { at: 0.44, label: "▶ これまでの歩み" },
  { at: 0.74, label: "▶ モデレーター" },
]

function PaperBackdrop({ progress }: { progress: MotionValue<number> }) {
  const paperScale = useTransform(progress, [0.02, 0.98], [0, 1])
  const rollRotate = useTransform(progress, [0, 1], [0, 900])
  const labelOpacities = RAIL_SECTIONS.map((s) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useTransform(progress, [Math.max(0, s.at - 0.1), s.at], [0, 1])
  )
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      {/* 全面に敷かれる紙(スクロール量に正比例 / 巻き戻し可) */}
      <motion.div
        style={{ scaleY: paperScale }}
        className="absolute inset-x-0 top-0 h-full origin-top bg-paper shadow-[0_6px_30px_var(--c-paper-shadow)]"
      >
        {/* ミシン目(横方向に一定間隔) */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0 118px, var(--c-paper-shadow) 118px 120px)",
          }}
        />
        {/* 紙のふち(左右)と柔らかい面の陰影 */}
        <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-[var(--c-paper-shadow)] to-transparent opacity-40" />
        <div className="absolute inset-y-0 right-0 w-2 bg-gradient-to-l from-[var(--c-paper-shadow)] to-transparent opacity-40" />
        <div className="absolute inset-x-0 top-0 h-px bg-[var(--c-paper-edge)]" />
        {/* 先端(下端)の切り取りギザギザ */}
        <div
          className="absolute inset-x-0 bottom-0 h-2"
          style={{
            background: "var(--c-paper)",
            clipPath: "polygon(0 0, 100% 0, 100% 40%, 97% 100%, 94% 40%, 91% 100%, 88% 40%, 85% 100%, 82% 40%, 79% 100%, 76% 40%, 73% 100%, 70% 40%, 67% 100%, 64% 40%, 61% 100%, 58% 40%, 55% 100%, 52% 40%, 49% 100%, 46% 40%, 43% 100%, 40% 40%, 37% 100%, 34% 40%, 31% 100%, 28% 40%, 25% 100%, 22% 40%, 19% 100%, 16% 40%, 13% 100%, 10% 40%, 7% 100%, 4% 40%, 0 100%)",
            transform: "translateY(100%)",
          }}
        />
      </motion.div>
      {/* 紙面左端に印字されたセクション案内 */}
      {RAIL_SECTIONS.map((s, i) => (
        <motion.span
          key={s.label}
          style={{ opacity: labelOpacities[i], top: `${10 + s.at * 74}%`, writingMode: "vertical-rl" }}
          className="absolute left-2 whitespace-nowrap text-[10px] font-bold tracking-[0.25em] text-ink-dim opacity-70 md:left-5 md:text-[11px]"
        >
          {s.label}
        </motion.span>
      ))}
    </div>
  )
}

/** 【3-2/v3】「流してトップへ」: 回転するペーパーロール。薄いウォーターマーク表現 */
function FlushButton({ progress, onFlush }: { progress: MotionValue<number>; onFlush: () => void }) {
  const opacity = useTransform(progress, [0.08, 0.18], [0, 1])
  const rollRotate = useTransform(progress, [0, 1], [0, 900])
  return (
    <motion.div style={{ opacity }} className="fixed bottom-20 right-3 z-40 md:bottom-8 md:right-6">
      <button
        onClick={onFlush}
        aria-label="流してトップへ（ページ上部へ戻る）"
        title="流してトップへ"
        className="group flex flex-col items-center gap-0.5 rounded-2xl px-2.5 py-2 opacity-40 transition-all hover:-translate-y-0.5 hover:bg-base-800/80 hover:opacity-100 hover:shadow-lg hover:backdrop-blur"
      >
        {/* ペーパーロール(スクロール量に連動して回転) */}
        <motion.svg viewBox="0 0 48 48" width="28" height="28" style={{ rotate: rollRotate }} aria-hidden="true">
          <circle cx="24" cy="24" r="20" fill="var(--c-paper)" stroke="var(--c-paper-edge)" strokeWidth="2.5" />
          <circle cx="24" cy="24" r="7" fill="var(--c-bg)" stroke="var(--c-paper-edge)" strokeWidth="2" />
          <path d="M24 4 A20 20 0 0 1 44 24" fill="none" stroke="var(--c-ink-dim)" strokeWidth="1.5" strokeDasharray="3 5" strokeLinecap="round" />
        </motion.svg>
        <span className="text-[9px] font-medium tracking-wider text-ink-dim group-hover:text-accent">流してトップへ</span>
      </button>
    </motion.div>
  )
}

export default function ProfileScroll() {
  const ref = useRef<HTMLDivElement>(null)
  const lenisRef = useRef<Lenis | null>(null)
  const { scrollYProgress } = useScroll()
  const heroScale = useTransform(scrollYProgress, [0, 0.25], [1, 1.15])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0.25])

  // Lenis: 慣性スクロール
  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.1 })
    lenisRef.current = lenis
    let raf: number
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); lenisRef.current = null; lenis.destroy() }
  }, [])

  const flush = () => {
    if (lenisRef.current) lenisRef.current.scrollTo(0, { duration: 1.1 })
    else window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div ref={ref} className="pb-28 md:pb-12">
      <PaperBackdrop progress={scrollYProgress} />
      <FlushButton progress={scrollYProgress} onFlush={flush} />

      {/* コンテンツは紙の上(z-10)に乗せる */}
      <div className="relative z-10">
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
            className="h-40 w-40 rounded-full border-2 border-base-700 shadow-[0_12px_60px_var(--c-paper-shadow)]"
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

      <div className="mx-auto max-w-2xl space-y-16 px-6 md:px-6">
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

        <hr className="tear-line" aria-hidden="true" />

        {/* 【2-5】WIKI内蔵セクション: チャンネル開設からの歩み */}
        <Reveal delay={0.1}>
          <section aria-labelledby="wiki">
            <h2 id="wiki" className="mb-4 text-xs font-bold tracking-[0.3em] text-accent">WIKI — これまでの歩み</h2>
            <p className="mb-4 text-sm leading-relaxed text-ink-dim">
              チャンネル開設からの節目を記録していくコーナー。随時更新中。
            </p>
            <div className="overflow-hidden rounded-2xl border border-base-700 bg-base-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-base-700 text-left text-xs text-ink-dim">
                    <th scope="col" className="px-4 py-3 font-bold">時期</th>
                    <th scope="col" className="px-4 py-3 font-bold">出来事</th>
                  </tr>
                </thead>
                <tbody>
                  {site.wikiHistory.map((h) => (
                    <tr key={h.event} className="border-b border-base-700 last:border-b-0">
                      <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-ink-dim">
                        {h.date}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{h.event}</p>
                        {h.detail && <p className="mt-0.5 text-xs text-ink-dim">{h.detail}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-dim">
              ※ 確定情報のみ掲載。「今後追記」の項目は判明し次第更新します。
            </p>
          </section>
        </Reveal>

        <hr className="tear-line" aria-hidden="true" />

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
    </div>
  )
}
