// popular.json 生成（kuromoji形態素解析 + 2〜4gram / YouTube API 不使用 = 0u）
//
// - 全セリフを kuromoji で分かち書きし、内容語の連続(2〜4gram)を集計
// - 短いセリフ全文(=口癖として繰り返されるもの)も候補に含める
// - scripts/stopwords.txt の除外語(完全一致)を弾く
// - 助詞/助動詞/記号のみのフレーズ、部分文字列で上位に包含されるものは落とす
//
// 実行: node scripts/build-popular.mjs
import { readFile, writeFile, readdir } from "node:fs/promises"
import path from "node:path"
import kuromoji from "kuromoji"

const ROOT = path.resolve(import.meta.dirname, "..")
const DATA = path.join(ROOT, "public", "data")
const TDIR = path.join(DATA, "transcripts")
const DIC = path.join(ROOT, "node_modules", "kuromoji", "dict")

const TOP_N = 60          // 書き出す件数（フロントは上位20件を表示）
const MIN_COUNT = 3       // 最低出現回数
const MIN_VIDEOS = 2      // 最低何本の配信に登場するか（一発ネタを除外）
const MIN_CHARS = 3       // フレーズの最低文字数
const MAX_CHARS = 20      // フレーズの最大文字数
const PHRASE_FULL_MAX = 16 // セリフ全文を候補にする最大文字数

// 内容語として扱う品詞（これらの連続をフレーズ候補にする）
const CONTENT_POS = new Set(["名詞", "動詞", "形容詞", "副詞", "感動詞"])
// フレーズ内で許容する（つなぎに使える）品詞
const GLUE_POS = new Set(["助詞", "助動詞", "接頭詞", "連体詞", "接続詞"])

const readJson = async (p, fallback = null) => {
  try {
    return JSON.parse(await readFile(p, "utf8"))
  } catch {
    return fallback
  }
}

const stopwords = new Set(
  (await readFile(path.join(ROOT, "scripts", "stopwords.txt"), "utf8").catch(() => ""))
    .split("\n")
    .map((l) => l.split("#")[0].trim())
    .filter(Boolean)
)
const excluded = new Set(
  (await readFile(path.join(ROOT, "scripts", "exclude.txt"), "utf8").catch(() => ""))
    .split("\n")
    .map((l) => l.split("#")[0].trim())
    .filter(Boolean)
)

const tokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath: DIC }).build((err, t) => (err ? reject(err) : resolve(t)))
})

const files = (await readdir(TDIR).catch(() => []))
  .filter((f) => f.endsWith(".json") && !["manifest.json", "skipped.json"].includes(f))

/** phrase -> { count, videos:Set, sample:{videoId,start} } */
const stats = new Map()
const bump = (phrase, videoId, start) => {
  const key = phrase.trim()
  if (key.length < MIN_CHARS || key.length > MAX_CHARS) return
  if (stopwords.has(key)) return
  let e = stats.get(key)
  if (!e) {
    e = { count: 0, videos: new Set(), sample: { videoId, start } }
    stats.set(key, e)
  }
  e.count++
  e.videos.add(videoId)
}

let segTotal = 0
for (const file of files) {
  const videoId = file.replace(/\.json$/, "")
  if (excluded.has(videoId)) continue
  const doc = await readJson(path.join(TDIR, file))
  if (!doc?.segments?.length) continue
  for (const seg of doc.segments) {
    segTotal++
    const text = (seg.text || "").trim()
    if (!text) continue

    // (a) 短いセリフはそのまま「口癖」候補
    if (text.length <= PHRASE_FULL_MAX) bump(text, videoId, seg.start)

    // (b) 形態素解析して内容語を含む 2〜4gram を候補に
    let tokens
    try {
      tokens = tokenizer.tokenize(text)
    } catch {
      continue
    }
    const surfaces = tokens.map((t) => t.surface_form)
    const poses = tokens.map((t) => t.pos)
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const pos = poses.slice(i, i + n)
        const sur = surfaces.slice(i, i + n)
        if (sur.some((s) => /[。、！？!?…「」\[\]()（）]/.test(s))) continue
        if (!pos.some((p) => CONTENT_POS.has(p))) continue
        if (!pos.every((p) => CONTENT_POS.has(p) || GLUE_POS.has(p))) continue
        if (!CONTENT_POS.has(pos[0])) continue // 助詞始まりを除外
        // 「らを笑顔に」のような接尾辞/非自立語始まりの半端なフレーズを除外
        const d1 = tokens[i].pos_detail_1
        if (d1 === "接尾" || d1 === "非自立") continue
        bump(sur.join(""), videoId, seg.start)
      }
    }
  }
}

let items = [...stats.entries()]
  .filter(([, v]) => v.count >= MIN_COUNT && v.videos.size >= MIN_VIDEOS)
  .map(([text, v]) => ({ text, count: v.count, videoCount: v.videos.size, sample: v.sample }))
  .sort((a, b) => b.count - a.count || b.text.length - a.text.length)

// 重複圧縮: 上位フレーズに包含される / 大きく重なるものを落とす
const lcsLen = (a, b) => {
  let best = 0
  const dp = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    let prev = 0
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : 0
      if (dp[j] > best) best = dp[j]
      prev = tmp
    }
  }
  return best
}
const kept = []
for (const it of items) {
  const dup = kept.find((k) => {
    if (it.count > k.count * 1.3) return false
    if (k.text.includes(it.text)) return true
    // 「お前らを笑顔」と「らを笑顔に」のような大幅な重なりも同一視する
    return lcsLen(k.text, it.text) >= Math.min(k.text.length, it.text.length) - 1
  })
  if (!dup) kept.push(it)
  if (kept.length >= TOP_N) break
}

await writeFile(
  path.join(DATA, "popular.json"),
  JSON.stringify(
    { version: 1, generatedAt: new Date().toISOString(), segmentCount: segTotal, items: kept },
    null,
    2
  ) + "\n"
)
console.log(`popular: ${kept.length} phrases from ${segTotal} segments (${files.length} videos)`)
