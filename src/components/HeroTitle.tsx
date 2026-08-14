import { site } from "@/lib/site.config"

/**
 * トップのメインタイトル(h1)。
 *
 * kickers.tokyo の .wordmark を参考にした構造だが、あちらは h1 を sr-only にして
 * 装飾用の div を別に置いている。ここでは h1 に本文を持たせたまま、
 * 版ズレのゴースト層だけを aria-hidden の span に分離している
 * （擬似要素の content は一部のスクリーンリーダーが読み上げてしまうため、
 *   ゴースト側に閉じ込めて二重読みを防ぐ）。
 *
 * アニメーション本体は globals.css の .ink-title / ink-slip-* を参照。
 */
export default function HeroTitle() {
  const text = "おトイレ先生"
  return (
    <div>
      <h1 className="ink-title text-4xl font-black tracking-wide sm:text-5xl lg:text-6xl xl:text-7xl">
        <span className="ink-title__base">{text}</span>
        <span className="ink-title__ghost" data-text={text} aria-hidden="true" />
      </h1>

      {/* ローマ字表記。「おトイレ先生」と「otoiresensei」を同一ページ内で共起させる狙い。
          flex は text-center を無視するので、中央寄せは justify-center で明示する
          （スマホ=中央寄せ / PC=左寄せ という親のレイアウトに合わせる） */}
      <div className="mt-2 flex items-center justify-center gap-3 md:justify-start">
        <span className="rule-line hidden w-8 origin-left md:block" aria-hidden="true" />
        <p className="text-[11px] font-medium uppercase tracking-[0.35em] text-ink-dim">
          otoiresensei
        </p>
        <span className="rule-line w-8 flex-1 origin-left md:max-w-16" aria-hidden="true" />
      </div>

      <p className="mt-3 text-sm font-medium text-accent lg:text-base">{site.tagline}</p>
    </div>
  )
}
