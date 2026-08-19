/**
 * Firebase の IDトークン検証（Cloudflare Workers 上で完結させる）。
 *
 * なぜ自前で検証するのか:
 *   チャットはOpenAIの従量課金を伴うため、誰でも叩ける状態にはできない。
 *   サイトは静的なので「ログイン済みかどうか」をサーバで確かめる場所が
 *   Worker しかない。firebase-admin はNode専用で Workers では動かないため、
 *   公開鍵による署名検証だけを WebCrypto で行う。
 *
 * 検証すること（どれか1つでも欠けると、なりすましを許すことになる）:
 *   1. 署名が Google の秘密鍵によるものか（RS256）
 *   2. aud  がこのFirebaseプロジェクトか      … 他プロジェクトのトークン流用を防ぐ
 *   3. iss  が securetoken.google.com/<project> か
 *   4. exp  が未来か（期限切れでないか）
 *   5. sub  が空でないか（UIDとして使う）
 */

/** JWK形式で公開鍵が取れるエンドポイント。
 *  x509版もあるがASN.1の解析が要るのに対し、こちらは importKey('jwk') に直接渡せる。 */
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"

export interface VerifiedUser {
  uid: string
  /** 表示名。プロンプトには使わない（呼び名は本人に入力してもらう方針のため） */
  name?: string
}

type Jwk = JsonWebKey & { kid: string }

// 公開鍵は数時間単位でしか変わらないので、アイソレート内で使い回す。
let jwksCache: { at: number; keys: Map<string, CryptoKey> } | null = null
const JWKS_TTL_MS = 60 * 60 * 1000

async function getKey(kid: string): Promise<CryptoKey | null> {
  if (jwksCache && Date.now() - jwksCache.at < JWKS_TTL_MS) {
    const hit = jwksCache.keys.get(kid)
    if (hit) return hit
  }
  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) return null
  const body = (await res.json()) as { keys: Jwk[] }
  const keys = new Map<string, CryptoKey>()
  for (const jwk of body.keys ?? []) {
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      )
      keys.set(jwk.kid, key)
    } catch {
      // 1つ壊れていても他の鍵で検証できるので握りつぶす
    }
  }
  jwksCache = { at: Date.now(), keys }
  return keys.get(kid) ?? null
}

const b64urlToBytes = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const decodeJson = (part: string): any =>
  JSON.parse(new TextDecoder().decode(b64urlToBytes(part)))

/**
 * IDトークンを検証して UID を返す。検証できなければ null。
 * @param projectId Firebase のプロジェクトID（aud/iss の照合に使う）
 */
export async function verifyIdToken(
  token: string,
  projectId: string
): Promise<VerifiedUser | null> {
  if (!token || !projectId) return null
  const parts = token.split(".")
  if (parts.length !== 3) return null

  let header: any
  let payload: any
  try {
    header = decodeJson(parts[0])
    payload = decodeJson(parts[1])
  } catch {
    return null
  }

  if (header?.alg !== "RS256" || !header?.kid) return null

  // 署名検証より先に安価なチェックを済ませ、無駄な鍵取得を避ける
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload?.exp !== "number" || payload.exp <= now) return null
  if (payload?.aud !== projectId) return null
  if (payload?.iss !== `https://securetoken.google.com/${projectId}`) return null
  if (!payload?.sub || typeof payload.sub !== "string") return null

  const key = await getKey(header.kid)
  if (!key) return null

  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(parts[2]),
    signed
  )
  if (!ok) return null

  return { uid: payload.sub, name: payload.name }
}
