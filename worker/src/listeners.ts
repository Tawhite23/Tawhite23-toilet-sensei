/**
 * リスナー名鑑の「いまの名前とアイコン」。
 *
 * ■ なぜ必要か
 *   名鑑のデータ(public/data/listeners.json)は手元PCで集計したときの名前とアイコンを持つ。
 *   リスナーが名前やアイコンを変えても、次に集計し直すまで古いままになり、
 *   アイコンは古いURLが消えて表示できなくなることもある。
 *   そこで配信状態(/api/live)と同じく、Worker が YouTube に聞いた最新の値を配る。
 *
 * ■ チャンネルIDを公開しない
 *   listeners.json にはチャンネルIDを載せていない（URL用のキーはソルト付きハッシュ）。
 *   「キー → チャンネルID」の対応は D1 の listener_ids テーブルにだけ置き、
 *   この Worker はキーと名前・アイコンだけを返す。対応表そのものは外へ出さない。
 *   投入は scripts/sync-listeners.mjs（npm run sync-listeners）。
 *
 * ■ API消費
 *   channels.list は50件まとめて1u。名鑑が200人なら1回の更新で4u。
 *   全閲覧者で1本のキャッシュを共有し、既定6時間に1回だけ上流を叩く（1日16u程度）。
 *   アクセスが無ければ0u。
 */
import type { Env } from "./index"

const API = "https://www.googleapis.com/youtube/v3/channels"
const CACHE_KEY = "https://otoile.cache/listener-profiles"
const BATCH = 50 // channels.list の id は1回50件まで
// 上流が落ちているときに、期限切れのキャッシュをどれだけ使い続けるか
const STALE_SEC = 7 * 86400

/** キー → [名前, アイコンのURL(サイズ指定なし)] */
type Profiles = Record<string, [string, string]>
interface Snapshot {
  storedAt: number
  profiles: Profiles
}

const jsonRes = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  })

async function fetchProfiles(env: Env): Promise<Profiles> {
  const rows = await env.DB.prepare("SELECT key, cid FROM listener_ids").all<{ key: string; cid: string }>()
  const keyOf = new Map((rows.results ?? []).map((r) => [r.cid, r.key]))
  const ids = [...keyOf.keys()]

  const out: Profiles = {}
  for (let i = 0; i < ids.length; i += BATCH) {
    const url = new URL(API)
    url.searchParams.set("part", "snippet")
    url.searchParams.set("id", ids.slice(i, i + BATCH).join(","))
    url.searchParams.set("maxResults", String(BATCH))
    url.searchParams.set("key", env.YT_API_KEY)
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(6000),
      cf: { cacheTtl: 0, cacheEverything: false },
    })
    if (!res.ok) throw new Error(`youtube channels HTTP ${res.status}`)
    const data = (await res.json()) as { items?: any[] }
    for (const ch of data.items ?? []) {
      const key = keyOf.get(ch.id)
      if (!key) continue
      // チャットに出るのはハンドル(@...)なので、名鑑もハンドルにそろえる。無ければチャンネル名
      const name = ch.snippet?.customUrl || ch.snippet?.title || ""
      // "=s88-c-k-..." のサイズ指定を外して返す（表示する大きさはページ側で付ける）
      const icon = String(ch.snippet?.thumbnails?.default?.url ?? "").split("=")[0]
      if (name) out[key] = [name, icon]
    }
  }
  // 削除・非公開になったチャンネルは返ってこない。その人は listeners.json の値のまま表示される
  return out
}

export async function handleListenerProfiles(
  env: Env,
  ctx: ExecutionContext,
  cors: Record<string, string>
): Promise<Response> {
  if (!env.DB || !env.YT_API_KEY) return jsonRes({ error: "not_configured" }, 500, cors)
  const ttl = Number(env.LISTENER_PROFILE_TTL_SEC) > 0 ? Number(env.LISTENER_PROFILE_TTL_SEC) : 21600
  // ブラウザ側のキャッシュ。名前やアイコンは頻繁には変わらないので長めでよい
  const ok = { ...cors, "cache-control": `public, max-age=${Math.min(3600, ttl)}, stale-while-revalidate=86400` }

  const hit = await caches.default.match(new Request(CACHE_KEY))
  const cached = hit ? ((await hit.json().catch(() => null)) as Snapshot | null) : null
  if (cached && (Date.now() - cached.storedAt) / 1000 < ttl) return jsonRes(cached, 200, ok)

  try {
    const snap: Snapshot = { storedAt: Date.now(), profiles: await fetchProfiles(env) }
    ctx.waitUntil(
      caches.default.put(
        new Request(CACHE_KEY),
        new Response(JSON.stringify(snap), {
          headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttl + STALE_SEC}` },
        })
      )
    )
    return jsonRes(snap, 200, ok)
  } catch (e) {
    // 上流やD1が落ちていても、前に取れた値があればそれを返す（ページは listeners.json の値でも表示できる）
    if (cached) return jsonRes(cached, 200, ok)
    return jsonRes({ error: "upstream_unavailable", detail: String(e).slice(0, 200) }, 503, {
      ...cors,
      "cache-control": "no-store",
    })
  }
}
