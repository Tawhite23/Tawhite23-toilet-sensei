/** @type {import('next').NextConfig} */
const nextConfig = {
  // Firebase Hosting (Spark) は静的配信のみ → 完全静的エクスポート
  output: "export",
  images: { unoptimized: true }, // YouTubeサムネは直リンクのため最適化サーバ不要
  trailingSlash: true,
}

export default nextConfig
