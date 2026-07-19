import { site } from "@/lib/site.config"

/**
 * 公式ブランドアイコン。
 * YouTube / X は各社ブランドガイドラインの公式ロゴパスをそのまま使用。
 * 【2-1】マシュマロは提供ロゴ(白いマシュマロキャラクター)をSVGで再現。
 * 外部画像参照をやめたことでリンク切れ(画像壊れ)が起きない。
 */
const YouTubeIcon = () => (
  <svg viewBox="0 0 28.57 20" width="28" height="20" aria-hidden="true">
    <path
      fill="#FF0000"
      d="M27.973 3.123A3.578 3.578 0 0 0 25.447.597C23.22 0 14.285 0 14.285 0S5.35 0 3.123.597A3.578 3.578 0 0 0 .597 3.123C0 5.35 0 10 0 10s0 4.65.597 6.877a3.578 3.578 0 0 0 2.526 2.526C5.35 20 14.285 20 14.285 20s8.935 0 11.162-.597a3.578 3.578 0 0 0 2.526-2.526C28.57 14.65 28.57 10 28.57 10s0-4.65-.597-6.877z"
    />
    <path fill="#FFF" d="M11.428 14.285 18.85 10l-7.423-4.285z" />
  </svg>
)

const XIcon = () => (
  <svg viewBox="0 0 1200 1227" width="22" height="22" aria-hidden="true">
    <path
      fill="currentColor"
      d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z"
    />
  </svg>
)

/** マシュマロ公式キャラクター(提供ロゴ準拠のベクター再現) */
const MarshmallowIcon = () => (
  <svg viewBox="0 0 100 100" width="26" height="26" aria-hidden="true">
    <g transform="rotate(14 44 44)">
      {/* 本体(白いマシュマロ・角丸スクエア・太い輪郭) */}
      <rect x="10" y="10" width="62" height="62" rx="20" fill="#fff" stroke="#4a4a4a" strokeWidth="7" />
      {/* 上面のハイライト線 */}
      <path d="M22 26 Q38 12 52 17" fill="none" stroke="#4a4a4a" strokeWidth="6" strokeLinecap="round" />
      {/* 目 */}
      <circle cx="34" cy="46" r="4.5" fill="#4a4a4a" />
      <circle cx="54" cy="38" r="4.5" fill="#4a4a4a" />
      {/* 頬 */}
      <circle cx="27" cy="57" r="4.5" fill="#f7b29a" />
      <circle cx="62" cy="45" r="4.5" fill="#f7b29a" />
      {/* 口(開けた笑顔+舌) */}
      <path d="M42 54 Q50 60 56 51 Q51 66 44 60 Z" fill="#4a4a4a" />
      <path d="M46 58 Q50 61 53 56 Q50 62 47 60 Z" fill="#d9534f" />
    </g>
    {/* スピードライン */}
    <g stroke="#4a4a4a" strokeWidth="6" strokeLinecap="round">
      <line x1="76" y1="52" x2="88" y2="64" />
      <line x1="64" y1="66" x2="76" y2="78" />
      <line x1="50" y1="78" x2="62" y2="90" />
    </g>
  </svg>
)

const items = [
  { label: "YouTube", href: site.sns.youtube, Icon: YouTubeIcon },
  { label: "X（旧Twitter）", href: site.sns.x, Icon: XIcon },
  { label: "マシュマロ", href: site.sns.marshmallow, Icon: MarshmallowIcon },
]

export default function SocialLinks() {
  return (
    <ul className="flex items-center justify-center gap-3" aria-label="公式SNS">
      {items.map(({ label, href, Icon }) => (
        <li key={label}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-base-700 bg-base-800 text-ink transition-transform hover:scale-110 hover:border-accent"
          >
            <Icon />
          </a>
        </li>
      ))}
    </ul>
  )
}
