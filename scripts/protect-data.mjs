// public/data/**/*.json は GitHub Actions（bot）が定期的に取得・生成してコミットする
// 「生きたデータ」であり、本番サイトも raw.githubusercontent.com 経由で直接それを読む
// （site.config.ts の dataBaseUrl 参照）。
//
// ローカルの古い public/data/**/*.json（手元で fetch/build スクリプトを試した残りや、
// bot の最新コミットをまだ pull していないだけの古い版）を、無関係な変更と一緒に
// GitHub Desktop で誤って commit してしまうと、bot が更新した最新データを古い内容で
// 上書きしてしまう。
//
// git の pre-commit フック（scripts/hooks/pre-commit）を .git/hooks にインストールし、
// commit 直前に public/data 配下を自動でステージから外すことでこれを防ぐ。
// ※ 以前は skip-worktree で保護していたが、それだと bot の新しいコミットを pull するたびに
//   「ローカルの変更が上書きされます」と pull 自体がブロックされてしまう副作用があったため、
//   commit 時にだけ効く pre-commit フック方式に切り替えた。
//
// ★重要: このスクリプトを package.json の postinstall に繋いではいけない。
//   GitHub Actions のワークフローも `npm ci` を実行するため、postinstall で自動実行すると
//   bot 自身の public/data 更新コミットまでこのフックが誤って止めてしまう
//   （実際に data-transcripts.yml でこれが原因の障害が発生した）。
//   フック自体にも CI 環境では即 no-op になる保険を入れてあるが（scripts/hooks/pre-commit）、
//   このインストールスクリプト自体も CI では明示的に何もしない。
// ※ 手動で入れる/入れ直す場合のみ、開発者がローカルで `npm run protect-data` を実行する。
//
// 実行: node scripts/protect-data.mjs
import { execFileSync } from "node:child_process"
import { copyFileSync, chmodSync, mkdirSync } from "node:fs"
import path from "node:path"

if (process.env.CI || process.env.GITHUB_ACTIONS) {
  console.log("CI環境のため何もしません（public/data 保護フックはローカル専用です）。")
  process.exit(0)
}

const ROOT = path.resolve(import.meta.dirname, "..")
const src = path.join(ROOT, "scripts", "hooks", "pre-commit")

let gitDir
try {
  gitDir = execFileSync("git", ["rev-parse", "--git-dir"], { cwd: ROOT, encoding: "utf8" }).trim()
} catch {
  console.log("git リポジトリが見つかりませんでした。スキップします。")
  process.exit(0)
}
const hooksDir = path.isAbsolute(gitDir) ? path.join(gitDir, "hooks") : path.join(ROOT, gitDir, "hooks")
mkdirSync(hooksDir, { recursive: true })
const dest = path.join(hooksDir, "pre-commit")
copyFileSync(src, dest)
try {
  chmodSync(dest, 0o755)
} catch {
  // Windows等、実行ビットが意味を持たない環境では無視してよい
}

console.log(`pre-commit フックを設置しました: ${dest}`)
console.log("これで public/data 配下の変更は commit 時に自動でステージから外れます。")
