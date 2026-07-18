import type { Metadata, Viewport } from "next"
import "./globals.css"
import Nav from "@/components/Nav"
import { site } from "@/lib/site.config"

export const metadata: Metadata = {
  title: { default: site.name, template: `%s | ${site.name}` },
  description: site.intro,
}
export const viewport: Viewport = { themeColor: "#0b0e14" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
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
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-base-900"
        >
          本文へスキップ
        </a>
        <Nav />
        <main id="main">{children}</main>
      </body>
    </html>
  )
}
