// public/data/wiki.json 生成（WIKI「これまでの歩み」の自動更新）
//
// YouTube Data API は呼ばない（0u）。既存の公開JSONだけを入力にする。
//   入力: public/data/contents.json … 現存する配信/動画の一覧
//         public/data/report.json   … 月次の登録者/再生数スナップショット
//         scripts/wiki-fixed.json   … 手で書く確定イベント（チャンネル開設日など）
//         public/data/wiki.json     … 前回の出力（記録済みマイルストーンの保持）
//   出力: public/data/wiki.json
//
// 自動で拾うもの:
//   1) 現存する最古の配信 / 最古の参加型マイクラ配信 / 初の動画投稿
//      （タイトルの #N から「それ以前は非公開または削除済み」と注記する）
//   2) 登録者数・総再生数の「最上位桁が繰り上がった」タイミング
//      例: 300人 → 400人 / 10万再生 → 20万再生
//      桁の刻み幅は step = 10^floor(log10(n))。339人なら100刻み、
//      110175回なら100000刻み。つまり n が 400/200000 に届いた日に1件追加される。
//   3) 最下部にKEEPされる「現在」エントリ（最新の登録者数と総再生数）
//
// 一度記録したマイルストーンは日付ごと保持する（後から日付が動かない）。
import { readFile, writeFile, mkdir } from "node:fs/promises"

const DATA = "public/data"
const OUT = `${DATA}/wiki.json`
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

const readJson = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(p, "utf8"))
  } catch {
    return fallback
  }
}

const pad = (n) => String(n).padStart(2, "0")
/** ISO(UTC) → JSTの YYYY-MM-DD */
const jstDate = (iso) => {
  const d = new Date(new Date(iso).getTime() + JST_OFFSET_MS)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** 最上位桁の刻み幅で切り下げた「達成済みマイルストーン」 */
export function milestoneOf(n) {
  if (!Number.isFinite(n) || n < 10) return 0
  const step = 10 ** Math.floor(Math.log10(n))
  return Math.floor(n / step) * step
}

/** 日本語の読みやすい単位（10万 / 1.2万 / 3400 など） */
function jaNum(n) {
  if (n >= 10000) {
    const man = n / 10000
    const s = Number.isInteger(man) ? String(man) : man.toFixed(1).replace(/\.0$/, "")
    return `${s}万`
  }
  return n.toLocaleString("ja-JP")
}

// ---------------------------------------------------------------- 入力
const contents = await readJson(`${DATA}/contents.json`, [])
const report = await readJson(`${DATA}/report.json`, {})
const fixed = await readJson("scripts/wiki-fixed.json", [])
const prev = await readJson(OUT, { entries: [] })
const prevById = new Map((prev.entries ?? []).map((e) => [e.id, e]))

const aired = contents
  .filter((c) => c && c.date && c.status !== "upcoming")
  .sort((a, b) => a.date.localeCompare(b.date))

const entries = []
/** 既に記録済みなら日付をそのまま引き継ぐ（履歴が後から動かないように） */
const push = (e) => {
  const old = prevById.get(e.id)
  entries.push(old ? { ...e, date: old.date ?? e.date, firstSeenAt: old.firstSeenAt } : { ...e, firstSeenAt: new Date().toISOString() })
}

// 1) 手書きの確定イベント
for (const f of fixed) {
  if (!f?.id || !f?.date || !f?.event) continue
  entries.push({ kind: "fixed", ...f })
}

// 2) 現存する最古のコンテンツ（削除・非公開があるため「残っている限り」の初回）
const firstLive = aired.find((c) => c.type === "live")
if (firstLive) {
  push({
    id: "first-live",
    kind: "auto",
    date: jstDate(firstLive.date),
    event: "現存する最も古い配信",
    detail: `「${firstLive.title}」。これより前の配信は非公開または削除済みのため確認できません。`,
    videoId: firstLive.videoId,
  })
}

// 参加型マイクラ（タイトル表記の揺れを吸収して判定）
const isMinecraftSanka = (t = "") =>
  /マイクラ|マインクラフト|minecraft/i.test(t) && /参加型/.test(t)
const firstMc = aired.find((c) => c.type === "live" && isMinecraftSanka(c.title))
if (firstMc) {
  const num = firstMc.title.match(/#\s*(\d+)/)
  const detail = num
    ? `「${firstMc.title}」。タイトルが#${num[1]}であることから、#1〜#${Number(num[1]) - 1}は非公開または削除済みと推測されます。`
    : `「${firstMc.title}」。これより前の回は非公開または削除済みのため確認できません。`
  push({
    id: "first-minecraft-sanka",
    kind: "auto",
    date: jstDate(firstMc.date),
    event: "現存する最も古い参加型マイクラ配信",
    detail,
    videoId: firstMc.videoId,
  })
}

const firstVideo = aired.find((c) => c.type === "video")
if (firstVideo) {
  push({
    id: "first-video",
    kind: "auto",
    date: jstDate(firstVideo.date),
    event: "現存する最も古い動画投稿",
    detail: `「${firstVideo.title}」`,
    videoId: firstVideo.videoId,
  })
}

// 3) 登録者・再生数のマイルストーン
//    月次スナップショット（report.json）を古い順に見て、
//    最上位桁が繰り上がった時点を1件ずつ記録する。
const months = Object.keys(report).sort()
const METRICS = [
  { key: "subscriberCount", id: "subs", label: "チャンネル登録者", unit: "人" },
  { key: "viewCount", id: "views", label: "総再生数", unit: "回" },
]

const todayJst = jstDate(new Date().toISOString())
const thisYm = todayJst.slice(0, 7)

const milestoneEntries = []
for (const m of METRICS) {
  // 過去に記録したマイルストーンは必ずそのまま残す（日付も文面も動かさない）
  const kept = (prev.entries ?? []).filter(
    (e) => e.kind === "milestone" && e.metric === m.id && typeof e.value === "number"
  )
  milestoneEntries.push(...kept)
  let last = kept.reduce((a, e) => Math.max(a, e.value), 0)
  // 初回実行時は「すでに達成済みの分」をまとめて埋めるだけなので、
  // 到達日は分からない = おおよその日付として扱う（嘘の日付を載せない）。
  const backfill = kept.length === 0

  // 記録済みの最大値を超えたぶんだけ新規追加する
  for (const ym of months) {
    const v = report[ym]?.[m.key]
    if (v == null) continue
    const ms = milestoneOf(Number(v))
    if (ms <= 0 || ms <= last) continue
    last = ms
    // 当月に検出したものは「検出した日」= 到達日にほぼ一致（日次実行のため）。
    // 過去月ぶん・初回まとめ記録は月初日に置き、おおよその日付であることを approx で示す。
    const isThisMonth = ym === thisYm && !backfill
    milestoneEntries.push({
      id: `${m.id}-${ms}`,
      kind: "milestone",
      metric: m.id,
      value: ms,
      date: isThisMonth ? todayJst : `${ym}-01`,
      approx: !isThisMonth,
      event: `${m.label} ${jaNum(ms)}${m.unit} 達成`,
      detail: isThisMonth
        ? `${m.label}の最上位桁が繰り上がりました。`
        : backfill
          ? `記録開始(${ym})時点で既に到達していました。正確な到達日は不明です。`
          : `月次スナップショット(${ym})で到達を確認。${m.label}の最上位桁が繰り上がりました。`,
      firstSeenAt: new Date().toISOString(),
    })
  }
}
entries.push(...milestoneEntries)

// 4) 「現在」用の最新値（最下部にKEEPされる。report.jsonの最新の非nullを使う）
let current = null
for (const ym of [...months].reverse()) {
  const r = report[ym]
  if (r && (r.subscriberCount != null || r.viewCount != null)) {
    current = {
      ym,
      subscriberCount: r.subscriberCount ?? null,
      viewCount: r.viewCount ?? null,
    }
    break
  }
}

entries.sort((a, b) => String(a.date).localeCompare(String(b.date)))

const out = {
  version: 1,
  generatedAt: new Date().toISOString(),
  current,
  entries,
}

await mkdir(DATA, { recursive: true })
await writeFile(OUT, JSON.stringify(out, null, 2))
console.log(
  `wiki.json: ${entries.length}件 (マイルストーン ${milestoneEntries.length}件) 現在=登録者${current?.subscriberCount ?? "-"} 再生${current?.viewCount ?? "-"}`
)
