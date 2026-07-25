import type { MetadataRoute } from "next"
import { site } from "@/lib/site.config"

/**
 * sitemap.xml の生成。
 *
 * public/sitemap.xml を手書きする代わりにこちらを選んだ理由:
 * - Next.js の metadata route 規約 (sitemap.ts) は output: 'export' の
 *   静的書き出しに対応しており、`next build` 時に out/sitemap.xml として
 *   1回だけ生成される（サーバー実行は発生しない = 追加コスト0）。
 * - サイトURLの一覧を TypeScript の配列として書けるため、
 *   XMLの閉じタグ忘れ・エスケープミスが起きない。
 * - src/lib/site.config.ts の siteUrl を直接参照できるので、
 *   本番URLの二重管理（public/sitemap.xml側にも同じURLを書く）を避けられる。
 *
 * 各ページのURLは next.config.mjs の trailingSlash: true に合わせて
 * 末尾スラッシュ付きで統一している（実際に配信されるURLと一致させるため）。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = site.siteUrl
  const now = new Date()

  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/calendar/`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/report/`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/profile/`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
  ]
}
