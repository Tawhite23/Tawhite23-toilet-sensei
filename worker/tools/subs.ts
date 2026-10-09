/**
 * リスナーかぶりの集計用: チャンネルの「公開されている登録チャンネル」を取る小さな道具。
 *
 * 本番にはデプロイしない。手元PCから `wrangler dev --remote` でだけ動かし、
 * scripts/build-overlap.py が呼ぶ（YT_API_KEY を手元に置かずに済ませるため。
 * --remote なら本体の Worker に登録済みの secret をそのまま使える）。
 *
 *   POST /subs  { "ids": ["UC...", ...], "maxPages": 4 }
 *   → { "UC...": null | [[チャンネルID, チャンネル名, アイコンURL], ...] }
 *      null = 登録チャンネルを公開していない人（大半はこちら）
 *
 *   POST /channels  { "ids": ["UC...", ...(50件まで)] }
 *   → { "UC...": [チャンネル名, アイコンURL] }
 *
 * 無料プランは1リクエストあたり外部呼び出し50回までなので、呼ぶ側が ids を10件ずつに分ける。
 */
interface Env {
  YT_API_KEY: string
}

type Sub = [string, string, string]

async function publicSubscriptions(env: Env, channelId: string, maxPages: number): Promise<Sub[] | null> {
  const out: Sub[] = []
  let pageToken = ""
  for (let page = 0; page < maxPages; page++) {
    const url = new URL("https://www.googleapis.com/youtube/v3/subscriptions")
    url.searchParams.set("part", "snippet")
    url.searchParams.set("channelId", channelId)
    url.searchParams.set("maxResults", "50")
    if (pageToken) url.searchParams.set("pageToken", pageToken)
    url.searchParams.set("key", env.YT_API_KEY)
    const res = await fetch(url.toString())
    // 403 = 登録チャンネルが非公開 / 404 = チャンネルが無い
    if (res.status === 403 || res.status === 404) return null
    if (!res.ok) throw new Error(`subscriptions HTTP ${res.status}`)
    const data = (await res.json()) as { items?: any[]; nextPageToken?: string }
    for (const it of data.items ?? []) {
      const id = it.snippet?.resourceId?.channelId
      if (id) out.push([id, it.snippet?.title ?? "", String(it.snippet?.thumbnails?.default?.url ?? "").split("=")[0]])
    }
    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }
  return out
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname
    if (req.method === "POST" && path === "/channels") {
      const { ids } = (await req.json()) as { ids: string[] }
      const url = new URL("https://www.googleapis.com/youtube/v3/channels")
      url.searchParams.set("part", "snippet")
      url.searchParams.set("id", ids.slice(0, 50).join(","))
      url.searchParams.set("maxResults", "50")
      url.searchParams.set("key", env.YT_API_KEY)
      const res = await fetch(url.toString())
      if (!res.ok) return Response.json({ error: `channels HTTP ${res.status}` }, { status: 502 })
      const data = (await res.json()) as { items?: any[] }
      return Response.json(
        Object.fromEntries(
          (data.items ?? []).map((c) => [
            c.id,
            [c.snippet?.title ?? "", String(c.snippet?.thumbnails?.default?.url ?? "").split("=")[0]],
          ])
        )
      )
    }
    if (req.method !== "POST" || path !== "/subs") return new Response("not found", { status: 404 })
    const { ids, maxPages = 4 } = (await req.json()) as { ids: string[]; maxPages?: number }
    const result: Record<string, Sub[] | null> = {}
    try {
      for (const id of ids.slice(0, 12)) result[id] = await publicSubscriptions(env, id, Math.min(4, maxPages))
    } catch (e) {
      return Response.json({ error: String(e), partial: result }, { status: 502 })
    }
    return Response.json(result)
  },
}
