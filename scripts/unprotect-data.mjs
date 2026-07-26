// protect-data.mjs でインストールした pre-commit フックを取り除く。
// public/data 配下を手元で意図的に更新してコミットしたい作業を、フックの外し忘れなく
// 一時的に行いたい場合に使う（作業後は `npm run protect-data` で入れ直すこと）。
//
// 実行: node scripts/unprotect-data.mjs
import { execFileSync } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "..")

let gitDir
try {
  gitDir = execFileSync("git", ["rev-parse", "--git-dir"], { cwd: ROOT, encoding: "utf8" }).trim()
} catch {
  console.log("git リポジトリが見つかりませんでした。スキップします。")
  process.exit(0)
}
const hookPath = path.join(path.isAbsolute(gitDir) ? gitDir : path.join(ROOT, gitDir), "hooks", "pre-commit")

if (existsSync(hookPath)) {
  rmSync(hookPath)
  console.log(`pre-commit フックを削除しました: ${hookPath}`)
} else {
  console.log("pre-commit フックは設置されていません。")
}
console.log("作業が終わったら `npm run protect-data` を実行して再びフックを入れてください。")
