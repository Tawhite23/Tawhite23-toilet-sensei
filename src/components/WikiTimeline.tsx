"use client"
import { useEffect, useRef, useState } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { fetchWiki } from "@/lib/data"
import { site } from "@/lib/site.config"
import type { WikiEntry, WikiFile } from "@/lib/types"

/**
 * WIKI「これまでの歩み」年表（ロードマップ表示）。
 *
 * 表示形式は kickers.tokyo /history を参考にしている:
 *   中央の縦レール + スクロール連動で伸びる進捗バー + 左右交互のカード。
 *   カードは origin-top の scaleY で「巻物が下りる」ように開き、
 *   中身は少し遅れてフェードインする。
 * 見た目はテーマに合わせ、レールをミシン目、進捗をオレンジのインクにした。
 *
 * データ源は従来どおり:
 * - wiki.json（GitHub Actions が日次生成）。取得できない場合は
 *   site.config.ts の wikiHistory にフォールバックして必ず何か出す。
 * - 登録者/再生数の桁が繰り上がると自動で1行追加される。
 * - 最下部の「現在」は常にKEEPされ、いま何人・何回なのかが分かる。
 */

const fmtDate = (d: string, approx?: boolean) => {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return d
  const label = `${m[1]}年${Number(m[2])}月${Number(m[3])}日`
  return approx ? `${m[1]}年${Number(m[2])}月ごろ` : label
}

const badge = (e: WikiEntry) => {
  if (e.kind === "milestone") return e.metric === "subs" ? "登録者" : "再生数"
  if (e.kind === "auto") return "記録"
  return null
}

/**
 * 出現アニメーションの発火条件。
 * 下は -60px（少し入ってから開く）。上は +800px と広めに取っている。
 * これは、素早いスクロールやリロード時のスクロール位置復元で
 * 「一度も交差しないまま画面より上へ通り過ぎた」カードが
 * scaleY(0) のまま見えなくなるのを防ぐため。
 * (IntersectionObserver は交差しなかった要素の出現を報告しない)
 */
const REVEAL_VIEWPORT = { once: true, margin: "800px 0px -60px 0px" } as const

/** 年表の1件ぶん。表示に必要な形だけに正規化して、フォールバックと同じ経路で描く */
interface Node {
  key: string
  date: string
  event: string
  detail?: string
  videoId?: string
  badge: string | null
}

function Card({ node, side }: { node: Node; side: "left" | "right" }) {
  return (
    <motion.div
      initial={{ scaleY: 0, opacity: 0 }}
      whileInView={{ scaleY: 1, opacity: 1 }}
      viewport={REVEAL_VIEWPORT}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="roadmap-card relative rounded-xl border border-base-700 bg-base-800 p-4 sm:p-5"
    >
      {/* カードからレールへ伸びる吹き出しの角(lg以上のみ) */}
      <span
        aria-hidden="true"
        className={`absolute top-6 hidden h-0 w-0 border-y-8 border-y-transparent lg:block ${
          side === "left"
            ? "right-[-9px] border-l-[10px] border-l-base-700"
            : "left-[-9px] border-r-[10px] border-r-base-700"
        }`}
      />
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={REVEAL_VIEWPORT}
        transition={{ duration: 0.5, delay: 0.35 }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-accent px-2 py-0.5 text-[11px] font-bold text-base-900">
            {node.date}
          </span>
          {node.badge && (
            <span className="rounded border border-base-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
              {node.badge}
            </span>
          )}
        </div>

        <h3 className="mt-2 text-base font-bold leading-snug sm:text-lg">{node.event}</h3>

        {node.detail && (
          <p className="mt-1.5 text-xs leading-relaxed text-ink-dim sm:text-sm">{node.detail}</p>
        )}

        {node.videoId && (
          <a
            href={`https://www.youtube.com/watch?v=${node.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[11px] text-ink-dim underline underline-offset-4 hover:text-accent"
          >
            該当の配信を見る ↗
          </a>
        )}
      </motion.div>
    </motion.div>
  )
}

export default function WikiTimeline() {
  const [wiki, setWiki] = useState<WikiFile | null>(null)
  const [loaded, setLoaded] = useState(false)
  const railRef = useRef<HTMLDivElement>(null)

  // レールの進捗。年表の上端が画面下に入ってから、下端が画面中央に来るまでで 0→1
  // layoutEffect:false … 初回レイアウト時点ではまだ ref が繋がっていないため。
  // これを付けないと framer-motion が計測に失敗し、進捗が 0 のまま固まる。
  const { scrollYProgress } = useScroll({
    target: railRef,
    offset: ["start 0.9", "end 0.55"],
    layoutEffect: false,
  })
  const fillHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])

  useEffect(() => {
    let alive = true
    fetchWiki()
      .then((w) => alive && setWiki(w))
      .finally(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [])

  const entries = wiki?.entries ?? []
  const nodes: Node[] =
    loaded && entries.length === 0
      ? site.wikiHistory.map((h) => ({
          key: h.event,
          date: h.date,
          event: h.event,
          detail: h.detail,
          badge: null,
        }))
      : entries.map((e) => ({
          key: e.id,
          date: fmtDate(e.date, e.approx),
          event: e.event,
          detail: e.detail,
          videoId: e.videoId,
          badge: badge(e),
        }))

  return (
    <div>
      {/* 読み込み中でも railRef を張ったこの要素は必ず描く。
          ここを早期returnにすると useScroll が計測対象を掴めず進捗が動かない。 */}
      <div ref={railRef} className="relative py-2">
        {!loaded && <p className="py-10 text-center text-xs text-ink-dim">読み込み中…</p>}

        {loaded && (
          <>
        {/* 中央の縦レール（ミシン目）。lg未満では左端に寄せる */}
        <div
          aria-hidden="true"
          className="roadmap-rail absolute bottom-0 top-0 w-0.5 left-[7px] lg:left-1/2 lg:-translate-x-1/2"
        >
          {/* スクロール連動で伸びるインク。先端に進行方向の矢尻を置く */}
          <motion.div
            style={{ height: fillHeight }}
            className="absolute left-0 top-0 w-full bg-accent"
          >
            <span className="absolute bottom-0 left-1/2 h-0 w-0 -translate-x-1/2 translate-y-1 border-x-[5px] border-x-transparent border-t-[7px] border-t-accent" />
          </motion.div>
        </div>

        {/* 間隔は space-y だけで作る。li に py を持たせるとカードだけが下がり、
            li 基準で置いているドットとカードの吹き出しの角が縦にズレる。 */}
        <ul className="space-y-8">
          {nodes.map((node, i) => {
            const side = i % 2 === 0 ? "left" : "right"
            return (
              <li key={node.key} className="relative">
                {/* レール上のドット。
                    位置決め(left/-translate-x)は外側のspan、拡大アニメーションは内側と
                    役割を分けている。両方を1要素にまとめると framer-motion が
                    transform をインラインで書き込み、-translate-x-1/2 が消えて
                    デスクトップでドットがレールから右に7pxズレる。 */}
                <span
                  aria-hidden="true"
                  className="absolute top-6 z-10 block h-3.5 w-3.5 left-[1px] lg:left-1/2 lg:-translate-x-1/2"
                >
                  <motion.span
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    viewport={REVEAL_VIEWPORT}
                    transition={{ duration: 0.3, delay: 0.25 }}
                    className="block h-full w-full rounded-full border-2 border-accent bg-base-900"
                  />
                </span>
                <div
                  className={`pl-8 lg:pl-0 ${
                    side === "left"
                      ? "lg:pr-[calc(50%+2.5rem)]"
                      : "lg:pl-[calc(50%+2.5rem)]"
                  }`}
                >
                  <Card node={node} side={side} />
                </div>
              </li>
            )
          })}

          {/* 最下部に常駐する「現在」。ロードマップの現在地マーカーとして置く */}
          {wiki?.current && (
            <li className="relative">
              <span
                aria-hidden="true"
                className="absolute top-6 z-10 block h-3.5 w-3.5 rounded-full bg-accent ring-4 ring-accent/25 left-[1px] lg:left-1/2 lg:-translate-x-1/2"
              />
              <div className="pl-8 lg:mx-auto lg:max-w-md lg:pl-0">
                <div className="rounded-xl border-2 border-accent bg-base-800 p-4 text-center sm:p-5">
                  <p className="text-[11px] font-bold tracking-[0.2em] text-accent">現在</p>
                  <p className="mt-2 text-sm font-bold sm:text-base">
                    チャンネル登録者{" "}
                    <span className="text-accent tabular-nums">
                      {wiki.current.subscriberCount?.toLocaleString("ja-JP") ?? "-"}
                    </span>
                    人
                    <span className="mx-2 text-ink-dim">/</span>
                    総再生数{" "}
                    <span className="text-accent tabular-nums">
                      {wiki.current.viewCount?.toLocaleString("ja-JP") ?? "-"}
                    </span>
                    回
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                    {wiki.current.ym.replace("-", "年")}月時点の記録。
                    桁が繰り上がるたびに年表へ1行追加されます。
                  </p>
                </div>
              </div>
            </li>
          )}
        </ul>
          </>
        )}
      </div>

      <p className="mt-4 text-xs text-ink-dim">
        ※ 削除・非公開になった配信は確認できないため、「現存する最も古い〜」として記録しています。
        {wiki?.generatedAt && ` 最終更新: ${wiki.generatedAt.slice(0, 10)}`}
      </p>
    </div>
  )
}
