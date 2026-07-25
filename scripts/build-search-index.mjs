// search-index.json 生成（MiniSearch の書き出しインデックス / YouTube API 不使用 = 0u）
//
// 設計: インデックスに本文(text)は保存しない。ヒットしたセリフの本文は
//       フロントが transcripts/<videoId>.json を遅延取得して表示する。
//       → search-index.json の肥大化を抑える。
//       セグメント総数が SHARD_THRESHOLD を超えたら年別シャードに自動分割する。
//
// 実行: node scripts/build-search-index.mjs
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises"
import path from "node:path"
import MiniSearch from "minisearch"
import { tokenizeJa } from "./ja-tokenize.mjs"

const ROOT = path.resolve(import.meta.dirname, "..")
const DATA = path.join(ROOT, "public", "data")
const TDIR = path.join(DATA, "transcripts")
const SHARD_THRESHOLD = 120_000 // これを超えたら年別分割

const MS_OPTIONS = {
  fields: ["t"],
  storeFields: ["v", "s"], // v=videoId, s=開始秒（本文は持たない）
  tokenize: tokenizeJa,
  processTerm: (term) => term,
}

const readJson = async (p, fallback = null) => {
  try {
    return JSON.parse(await readFile(p, "utf8"))
  } catch {
    return fallback
  }
}

const excluded = new Set(
  (await readFile(path.join(ROOT, "scripts", "exclude.txt"), "utf8").catch(() => ""))
    .split("\n")
    .map((l) => l.split("#")[0].trim())
    .filter(Boolean)
)

const manifest = (await readJson(path.join(TDIR, "manifest.json"), [])) ?? []
const files = (await readdir(TDIR).catch(() => []))
  .filter((f) => f.endsWith(".json") && !["manifest.json", "skipped.json"].includes(f))

const docsByYear = new Map()
let total = 0
for (const file of files) {
  const videoId = file.replace(/\.json$/, "")
  if (excluded.has(videoId)) continue
  if (manifest.length && !manifest.some((m) => m.videoId === videoId)) continue
  const doc = await readJson(path.join(TDIR, file))
  if (!doc?.segments?.length) continue
  const year = (doc.date || "").slice(0, 4) || "unknown"
  const arr = docsByYear.get(year) ?? []
  for (const seg of doc.segments) {
    const text = seg.yomi ? `${seg.text} ${seg.yomi}` : seg.text
    arr.push({ id: `${videoId}#${seg.id}`, v: videoId, s: seg.start, t: text })
  }
  docsByYear.set(year, arr)
  total += doc.segments.length
}

await mkdir(DATA, { recursive: true })
const generatedAt = new Date().toISOString()

const buildIndex = (docs) => {
  const mini = new MiniSearch(MS_OPTIONS)
  mini.addAll(docs)
  return mini
}

if (total === 0) {
  await writeFile(
    path.join(DATA, "search-index.json"),
    JSON.stringify({ version: 1, generatedAt, segmentCount: 0, sharded: false, index: null }) + "\n"
  )
  console.log("search-index: 0 segments (nothing to index)")
  process.exit(0)
}

if (total <= SHARD_THRESHOLD) {
  const all = [...docsByYear.values()].flat()
  const mini = buildIndex(all)
  await writeFile(
    path.join(DATA, "search-index.json"),
    JSON.stringify({ version: 1, generatedAt, segmentCount: total, sharded: false, index: mini.toJSON() }) + "\n"
  )
  console.log(`search-index: ${total} segments (single file)`)
} else {
  const shards = []
  for (const [year, docs] of [...docsByYear.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    const mini = buildIndex(docs)
    const name = `search-index-${year}.json`
    await writeFile(
      path.join(DATA, name),
      JSON.stringify({ version: 1, generatedAt, year, segmentCount: docs.length, index: mini.toJSON() }) + "\n"
    )
    shards.push({ year, file: name, segmentCount: docs.length })
  }
  await writeFile(
    path.join(DATA, "search-index.json"),
    JSON.stringify({ version: 1, generatedAt, segmentCount: total, sharded: true, shards }) + "\n"
  )
  console.log(`search-index: ${total} segments (sharded into ${shards.length} year files)`)
}
