"use client"

/**
 * リアルタイム配信ステータスの取得クライアント。
 *
 * ■ 課題
 *   「APIがリアルタイム性の課題とならないように」= 更新を速くしつつ、
 *   閲覧者が増えても上流(YouTube Data API)の呼び出しが増えないようにする。
 *
 * ■ 対策(サーバ側)
 *   worker/src/index.ts が TTL ごとに1回だけ上流を叩き、Cache API に載せた
 *   1本のスナップショットを全閲覧者に配る。閲覧者数と API 消費が連動しない。
 *
 * ■ 対策(このファイル / クライアント側)
 *   1. ページ内に何個コンポーネントがあってもポーリングは1本に束ねる
 *   2. localStorage に短期キャッシュを置き、ページ遷移直後の再取得を省く
 *   3. タブが非表示の間はポーリングしない(visibilitychange)
 *   4. 開きっぱなしのタブを想定し、12時間で自動停止する
 *   5. ポーリング間隔はサーバ(/api/config)から受け取る = 再デプロイ無しで変えられる
 *   6. Worker 未デプロイ / 到達不能なら従来の live.json へ自動フォールバック
 */

import { fetchLive } from "./data"
import { site } from "./site.config"
import type { LiveNow, LiveRuntimeConfig } from "./types"

const CACHE_KEY = "otoile_live_snapshot"
/** localStorage キャッシュの有効期限。ポーリング間隔より短くする */
const CACHE_TTL_MS = 45_000
/** 開きっぱなしのタブを永久にポーリングさせない */
const MAX_SESSION_MS = 12 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 8_000
/** タブ復帰時の再取得デバウンス(切り替え連打で叩かないため) */
const VISIBILITY_DEBOUNCE_MS = 900

const DEFAULT_CONFIG: LiveRuntimeConfig = {
  disabled: false,
  livePollMs: 60_000,
  idlePollMs: 300_000,
}

// ---------------------------------------------------------------------------
// ストア(モジュールスコープ = ページ内で共有)
// ---------------------------------------------------------------------------

export interface LiveState {
  data: LiveNow | null
  /** 初回取得が終わったか */
  loaded: boolean
}

let state: LiveState = { data: null, loaded: false }
const listeners = new Set<() => void>()

function setState(next: LiveState) {
  state = next
  listeners.forEach((l) => l())
}

const getSnapshot = () => state
const SERVER_STATE: LiveState = { data: null, loaded: false }
const getServerSnapshot = () => SERVER_STATE

// ---------------------------------------------------------------------------
// localStorage キャッシュ
// ---------------------------------------------------------------------------

function readCache(): LiveNow | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { at, value } = JSON.parse(raw) as { at: number; value: LiveNow }
    if (Date.now() - at > CACHE_TTL_MS) return null
    return value
  } catch {
    return null
  }
}

function writeCache(value: LiveNow) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), value }))
  } catch {
    // プライベートモード等で書けないことがある。キャッシュは無くても動く
  }
}

// ---------------------------------------------------------------------------
// 取得
// ---------------------------------------------------------------------------

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** live.json 経由のフォールバック。Worker 未設定でも従来通り動かすための保険 */
async function fetchFallback(): Promise<LiveNow | null> {
  const l = await fetchLive()
  if (!l) return null
  return {
    isLive: !!l.isLive,
    videoId: l.videoId,
    title: l.title,
    viewerCount: null, // live.json は同接を持っていない
    startedAt: l.startedAt,
    thumbnail: null,
    subscriberCount: null,
    viewCount: null,
    checkedAt: l.checkedAt,
    source: "fallback",
  }
}

let inflight: Promise<LiveNow | null> | null = null

/** 同時に複数箇所から呼ばれても1リクエストに束ねる */
function fetchSnapshot(): Promise<LiveNow | null> {
  if (inflight) return inflight
  const base = site.liveApiBaseUrl?.replace(/\/$/, "")
  inflight = (async () => {
    if (base) {
      const snap = await getJson<LiveNow>(`${base}/api/live`)
      if (snap && typeof snap.isLive === "boolean") return snap
    }
    return fetchFallback()
  })().finally(() => {
    inflight = null
  })
  return inflight
}

// ---------------------------------------------------------------------------
// ポーリングループ
// ---------------------------------------------------------------------------

let refCount = 0
let timer: ReturnType<typeof setTimeout> | null = null
let visibilityTimer: ReturnType<typeof setTimeout> | null = null
let startedAtMs = 0
let config: LiveRuntimeConfig = DEFAULT_CONFIG
let configLoaded = false
let lastFetchAtMs = 0

async function loadConfig() {
  if (configLoaded) return
  configLoaded = true
  const base = site.liveApiBaseUrl?.replace(/\/$/, "")
  if (!base) return
  const c = await getJson<Partial<LiveRuntimeConfig>>(`${base}/api/config`)
  if (!c) return
  config = {
    disabled: !!c.disabled,
    livePollMs: Number(c.livePollMs) || DEFAULT_CONFIG.livePollMs,
    idlePollMs: Number(c.idlePollMs) || DEFAULT_CONFIG.idlePollMs,
  }
}

/** 次回までの待ち時間。配信中は短く、非配信中は長く */
function nextDelay(): number {
  return state.data?.isLive ? config.livePollMs : config.idlePollMs
}

/**
 * @param force マウント直後の初回取得。停止条件を無視して1回だけ取りに行く
 *   （ポーリングが止まっていても「今この瞬間の状態」は出したいため）
 */
async function tick(force = false) {
  timer = null
  if (refCount === 0) return

  if (!force) {
    // 12時間で自動停止(開きっぱなしのタブ対策)
    if (Date.now() - startedAtMs > MAX_SESSION_MS) return
    // サーバ側の緊急ブレーキ
    if (config.disabled) return
    // 非表示タブは叩かない。復帰時に visibilitychange 側が拾う
    if (document.visibilityState !== "visible") {
      schedule(nextDelay())
      return
    }
  }

  lastFetchAtMs = Date.now()
  const snap = await fetchSnapshot()
  if (snap) {
    writeCache(snap)
    setState({ data: snap, loaded: true })
  } else if (!state.loaded) {
    setState({ data: null, loaded: true })
  }

  if (refCount > 0 && !config.disabled) schedule(nextDelay())
}

function schedule(delayMs: number) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(tick, delayMs)
}

function onVisibilityChange() {
  if (document.visibilityState !== "visible") return
  if (refCount === 0 || config.disabled) return
  if (Date.now() - startedAtMs > MAX_SESSION_MS) return
  // 直近に取得済みなら叩き直さない
  if (Date.now() - lastFetchAtMs < nextDelay()) return
  if (visibilityTimer) clearTimeout(visibilityTimer)
  visibilityTimer = setTimeout(() => {
    if (timer) clearTimeout(timer)
    void tick()
  }, VISIBILITY_DEBOUNCE_MS)
}

function start() {
  refCount += 1
  if (refCount > 1) return

  startedAtMs = Date.now()
  document.addEventListener("visibilitychange", onVisibilityChange)

  // まずキャッシュで即描画してから、設定を読んで実取得に入る
  const cached = readCache()
  if (cached) setState({ data: cached, loaded: true })

  void loadConfig().then(() => {
    if (refCount === 0) return
    // disabled でも初回の1回だけは取りに行く。以降 tick() は自分で止まる
    void tick(true)
  })
}

function stop() {
  refCount = Math.max(0, refCount - 1)
  if (refCount > 0) return
  if (timer) clearTimeout(timer)
  if (visibilityTimer) clearTimeout(visibilityTimer)
  timer = null
  visibilityTimer = null
  document.removeEventListener("visibilitychange", onVisibilityChange)
}

export const liveStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    start()
    return () => {
      listeners.delete(listener)
      stop()
    }
  },
  getSnapshot,
  getServerSnapshot,
}

/** 配信開始からの経過時間を「1時間23分」形式にする */
export function elapsedLabel(startedAt: string | null, nowMs: number): string | null {
  if (!startedAt) return null
  const start = Date.parse(startedAt)
  if (Number.isNaN(start)) return null
  const sec = Math.max(0, Math.floor((nowMs - start) / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}時間${m}分` : `${m}分`
}
