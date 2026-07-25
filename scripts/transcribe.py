#!/usr/bin/env python3
"""
配信アーカイブのセリフ文字起こし CLI（YouTube Data API は一切呼ばない = 追加クォータ 0u）

処理の流れ:
  1) 対象videoIdを決める
     - バッチ: public/data/contents.json の type="live" かつ status!="upcoming" のうち
               manifest.json 未登録・exclude.txt 未記載のものを新しい順に --max 本
     - 単体:   --video-id で指定（--force で再処理）
  2) yt-dlp で字幕(timedtext/json3)を取得できればそれを使う（高速・時刻付き）
  3) 字幕が無ければ yt-dlp で音声のみDL → faster-whisper(日本語・語単位タイムスタンプ)
  4) 語(word)列 → セリフ(segment)へ整形（1〜2文。40文字超 or 8秒超のときのみ句読点/無音で分割）
  5) public/data/transcripts/<videoId>.json と manifest.json を更新
  6) 音声ファイルは一時ディレクトリに置き、処理後に必ず破棄する

YouTubeのボット判定について:
  GitHub Actions のIPは "Sign in to confirm you're not a bot" で弾かれることがある。
  対策として (a) ボット判定を受けにくい player_client を順に試行、
  (b) 環境変数 YT_COOKIES_FILE / YT_COOKIES_BROWSER で Cookie を渡せる、
  (c) 連続失敗した動画は failures.json に記録して毎日の無駄な再試行を避ける。
  それでもCIで取得できない場合は、手元PCで実行して生成物をコミットするのが確実。

ローカル実行例:
  python scripts/transcribe.py --max 2
  python scripts/transcribe.py --video-id XXXXXXXXXXX --force
  python scripts/transcribe.py --video-id XXXXXXXXXXX --whisper-model medium
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = Path(__file__).resolve().parent
DATA = ROOT / "public" / "data"
TRANSCRIPT_DIR = DATA / "transcripts"
MANIFEST = TRANSCRIPT_DIR / "manifest.json"
SKIPPED = TRANSCRIPT_DIR / "skipped.json"
FAILURES = TRANSCRIPT_DIR / "failures.json"
CONTENTS = DATA / "contents.json"
EXCLUDE = SCRIPTS / "exclude.txt"

# セリフ整形のしきい値（指示: 40文字超 or 8秒超のときのみ分割）
MAX_CHARS = 40
MAX_SEC = 8.0
GAP_SEC = 0.7          # これ以上の語間ギャップは無音として分割候補にする
SENT_END = "。．！？!?"  # 文末記号
SOFT_BREAK = "、，,"     # 文中の分割候補


# ---------------------------------------------------------------- utilities
def log(msg: str) -> None:
    print(f"[transcribe] {msg}", flush=True)


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_id_list(path: Path) -> set:
    """1行1videoId のテキスト（# 以降はコメント）を読む。"""
    if not path.exists():
        return set()
    ids = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if line:
            ids.add(line)
    return ids


def run(cmd: list, retries: int = 3, timeout: int = 5400) -> subprocess.CompletedProcess:
    """コマンドをリトライ付きで実行する。"""
    for attempt in range(1, retries + 1):
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            if proc.returncode == 0:
                return proc
            log(f"command failed (attempt {attempt}/{retries}): {proc.stderr.strip()[:400]}")
        except subprocess.TimeoutExpired:
            log(f"command timeout (attempt {attempt}/{retries})")
        if attempt < retries:
            time.sleep(random.uniform(5, 15) * attempt)
    raise RuntimeError(f"command failed after {retries} attempts: {' '.join(cmd[:5])}")


# ---------------------------------------------------------------- yt-dlp 実行
# GitHub Actions のデータセンターIPからのアクセスは YouTube のボット判定
# （"Sign in to confirm you're not a bot"）で弾かれることがある。
# 対策として、ボット判定を受けにくい player_client を順に試す。
# 環境変数 YTDLP_PLAYER_CLIENTS で順序を上書きできる（例: "tv,android_vr,default"）。
DEFAULT_CLIENTS = ["android_vr", "tv", "mweb", "web_safari", "default"]
BOT_HINTS = ("not a bot", "sign in to confirm", "confirm you", "cookies")


def player_clients() -> list:
    raw = os.environ.get("YTDLP_PLAYER_CLIENTS", "").strip()
    if raw:
        return [c.strip() for c in raw.split(",") if c.strip()]
    return DEFAULT_CLIENTS


def cookie_args() -> list:
    """
    Cookie の指定（任意）。
      YT_COOKIES_FILE   : Netscape形式 cookies.txt のパス（CI: Secretから生成）
      YT_COOKIES_BROWSER: ローカル実行時のブラウザ名（chrome/firefox/edge等）
    どちらも未設定なら Cookie なしで動作する。
    """
    f = os.environ.get("YT_COOKIES_FILE", "").strip()
    if f and Path(f).exists():
        return ["--cookies", f]
    b = os.environ.get("YT_COOKIES_BROWSER", "").strip()
    if b:
        return ["--cookies-from-browser", b]
    return []


_help_cache = None


def ytdlp_supports(option: str) -> bool:
    """インストールされている yt-dlp が指定オプションに対応しているか（--help を1回だけ確認）。"""
    global _help_cache
    if _help_cache is None:
        try:
            proc = subprocess.run([sys.executable, "-m", "yt_dlp", "--help"],
                                  capture_output=True, text=True, timeout=120)
            _help_cache = proc.stdout + proc.stderr
        except Exception:
            _help_cache = ""
    return option in _help_cache


def ytdlp_base(client: str = "") -> list:
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--no-warnings", "--no-playlist",
        "--retries", "5", "--fragment-retries", "5",
        "--socket-timeout", "30",
        "--sleep-requests", "1",
    ]
    # 【重要】YouTubeのJSチャレンジ(EJS)対策。
    # yt-dlp は署名/n-challenge を解くために外部JSランタイムを必要とする。
    # 解けないと「利用可能な形式が無い」状態になり
    # "Requested format is not available" で失敗する。
    # CI/ローカルともNode 20+が入っているため node ランタイムを使う。
    # 環境変数 YTDLP_JS_RUNTIME で上書き可（例: "deno"）。
    if ytdlp_supports("--js-runtimes"):
        cmd += ["--js-runtimes", os.environ.get("YTDLP_JS_RUNTIME", "node")]
    # 字幕だけ取りたい場合、動画形式が取得できなくてもエラーにしない
    # （字幕は形式の有無と無関係。JSチャレンジが解けない環境でも字幕は取れる）
    if ytdlp_supports("--ignore-no-formats-error"):
        cmd += ["--ignore-no-formats-error"]
    if client and client != "default":
        cmd += ["--extractor-args", f"youtube:player_client={client}"]
    cmd += cookie_args()
    return cmd


def run_ytdlp(extra: list, timeout: int = 5400, retries_per_client: int = 2,
              check: Path = None) -> subprocess.CompletedProcess:
    """
    player_client を順に切り替えながら yt-dlp を実行する。
    check にパスを渡すと「そのglobにファイルが出来たか」も成功条件に含める。
    """
    last_err = ""
    for client in player_clients():
        cmd = ytdlp_base(client) + extra
        for attempt in range(1, retries_per_client + 1):
            try:
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
                if proc.returncode == 0:
                    if client != "default":
                        log(f"yt-dlp ok (player_client={client})")
                    return proc
                last_err = proc.stderr.strip()[:300]
                bot = any(h in last_err.lower() for h in BOT_HINTS)
                log(f"yt-dlp failed [client={client} {attempt}/{retries_per_client}]"
                    f"{' (bot-check)' if bot else ''}: {last_err}")
                if bot:
                    break  # このクライアントでは無理なので次のクライアントへ
            except subprocess.TimeoutExpired:
                last_err = "timeout"
                log(f"yt-dlp timeout [client={client} {attempt}/{retries_per_client}]")
            if attempt < retries_per_client:
                time.sleep(random.uniform(4, 10) * attempt)
    raise YtDlpBlocked(last_err or "unknown error")


class YtDlpBlocked(Exception):
    """yt-dlp が全 player_client で失敗した（多くはYouTubeのボット判定）。"""


# ---------------------------------------------------------------- 字幕(timedtext)
def fetch_subtitle_words(video_id: str, workdir: Path) -> tuple:
    """
    yt-dlp で日本語字幕(json3)を取得し、語(または字幕イベント)列を返す。
    戻り値: (words, source) / 取得できなければ (None, None)
      words = [{"start": float, "end": float, "text": str}, ...]
      source = "subtitle" | "auto-subtitle"
    """
    url = f"https://www.youtube.com/watch?v={video_id}"
    for kind, flag in (("subtitle", "--write-subs"), ("auto-subtitle", "--write-auto-subs")):
        out_dir = workdir / kind
        out_dir.mkdir(parents=True, exist_ok=True)
        extra = [
            "--skip-download", flag,
            "--sub-langs", "ja,ja-JP,ja-orig,ja.*",
            "--sub-format", "json3",
            "-o", str(out_dir / "%(id)s.%(ext)s"),
            url,
        ]
        try:
            run_ytdlp(extra, timeout=900)
        except YtDlpBlocked as e:
            log(f"{kind} fetch failed: {e}")
            continue
        files = sorted(out_dir.glob("*.json3")) + sorted(out_dir.glob("*.json"))
        if not files:
            log(f"{kind}: not available")
            continue
        words = parse_json3(files[0])
        if words:
            log(f"{kind}: {len(words)} tokens from {files[0].name}")
            return words, kind
    return None, None


def parse_json3(path: Path) -> list:
    """YouTube json3 字幕を語列に変換する。"""
    data = load_json(path, None)
    if not data or "events" not in data:
        return []
    words = []
    for ev in data["events"]:
        segs = ev.get("segs")
        if not segs:
            continue
        base = (ev.get("tStartMs") or 0) / 1000.0
        dur = (ev.get("dDurationMs") or 0) / 1000.0
        for seg in segs:
            text = (seg.get("utf8") or "").replace("​", "")
            if not text.strip():
                continue
            start = base + (seg.get("tOffsetMs") or 0) / 1000.0
            words.append({"start": start, "end": start + max(dur, 0.4), "text": text.strip()})
    # 自動字幕はローリング表示で重複しやすいので、同一開始時刻+同一テキストの重複を除去
    words.sort(key=lambda w: (w["start"], w["text"]))
    dedup = []
    seen = set()
    for w in words:
        key = (round(w["start"], 2), w["text"])
        if key in seen:
            continue
        seen.add(key)
        dedup.append(w)
    # 次の語の開始で end を補正
    for i in range(len(dedup) - 1):
        dedup[i]["end"] = min(dedup[i]["end"], max(dedup[i + 1]["start"], dedup[i]["start"] + 0.2))
    return dedup


# ---------------------------------------------------------------- Whisper
def download_audio(video_id: str, workdir: Path) -> Path:
    url = f"https://www.youtube.com/watch?v={video_id}"
    out = workdir / f"{video_id}.m4a"
    run_ytdlp([
        "-f", "bestaudio/best",
        "-x", "--audio-format", "m4a", "--audio-quality", "5",
        "-o", str(workdir / f"{video_id}.%(ext)s"),
        url,
    ], timeout=5400)
    if out.exists():
        return out
    cands = [p for p in sorted(workdir.glob(f"{video_id}.*")) if p.is_file()]
    if not cands:
        # --ignore-no-formats-error のため exit 0 でもファイルが無いことがある。
        # 多くは JSチャレンジ(EJS)を解けず音声形式が取得できていないケース。
        raise RuntimeError(
            "音声形式を取得できませんでした（JSチャレンジ未解決の可能性）。"
            "yt-dlp を 'pip install -U \"yt-dlp[default]\"' で更新し、"
            "Node 20+ か Deno がPATHにあるか確認してください"
        )
    return cands[0]


def whisper_words(audio: Path, model_size: str, compute_type: str) -> tuple:
    """faster-whisper で語単位タイムスタンプ付きの文字起こしを行う。"""
    from faster_whisper import WhisperModel  # 遅延import(字幕で済む場合は不要)

    log(f"whisper: model={model_size} compute_type={compute_type}")
    model = WhisperModel(model_size, device="cpu", compute_type=compute_type)
    segments, _info = model.transcribe(
        str(audio),
        language="ja",
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
        beam_size=1,
        condition_on_previous_text=False,
    )
    words = []
    for seg in segments:
        if seg.words:
            for w in seg.words:
                text = (w.word or "").strip()
                if text:
                    words.append({"start": float(w.start), "end": float(w.end), "text": text})
        else:
            text = (seg.text or "").strip()
            if text:
                words.append({"start": float(seg.start), "end": float(seg.end), "text": text})
    return words, "whisper"


# ---------------------------------------------------------------- セリフ整形
def build_segments(words: list) -> list:
    """
    語列 → セリフ列。
    基本は1〜2文をひとまとまりにし、40文字超 or 8秒超になった場合のみ
    句読点/無音(語間ギャップ)で分割する。
    """
    segments = []
    buf = []          # [{start,end,text}]
    sentences_in_buf = 0

    def flush():
        nonlocal buf, sentences_in_buf
        if not buf:
            return
        text = normalize("".join(w["text"] for w in buf))
        if text:
            segments.append({
                "start": round(buf[0]["start"], 2),
                "end": round(buf[-1]["end"], 2),
                "text": text,
            })
        buf = []
        sentences_in_buf = 0

    for i, w in enumerate(words):
        buf.append(w)
        cur_text = "".join(x["text"] for x in buf)
        cur_len = len(cur_text)
        cur_dur = buf[-1]["end"] - buf[0]["start"]
        ends_sentence = bool(w["text"]) and w["text"][-1] in SENT_END
        if ends_sentence:
            sentences_in_buf += 1
        gap_next = (words[i + 1]["start"] - w["end"]) if i + 1 < len(words) else 999.0

        too_long = cur_len > MAX_CHARS or cur_dur > MAX_SEC
        if ends_sentence and sentences_in_buf >= 2:
            flush()
        elif ends_sentence and too_long:
            flush()
        elif too_long and (w["text"][-1:] in SOFT_BREAK or gap_next >= GAP_SEC):
            flush()
        elif cur_len > MAX_CHARS * 2 or cur_dur > MAX_SEC * 2:
            # 句読点も無音も来ない長話は強制的に切る
            flush()
    flush()
    return segments


def normalize(text: str) -> str:
    text = text.replace("\n", " ").replace("　", " ")
    text = re.sub(r"\[.*?\]|\(.*?\)|（.*?）", "", text)   # [音楽] 等のラベルを除去
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def add_yomi(segments: list) -> None:
    """pykakasi があればひらがな読みを付与する（無ければ何もしない）。"""
    try:
        import pykakasi
    except Exception:
        log("pykakasi not installed: skip yomi")
        return
    kks = pykakasi.kakasi()
    for seg in segments:
        try:
            seg["yomi"] = "".join(item["hira"] for item in kks.convert(seg["text"]))
        except Exception:
            pass


# ---------------------------------------------------------------- メタ情報
def contents_index() -> dict:
    items = load_json(CONTENTS, [])
    return {it["videoId"]: it for it in items if isinstance(it, dict) and it.get("videoId")}


def ytdlp_meta(video_id: str) -> dict:
    """contents.json に無い動画のメタ情報を yt-dlp から取る（API不使用）。"""
    proc = run_ytdlp(["--skip-download", "--dump-single-json",
                      f"https://www.youtube.com/watch?v={video_id}"], timeout=300)
    info = json.loads(proc.stdout)
    upload = info.get("upload_date")
    date = f"{upload[0:4]}-{upload[4:6]}-{upload[6:8]}T00:00:00Z" if upload else ""
    return {
        "videoId": video_id,
        "title": info.get("title") or video_id,
        "date": date,
        "durationSec": int(info.get("duration") or 0),
        "thumbnail": info.get("thumbnail"),
    }


class SkipVideo(Exception):
    """恒久的に処理しない（毎日リトライしないよう skipped.json に記録する）。"""


# ---------------------------------------------------------------- 1本処理
def process_one(video_id: str, meta: dict, args) -> dict:
    out_path = TRANSCRIPT_DIR / f"{video_id}.json"
    workdir = Path(tempfile.mkdtemp(prefix=f"tr-{video_id}-"))
    try:
        words, source = fetch_subtitle_words(video_id, workdir)
        if not words:
            hours = (meta.get("durationSec") or 0) / 3600.0
            if args.max_audio_hours > 0 and hours > args.max_audio_hours:
                raise SkipVideo(f"too long for whisper on CI ({hours:.1f}h > {args.max_audio_hours}h)")
            log(f"no subtitle: fall back to whisper ({hours:.1f}h)")
            audio = download_audio(video_id, workdir)
            words, source = whisper_words(audio, args.whisper_model, args.compute_type)
        if not words:
            raise SkipVideo("no words extracted")

        raw = build_segments(words)
        if args.yomi:
            add_yomi(raw)
        segments = []
        for i, s in enumerate(raw):
            seg = {"id": i, "start": s["start"], "end": s["end"], "text": s["text"]}
            if "yomi" in s:
                seg["yomi"] = s["yomi"]
            segments.append(seg)

        doc = {
            "videoId": video_id,
            "title": meta.get("title") or video_id,
            "date": meta.get("date") or "",
            "durationSec": int(meta.get("durationSec") or 0),
            "source": source,
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "segments": segments,
        }
        save_json(out_path, doc)
        log(f"wrote {out_path.relative_to(ROOT)} segments={len(segments)} source={source}")
        return {
            "videoId": video_id,
            "title": doc["title"],
            "date": doc["date"],
            "thumbnail": meta.get("thumbnail"),
            "durationSec": doc["durationSec"],
            "segmentCount": len(segments),
            "source": source,
        }
    finally:
        shutil.rmtree(workdir, ignore_errors=True)  # 音声ファイルはコミットせず破棄


# ---------------------------------------------------------------- main
def main() -> int:
    p = argparse.ArgumentParser(description="配信アーカイブのセリフ文字起こし")
    p.add_argument("--video-id", default="", help="1本だけ処理する videoId")
    p.add_argument("--force", action="store_true", help="既に処理済みでも再処理する")
    p.add_argument("--max", type=int, default=2, help="バッチ1実行あたりの最大本数(既定2)")
    p.add_argument("--whisper-model", default="small", help="faster-whisper モデル(tiny/base/small/medium)")
    p.add_argument("--compute-type", default="int8", help="faster-whisper compute_type")
    p.add_argument("--max-audio-hours", type=float, default=4.0,
                   help="Whisper実行を諦める長さ(時間)。0で無制限")
    p.add_argument("--max-failures", type=int, default=3,
                   help="この回数連続で失敗した動画はバッチ対象から一旦外す(既定3)")
    p.add_argument("--retry-failed", action="store_true",
                   help="失敗回数の上限を無視して再挑戦する")
    p.add_argument("--no-yomi", dest="yomi", action="store_false", help="ひらがな読みを付与しない")
    p.set_defaults(yomi=True)
    args = p.parse_args()

    TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = load_json(MANIFEST, [])
    if not isinstance(manifest, list):
        manifest = []
    skipped = load_json(SKIPPED, [])
    if not isinstance(skipped, list):
        skipped = []
    failures = load_json(FAILURES, [])
    if not isinstance(failures, list):
        failures = []
    fail_count = {f["videoId"]: int(f.get("count") or 0)
                  for f in failures if isinstance(f, dict) and f.get("videoId")}

    excluded = read_id_list(EXCLUDE)
    done = {m["videoId"] for m in manifest if isinstance(m, dict) and m.get("videoId")}
    skipped_ids = {s["videoId"] for s in skipped if isinstance(s, dict) and s.get("videoId")}
    cindex = contents_index()

    # 削除依頼(exclude.txt)は処理も掲載もしない → 既存の出力も取り下げる
    removed = 0
    for vid in list(excluded):
        f = TRANSCRIPT_DIR / f"{vid}.json"
        if f.exists():
            f.unlink()
            removed += 1
    before = len(manifest)
    manifest = [m for m in manifest if m.get("videoId") not in excluded]
    if removed or before != len(manifest):
        log(f"excluded: removed {removed} file(s), {before - len(manifest)} manifest entry(ies)")

    # 対象決定
    targets = []
    if args.video_id:
        if args.video_id in excluded:
            log(f"{args.video_id} is in scripts/exclude.txt: refuse to process")
            save_json(MANIFEST, manifest)
            return 0
        if args.video_id in done and not args.force:
            log(f"{args.video_id} already processed (use --force to redo)")
            save_json(MANIFEST, manifest)
            return 0
        targets = [args.video_id]
    else:
        for it in load_json(CONTENTS, []):
            if len(targets) >= max(args.max, 0):
                break
            if not isinstance(it, dict) or it.get("type") != "live":
                continue
            if it.get("status") == "upcoming":
                continue
            vid = it.get("videoId")
            if not vid or vid in done or vid in excluded or vid in skipped_ids:
                continue
            # 連続失敗が上限に達した動画は一旦飛ばし、他の配信を先に処理する
            # （--retry-failed で再挑戦できる）
            if not args.retry_failed and fail_count.get(vid, 0) >= args.max_failures:
                continue
            targets.append(vid)
        log(f"batch targets: {targets or 'none (up to date or all deferred)'}")

    attempted = 0
    succeeded = 0
    blocked = 0  # 全滅したら「ボット判定が原因」と特定できるようにカウントする

    for vid in targets:
        attempted += 1
        meta = cindex.get(vid)
        if not meta:
            try:
                meta = ytdlp_meta(vid)
            except YtDlpBlocked:
                blocked += 1
                log(f"{vid}: metadata fetch blocked (bot-check)")
                continue
            except Exception as e:
                log(f"{vid}: metadata fetch failed: {e}")
                continue
        try:
            entry = process_one(vid, meta, args)
        except SkipVideo as e:
            log(f"{vid}: skipped ({e})")
            skipped = [s for s in skipped if s.get("videoId") != vid]
            skipped.append({"videoId": vid, "reason": str(e),
                            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
            continue
        except YtDlpBlocked as e:
            blocked += 1
            n = fail_count.get(vid, 0) + 1
            fail_count[vid] = n
            log(f"{vid}: yt-dlp blocked ({n}/{args.max_failures}回目): {e}")
            failures = [f for f in failures if f.get("videoId") != vid]
            failures.append({"videoId": vid, "count": n, "reason": str(e)[:200],
                             "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
            continue
        except Exception as e:
            n = fail_count.get(vid, 0) + 1
            fail_count[vid] = n
            log(f"{vid}: FAILED ({type(e).__name__}: {e})")
            failures = [f for f in failures if f.get("videoId") != vid]
            failures.append({"videoId": vid, "count": n,
                             "reason": f"{type(e).__name__}: {e}"[:200],
                             "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
            continue
        succeeded += 1
        manifest = [m for m in manifest if m.get("videoId") != vid]
        manifest.append(entry)
        skipped = [s for s in skipped if s.get("videoId") != vid]
        failures = [f for f in failures if f.get("videoId") != vid]

    manifest.sort(key=lambda m: (m.get("date") or ""), reverse=True)
    save_json(MANIFEST, manifest)
    save_json(SKIPPED, skipped)
    save_json(FAILURES, failures)
    log(f"manifest={len(manifest)} videos, skipped={len(skipped)}, failures={len(failures)}")

    # 【重要】対象があったのに1本も成功しなかった場合は exit 0 にしない。
    # CIがボット判定で毎回全滅していても静かに「正常終了」していたのが本来の問題だったため、
    # ここでジョブを失敗させ、GitHub Actionsの失敗通知(赤いX・既定でメール通知)で気づけるようにする。
    if attempted > 0 and succeeded == 0:
        reason = "YouTubeのボット判定(Sign in to confirm you're not a bot)" if blocked == attempted else "取得エラー"
        log(f"ALERT: {attempted}本すべて失敗しました（{reason}）。"
            "このワークフローは失敗として終了します。手元PCでの実行、または Secret YT_COOKIES の設定を検討してください。")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
