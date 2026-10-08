"use client"
import { useMemo, useState } from "react"
import { CATEGORY_CLASS, favTitle, titlesOf } from "@/lib/listeners"
import type { Listener, ListenersFile } from "@/lib/types"

/**
 * よく来る配信の種類と称号のチップ。押すと、その称号の意味とこの人の数字がすぐ下に開く。
 * 名鑑のカードの左下と、1人の記録の両方で使う。
 */
export default function TitleChips({ listener: l, data }: { listener: Listener; data: ListenersFile }) {
  const items = useMemo(() => [favTitle(l, data), ...titlesOf(l, data)], [l, data])
  const [openId, setOpenId] = useState<string | null>(null)
  const open = items.find((t) => t.id === openId)

  return (
    <div className="min-w-0">
      <ul className="flex flex-wrap gap-1.5">
        {items.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => setOpenId(openId === t.id ? null : t.id)}
              aria-expanded={openId === t.id}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:bg-base-700 ${
                t.id === "fav" ? CATEGORY_CLASS[l.fav] : "border-accent text-accent"
              } ${openId === t.id ? "bg-base-700" : ""}`}
            >
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div role="status" className="mt-2 flex items-start gap-3 rounded-xl bg-base-900 p-3">
          <span aria-hidden="true" className="text-3xl leading-none">
            {open.icon}
          </span>
          <p className="min-w-0 text-xs leading-relaxed text-ink-dim">
            <b className="block text-sm text-ink">{open.label}</b>
            {open.rule}
            <br />
            <span className="text-ink">{open.detail}</span>
          </p>
        </div>
      )}
    </div>
  )
}
