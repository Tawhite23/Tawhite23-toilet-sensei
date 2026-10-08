import type { Listener, ListenersFile, ListenerSeason, StreamCategory } from "./types"

// リスナー名鑑（名鑑 / ランキング / 日報）で共有する集計と表示の小物。
// listeners.json は「誰がどの回に何件コメントしたか」だけを持ち、
// シーズン別の順位や称号などの見せ方はここ（ブラウザ側）で作る。
// 見せ方を変えるたびに手元PCで集計し直さなくて済むようにするため。

export const num = (n: number) => n.toLocaleString("ja-JP")

/** 分 → "1:05"（配信の長さ・開始からの時刻） */
export const fmtMin = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`

/** 配信の種類ごとのタグ色（テーマのCSS変数に追従） */
export const CATEGORY_CLASS: Record<StreamCategory, string> = {
  マイクラ: "border-plan text-plan",
  マリカ: "border-saturday text-saturday",
  参加型: "border-accent-warm text-accent-warm",
  "雑談・その他": "border-base-700 text-ink-dim",
}

/** 「自分の記録」として登録したリスナーのキー（この端末のブラウザにだけ保存する） */
const ME_KEY = "listener:me"
export function loadMe(): string | null {
  try {
    return localStorage.getItem(ME_KEY)
  } catch {
    return null
  }
}
export function saveMe(key: string | null) {
  try {
    if (key) localStorage.setItem(ME_KEY, key)
    else localStorage.removeItem(ME_KEY)
  } catch {
    // 保存できない環境（プライベートブラウズ等）では登録なしのまま使える
  }
}

/** いまが何シーズンか（scripts/build-listeners.py の season_of と同じ数え方） */
export function currentSeasonKey(now = new Date()): string {
  // 配信の日付はJSTで数えているので、閲覧者のタイムゾーンに関係なくJSTでそろえる
  const jst = new Date(now.getTime() + 9 * 3600 * 1000)
  let y = jst.getUTCFullYear()
  const m = jst.getUTCMonth() + 1
  const start = m === 12 || m <= 2 ? 12 : Math.floor((m - 3) / 3) * 3 + 3
  if (m <= 2) y -= 1
  return `${y}-${String(start).padStart(2, "0")}`
}

export interface RangeStat {
  listener: Listener
  attend: number
  comments: number
  /** この期間の配信のうち来た割合(%) */
  rate: number
  /** この期間の中での最長の連続出席 */
  best: number
  /** この期間に初めて来た */
  rookie: boolean
}

/** 配信の添字 from〜to の範囲だけで数え直す（シーズン別ランキング用） */
export function rangeStats(listeners: Listener[], from: number, to: number): RangeStat[] {
  const total = to - from + 1
  const out: RangeStat[] = []
  for (const l of listeners) {
    let attend = 0
    let comments = 0
    let best = 0
    let run = 0
    let prev = -2
    for (const [i, c] of l.att) {
      if (i < from || i > to) continue
      attend++
      comments += c
      run = i === prev + 1 ? run + 1 : 1
      if (run > best) best = run
      prev = i
    }
    if (!attend) continue
    const first = l.att[0][0]
    out.push({
      listener: l,
      attend,
      comments,
      best,
      rate: Math.round((attend / total) * 100),
      rookie: first >= from && first <= to,
    })
  }
  return out
}

/** 称号。数字の羅列だけだと自分の記録を見る楽しみが薄いので、節目に名前とアイコンを付ける */
export interface ListenerTitle {
  id: string
  icon: string
  label: string
  /** どうすると付くか */
  rule: string
  /** この人の実際の数字 */
  detail: string
}
export function titlesOf(l: Listener, data: ListenersFile): ListenerTitle[] {
  const n = data.streams.length
  const out: ListenerTitle[] = []
  const tier = ([[300, "👑"], [200, "🥇"], [100, "🥈"], [50, "🥉"]] as const).find(([t]) => l.attend >= t)
  if (tier)
    out.push({
      id: "attend",
      icon: tier[1],
      label: `出席${tier[0]}回`,
      rule: "コメントした配信が50回・100回・200回・300回を超えると付きます。",
      detail: `これまでの出席は ${l.attend}回です。`,
    })
  if (l.rate >= 80 && l.attend >= 20)
    out.push({
      id: "kaikin",
      icon: "💮",
      label: "ほぼ皆勤",
      rule: "初めて来た回から後の配信の80%以上に出席していると付きます（20回以上来た人）。",
      detail: `出席率は ${l.rate}%です。`,
    })
  if (l.streak >= 5)
    out.push({
      id: "streak",
      icon: "🔥",
      label: `${l.streak}連続出席中`,
      rule: "最新の配信まで5回以上続けて出席していると付きます。1回休むと消えます。",
      detail: `いま ${l.streak}回連続・これまでの最長は ${l.best}回連続です。`,
    })
  if (l.comments / l.attend >= 30)
    out.push({
      id: "comment",
      icon: "💬",
      label: "コメント職人",
      rule: "1回の配信あたり平均30件以上コメントしていると付きます。",
      detail: `1回あたり ${Math.round((l.comments / l.attend) * 10) / 10}件・合計 ${num(l.comments)}件です。`,
    })
  const first = l.att[0][0]
  const last = data.seasons.at(-1)
  if (last && first >= last.from)
    out.push({
      id: "rookie",
      icon: "🌱",
      label: "ルーキー",
      rule: "いまのシーズンに初めて来た人に付きます。",
      detail: `初めて来た日は ${data.streams[first].date}です。`,
    })
  else if (first < n * 0.1)
    out.push({
      id: "kosan",
      icon: "🏛️",
      label: "古参",
      rule: "集計している配信のうち、最初の1割のころから来ている人に付きます。",
      detail: `初めて来た日は ${data.streams[first].date}です。`,
    })
  return out
}

/** よく来る配信の種類も、称号と同じ形で詳しく見られるようにする */
const CATEGORY_ICON: Record<StreamCategory, string> = { マイクラ: "⛏️", マリカ: "🏎️", 参加型: "🙌", "雑談・その他": "🗣️" }
export function favTitle(l: Listener, data: ListenersFile): ListenerTitle {
  const count = l.att.filter(([i]) => data.streams[i].cat === l.fav).length
  return {
    id: "fav",
    icon: CATEGORY_ICON[l.fav],
    label: l.fav,
    rule: "いちばん多く出席している配信の種類です。",
    detail: `出席 ${l.attend}回のうち ${count}回が「${l.fav}」の配信です。`,
  }
}

// ---- 出席カレンダー（1日1マス。GitHubの草と同じ並び: 縦が日〜土、横が週） ----

export interface DayCell {
  date: string // YYYY-MM-DD
  /** その日の配信（streams の添字）。空なら配信のなかった日 */
  streams: number[]
  /** その日のコメント数の合計（出席していなければ0） */
  comments: number
  /** 色の濃さ 0=欠席 1〜4=出席（その人のコメント数の中での多さ） */
  level: 0 | 1 | 2 | 3 | 4
}
export type CalendarRange = { kind: "recent" } | { kind: "year"; year: number }

const ymd = (d: Date) => d.toISOString().slice(0, 10)

/**
 * 出席カレンダーの中身。週ごとの列の配列（各列は日曜はじまりで最大7日。範囲外の日は null）。
 * recent は「最新の配信の日まで」の53週。更新が止まっていても右端が空白だらけにならない。
 */
export function attendanceCalendar(l: Listener, data: ListenersFile, range: CalendarRange): (DayCell | null)[][] {
  const byDate = new Map<string, number[]>()
  data.streams.forEach((s, i) => {
    const arr = byDate.get(s.date)
    if (arr) arr.push(i)
    else byDate.set(s.date, [i])
  })
  const mine = new Map<number, number>(l.att)

  let start: Date
  let end: Date
  if (range.kind === "year") {
    start = new Date(Date.UTC(range.year, 0, 1))
    end = new Date(Date.UTC(range.year, 11, 31))
  } else {
    end = new Date(`${data.streams[data.streams.length - 1].date}T00:00:00Z`)
    start = new Date(end.getTime() - (52 * 7 + end.getUTCDay()) * 86400000)
  }

  // 濃さは、その人が出席した日のコメント数を4段階に分けて決める（人によって件数の桁が違うため）
  const counts = [...byDate.values()]
    .map((idxs) => idxs.reduce((a, i) => a + (mine.get(i) ?? 0), 0))
    .filter((c) => c > 0)
    .sort((a, b) => a - b)
  const q = (p: number) => counts[Math.min(counts.length - 1, Math.floor(counts.length * p))] ?? 0
  const cuts = [q(0.25), q(0.5), q(0.75)]

  const weeks: (DayCell | null)[][] = []
  let week: (DayCell | null)[] = Array(start.getUTCDay()).fill(null)
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const date = ymd(new Date(t))
    const streams = byDate.get(date) ?? []
    const comments = streams.reduce((a, i) => a + (mine.get(i) ?? 0), 0)
    const level = comments === 0 ? 0 : comments <= cuts[0] ? 1 : comments <= cuts[1] ? 2 : comments <= cuts[2] ? 3 : 4
    week.push({ date, streams, comments, level })
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length) weeks.push(week)
  return weeks
}

// ---- 配信のタグ（日報用。どんな回だったかをひと目で） ----

export interface StreamTag {
  icon: string
  label: string
}
export function streamTags(data: ListenersFile, index: number): StreamTag[] {
  const s = data.streams[index]
  const out: StreamTag[] = []
  const hour = Number(s.start.slice(0, 2))
  if (/参加型/.test(s.title) && s.cat !== "参加型") out.push({ icon: "🙌", label: "参加型" })
  if (/耐久/.test(s.title)) out.push({ icon: "⏳", label: "耐久" })
  if (s.min >= 300) out.push({ icon: "🕰️", label: "長時間" })
  if (hour >= 5 && hour < 11) out.push({ icon: "🌅", label: "朝配信" })
  else if (hour < 5) out.push({ icon: "🌙", label: "深夜配信" })
  // その季節の中で比べる（時期によってチャットの人数が違うため）
  const season = data.seasons.find((se) => index >= se.from && index <= se.to)
  if (season) {
    const peers = data.streams.slice(season.from, season.to + 1)
    const top = (v: (x: typeof s) => number) => {
      const sorted = peers.map(v).sort((a, b) => b - a)
      return sorted[Math.max(0, Math.floor(sorted.length * 0.1) - 1)]
    }
    if (peers.length >= 10) {
      if (s.chatters >= top((x) => x.chatters)) out.push({ icon: "🎉", label: "大にぎわい" })
      if (s.comments / s.min >= top((x) => x.comments / x.min)) out.push({ icon: "⚡", label: "コメント多め" })
    }
  }
  if (s.first !== null && s.first >= 3) out.push({ icon: "👋", label: "初めての人が多い" })
  return out
}

/** その配信に来た人（日報用）。コメントの多い順。初めて来た回かどうかも返す */
export function attendees(data: ListenersFile, streamIndex: number): { listener: Listener; count: number; first: boolean }[] {
  const out: { listener: Listener; count: number; first: boolean }[] = []
  for (const l of data.listeners) {
    // att は古い順に並んでいるので二分探索で引く（日報は何十回ぶんも一度に描くため）
    let lo = 0
    let hi = l.att.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const i = l.att[mid][0]
      if (i === streamIndex) {
        out.push({ listener: l, count: l.att[mid][1], first: mid === 0 })
        break
      }
      if (i < streamIndex) lo = mid + 1
      else hi = mid - 1
    }
  }
  return out.sort((a, b) => b.count - a.count)
}

/** よく同じ配信にいる人（同じ回にコメントした回数の上位） */
export function companions(l: Listener, data: ListenersFile, limit = 5): { listener: Listener; count: number }[] {
  const came = new Set(l.att.map(([i]) => i))
  const out: { listener: Listener; count: number }[] = []
  for (const o of data.listeners) {
    if (o.key === l.key) continue
    let count = 0
    for (const [i] of o.att) if (came.has(i)) count++
    if (count >= 3) out.push({ listener: o, count })
  }
  return out.sort((a, b) => b.count - a.count).slice(0, limit)
}

export const seasonLabel = (s: ListenerSeason) => `${s.label}（${s.months}）`
