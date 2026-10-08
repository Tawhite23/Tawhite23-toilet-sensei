// リスナー名鑑の「キー → チャンネルID」の対応表を D1 に入れる。
//
// Worker の /api/listeners/profiles は、この表を使って名鑑に載っている人の
// 最新の名前とアイコンを YouTube から取る（worker/src/listeners.ts）。
// チャンネルIDは公開リポジトリに置かないため、手元PCから直接 D1 に入れる。
//
// 使い方:
//   npm run build:listeners   # 集計。out/listeners/listener-ids.sql もここで作られる
//   npm run sync-listeners    # D1 に反映（名鑑に載る人が増えた・減ったときだけでよい）
//
// 認証は wrangler login 済みの環境、または CLOUDFLARE_API_TOKEN で行う。
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "..")
const WORKER = path.join(ROOT, "worker")
const DB = "otoile-search"
const SQL = path.join(ROOT, "out", "listeners", "listener-ids.sql")
// wrangler の実体(JS)を直接叩く理由は scripts/sync-d1.mjs を参照（Windowsの npx.cmd を避ける）
const WRANGLER_BIN = path.join(WORKER, "node_modules", "wrangler", "bin", "wrangler.js")

if (!existsSync(WRANGLER_BIN)) {
  console.error("wrangler が見つかりません。先に worker の依存を入れてください:")
  console.error("  cd worker && npm ci")
  process.exit(1)
}
if (!existsSync(SQL)) {
  console.error("対応表がありません。先に npm run build:listeners を実行してください。")
  console.error("（npm run build は out/ を作り直すので、そのあとにも集計し直しが必要です）")
  process.exit(1)
}

for (const file of [path.join(WORKER, "schema-listeners.sql"), SQL]) {
  console.log(`\n--- ${path.relative(ROOT, file)} ---`)
  const r = spawnSync(process.execPath, [WRANGLER_BIN, "d1", "execute", DB, "--remote", "-y", "--file", file], {
    cwd: WORKER,
    stdio: "inherit",
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
console.log("\n完了しました。反映は Worker のキャッシュが切れてから（最長6時間）です。")
