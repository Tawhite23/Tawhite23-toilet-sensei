/**
 * おトイレ先生 リアルタイム配信ステータス API (Cloudflare Workers)
 *
 * ■ なぜこれが必要か
 *   本体サイトは完全静的エクスポート(next.config.mjs の output:"export")で
 *   Firebase Hosting Spark に置いているため、YouTube API キーを置けるサーバが無い。
 *   そのため従来は GitHub Actions が15分毎に live.json をコミットしていたが、
 *   scheduled workflow は遅延・スキップが常態で、実質35〜40分遅れていた。
 *
 * ■ 設計方針: 「閲覧者数」と「API呼び出し回数」を切り離す
 *   閲覧者が何人いても、上流(YouTube Data API)を叩くのは TTL ごとに1回だけ。
 *   Cache API に載せた1本のスナップショットを全員が読む。
 *   これは kickers.tokyo / multi.prrc-ch.com が採っているのと同じ構造。
 *
 * ■ クォータ試算 (上限 10,000u/日)
 *   配信中  : videoId が既知なので videos.list だけで同接が取れる ...... 1u / 60秒
 *   非配信中: playlistItems + videos で新しい配信を探す ................ 2u / 300秒
 *   統計    : channels.list(登録者/総再生) ............................. 1u / 600秒
 *   → 1日6時間配信の想定で約 800u/日。既存ワークフロー(約375u/日)と合わせても
 *     全体の12%程度に収まる。アクセスが無い時間帯は0u(オンデマンド更新のため)。
 *
 * ■ エンドポイント
 *   GET /api/live     ... 配信状態のスナップショット
 *   GET /api/contents ... 動画/配信一覧（直近分だけ差分パッチ。下記参照）
 *   GET /api/config   ... クライアントのポーリング間隔と緊急停止フラグ
 *   GET /health       ... 死活確認
 *
 * ■ /api/contents の設計: 「全件取得」ではなく「差分パッチ」
 *   contents.json は数百本ぶんの一覧で、全件を毎回取り直すとページング
 *   (playlistItems.list を50件ずつ)だけでクォータもWorkerのサブリクエスト数
 *   (無料枠は1呼び出しあたり50件まで)も膨らみ、チャンネルが育つほど重くなる。
 *
 *   そこで既存の6時間毎ワークフロー(data-contents.yml)が生成する完全な一覧を
 *   「ベース」として GitHub の raw URL からそのまま読み、そこに YouTube API から
 *   取った「直近数十件」だけを videoId で上書き・先頭追加してパッチする。
 *   新着動画・配信開始/終了・予定→配信中への遷移は直近側に必ず含まれるため、
 *   これで実用上「今の状態」に追いつく。古い動画の並び替えや削除の検出はしない
 *   (その2つは頻度も重要度も低く、6時間毎の再生成で十分追従できる)。
 */

import { handleChat, handleChatIntro, handleChatProfile } from "./chat"

export interface Env {
  /** セリフ全文検索・名言集のD1データベース（wrangler.toml の d1_databases） */
  DB: D1Database
  /** YouTube Data API v3 のキー。`wrangler secret put YT_API_KEY` で登録する */
  YT_API_KEY: string
  /** 監視対象チャンネルID (UC...) */
  YT_CHANNEL_ID: string
  /** CORS 許可オリジン。カンマ区切り。未設定なら全許可 */
  ALLOW_ORIGINS?: string

  // --- 以下は wrangler.toml の [vars] / ダッシュボードから再デプロイ無しで変更できる ---
  /** 配信中のサーバ側TTL(秒)。既定 60 */
  LIVE_TTL_SEC?: string
  /** 非配信中のサーバ側TTL(秒)。既定 300 */
  IDLE_TTL_SEC?: string
  /** 登録者数/総再生数のTTL(秒)。既定 600 */
  STATS_TTL_SEC?: string
  /** クライアントの配信中ポーリング間隔(ミリ秒)。既定 60000 */
  CLIENT_LIVE_POLL_MS?: string
  /** クライアントの非配信中ポーリング間隔(ミリ秒)。既定 300000 */
  CLIENT_IDLE_POLL_MS?: string
  /** "1" にするとクライアントのポーリングを止める緊急ブレーキ */
  DISABLED?: string

  // --- AIおトイレ先生（チャット） ---
  /** Workers AI のバインディング。上限超過時とOpenAI障害時の受け皿として使う */
  AI?: Ai
  /** OpenAI のキー。`wrangler secret put OPENAI_API_KEY` で登録する */
  OPENAI_API_KEY?: string
  /** 既定 gpt-4o-mini */
  OPENAI_MODEL?: string
  /** 既定 @cf/meta/llama-3.1-8b-instruct */
  WORKERS_AI_MODEL?: string
  /** IDトークンの aud/iss 照合に使う Firebase プロジェクトID */
  FIREBASE_PROJECT_ID?: string
  /** 1人あたりの1日の往復上限。既定 20 */
  CHAT_DAILY_PER_USER?: string
  /** サイト全体の1日の往復上限。超えたら無料のWorkers AIへ切り替える。既定 500 */
  CHAT_DAILY_TOTAL?: string
  /** 口調の参考にする言い回し（"/"区切り） */
  CHAT_PHRASES?: string

  /** contents.json のベース(完全な一覧)を取得する raw URL。data-contents.yml が更新する */
  CONTENTS_BASE_URL?: string
  /** /api/contents のTTL(秒)。既定 300 */
  CONTENTS_TTL_SEC?: string
  /** 差分パッチで確認する直近件数。既定 30 */
  CONTENTS_PATCH_SIZE?: string
}

/** src/lib/types.ts の ContentItem と同じ形にすること */
interface ContentItem {
  date: string
  type: "live" | "video"
  title: string
  videoId: string
  thumbnail: string | null
  durationSec: number
  status?: "upcoming"
}

/** /api/live のレスポンス。src/lib/types.ts の LiveNow と同じ形にすること */
interface LiveSnapshot {
  isLive: boolean
  videoId: string | null
  title: string | null
  /** 同時接続数。YouTube側が非公開にしている配信では null */
  viewerCount: number | null
  startedAt: string | null
  thumbnail: string | null
  subscriberCount: number | null
  viewCount: number | null
  checkedAt: string
  /** "live" = 上流を叩いた直後 / "cache" = TTL内 / "stale" = 上流失敗時の生き残り */
  source: "live" | "cache" | "stale"
}

const API_BASE = "https://www.googleapis.com/youtube/v3"

// Cache API のキー(実在しないホスト名で良い。URLがキーになるだけ)
const CACHE_SNAPSHOT = "https://otoile.cache/live-snapshot"
const CACHE_STATS = "https://otoile.cache/channel-stats"
const CACHE_HINT = "https://otoile.cache/live-hint"
const CACHE_LAST_GOOD = "https://otoile.cache/last-good"

/** TTL切れ後もこの秒数だけは古い値を返しつつ裏で更新する(stale-while-revalidate) */
const SWR_WINDOW_SEC = 600
/** 上流が落ちた時に「最後に成功した値」を保持する時間 */
const LAST_GOOD_TTL_SEC = 3600
/** 上流1リクエストのタイムアウト */
const UPSTREAM_TIMEOUT_MS = 6000

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// ---------------------------------------------------------------------------
// 同一アイソレート内での重複リクエスト抑止。
// TTL切れの瞬間に同時アクセスが来ても、上流を叩くのは1回だけにする。
// ---------------------------------------------------------------------------
let inflight: Promise<LiveSnapshot> | null = null
/** 直近の配信中 videoId。これがあると videos.list 1回(1u)だけで済む */
let hintVideoId: string | null = null

async function ytGet(
  env: Env,
  endpoint: string,
  params: Record<string, string | number | undefined>
): Promise<any> {
  const url = new URL(`${API_BASE}/${endpoint}`)
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v))
  url.searchParams.set("key", env.YT_API_KEY)

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    // 上流のレスポンスは自前でキャッシュ管理するので、CFの自動キャッシュには載せない
    cf: { cacheTtl: 0, cacheEverything: false },
  })
  if (!res.ok) throw new Error(`youtube ${endpoint} HTTP ${res.status}`)
  return res.json()
}

function bestThumb(t: any): string | null {
  return (
    t?.maxres?.url || t?.standard?.url || t?.high?.url || t?.medium?.url || t?.default?.url || null
  )
}

/** チャンネルの uploads プレイリストIDは "UC..." → "UU..." で導出できる(channels.list 1u を節約) */
const uploadsPlaylistId = (channelId: string) => `UU${channelId.replace(/^UC/, "")}`

/** scripts/lib.mjs の parseDurationSec と同じロジック(ISO8601 duration → 秒) */
function parseDurationSec(iso: string | undefined): number {
  if (!iso) return 0
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  const [d, h, min, s] = [m[1], m[2], m[3], m[4]].map((x) => (x ? Number(x) : 0))
  return d * 86400 + h * 3600 + min * 60 + s
}

/** scripts/fetch-contents.mjs と同じロジック */
function detectType(v: any): "live" | "video" {
  const l = v.liveStreamingDetails
  return l && (l.actualStartTime || l.actualEndTime || l.scheduledStartTime) ? "live" : "video"
}

/** scripts/fetch-contents.mjs と同じロジックで1本の videos.list 結果を ContentItem に変換する */
function toContentItem(v: any): ContentItem | null {
  const live = v.liveStreamingDetails
  const isUpcoming = !!live?.scheduledStartTime && !live?.actualStartTime && !live?.actualEndTime
  const date: string | undefined = isUpcoming
    ? live.scheduledStartTime
    : live?.actualStartTime ?? v.snippet?.publishedAt
  if (!date) return null
  return {
    date,
    type: detectType(v),
    title: v.snippet?.title ?? "",
    videoId: v.id,
    thumbnail: bestThumb(v.snippet?.thumbnails),
    durationSec: parseDurationSec(v.contentDetails?.duration),
    ...(isUpcoming ? { status: "upcoming" as const } : {}),
  }
}

// --- Cache API ヘルパ ------------------------------------------------------

async function cacheRead<T>(key: string): Promise<{ value: T; ageSec: number } | null> {
  const hit = await caches.default.match(new Request(key))
  if (!hit) return null
  try {
    const body = (await hit.json()) as { storedAt: number; value: T }
    return { value: body.value, ageSec: (Date.now() - body.storedAt) / 1000 }
  } catch {
    return null
  }
}

async function cacheWrite(key: string, value: unknown, maxAgeSec: number): Promise<void> {
  await caches.default.put(
    new Request(key),
    new Response(JSON.stringify({ storedAt: Date.now(), value }), {
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${Math.ceil(maxAgeSec)}`,
      },
    })
  )
}

// --- 上流の取得 ------------------------------------------------------------

/** 登録者数/総再生数。TTLが長い(既定10分)ので配信中でも毎回は叩かない */
async function getStats(env: Env, ctx: ExecutionContext) {
  const ttl = num(env.STATS_TTL_SEC, 600)
  const cached = await cacheRead<{ subscriberCount: number | null; viewCount: number | null }>(
    CACHE_STATS
  )
  if (cached && cached.ageSec < ttl) return cached.value

  try {
    const ch = await ytGet(env, "channels", { part: "statistics", id: env.YT_CHANNEL_ID })
    const s = ch.items?.[0]?.statistics ?? {}
    const value = {
      subscriberCount: s.subscriberCount != null ? Number(s.subscriberCount) : null,
      viewCount: s.viewCount != null ? Number(s.viewCount) : null,
    }
    ctx.waitUntil(cacheWrite(CACHE_STATS, value, ttl + SWR_WINDOW_SEC))
    return value
  } catch {
    // 統計は取れなくても配信状態の表示は続けたいので、失敗しても落とさない
    return cached?.value ?? { subscriberCount: null, viewCount: null }
  }
}

function toSnapshot(video: any): Omit<LiveSnapshot, "subscriberCount" | "viewCount" | "checkedAt" | "source"> {
  const cv = video?.liveStreamingDetails?.concurrentViewers
  return {
    isLive: true,
    videoId: video.id,
    title: video.snippet?.title ?? null,
    viewerCount: cv != null ? Number(cv) : null,
    startedAt: video.liveStreamingDetails?.actualStartTime ?? null,
    thumbnail: bestThumb(video.snippet?.thumbnails),
  }
}

const OFFLINE = {
  isLive: false as const,
  videoId: null,
  title: null,
  viewerCount: null,
  startedAt: null,
  thumbnail: null,
}

/**
 * 上流を実際に叩いて配信状態を作る。
 * 配信中(hintVideoId あり)なら 1u、配信を探しに行く場合は 2u。
 */
async function fetchUpstream(env: Env, ctx: ExecutionContext): Promise<LiveSnapshot> {
  // ヒントはアイソレート再起動で消えるので、Cache API からも復元する
  if (!hintVideoId) {
    const h = await cacheRead<string>(CACHE_HINT)
    if (h) hintVideoId = h.value
  }

  let core: Omit<LiveSnapshot, "subscriberCount" | "viewCount" | "checkedAt" | "source"> | null =
    null

  // 1) 既知の配信がまだ生きているかを1回で確認する(1u)
  if (hintVideoId) {
    try {
      const vs = await ytGet(env, "videos", {
        part: "snippet,liveStreamingDetails",
        id: hintVideoId,
      })
      const v = vs.items?.[0]
      if (v && v.snippet?.liveBroadcastContent === "live") core = toSnapshot(v)
      else hintVideoId = null // 配信が終わった → 2) の探索へ
    } catch {
      hintVideoId = null
    }
  }

  // 2) 新しい配信を探す(2u)。ライブ配信も uploads プレイリストに載る
  if (!core) {
    const pl = await ytGet(env, "playlistItems", {
      part: "contentDetails",
      playlistId: uploadsPlaylistId(env.YT_CHANNEL_ID),
      maxResults: 10,
    })
    const ids: string[] = (pl.items ?? []).map((i: any) => i.contentDetails.videoId)
    if (ids.length) {
      const vs = await ytGet(env, "videos", {
        part: "snippet,liveStreamingDetails",
        id: ids.join(","),
      })
      const liveNow = (vs.items ?? []).find((v: any) => v.snippet?.liveBroadcastContent === "live")
      if (liveNow) {
        core = toSnapshot(liveNow)
        hintVideoId = liveNow.id
      }
    }
    if (!core) core = { ...OFFLINE }
  }

  const stats = await getStats(env, ctx)
  const snapshot: LiveSnapshot = {
    ...core,
    ...stats,
    checkedAt: new Date().toISOString(),
    source: "live",
  }

  const ttl = snapshot.isLive ? num(env.LIVE_TTL_SEC, 60) : num(env.IDLE_TTL_SEC, 300)
  ctx.waitUntil(
    Promise.all([
      cacheWrite(CACHE_SNAPSHOT, snapshot, ttl + SWR_WINDOW_SEC),
      cacheWrite(CACHE_LAST_GOOD, snapshot, LAST_GOOD_TTL_SEC),
      hintVideoId
        ? cacheWrite(CACHE_HINT, hintVideoId, 21600)
        : caches.default.delete(new Request(CACHE_HINT)),
    ])
  )
  return snapshot
}

/** 上流呼び出しを1本に束ねる(サンダリングハード対策) */
function refresh(env: Env, ctx: ExecutionContext): Promise<LiveSnapshot> {
  if (!inflight) {
    inflight = fetchUpstream(env, ctx).finally(() => {
      inflight = null
    })
  }
  return inflight
}

async function getSnapshot(env: Env, ctx: ExecutionContext): Promise<LiveSnapshot> {
  const cached = await cacheRead<LiveSnapshot>(CACHE_SNAPSHOT)

  if (cached) {
    const ttl = cached.value.isLive ? num(env.LIVE_TTL_SEC, 60) : num(env.IDLE_TTL_SEC, 300)
    // TTL内: そのまま返す(上流は叩かない)
    if (cached.ageSec < ttl) return { ...cached.value, source: "cache" }
    // TTL切れ〜SWR窓内: 古い値を即返しつつ、裏で更新しておく
    if (cached.ageSec < ttl + SWR_WINDOW_SEC) {
      ctx.waitUntil(refresh(env, ctx).catch(() => {}))
      return { ...cached.value, source: "cache" }
    }
  }

  try {
    return await refresh(env, ctx)
  } catch (e) {
    // 上流が落ちている: 最後に成功した値で凌ぐ。真っ白よりは古い情報の方がまし
    const lastGood = await cacheRead<LiveSnapshot>(CACHE_LAST_GOOD)
    if (lastGood) return { ...lastGood.value, source: "stale" }
    throw e
  }
}

// --- contents.json の差分パッチ ---------------------------------------------

const CACHE_CONTENTS = "https://otoile.cache/contents-patched"
let contentsInflight: Promise<ContentItem[]> | null = null

/** GitHub Actions が6時間毎に更新する完全な一覧。Workerの外側で生成されたものをベースに使う */
async function fetchContentsBase(env: Env): Promise<ContentItem[]> {
  if (!env.CONTENTS_BASE_URL) return []
  try {
    const res = await fetch(env.CONTENTS_BASE_URL, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cf: { cacheTtl: 0, cacheEverything: false },
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as ContentItem[]) : []
  } catch {
    return []
  }
}

/** 直近の動画/配信をYouTube APIから取得し、ベースの一覧に上書き・先頭追加でパッチする */
async function fetchContentsUpstream(env: Env, ctx: ExecutionContext): Promise<ContentItem[]> {
  const patchSize = Math.min(50, num(env.CONTENTS_PATCH_SIZE, 30))

  const [base, pl] = await Promise.all([
    fetchContentsBase(env),
    ytGet(env, "playlistItems", {
      part: "contentDetails",
      playlistId: uploadsPlaylistId(env.YT_CHANNEL_ID),
      maxResults: patchSize,
    }),
  ])

  const ids: string[] = (pl.items ?? []).map((i: any) => i.contentDetails.videoId)
  const recent: ContentItem[] = []
  if (ids.length) {
    const vs = await ytGet(env, "videos", {
      part: "snippet,contentDetails,liveStreamingDetails",
      id: ids.join(","),
    })
    for (const v of vs.items ?? []) {
      const item = toContentItem(v)
      if (item) recent.push(item)
    }
  }

  // videoId をキーに、直近取得分(recent)でベースを上書き・先頭追加する
  const byId = new Map(base.map((c) => [c.videoId, c]))
  for (const item of recent) byId.set(item.videoId, item)
  const merged = [...byId.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))

  const ttl = num(env.CONTENTS_TTL_SEC, 300)
  ctx.waitUntil(cacheWrite(CACHE_CONTENTS, merged, ttl + SWR_WINDOW_SEC))
  return merged
}

function refreshContents(env: Env, ctx: ExecutionContext): Promise<ContentItem[]> {
  if (!contentsInflight) {
    contentsInflight = fetchContentsUpstream(env, ctx).finally(() => {
      contentsInflight = null
    })
  }
  return contentsInflight
}

async function getContents(env: Env, ctx: ExecutionContext): Promise<ContentItem[]> {
  const ttl = num(env.CONTENTS_TTL_SEC, 300)
  const cached = await cacheRead<ContentItem[]>(CACHE_CONTENTS)

  if (cached) {
    if (cached.ageSec < ttl) return cached.value
    if (cached.ageSec < ttl + SWR_WINDOW_SEC) {
      ctx.waitUntil(refreshContents(env, ctx).catch(() => {}))
      return cached.value
    }
  }

  try {
    return await refreshContents(env, ctx)
  } catch (e) {
    if (cached) return cached.value // 上流が落ちていても古い一覧で凌ぐ
    throw e
  }
}

// --- セリフ全文検索 / 名言集 (D1) --------------------------------------------
//
// 従来はブラウザが search-index.json を丸ごと落として MiniSearch で検索していた。
// 配信本数の増加でこのファイルが肥大するため(13.6MB→全件で97MB見込み)、
// D1(エッジのSQLite)へ移し、クエリ毎に数KBだけ返す方式にしている。

/**
 * 日本語向けトークナイザ。
 * ★重要: scripts/ja-tokenize.mjs / src/lib/quoteSearch.ts と完全に同じロジックにすること。
 *   投入時と検索時で分解が食い違うと、何も引っかからなくなる。
 *
 * 方式: 日本語(漢字/かな)は文字bigram、英数字は単語単位。
 *   FTS5標準の trigram を使わないのは、3文字以上でないとヒットせず
 *   「今日」のような2文字の検索語が引けないため（実測で確認済み）。
 */
const JA_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/
const ALNUM_RE = /[0-9A-Za-zー]/

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
    if (ja.length === 1) tokens.push(ja[0])
    else for (let i = 0; i < ja.length - 1; i++) tokens.push(ja[i] + ja[i + 1])
    ja.length = 0
  }
  for (const ch of s) {
    if (JA_RE.test(ch)) {
      flushAlnum()
      ja.push(ch)
    } else if (ALNUM_RE.test(ch)) {
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

/**
 * 検索語を FTS5 の MATCH 式へ変換する。
 * 各トークンを二重引用符で囲んで AND 連結する。
 * トークンから " を除去しているため、利用者の入力が FTS5 の構文
 * (OR / NEAR / * など)として解釈されることはない。
 */
function toMatchExpr(query: string): string | null {
  const tokens = tokenizeJa(query)
    .map((t) => t.replace(/"/g, "").trim())
    .filter(Boolean)
  if (!tokens.length) return null
  // トークンが多すぎるクエリは重いので上限を設ける
  return tokens.slice(0, 32).map((t) => `"${t}"`).join(" AND ")
}

const clampInt = (v: string | null, def: number, min: number, max: number) => {
  const x = Number(v)
  if (!Number.isFinite(x)) return def
  return Math.min(max, Math.max(min, Math.trunc(x)))
}

async function handleSearch(env: Env, url: URL, cors: Record<string, string>) {
  const q = (url.searchParams.get("q") ?? "").trim()
  // 既定を大きめ(300)にしているのは、画面側が「配信ごとにまとめて表示」する
  // ためにある程度まとまった件数を必要とするため。300件でも数十KBに収まる。
  const limit = clampInt(url.searchParams.get("limit"), 300, 1, 500)
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 5000)
  const video = (url.searchParams.get("video") ?? "").trim()
  const month = (url.searchParams.get("month") ?? "").trim() // YYYY-MM
  const sort = url.searchParams.get("sort") === "newest" ? "newest" : "relevance"

  const match = toMatchExpr(q)
  if (!match) return json({ query: q, total: 0, items: [] }, 200, cors)

  // 絞り込みは画面側ではなくSQL側で行う。
  // クライアント側で絞ると「取得した範囲の中だけ」が対象になってしまい、
  // 該当が範囲外にあると見つからないため。
  const conds: string[] = ["segments MATCH ?"]
  const filterBinds: (string | number)[] = [match]
  if (video && /^[\w-]{5,20}$/.test(video)) {
    conds.push("vid = ?")
    filterBinds.push(video)
  }
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    conds.push("ymd LIKE ?")
    filterBinds.push(`${month}%`)
  }
  const where = conds.join(" AND ")
  // bm25 の昇順が関連度の高い順（FTS5のスコアは負値で小さいほど良い）
  const order = sort === "newest" ? "ymd DESC, st ASC" : "rank"

  const sql = `
    SELECT vid, sid, st, txt, ymd, bm25(segments) AS rank
    FROM segments
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ? OFFSET ?`
  const countSql = `SELECT count(*) AS n FROM segments WHERE ${where}`

  const [rows, cnt] = await Promise.all([
    env.DB.prepare(sql)
      .bind(...filterBinds, limit, offset)
      .all(),
    env.DB.prepare(countSql)
      .bind(...filterBinds)
      .first<{ n: number }>(),
  ])

  const items = (rows.results ?? []).map((r: any) => ({
    videoId: r.vid,
    segmentId: r.sid,
    start: r.st,
    text: r.txt,
    date: r.ymd,
  }))
  return json({ query: q, total: cnt?.n ?? items.length, offset, items }, 200, {
    ...cors,
    "cache-control": "public, max-age=300",
  })
}

async function handleQuotes(env: Env, url: URL, cors: Record<string, string>) {
  const row = (url.searchParams.get("row") ?? "").trim()
  const limit = clampInt(url.searchParams.get("limit"), 60, 1, 200)
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 5000)

  // 行ごとの件数（五十音索引のUIで使う）
  const rowsAgg = await env.DB.prepare(
    "SELECT row, count(*) AS n FROM quotes GROUP BY row"
  ).all()
  const counts: Record<string, number> = {}
  for (const r of (rowsAgg.results ?? []) as any[]) counts[r.row] = r.n

  // 並び順。画面側で並べ替えると「取得済みの範囲の中だけ」が対象になるためサーバで行う。
  const sortKey = url.searchParams.get("sort")
  const order =
    sortKey === "newest"
      ? "ymd DESC, score DESC"
      : sortKey === "long"
        ? "length(txt) DESC, score DESC"
        : "score DESC"

  const where = row ? "WHERE row = ?" : ""
  const binds = row ? [row, limit, offset] : [limit, offset]
  const list = await env.DB.prepare(
    `SELECT id, vid, sid, st, txt, ymd, row, score, picked
     FROM quotes ${where}
     ORDER BY picked DESC, ${order}
     LIMIT ? OFFSET ?`
  )
    .bind(...binds)
    .all()

  const items = (list.results ?? []).map((r: any) => ({
    videoId: r.vid,
    segmentId: r.sid,
    start: r.st,
    text: r.txt,
    date: r.ymd,
    row: r.row,
    score: r.score,
    picked: !!r.picked,
  }))
  return json({ rows: counts, offset, items }, 200, {
    ...cors,
    "cache-control": "public, max-age=3600",
  })
}

// --- HTTP --------------------------------------------------------------------

function corsHeaders(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get("Origin")
  const allow = (env.ALLOW_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const value = allow.length === 0 ? "*" : origin && allow.includes(origin) ? origin : allow[0]
  return {
    "access-control-allow-origin": value,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    ...(allow.length ? { vary: "Origin" } : {}),
  }
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  })

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(req.url)
    const cors = corsHeaders(env, req)

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors })

    // チャットは POST。認証と課金を伴うのでここだけ別扱いにする。
    if (pathname === "/api/chat" && req.method === "POST") {
      return handleChat(req, env, ctx, cors, tokenizeJa)
    }
    if (pathname === "/api/chat/profile" && (req.method === "GET" || req.method === "POST")) {
      return handleChatProfile(req, env, cors)
    }
    // 会話の入口（最初の挨拶＋おすすめ質問）。LLMは使わないので費用はかからない。
    if (pathname === "/api/chat/intro" && req.method === "GET") {
      return handleChatIntro(req, env, cors)
    }

    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405, cors)

    if (pathname === "/health") return json({ ok: true }, 200, cors)

    /**
     * クライアントのポーリング設定。再デプロイ無しでダッシュボードの環境変数から
     * 間隔を伸ばしたり、DISABLED=1 でポーリング自体を止めたりできる。
     * (multi.prrc-ch.com の /api/runtime-config と同じ役割の非常ブレーキ)
     */
    if (pathname === "/api/config") {
      return json(
        {
          disabled: env.DISABLED === "1",
          livePollMs: num(env.CLIENT_LIVE_POLL_MS, 60_000),
          idlePollMs: num(env.CLIENT_IDLE_POLL_MS, 300_000),
        },
        200,
        { ...cors, "cache-control": "public, max-age=300" }
      )
    }

    if (pathname === "/api/live") {
      if (!env.YT_API_KEY || !env.YT_CHANNEL_ID) {
        return json({ error: "not_configured" }, 500, cors)
      }
      try {
        const snap = await getSnapshot(env, ctx)
        const ttl = snap.isLive ? num(env.LIVE_TTL_SEC, 60) : num(env.IDLE_TTL_SEC, 300)
        return json(snap, 200, {
          ...cors,
          // ブラウザ側は短めに。エッジのキャッシュは Cache API 側で管理している
          "cache-control": `public, max-age=${Math.min(30, ttl)}, stale-while-revalidate=120`,
        })
      } catch {
        return json({ error: "upstream_unavailable" }, 503, {
          ...cors,
          "cache-control": "no-store",
        })
      }
    }

    if (pathname === "/api/contents") {
      if (!env.YT_API_KEY || !env.YT_CHANNEL_ID) {
        return json({ error: "not_configured" }, 500, cors)
      }
      try {
        const contents = await getContents(env, ctx)
        const ttl = num(env.CONTENTS_TTL_SEC, 300)
        return json(contents, 200, {
          ...cors,
          "cache-control": `public, max-age=${Math.min(60, ttl)}, stale-while-revalidate=300`,
        })
      } catch {
        return json({ error: "upstream_unavailable" }, 503, {
          ...cors,
          "cache-control": "no-store",
        })
      }
    }

    if (pathname === "/api/search" || pathname === "/api/quotes") {
      if (!env.DB) return json({ error: "db_not_configured" }, 500, cors)
      try {
        const url = new URL(req.url)
        return pathname === "/api/search"
          ? await handleSearch(env, url, cors)
          : await handleQuotes(env, url, cors)
      } catch (e) {
        return json({ error: "query_failed", detail: String(e).slice(0, 200) }, 500, {
          ...cors,
          "cache-control": "no-store",
        })
      }
    }

    return json({ error: "not_found" }, 404, cors)
  },
} satisfies ExportedHandler<Env>
