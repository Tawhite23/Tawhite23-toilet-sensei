"use client"
import { useEffect, useState } from "react"
import type { Listener } from "@/lib/types"

/**
 * リスナーのYouTubeアイコン。YouTubeの画像を直接読み込む（サムネと同じ扱い）。
 * 集計した後に本人がアイコンを変える・消すと読めなくなることがあるので、
 * そのときは名前の頭文字の丸にする（壊れた画像の印を出さない）。
 */
export default function Avatar({ listener: l, size }: { listener: Listener; size: number }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [l.icon])

  const box = { width: size, height: size }
  if (!l.icon || broken)
    return (
      <span
        aria-hidden="true"
        style={{ ...box, fontSize: size * 0.45 }}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-base-700 font-bold text-ink-dim"
      >
        {l.name.replace(/^@/, "").slice(0, 1)}
      </span>
    )
  return (
    <img
      // 高精細な画面でもぼやけないよう、表示の2倍の大きさで取る
      src={`${l.icon}=s${size * 2}-c-k-c0x00ffffff-no-rj`}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      style={box}
      className="shrink-0 rounded-full bg-base-700 object-cover"
    />
  )
}
