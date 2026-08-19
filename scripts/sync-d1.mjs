// 文字起こし → D1(検索データベース) への同期を1コマンドで行う。
//
// これまでは「投入済みを問い合わせる → SQLを生成する → ファイルを順に流す」を
// 手作業でつないでいたが、シェルのループ構文がWindowsのcmd.exeでは動かず、
// さらにD1無料枠(書き込み10万行/日)を人間が数えて分割する必要があった。
// それらをまとめてここで面倒を見る。
//
// 使い方:
//   npm run sync-d1              # 上限まで自動で投入し、残りは翌日へ回す
//   npm run sync-d1 -- --dry-run # 何行入るかだけ確認する（投入しない）
//   npm run sync-d1 -- --budget 50000  # 今回の書き込み上限を変える
//
// CI(GitHub Actions)からも同じスクリプトを呼べる。
// 認証は wrangler login 済みの環境、または CLOUDFLARE_API_TOKEN で行う。
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs"
import path from "node:path"
import os from "node:os"

const ROOT = path.resolve(import.meta.dirname, "..")
const WORKER = path.join(ROOT, "worker")
const OUT = path.join(ROOT, "out", "d1")
const DB = "otoile-search"

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f, d) => {
  const i = argv.indexOf(f)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}

const DRY = has("--dry-run")
// D1無料枠は 100,000 行/日。取りこぼしを避けて少し余裕を持たせる。
const BUDGET = Number(val("--budget", "95000"))

/**
 * shell:true のときは引数がそのまま1行に連結されるため、
 * スペースを含むもの（SQL文やWindowsのパス）は自分で引用符を付ける必要がある。
 * これを怠ると "SELECT vid FROM ingested" が3つの引数として解釈され、
 * wrangler が Unknown arguments で落ちる。
 */
const qArg = (a) => (/[\s]/.test(String(a)) ? `"${a}"` : String(a))

/** wrangler を worker ディレクトリで実行する（wrangler.toml がそこにあるため） */
function wrangler(args, { capture = false } = {}) {
  const r = spawnSync("npx", ["wrangler", ...args].map(qArg), {
    cwd: WORKER,
    encoding: "utf8",
    shell: true, // Windowsで npx(.cmd) を解決させるために必要
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  })
  if (capture) return r
  if (r.status !== 0) process.exit(r.status ?? 1)
  return r
}

// ---- 1) D1 に投入済みの配信を取得 ------------------------------------------
console.log("D1の投入済み一覧を取得しています…")
const q = wrangler(
  ["d1", "execute", DB, "--remote", "--json", "--command", "SELECT vid FROM ingested"],
  { capture: true }
)
let ingested = []
try {
  if (q.error) throw q.error
  // wrangler の出力には JSON 以外の行(警告など)が混ざることがあるため、
  // 最初の '[' から最後の ']' までを切り出してから解析する。
  const out = q.stdout ?? ""
  const s = out.indexOf("[")
  const e = out.lastIndexOf("]")
  if (s < 0 || e < 0) throw new Error("出力にJSONが含まれていません")
  const parsed = JSON.parse(out.slice(s, e + 1))
  ingested = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((x) => x.results ?? [])
} catch (err) {
  // ここで中断するのは意図的。取得できないまま進むと「投入済み0本」とみなして
  // 全件を再投入し、D1に重複行を作ってしまう。
  //
  // 原因を必ず追えるよう、出力を丸ごと出す。
  // 以前は stderr を800文字だけ出していたが、それが空のときに
  // 何も分からず手詰まりになった（実際にCIで起きた）。
  console.error("投入済み一覧の取得に失敗しました。中断します。")
  console.error(`  理由     : ${err?.message ?? err}`)
  console.error(`  終了コード: ${q.status}`)
  console.error(`  認証     : CLOUDFLARE_API_TOKEN=${process.env.CLOUDFLARE_API_TOKEN ? "あり" : "なし"} / CLOUDFLARE_ACCOUNT_ID=${process.env.CLOUDFLARE_ACCOUNT_ID || "(未設定)"}`)
  console.error("--- wrangler stdout ---")
  console.error(q.stdout || "(空)")
  console.error("--- wrangler stderr ---")
  console.error(q.stderr || "(空)")
  process.exit(1)
}
console.log(`  投入済み: ${ingested.length} 本`)

const tmp = path.join(os.tmpdir(), "otoile-ingested.json")
writeFileSync(tmp, JSON.stringify(ingested), "utf8")

// ---- 2) 差分のSQLを生成 -----------------------------------------------------
console.log("差分のSQLを生成しています…")
const gen = spawnSync(
  process.execPath,
  [path.join(ROOT, "scripts", "build-d1-sql.mjs"), "--ingested", tmp],
  { cwd: ROOT, encoding: "utf8", stdio: "inherit" }
)
if (gen.status !== 0) process.exit(gen.status ?? 1)

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
const files = readdirSync(OUT).filter((f) => f.endsWith(".sql")).sort()
if (!files.length) {
  console.log("\n投入するものはありません（すべて同期済み）。")
  process.exit(0)
}

/** SQLファイルの行数 = INSERT文の数 */
const rowsOf = (f) =>
  readFileSync(path.join(OUT, f), "utf8").split("\n").filter((l) => l.trim()).length

// ---- 3) 予算内で順に投入 ----------------------------------------------------
let used = 0
const todo = []
const deferred = []
for (const f of files) {
  const n = rowsOf(f)
  if (used + n <= BUDGET) {
    todo.push({ f, n })
    used += n
  } else {
    deferred.push({ f, n })
  }
}

console.log("")
console.log(`今回投入: ${todo.length}ファイル / ${used.toLocaleString()} 行`)
if (deferred.length) {
  const rest = deferred.reduce((a, b) => a + b.n, 0)
  console.log(`翌日以降: ${deferred.length}ファイル / ${rest.toLocaleString()} 行`)
  console.log("  （D1無料枠が書き込み10万行/日のため分割しています）")
}

if (DRY) {
  console.log("\n--dry-run のため投入は行いませんでした。")
  process.exit(0)
}

for (const { f, n } of todo) {
  console.log(`\n--- ${f} (${n.toLocaleString()} 行) ---`)
  wrangler(["d1", "execute", DB, "--remote", "-y", "--file", path.join(OUT, f)])
}

console.log("\n完了しました。")
if (deferred.length) {
  console.log("残りがあります。日付が変わってから、もう一度 npm run sync-d1 を実行してください。")
}
