import type { Config } from "tailwindcss"

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ダーク基調 + WCAG AA を満たす前景色
        base: { 900: "#0b0e14", 800: "#131722", 700: "#1c2230" },
        ink: { DEFAULT: "#e8ecf4", dim: "#a8b3c7" }, // base-900上でコントラスト比 13.9 / 7.2
        accent: { DEFAULT: "#38bdf8", warm: "#f472b6" },
        live: "#ff4d4d",
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
