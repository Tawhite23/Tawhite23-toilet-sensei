// D1(Cloudflare のエッジSQLite)へ投入するSQLを生成する。
//
// ■ 背景
//   従来はブラウザが search-index.json を丸ごと落としてクライアント側で検索していた。
//   配信本数が増えるとこのファイルが肥大し(13.6MB → 全件で97MB見込み)、
//   検索ページを開くだけで重くなる。D1に載せてクエリ毎に数KBだけ返す方式へ移行する。
//
// ■ 差分投入について
//   D1の無料枠は書き込み10万行/日。全28万行を毎回入れ直すと上限に当たるため、
//   「まだ投入していない配信」だけをSQLにする。投入済みの判定は
//   worker/schema.sql の ingested テーブルを --ingested で渡して行う。
//
// ■ 分割について
//   1ファイルが大きすぎると wrangler の実行が不安定になるので、
//   --max-rows で1ファイルあたりの行数を区切って連番出力する。
//
// 使い方:
//   node scripts/build-d1-sql.mjs                       # 全件を out/d1/*.sql に生成
//   node scripts/build-d1-sql.mjs --ingested done.json  # 投入済みを除外して差分だけ
//   node scripts/build-d1-sql.mjs --max-rows 90000      # 1ファイルの行数上限
import { readFile, writeFile, readdir, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { tokenizeJa } from "./ja-tokenize.mjs"

const ROOT = path.resolve(import.meta.dirname, "..")
const DATA = path.join(ROOT, "public", "data")
const TDIR = path.join(DATA, "transcripts")
const OUT = path.join(ROOT, "out", "d1")

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

// D1無料枠(10万行/日)を超えないよう、既定は少し余裕を持たせる
const MAX_ROWS = Number(arg("--max-rows", "90000"))
const INGESTED_FILE = arg("--ingested", null)

const readJson = async (p, fallback = null) => {
  try {
    return JSON.parse(await readFile(p, "utf8"))
  } catch {
    return fallback
  }
}

/** SQL文字列リテラルへエスケープ（シングルクォートを2重にする） */
const q = (v) => {
  if (v == null) return "NULL"
  return "'" + String(v).replace(/'/g, "''") + "'"
}
const n = (v) => (v == null || Number.isNaN(Number(v)) ? "NULL" : String(Number(v)))

const excluded = new Set(
  (await readFile(path.join(ROOT, "scripts", "exclude.txt"), "utf8").catch(() => ""))
    .split("\n")
    .map((l) => l.split("#")[0].trim())
    .filter(Boolean)
)

// すでにD1へ入れた配信は飛ばす
let ingested = new Set()
if (INGESTED_FILE) {
  const rows = await readJson(path.resolve(INGESTED_FILE), [])
  const list = Array.isArray(rows) ? rows : rows?.results ?? []
  ingested = new Set(list.map((r) => r.vid).filter(Boolean))
  console.log(`ingested: ${ingested.size} videos already in D1`)
}

const manifest = (await readJson(path.join(TDIR, "manifest.json"), [])) ?? []
const manifestIds = new Set(manifest.map((m) => m.videoId))
const files = (await readdir(TDIR).catch(() => [])).filter(
  (f) =>
    f.endsWith(".json") &&
    !["manifest.json", "skipped.json", "failures.json", "needs-whisper.json"].includes(f)
)

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

let fileIndex = 0
let rowsInFile = 0
let buf = []
const written = []

async function flush() {
  if (!buf.length) return
  fileIndex += 1
  const name = `segments-${String(fileIndex).padStart(3, "0")}.sql`
  await writeFile(path.join(OUT, name), buf.join("\n") + "\n", "utf8")
  written.push({ name, rows: rowsInFile })
  console.log(`  wrote ${name} (${rowsInFile.toLocaleString()} rows)`)
  buf = []
  rowsInFile = 0
}

let totalRows = 0
let videoCount = 0
let skipped = 0

for (const file of files) {
  const videoId = file.replace(/\.json$/, "")
  if (excluded.has(videoId)) continue
  if (manifestIds.size && !manifestIds.has(videoId)) continue
  if (ingested.has(videoId)) {
    skipped += 1
    continue
  }
  const doc = await readJson(path.join(TDIR, file))
  if (!doc?.segments?.length) continue

  const ymd = (doc.date || "").slice(0, 10)
  videoCount += 1

  for (const seg of doc.segments) {
    // 検索対象は「本文＋読み」をbigram分解したもの。
    // 読みも入れるのは、漢字表記が違っても音で拾えるようにするため。
    const source = seg.yomi ? `${seg.text} ${seg.yomi}` : seg.text
    const bg = tokenizeJa(source).join(" ")
    buf.push(
      `INSERT INTO segments(bg,vid,sid,st,txt,ymd) VALUES(${q(bg)},${q(videoId)},${n(seg.id)},${n(seg.start)},${q(seg.text)},${q(ymd)});`
    )
    rowsInFile += 1
    totalRows += 1
  }

  // この配信を投入済みとして記録（次回の差分判定に使う）
  buf.push(
    `INSERT OR REPLACE INTO ingested(vid,segment_count,at) VALUES(${q(videoId)},${n(doc.segments.length)},${q(new Date().toISOString())});`
  )
  rowsInFile += 1
  totalRows += 1

  // 【重要】分割は必ず配信の切れ目で行う（1本を2ファイルに割らない）。
  //
  // wrangler の --file は1ファイルを不可分に適用する（途中で失敗したら
  // 元の状態に戻る）。したがって1ファイル=完結した配信の集合にしておけば、
  // 「セグメントだけ入って ingested の記録が入らない」中途半端な状態が
  // 原理的に発生せず、再実行しても重複しない。
  //
  // 以前は行数で機械的に割り、代わりに各配信の先頭で
  // DELETE FROM segments WHERE vid=... を出して重複を防いでいたが、
  // FTS5 の UNINDEXED 列には索引が張れずテーブル全走査になるため、
  // 98本の投入で読み取り543万行に達した（無料枠は500万行/日）。
  // 分割位置を工夫するだけで DELETE は不要になる。
  if (rowsInFile >= MAX_ROWS) await flush()
}
await flush()

// ---- 名言集 -------------------------------------------------------------
// quotes.json は毎回まるごと作り直される性質なので、差分ではなく総入れ替えにする。
//
// ただし「新しく投入する配信が1本も無い」ときは名言も変わらないため、
// 総入れ替えを行わない。毎日走るワークフローから呼ばれるので、
// ここで無条件に出すと変化が無い日でも3千行以上を書き込み続けることになり、
// D1無料枠(10万行/日)を無駄に消費してしまう。
const quotes = videoCount > 0 ? await readJson(path.join(DATA, "quotes.json"), null) : null
if (!videoCount) {
  console.log("新規配信が無いため名言集の再投入はスキップします")
}
if (quotes?.items?.length) {
  const lines = ["DELETE FROM quotes;"]
  for (const it of quotes.items) {
    const id = `${it.videoId}#${it.segmentId}`
    lines.push(
      `INSERT OR REPLACE INTO quotes(id,vid,sid,st,txt,ymd,row,score,picked) VALUES(${q(id)},${q(it.videoId)},${n(it.segmentId)},${n(it.start)},${q(it.text)},${q(it.date)},${q(it.row)},${n(it.score)},${it.picked ? 1 : 0});`
    )
  }
  await writeFile(path.join(OUT, "quotes.sql"), lines.join("\n") + "\n", "utf8")
  written.push({ name: "quotes.sql", rows: quotes.items.length })
  console.log(`  wrote quotes.sql (${quotes.items.length.toLocaleString()} rows)`)
}

console.log("")
console.log(`対象配信: ${videoCount}本（投入済みスキップ: ${skipped}本）`)
console.log(`生成行数: ${totalRows.toLocaleString()} 行 / ${written.length} ファイル`)
if (totalRows > 100000) {
  const days = Math.ceil(totalRows / 100000)
  console.log(
    `⚠ D1無料枠は書き込み10万行/日。${days}日に分けて投入してください（1日1〜2ファイルずつ）。`
  )
}
