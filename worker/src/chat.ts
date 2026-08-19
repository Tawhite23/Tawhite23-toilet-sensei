/**
 * AIおトイレ先生（RAGチャット）。
 *
 * ■ 仕組み
 *   1. Firebase の IDトークンを検証（誰でも叩けると課金が青天井になるため）
 *   2. 利用回数を確認（1人あたり / サイト全体の両方）
 *   3. 質問文で D1(FTS5) を検索し、関連する実際のセリフを集める ← RAG
 *   4. 口癖・名言・関連セリフを材料に人格を組み立て、LLMへ渡す
 *
 * ■ 費用の考え方
 *   1往復あたりの費用は、詰め込むセリフ件数(RAG_LIMIT)と返答の最大長
 *   (MAX_OUTPUT_TOKENS)で頭打ちにしてある。振れるのは往復回数＝利用者数の方。
 *   そちらは CHAT_DAILY_TOTAL でサイト全体の上限を切り、超えたら
 *   Workers AI(無料)へ自動で切り替える。結果として月額の最大値が確定する。
 *
 * ■ なりすまし防止
 *   本人ではなくAIによる再現であることをシステムプロンプトで明示させ、
 *   本人が言っていないことを事実として断定しないよう指示する。
 */
import type { Env } from "./index"
import { verifyIdToken } from "./auth"

/** RAGで渡す実セリフの件数。増やすほど再現度は上がるが1往復の費用も上がる */
const RAG_LIMIT = 14
/** 返答の最大長。費用の上限を決める要素 */
const MAX_OUTPUT_TOKENS = 320
/** 会話履歴として引き継ぐ往復数 */
const MAX_HISTORY_TURNS = 6
/** 1回の質問の最大文字数 */
const MAX_QUESTION_CHARS = 400

export interface ChatTurn {
  role: "user" | "assistant"
  content: string
}

const jsonRes = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  })

const today = () => new Date().toISOString().slice(0, 10)
const numEnv = (v: string | undefined, d: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : d
}

/**
 * 人格の土台。
 * 実際の口癖と発言だけを材料にし、素の言い回しを勝手に作らせない。
 */
function buildSystemPrompt(opts: {
  nickname?: string
  phrases: string[]
  quotes: string[]
  context: { text: string; date: string; videoId: string; start: number }[]
}) {
  const { nickname, phrases, quotes, context } = opts
  return [
    "あなたはYouTube配信者「おトイレ先生」を再現したAIです。",
    "",
    "【重要な前提】",
    "・あなたは本人ではなく、非公式ファンサイトのAIによる再現です。",
    "・本人が実際に言っていないことを、本人の発言として断定しないでください。",
    "・本人の見解を求められたら「本人に聞いてみて」と促してください。",
    "・誹謗中傷、差別、性的な内容、実在の第三者への攻撃は書かないでください。",
    "",
    "【話し方】",
    "・視聴者を「お前ら」と呼ぶ、フランクでテンションの高い口調です。",
    "・短め（2〜4文）でテンポよく返します。長い説明は好みません。",
    "・敬語は使いません。タメ口で、語尾に「〜わ」「〜だろ」「〜じゃん」などを混ぜます。",
    "・箇条書きや見出しは使いません。話し言葉のまま書いてください。",
    "・一番大事: 説明ではなく「会話」にしてください。相手に質問を投げ返すのも歓迎です。",
    phrases.length ? `・よく使う言い回し: ${phrases.join(" / ")}` : "",
    nickname
      ? `・いま話している相手のことは「${nickname}」と呼んでください。配信での呼び名です。`
      : "・相手の呼び名が分からないときは「お前」「お前ら」で構いません。",
    "",
    "【実際の発言（口調の参考。そのまま繰り返さず、雰囲気だけ真似ること）】",
    ...quotes.map((q) => `・${q}`),
    "",
    context.length
      ? [
          "【質問に関係しそうな過去の配信での発言】",
          "この内容に基づいて答えてください。ここに無いことは推測で断定せず、",
          "「配信では言ってなかったと思う」のように正直に返してください。",
          ...context.map((c) => `・(${c.date}) ${c.text}`),
        ].join("\n")
      : "【参考】関連する過去の発言は見つかりませんでした。無理に事実を作らず、雑談として返してください。",
  ]
    .filter(Boolean)
    .join("\n")
}

/** OpenAI を呼ぶ */
async function callOpenAI(
  env: Env,
  system: string,
  history: ChatTurn[],
  question: string
): Promise<{ text: string; model: string } | null> {
  if (!env.OPENAI_API_KEY) return null
  const model = env.OPENAI_MODEL || "gpt-4o-mini"
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.8,
        messages: [
          { role: "system", content: system },
          ...history,
          { role: "user", content: question },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) return null
    const data: any = await res.json()
    const text = data?.choices?.[0]?.message?.content
    return typeof text === "string" && text.trim() ? { text: text.trim(), model } : null
  } catch {
    return null
  }
}

/** Cloudflare Workers AI を呼ぶ（無料枠。上限超過時と OpenAI 障害時の受け皿） */
async function callWorkersAI(
  env: Env,
  system: string,
  history: ChatTurn[],
  question: string
): Promise<{ text: string; model: string } | null> {
  if (!env.AI) return null
  const model = env.WORKERS_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct"
  try {
    const out: any = await env.AI.run(model, {
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: "system", content: system },
        ...history,
        { role: "user", content: question },
      ],
    })
    const text = out?.response
    return typeof text === "string" && text.trim() ? { text: text.trim(), model } : null
  } catch {
    return null
  }
}

export async function handleChat(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  cors: Record<string, string>,
  tokenizeJa: (s: string) => string[]
): Promise<Response> {
  if (!env.DB) return jsonRes({ error: "db_not_configured" }, 500, cors)
  if (!env.FIREBASE_PROJECT_ID) return jsonRes({ error: "auth_not_configured" }, 500, cors)

  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonRes({ error: "bad_request" }, 400, cors)
  }

  // ---- 1) 認証 -------------------------------------------------------------
  const authz = req.headers.get("Authorization") ?? ""
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : ""
  const user = await verifyIdToken(token, env.FIREBASE_PROJECT_ID)
  if (!user) return jsonRes({ error: "unauthorized" }, 401, cors)

  const question = String(body?.message ?? "").trim().slice(0, MAX_QUESTION_CHARS)
  if (!question) return jsonRes({ error: "empty_message" }, 400, cors)

  const history: ChatTurn[] = Array.isArray(body?.history)
    ? body.history
        .filter((t: any) => (t?.role === "user" || t?.role === "assistant") && t?.content)
        .slice(-MAX_HISTORY_TURNS * 2)
        .map((t: any) => ({ role: t.role, content: String(t.content).slice(0, 600) }))
    : []

  // ---- 2) 利用回数の確認 ---------------------------------------------------
  const day = today()
  const perUser = numEnv(env.CHAT_DAILY_PER_USER, 20)
  const perSite = numEnv(env.CHAT_DAILY_TOTAL, 500)

  const [mine, total] = await Promise.all([
    env.DB.prepare("SELECT count FROM chat_usage WHERE uid = ? AND day = ?")
      .bind(user.uid, day)
      .first<{ count: number }>(),
    env.DB.prepare("SELECT COALESCE(SUM(count),0) AS n FROM chat_usage WHERE day = ?")
      .bind(day)
      .first<{ n: number }>(),
  ])
  const used = mine?.count ?? 0
  if (used >= perUser) {
    return jsonRes(
      { error: "rate_limited", scope: "user", limit: perUser, retryAfter: "明日" },
      429,
      cors
    )
  }
  // サイト全体の上限を超えたら、課金の出るOpenAIは使わず無料側に落とす
  const overBudget = (total?.n ?? 0) >= perSite

  // ---- 3) 呼び名 -----------------------------------------------------------
  const prof = await env.DB.prepare("SELECT nickname FROM chat_profile WHERE uid = ?")
    .bind(user.uid)
    .first<{ nickname: string }>()
  const nickname = (prof?.nickname ?? "").slice(0, 24) || undefined

  // ---- 4) RAG: 質問に関係する実際のセリフを集める --------------------------
  //
  // 2段構えにしている。
  //   1段目: AND で「質問語をすべて含む」発言を探す（精度重視）
  //   2段目: それが少なければ OR で広く拾う（再現率重視）
  // OR だけだと「今日」「です」のような頻出bigramが大量に釣れ、
  // 質問と無関係な発言で文脈が埋まってしまう。まず絞ってから緩める。
  const terms = tokenizeJa(question)
    .map((t) => t.replace(/"/g, "").trim())
    .filter(Boolean)
    .slice(0, 24)

  const search = async (expr: string, limit: number) => {
    try {
      const rows = await env.DB.prepare(
        `SELECT vid, sid, st, txt, ymd FROM segments WHERE segments MATCH ? ORDER BY rank LIMIT ?`
      )
        .bind(expr, limit)
        .all()
      return (rows.results ?? []) as any[]
    } catch {
      // 検索に失敗しても雑談としては成立するので続行する
      return []
    }
  }

  let rows: any[] = []
  if (terms.length) {
    const quoted = terms.map((t) => `"${t}"`)
    rows = await search(quoted.join(" AND "), RAG_LIMIT)
    if (rows.length < 4) {
      const loose = await search(quoted.join(" OR "), RAG_LIMIT)
      // AND の結果を優先しつつ、足りない分を OR で補う
      const seen = new Set(rows.map((r) => `${r.vid}#${r.sid}`))
      for (const r of loose) {
        if (rows.length >= RAG_LIMIT) break
        const k = `${r.vid}#${r.sid}`
        if (!seen.has(k)) {
          seen.add(k)
          rows.push(r)
        }
      }
    }
  }

  const context = rows.map((r) => ({
    text: String(r.txt),
    date: String(r.ymd ?? ""),
    videoId: String(r.vid),
    start: Math.max(0, Math.floor(Number(r.st) || 0)),
  }))

  // 口調の材料（毎回同じにならないよう、名言はランダムに数件選ぶ）
  const quoteRows = await env.DB.prepare(
    "SELECT txt FROM quotes ORDER BY RANDOM() LIMIT 8"
  ).all()
  const quotes = (quoteRows.results ?? []).map((r: any) => String(r.txt))

  const system = buildSystemPrompt({
    nickname,
    phrases: (env.CHAT_PHRASES || "お前ら / マジで / やばい / 笑顔に")
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean),
    quotes,
    context,
  })

  // ---- 5) 生成 -------------------------------------------------------------
  let out = overBudget ? null : await callOpenAI(env, system, history, question)
  if (!out) out = await callWorkersAI(env, system, history, question)
  if (!out) {
    return jsonRes({ error: "generation_failed" }, 503, { ...cors, "cache-control": "no-store" })
  }

  // ---- 6) 記録（応答を待たせないよう裏で書く） -----------------------------
  ctx.waitUntil(
    Promise.all([
      env.DB.prepare(
        `INSERT INTO chat_usage(uid,day,count) VALUES(?,?,1)
         ON CONFLICT(uid,day) DO UPDATE SET count = count + 1`
      )
        .bind(user.uid, day)
        .run(),
      env.DB.prepare(
        `INSERT INTO chat_log(uid,at,question,answer,model) VALUES(?,?,?,?,?)`
      )
        .bind(user.uid, new Date().toISOString(), question, out.text, out.model)
        .run(),
    ]).catch(() => {})
  )

  return jsonRes(
    {
      reply: out.text,
      model: out.model,
      remaining: Math.max(0, perUser - used - 1),
      sources: context.slice(0, 5).map((c) => ({
        text: c.text,
        date: c.date,
        videoId: c.videoId,
        start: c.start,
      })),
    },
    200,
    { ...cors, "cache-control": "no-store" }
  )
}

/**
 * 会話の入口（最初の挨拶＋おすすめ質問）。
 *
 * 空の入力欄をいきなり見せると「何を聞けばいいか分からない」で終わってしまう。
 * キャラクターから先に話しかけ、質問の候補も出して会話を始めやすくする。
 *
 * ★ここではLLMを呼ばない。挨拶は呼び名を差し込んだ定型、質問候補は
 *   実際によく話している配信のタイトルから作る。費用ゼロで毎回変化する。
 */
export async function handleChatIntro(
  req: Request,
  env: Env,
  cors: Record<string, string>
): Promise<Response> {
  if (!env.DB || !env.FIREBASE_PROJECT_ID) {
    return jsonRes({ error: "not_configured" }, 500, cors)
  }
  const authz = req.headers.get("Authorization") ?? ""
  const user = await verifyIdToken(
    authz.startsWith("Bearer ") ? authz.slice(7) : "",
    env.FIREBASE_PROJECT_ID
  )
  if (!user) return jsonRes({ error: "unauthorized" }, 401, cors)

  const prof = await env.DB.prepare("SELECT nickname FROM chat_profile WHERE uid = ?")
    .bind(user.uid)
    .first<{ nickname: string }>()
  const nick = (prof?.nickname ?? "").trim().slice(0, 24)

  const day = today()
  const mine = await env.DB.prepare("SELECT count FROM chat_usage WHERE uid = ? AND day = ?")
    .bind(user.uid, day)
    .first<{ count: number }>()
  const perUser = numEnv(env.CHAT_DAILY_PER_USER, 20)
  const used = mine?.count ?? 0

  // 挨拶。呼び名が登録されていれば必ず使う（キャラぷの「呼び方」に相当）
  const greetings = nick
    ? [
        `お、${nick}じゃん。今日は何の話する？`,
        `${nick}きたか。なんか聞きたいことある？`,
        `よー${nick}。暇なら喋ってくわ。`,
      ]
    : [
        "お、来たか。何の話する？",
        "よー。なんか聞きたいことあるか？",
        "暇なら喋ってくわ。何でも聞いてくれ。",
      ]
  const greeting = greetings[Math.floor(Math.random() * greetings.length)]

  // おすすめ質問。
  // 定番の3つに加え、実際の名言から1つ話題を作る。
  // 実発言が元なので必ずRAGで拾える＝「知らない」と返される空振りが起きにくい。
  const suggestions = [
    "最近の配信どうだった？",
    "マイクラで一番やばかったことは？",
    "お前らに一言くれ",
  ]
  try {
    const q = await env.DB.prepare(
      // 短すぎ・長すぎは話題として扱いにくいので、ほどよい長さのものを選ぶ
      `SELECT txt FROM quotes WHERE length(txt) BETWEEN 10 AND 28 ORDER BY RANDOM() LIMIT 1`
    ).first<{ txt: string }>()
    if (q?.txt) suggestions.push(`「${q.txt}」ってどういうこと？`)
  } catch {
    // 取れなくても定番の3つで成立する
  }

  return jsonRes(
    { greeting, suggestions, nickname: nick, remaining: Math.max(0, perUser - used) },
    200,
    { ...cors, "cache-control": "no-store" }
  )
}

/** 呼び名の保存 */
export async function handleChatProfile(
  req: Request,
  env: Env,
  cors: Record<string, string>
): Promise<Response> {
  if (!env.DB || !env.FIREBASE_PROJECT_ID) {
    return jsonRes({ error: "not_configured" }, 500, cors)
  }
  const authz = req.headers.get("Authorization") ?? ""
  const user = await verifyIdToken(
    authz.startsWith("Bearer ") ? authz.slice(7) : "",
    env.FIREBASE_PROJECT_ID
  )
  if (!user) return jsonRes({ error: "unauthorized" }, 401, cors)

  if (req.method === "GET") {
    const row = await env.DB.prepare("SELECT nickname FROM chat_profile WHERE uid = ?")
      .bind(user.uid)
      .first<{ nickname: string }>()
    return jsonRes({ nickname: row?.nickname ?? "" }, 200, { ...cors, "cache-control": "no-store" })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonRes({ error: "bad_request" }, 400, cors)
  }
  const nickname = String(body?.nickname ?? "").trim().slice(0, 24)
  await env.DB.prepare(
    `INSERT INTO chat_profile(uid,nickname,at) VALUES(?,?,?)
     ON CONFLICT(uid) DO UPDATE SET nickname = excluded.nickname, at = excluded.at`
  )
    .bind(user.uid, nickname, new Date().toISOString())
    .run()
  return jsonRes({ nickname }, 200, { ...cors, "cache-control": "no-store" })
}
