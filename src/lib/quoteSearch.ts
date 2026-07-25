import MiniSearch from "minisearch"
import type { SearchIndexFile } from "./types"
import { fetchSearchIndex, fetchSearchIndexShard } from "./data"

/**
 * 日本語向けトークナイザ（MiniSearch用）
 * ★重要: バッチ側 scripts/ja-tokenize.mjs の tokenizeJa と完全に同じロジックにすること。
 *   ここを変更したら必ず両方を更新し、search-index.json を再生成する。
 *
 * 方式: 日本語(漢字/かな)は文字bigram、英数字は単語単位。
 *       bigramは辞書不要・部分一致に強く、インデックスサイズも予測しやすい。
 */
const JA = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/
const ALNUM = /[0-9A-Za-zー]/

export function tokenizeJa(text: string): string[] {
  if (!text) return []
  const s = String(text).toLowerCase()
  const tokens: string[] = []
  let buf = ""
  const ja: string[] = []
  const flushAlnum = () => {
    if (buf) {
      tokens.push(buf)
      buf = ""
    }
  }
  const pushJa = () => {
    if (ja.length === 1) {
      tokens.push(ja[0])
    } else {
      for (let i = 0; i < ja.length - 1; i++) tokens.push(ja[i] + ja[i + 1])
    }
    ja.length = 0
  }
  for (const ch of s) {
    if (JA.test(ch)) {
      flushAlnum()
      ja.push(ch)
    } else if (ALNUM.test(ch)) {
      buf += ch
      if (ja.length) pushJa()
    } else {
      flushAlnum()
      if (ja.length) pushJa()
    }
  }
  flushAlnum()
  if (ja.length) pushJa()
  return tokens
}

/** インデックスに入っているドキュメント（本文は持たない） */
export interface IndexedHit {
  id: string // `${videoId}#${segmentId}`
  v: string // videoId
  s: number // 開始秒
  score: number
}

const MS_OPTIONS = {
  fields: ["t"],
  storeFields: ["v", "s"],
  tokenize: tokenizeJa,
  processTerm: (term: string) => term,
}

/** search-index.json（必要なら年別シャード）を読み込んで MiniSearch を返す */
export async function loadSearchIndexes(): Promise<{
  engines: MiniSearch[]
  segmentCount: number
  generatedAt: string | null
}> {
  const meta = await fetchSearchIndex()
  if (!meta) return { engines: [], segmentCount: 0, generatedAt: null }

  const load = (raw: unknown) =>
    MiniSearch.loadJSON(typeof raw === "string" ? raw : JSON.stringify(raw), MS_OPTIONS)

  if (meta.sharded && meta.shards?.length) {
    const shards = await Promise.all(
      meta.shards.map((s) => fetchSearchIndexShard(s.file).catch(() => null))
    )
    const engines = shards
      .filter((s): s is SearchIndexFile => !!s?.index)
      .map((s) => load(s.index))
    return { engines, segmentCount: meta.segmentCount, generatedAt: meta.generatedAt }
  }
  if (!meta.index) return { engines: [], segmentCount: meta.segmentCount ?? 0, generatedAt: meta.generatedAt }
  return { engines: [load(meta.index)], segmentCount: meta.segmentCount, generatedAt: meta.generatedAt }
}

/** 複数エンジン（年別シャード）をまとめて検索し、スコア降順で返す */
export function searchAll(engines: MiniSearch[], query: string, limit = 400): IndexedHit[] {
  const q = query.trim()
  if (!q || engines.length === 0) return []
  const hits: IndexedHit[] = []
  for (const engine of engines) {
    const raw = engine.search(q, {
      prefix: true,
      fuzzy: 0.2, // 軽いfuzzy（誤認識・言い回しのズレを吸収）
      combineWith: "AND",
    })
    for (const r of raw) {
      hits.push({ id: String(r.id), v: String(r.v), s: Number(r.s), score: r.score })
    }
  }
  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, limit)
}

/** mm:ss / h:mm:ss */
export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`
}

/**
 * クエリのハイライト用: 検索語から「本文中で光らせる部分文字列」を作る。
 * bigramトークナイザに合わせ、日本語は2文字以上の連続、英数字は単語単位で拾う。
 */
export function highlightParts(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const parts = q.split(/[\s　、。,.!?！？]+/).filter((p) => p.length >= 1)
  return Array.from(new Set(parts)).sort((a, b) => b.length - a.length)
}

/** 本文をハイライト用のトークン配列に分割する（Reactで <mark> を当てるため） */
export function splitForHighlight(text: string, parts: string[]): { t: string; hit: boolean }[] {
  if (!parts.length) return [{ t: text, hit: false }]
  const lower = text.toLowerCase()
  const marks: boolean[] = new Array(text.length).fill(false)
  for (const p of parts) {
    if (!p) continue
    let from = 0
    for (;;) {
      const idx = lower.indexOf(p, from)
      if (idx === -1) break
      for (let i = idx; i < idx + p.length; i++) marks[i] = true
      from = idx + p.length
    }
  }
  const out: { t: string; hit: boolean }[] = []
  let cur = ""
  let curHit = marks[0] ?? false
  for (let i = 0; i < text.length; i++) {
    if (marks[i] === curHit) {
      cur += text[i]
    } else {
      out.push({ t: cur, hit: curHit })
      cur = text[i]
      curHit = marks[i]
    }
  }
  if (cur) out.push({ t: cur, hit: curHit })
  return out
}
