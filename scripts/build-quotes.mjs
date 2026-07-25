// quotes.json 生成（名言候補の自動抽出 + 五十音索引）
//
// 「よく出るキーワード」(popular.json)は頻度順なので口癖ばかりになり、
// 名言を見つける役には立たない。こちらは逆に「頻度が低くても印象的な、
// ある程度の長さを持つ言い切り型の発言」をスコアリングして抽出する。
//
// スコアの考え方:
//   + 適度な長さ(短すぎ/長すぎを減点)
//   + 言い切り・断定・宣言の語尾(〜だ / 〜なんだよ / 〜しよう / 〜べき など)
//   + 内容語(名詞・動詞・形容詞)の密度が高い
//   + 一人称・二人称を含む(語りかけ・主張になりやすい)
//   - フィラー/口癖/あいづち(えっと、まあ、マジで 等)が多い
//   - 実況の実務セリフ(数字だけ、ゲーム内の作業指示など)
//   - 同じ配信で何度も繰り返される定型句
//
// 五十音索引: pykakasi由来の yomi(ひらがな)の先頭文字から「あ〜わ行」を判定する。
// 実行: node scripts/build-quotes.mjs
import { readFile, writeFile, readdir } from "node:fs/promises"
import path from "node:path"
import kuromoji from "kuromoji"

const ROOT = path.resolve(import.meta.dirname, "..")
const DATA = path.join(ROOT, "public", "data")
const TDIR = path.join(DATA, "transcripts")
const DIC = path.join(ROOT, "node_modules", "kuromoji", "dict")

// 【重要】ここは「名言集」の候補数であり、キーワード全文検索とは無関係。
// 検索は search-index.json（全発言を漏れなく収録・件数上限なし）が担当する。
// 五十音索引UIのため、行ごとに上限を設ける（全体の一律上限は設けない）。
// 行別なので「ら行」「わ行」のような少数派が上位スコアに押し潰されない。
const MAX_PER_ROW = 400      // 五十音の1行あたりの上限
const MIN_CHARS = 12         // これ未満は名言として短すぎる
const MAX_CHARS = 60         // これを超えると長すぎ(文字起こしの繋がりミスも多い)
const MIN_SCORE = 2.0        // このスコア未満は採用しない

// 口癖・フィラー(含むと減点)
const FILLERS = [
  "えっと", "えーと", "あの", "その", "まあ", "ま、", "なんか", "えー", "あー", "うーん",
  "はい", "うん", "そうそう", "ですね", "ちょっと", "とりあえず", "みたいな", "って感じ",
]
// 言い切り・宣言・主張の語尾(含むと加点)
const ASSERTIVE = [
  "んだよ", "んだ。", "なんだ", "だよな", "だろ", "でしょ", "べき", "しかない", "したい",
  "しよう", "います", "ません", "だから", "なので", "つまり", "大事", "大切", "一番",
  "絶対", "必ず", "本気", "全力", "だと思う", "と思って", "信じ", "約束", "感謝", "ありがと",
  "笑顔", "楽しい", "楽しく", "幸せ", "頑張", "がんば", "諦め", "あきらめ", "負け", "勝つ",
  "夢", "目標", "未来", "今日", "みんな", "お前ら", "俺は", "僕は", "自分は",
]
// 実況の実務セリフ・ゲーム作業(含むと減点)
const CHORE = [
  "ダメージ", "リスポーン", "回復", "アイテム", "ブロック", "クラフト", "エンチャント",
  "座標", "スポーン", "ワープ", "コマンド", "チャット", "ミュート", "配信", "コメント",
  "アップデート", "バグ", "ラグ", "エイム", "リロード",
]
// 一人称・二人称(語りかけ・主張になりやすい)
const PERSONAL = ["俺", "僕", "私", "自分", "お前", "君", "みんな", "お前ら"]

const CONTENT_POS = new Set(["名詞", "動詞", "形容詞", "副詞"])

const readJson = async (p, fallback = null) => {
  try {
    return JSON.parse(await readFile(p, "utf8"))
  } catch {
    return fallback
  }
}

const excluded = new Set(
  (await readFile(path.join(ROOT, "scripts", "exclude.txt"), "utf8").catch(() => ""))
    .split("\n").map((l) => l.split("#")[0].trim()).filter(Boolean)
)
// stopwords.txt に書かれたフレーズを含む発言は名言候補から除外する
const stopwords = (await readFile(path.join(ROOT, "scripts", "stopwords.txt"), "utf8").catch(() => ""))
  .split("\n").map((l) => l.split("#")[0].trim()).filter(Boolean)

// 手動で「推し名言」を登録できる（任意ファイル。無くてもよい）
// 形式: [{ "videoId": "...", "id": 12 }] または [{ "videoId": "...", "text": "..." }]
const picks = (await readJson(path.join(ROOT, "scripts", "quote-picks.json"), [])) ?? []
const pickKey = (v, i) => `${v}#${i}`
const pickedIds = new Set(picks.filter((p) => p.videoId && p.id != null).map((p) => pickKey(p.videoId, p.id)))
const pickedTexts = new Set(picks.filter((p) => p.text).map((p) => String(p.text).trim()))

const tokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath: DIC }).build((err, t) => (err ? reject(err) : resolve(t)))
})

const count = (text, list) => list.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0)

/** 五十音の行（あ/か/さ/た/な/は/ま/や/ら/わ/その他） */
const GOJUON = [
  { row: "あ", chars: "あいうえおぁぃぅぇぉ" },
  { row: "か", chars: "かきくけこがぎぐげご" },
  { row: "さ", chars: "さしすせそざじずぜぞ" },
  { row: "た", chars: "たちつてとだぢづでどっ" },
  { row: "な", chars: "なにぬねの" },
  { row: "は", chars: "はひふへほばびぶべぼぱぴぷぺぽ" },
  { row: "ま", chars: "まみむめも" },
  { row: "や", chars: "やゆよゃゅょ" },
  { row: "ら", chars: "らりるれろ" },
  { row: "わ", chars: "わをんゐゑ" },
]

function gojuonRow(yomi, text) {
  const src = (yomi || text || "").trim()
  for (const ch of src) {
    for (const g of GOJUON) if (g.chars.includes(ch)) return g.row
  }
  return "その他"
}

function score(text, tokens) {
  let s = 0
  const len = text.length

  // 長さ: 20〜36文字あたりを最良とする山なりの評価
  if (len < MIN_CHARS || len > MAX_CHARS) return -99
  s += 1 - Math.abs(len - 28) / 28   // 28文字前後で最大1.0

  const poses = tokens.map((t) => t.pos)
  const contentRatio = poses.filter((p) => CONTENT_POS.has(p)).length / Math.max(poses.length, 1)
  s += contentRatio * 2                        // 内容語の密度

  s += Math.min(count(text, ASSERTIVE), 3) * 0.8   // 言い切り・主張
  s += count(text, PERSONAL) > 0 ? 0.6 : 0         // 語りかけ
  s -= count(text, FILLERS) * 0.7                  // 口癖・フィラー
  s -= count(text, CHORE) * 0.6                    // 実況の実務セリフ

  // 【誤認識対策】辞書に無い語(UNKNOWN)が多い発言は文字起こしの誤りである可能性が高い。
  // 例:「ミラーのかぽじてよく消えがれ」「甘口魔房毒ってなって」
  const unknown = tokens.filter((t) => t.word_type === "UNKNOWN").length
  s -= unknown * 1.4
  // 意味を成さない漢字の羅列（辞書に無い2文字以上の漢字語）も誤認識の兆候
  const oddKanji = tokens.filter(
    (t) => t.word_type === "UNKNOWN" && /^[一-鿿]{2,}$/.test(t.surface_form)
  ).length
  s -= oddKanji * 1.0

  // 【質問文は名言ではない】視聴者への問いかけ(「〜ある?」「〜でしょ?」)を減点
  const questions = (text.match(/[?？]/g) || []).length
  s -= questions * 1.3

  // 数字だけ/記号だらけ/同じ文字の連続は減点
  if (/^[\d\s,.:：0-9]+$/.test(text)) s -= 3
  if (/(.)\1{3,}/.test(text)) s -= 1
  // 同じ語の連呼(「これ、これ、これ」)は減点
  const words = text.split(/[\s、。]+/).filter(Boolean)
  if (words.length >= 3 && new Set(words).size <= words.length / 2) s -= 1.2
  // 文として終わっていると加点
  if (/[。！]$/.test(text)) s += 0.4
  // 途中で切れている感じ(助詞で終わる)は減点
  if (/[のにをはがでとへ、]$/.test(text)) s -= 0.8

  return s
}

const files = (await readdir(TDIR).catch(() => []))
  .filter((f) => f.endsWith(".json") && !["manifest.json", "skipped.json", "failures.json"].includes(f))

const manifest = (await readJson(path.join(TDIR, "manifest.json"), [])) ?? []
const titleById = new Map(manifest.map((m) => [m.videoId, m.title]))

const candidates = []
const seenText = new Set()   // 同一文言の重複排除
let segTotal = 0

for (const file of files) {
  const videoId = file.replace(/\.json$/, "")
  if (excluded.has(videoId)) continue
  const doc = await readJson(path.join(TDIR, file))
  if (!doc?.segments?.length) continue

  // 同じ配信内で繰り返される定型句を把握する
  const freq = new Map()
  for (const seg of doc.segments) {
    const t = (seg.text || "").trim()
    freq.set(t, (freq.get(t) ?? 0) + 1)
  }

  for (const seg of doc.segments) {
    segTotal++
    const text = (seg.text || "").trim()
    if (!text) continue
    const norm = text.replace(/\s+/g, "")
    if (seenText.has(norm)) continue
    if (stopwords.some((w) => text.includes(w))) continue

    const isPicked = pickedIds.has(pickKey(videoId, seg.id)) || pickedTexts.has(text)

    let tokens
    try {
      tokens = tokenizer.tokenize(text)
    } catch {
      continue
    }
    let sc = score(text, tokens)
    if (freq.get(text) > 2) sc -= 1.2          // 同一配信で連発される定型句
    if (isPicked) sc += 100                     // 手動推しは最優先

    if (sc < MIN_SCORE) continue
    seenText.add(norm)
    // 【転送量対策】title は manifest.json から引けるので持たせない。
    // yomi も row の算出に使うだけなので出力しない。
    candidates.push({
      text,
      videoId,
      date: (doc.date ?? "").slice(0, 10),
      segmentId: seg.id,
      start: Math.round(seg.start * 10) / 10,
      row: gojuonRow(seg.yomi, text),
      score: Math.round(sc * 100) / 100,
      picked: isPicked || undefined,
    })
  }
}

candidates.sort((a, b) => b.score - a.score)

// 五十音の行ごとに上限を適用（スコア順に詰めるので各行の上位が残る）
const perRow = {}
const items = []
for (const c of candidates) {
  perRow[c.row] = (perRow[c.row] ?? 0) + 1
  if (perRow[c.row] > MAX_PER_ROW) continue
  items.push(c)
}

// 五十音の行ごとの件数（索引UIのため）
const rows = {}
for (const it of items) rows[it.row] = (rows[it.row] ?? 0) + 1

// pretty-print しない（1.7MB → 350KB程度に収まる）
await writeFile(
  path.join(DATA, "quotes.json"),
  JSON.stringify({
    version: 2,
    generatedAt: new Date().toISOString(),
    segmentCount: segTotal,
    rows,
    items,
  }) + "\n"
)
console.log(
  `quotes: ${items.length} quotes (候補${candidates.length}件から行別上限${MAX_PER_ROW}で採用) ` +
  `from ${segTotal} segments (${files.length} videos)` +
  `${picks.length ? `, ${picks.length} manual pick(s)` : ""}`
)
console.log("  rows:", Object.entries(rows).map(([k, v]) => `${k}:${v}`).join(" "))
