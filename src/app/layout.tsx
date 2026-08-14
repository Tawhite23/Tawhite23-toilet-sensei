import type { Metadata, Viewport } from "next"
import "./globals.css"
import Nav from "@/components/Nav"
import StructuredData from "@/components/StructuredData"
import { site } from "@/lib/site.config"

export const metadata: Metadata = {
  metadataBase: new URL(site.siteUrl),
  // タイトルは「おトイレ先生」を先頭に置く（ブランド検索の一致を強める）
  title: {
    default: `おトイレ先生 非公式ファンサイト | ${site.name}`,
    template: `%s | ${site.name}`,
  },
  // ★ description には必ず配信者名を含める（旧: site.intro は名前を含まず手掛かりが無かった）
  description: site.description,
  applicationName: site.name,
  alternates: { canonical: "/" },
  // 非公式のファンサイトであることを明示（OGP/Twitterカードの説明文にも反映）
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: site.siteUrl,
    siteName: site.name,
    title: `おトイレ先生 非公式ファンサイト | ${site.name}`,
    description: site.description,
    images: [{ url: site.channelIcon, width: 800, height: 800, alt: site.personName }],
  },
  twitter: {
    card: "summary_large_image",
    title: `おトイレ先生 非公式ファンサイト | ${site.name}`,
    description: site.description,
    images: [site.channelIcon],
  },
  robots: {
    index: true,
    follow: true,
    // 検索結果にスニペット/画像を出させる（既定より明示的に許可する）
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
  // ※ 所有権の確認は public/googlebf736b08f0e59823.html（HTMLファイル方式）で完了済み。
  //   以前ここに置いていた verification.google はプレースホルダ文字列のままで、
  //   <meta name="google-site-verification" content="__GOOGLE_META_VERIFICATION_TOKEN__">
  //   という無効なタグを全ページに出力していたため削除した。
}
export const viewport: Viewport = { themeColor: "#0f0e0d" }

// 初回描画前にテーマクラスを適用(フラッシュ防止)。既定はダーク(黒ペーパー)。
const themeInit = `(function(){try{var t=localStorage.getItem("theme");var c=t==="light"?"light":"dark";document.documentElement.classList.add(c)}catch(e){document.documentElement.classList.add("dark")}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <StructuredData />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh font-sans">
        <a
          href="#main"
          className="skip-link"
        >
          本文へスキップ
        </a>
        <Nav />
        <main id="main">{children}</main>
      </body>
    </html>
  )
}
