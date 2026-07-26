// protect-data.mjs で立てた skip-worktree を解除する。
// public/data 配下を手元で意図的に更新して commit したい場合の前準備に使う。
//
// 実行: node scripts/unprotect-data.mjs
import { execFileSync } from "node:child_process"

const files = execFileSync("git", ["ls-files", "public/data"], { encoding: "utf8" })
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)

if (files.length === 0) {
  console.log("対象ファイルなし（public/data 配下がまだ git 管理されていません）")
  process.exit(0)
}

execFileSync("git", ["update-index", "--no-skip-worktree", ...files], { stdio: "inherit" })
console.log(`skip-worktree を解除しました（${files.length} ファイル）。`)
console.log("作業が終わったら `npm run protect-data` を実行して再び保護してください。")
