import { site } from "./site.config"

/**
 * セリフ全文検索のクライアント。
 *
 * 以前は search-index.json（MiniSearchの書き出し）をブラウザが丸ごと落として
 * 端末側で検索していた。配信本数が増えるほどこのファイルが肥大し、
 * 現在13.6MB・全件消化後は約97MBに達する見込みだった
 * （年別シャードはあるが全シャードを一括取得する作りで、分割しても軽くならない）。
 *
 * いまは Cloudflare Worker + D1(エッジのSQLite/FTS5) に問い合わせ、
 * 必要な数十件ぶんだけを受け取る。初回ダウンロードはゼロになる。
 *
 * トークナイズ(日本語のbigram分解)はサーバ側が行うため、ここには持たない。
 * ★サーバ側の実装は worker/src/index.ts の tokenizeJa。
 */

/** 検索1件ぶん。D1から本文も一緒に返るので、別途 transcripts を引く必要がない */
export interface SearchHit {
  videoId: string
  segmentId: number
  start: number
  text: string
  date: string
}

export interface SearchResult {
  total: number
  items: SearchHit[]
}

export interface SearchOptions {
  video?: string
  /** YYYY-MM */
  month?: string
  sort?: "relevance" | "newest"
  limit?: number
  signal?: AbortSignal
}

const EMPTY: SearchResult = { total: 0, items: [] }

/** 検索APIを叩く。未設定・失敗時は空結果を返す（画面は「見つかりません」表示になる） */
export async function searchQuotes(
  query: string,
  opts: SearchOptions = {}
): Promise<SearchResult> {
  const q = query.trim()
  const base = site.liveApiBaseUrl?.replace(/\/$/, "")
  if (!q || !base) return EMPTY

  const sp = new URLSearchParams({ q, limit: String(opts.limit ?? 300) })
  if (opts.video) sp.set("video", opts.video)
  if (opts.month) sp.set("month", opts.month)
  if (opts.sort) sp.set("sort", opts.sort)

  try {
    const res = await fetch(`${base}/api/search?${sp.toString()}`, { signal: opts.signal })
    if (!res.ok) return EMPTY
    const data = (await res.json()) as SearchResult
    return { total: Number(data.total) || 0, items: Array.isArray(data.items) ? data.items : [] }
  } catch {
    return EMPTY
  }
}

/** 名言集1件ぶん */
export interface QuoteHit extends SearchHit {
  row: string
  score: number
  picked: boolean
}

export interface QuotesResult {
  rows: Record<string, number>
  items: QuoteHit[]
}

/** 名言集APIを叩く */
export async function fetchQuoteGallery(
  opts: {
    row?: string
    sort?: "score" | "newest" | "long"
    limit?: number
    signal?: AbortSignal
  } = {}
): Promise<QuotesResult> {
  const base = site.liveApiBaseUrl?.replace(/\/$/, "")
  if (!base) return { rows: {}, items: [] }
  // 1行あたりの最大が400件なので、既定400なら行を選んだ状態では全件が入る
  const sp = new URLSearchParams({ limit: String(opts.limit ?? 400) })
  if (opts.row) sp.set("row", opts.row)
  if (opts.sort) sp.set("sort", opts.sort)
  try {
    const res = await fetch(`${base}/api/quotes?${sp.toString()}`, { signal: opts.signal })
    if (!res.ok) return { rows: {}, items: [] }
    const data = (await res.json()) as QuotesResult
    return {
      rows: data.rows ?? {},
      items: Array.isArray(data.items) ? data.items : [],
    }
  } catch {
    return { rows: {}, items: [] }
  }
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
