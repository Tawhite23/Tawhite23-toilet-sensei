import type { Config } from "tailwindcss"

// カラーは globals.css の CSS変数(ライト/ダーク2モード)に追従する。
// クラス名は従来のまま(base-900=背景, base-800=面, base-700=境界線)。
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          900: "var(--c-bg)",
          800: "var(--c-surface)",
          700: "var(--c-border)",
        },
        ink: { DEFAULT: "var(--c-ink)", dim: "var(--c-ink-dim)" },
        accent: { DEFAULT: "var(--c-accent)", warm: "var(--c-warm)" },
        live: "var(--c-live)",
        plan: "var(--c-plan)", // 配信予定バッジ
        paper: "var(--c-paper)", // トイレットペーパー(演出用)
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', "system-ui", "sans-serif"],
      },
      animation: {
        "spin-slow": "spin 3s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config
