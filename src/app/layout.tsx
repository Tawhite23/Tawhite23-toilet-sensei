import type { Metadata, Viewport } from "next"
import "./globals.css"
import Nav from "@/components/Nav"
import { site } from "@/lib/site.config"

export const metadata: Metadata = {
  metadataBase: new URL(site.siteUrl),
  title: { default: site.name, template: `%s | ${site.name}` },
  description: site.intro,
  applicationName: site.name,
  alternates: { canonical: "/" },
  // 非公式のファンサイトであることを明示（OGP/Twitterカードの説明文にも反映）
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: site.siteUrl,
    siteName: site.name,
    title: site.name,
    description: `${site.intro}（非公式ファンサイト）`,
    images: [{ url: site.channelIcon, width: 800, height: 800, alt: site.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: site.name,
    description: `${site.intro}（非公式ファンサイト）`,
    images: [site.channelIcon],
  },
  robots: { index: true, follow: true },
  verification: {
    // Search Console「所有権の確認」→「HTMLタグ」方式を使う場合のみ必要（保険の併用）。
    // 本命は public/googlebf736b08f0e59823.html（HTMLファイル方式）で確認済みならこちらは未設定のままでも良い。
    // 使う場合は下記を Search Console が提示する <meta name="google-site-verification" content="XXXX" /> の
    // content の値（XXXXの部分だけ）に差し替えること。
    google: "__GOOGLE_META_VERIFICATION_TOKEN__", // TODO: HTMLタグ方式を使うならここを実際のトークンに差し替え
  },
}
export const viewport: Viewport = { themeColor: "#0f0e0d" }

// 初回描画前にテーマクラスを適用(フラッシュ防止)。既定はダーク(黒ペーパー)。
const themeInit = `(function(){try{var t=localStorage.getItem("theme");var c=t==="light"?"light":"dark";document.documentElement.classList.add(c)}catch(e){document.documentElement.classList.add("dark")}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
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
