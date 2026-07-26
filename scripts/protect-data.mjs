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
// ※ .git/hooks はクローンごとのローカル設定（git管理外）なので、`npm install` 実行時に
//   自動でも入る（package.json の postinstall）。手動で入れ直したい場合はこのスクリプトを実行する。
//
// 実行: node scripts/protect-data.mjs
import { execFileSync } from "node:child_process"
import { copyFileSync, chmodSync, mkdirSync } from "node:fs"
import path from "node:path"

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
