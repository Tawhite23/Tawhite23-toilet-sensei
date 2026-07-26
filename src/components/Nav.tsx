"use client"
import { Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import ThemeToggle from "./ThemeToggle"

const links = [
  { href: "/", label: "ホーム" },
  { href: "/calendar/", label: "カレンダー" },
  { href: "/report/", label: "レポート" },
  { href: "/profile/", label: "プロフィール" },
]
// モード切替(ThemeToggle)を差し込む位置(前から何番目の後ろか)。メニューの真ん中に置く。
const TOGGLE_AFTER_INDEX = 2

export default function Nav() {
  // usePathname は稀に null を返しうる（静的エクスポートの初期化タイミング）。
  // ここで null のまま startsWith を呼ぶと画面全体が落ちるため空文字に寄せる。
  const path = usePathname() ?? ""
  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-base-700 bg-base-800/90 backdrop-blur md:inset-x-auto md:bottom-auto md:left-1/2 md:top-4 md:-translate-x-1/2 md:rounded-full md:border md:px-2"
    >
      {/* 項目は必ず1行(nowrap)。収まらない狭幅は横スクロールで対応 */}
      <ul className="mx-auto flex max-w-full items-center justify-around gap-0 overflow-x-auto px-1 md:gap-1">
        {links.map((l, i) => {
          const active = path === l.href || (l.href !== "/" && path.startsWith(l.href.replace(/\/$/, "")))
          return (
            <Fragment key={l.href}>
              <li className="shrink-0">
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`block whitespace-nowrap px-2.5 py-3 text-[13px] font-medium transition-colors sm:px-4 sm:text-sm md:rounded-full md:py-2 ${
                    active ? "text-accent" : "text-ink-dim hover:text-ink"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
              {/* メインメニューの真ん中にモード切替を差し込む(右端だと左右スワイプ操作がしにくいため) */}
              {i + 1 === TOGGLE_AFTER_INDEX && (
                <li className="shrink-0">
                  <ThemeToggle />
                </li>
              )}
            </Fragment>
          )
        })}
      </ul>
    </nav>
  )
}
