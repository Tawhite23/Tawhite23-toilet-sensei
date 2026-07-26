// public/data/**/*.json は GitHub Actions（bot）が定期的に取得・生成してコミットする
// 「生きたデータ」であり、本番サイトも raw.githubusercontent.com 経由で直接それを読む
// （site.config.ts の dataBaseUrl 参照）。
//
// そのため、ローカルの古い public/data/**/*.json（手元で fetch/build スクリプトを試した
// 残りや、bot の最新コミットをまだ pull していないだけの古い版）を、無関係な変更と一緒に
// GitHub Desktop で誤って commit & push すると、bot が更新した最新データを古い内容で
// 上書きしてしまう。
//
// git の skip-worktree を立てておくと、この範囲のファイルは実際にローカルで内容が
// 変わっていても `git status` / GitHub Desktop の変更一覧に出てこなくなり、誤コミットを防げる。
// （クローン毎にローカルで有効化する必要がある。詳細は README「ローカル開発」を参照）
//
// 実行: node scripts/protect-data.mjs
import { execFileSync } from "node:child_process"

const files = execFileSync("git", ["ls-files", "public/data"], { encoding: "utf8" })
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)

if (files.length === 0) {
  console.log("対象ファイルなし（public/data 配下がまだ git 管理されていません）")
  process.exit(0)
}

execFileSync("git", ["update-index", "--skip-worktree", ...files], { stdio: "inherit" })
console.log(`skip-worktree を設定しました（${files.length} ファイル）。`)
console.log("これで public/data 配下の変更は git status / GitHub Desktop に表示されなくなります。")
console.log("手元で意図的に更新して commit したい場合は先に `npm run unprotect-data` を実行してください。")
