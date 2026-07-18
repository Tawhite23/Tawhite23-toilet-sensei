import { site } from "@/lib/site.config"

/**
 * 公式ブランドアイコン(無改変)。
 * YouTube / X は各社ブランドガイドラインの公式ロゴパスをそのまま使用。
 * マシュマロは公式サイト提供のアイコン画像を直接参照(改変なし)。
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

const MarshmallowIcon = () => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src="https://marshmallow-qa.com/apple-touch-icon.png"
    alt=""
    width={24}
    height={24}
    className="rounded"
    aria-hidden="true"
  />
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
