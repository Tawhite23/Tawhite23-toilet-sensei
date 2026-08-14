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
 *   GET /api/live   ... 配信状態のスナップショット
 *   GET /api/config ... クライアントのポーリング間隔と緊急停止フラグ
 *   GET /health     ... 死活確認
 */

export interface Env {
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
    "access-control-allow-methods": "GET, OPTIONS",
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

    return json({ error: "not_found" }, 404, cors)
  },
} satisfies ExportedHandler<Env>
