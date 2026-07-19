"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import ThemeToggle from "./ThemeToggle"

const links = [
  { href: "/", label: "ホーム" },
  { href: "/calendar/", label: "カレンダー" },
  { href: "/report/", label: "レポート" },
  { href: "/profile/", label: "プロフィール" },
]

export default function Nav() {
  const path = usePathname()
  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-base-700 bg-base-800/90 backdrop-blur md:inset-x-auto md:bottom-auto md:left-1/2 md:top-4 md:-translate-x-1/2 md:rounded-full md:border md:px-2"
    >
      {/* 項目は必ず1行(nowrap)。収まらない狭幅は横スクロールで対応 */}
      <ul className="mx-auto flex max-w-full items-center justify-around gap-0 overflow-x-auto px-1 md:gap-1">
        {links.map((l) => {
          const active = path === l.href || (l.href !== "/" && path.startsWith(l.href.replace(/\/$/, "")))
          return (
            <li key={l.href} className="shrink-0">
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
          )
        })}
        <li className="shrink-0">
          <ThemeToggle />
        </li>
      </ul>
    </nav>
  )
}
