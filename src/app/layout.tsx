import type { Metadata, Viewport } from "next"
import "./globals.css"
import Nav from "@/components/Nav"
import { site } from "@/lib/site.config"

export const metadata: Metadata = {
  title: { default: site.name, template: `%s | ${site.name}` },
  description: site.intro,
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
