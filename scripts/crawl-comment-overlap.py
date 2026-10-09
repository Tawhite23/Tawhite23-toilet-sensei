#!/usr/bin/env python3
"""リスナーかぶり（コメントした場所）の下調べ: ほかの配信者のチャットに、うちのリスナーが何人いるかを数える。

  python scripts/crawl-comment-overlap.py            # 候補のチャンネルを順に見る（続きから再開できる）
  python scripts/crawl-comment-overlap.py --add UCxxxx UCyyyy   # 見てほしいチャンネルを足す

やること:
  1. 候補を決める … リスナー自身のチャンネル（全員ぶん）、検索で見つかった今週の配信者、
     リスナーの登録先で人数の多いチャンネル（_subs.json。補助）、--add で足したチャンネル
  2. 各チャンネルの、この DAYS 日間のライブ配信アーカイブを選ぶ（STREAMS_PER_CHANNEL 本まで）
  3. そのチャットリプレイを取り、コメントした人の中にうちのリスナーが何人いるかを記録する
     （取ったチャットは数えたら消す。1本あたり CHAT_TIMEOUT 秒で打ち切るので、
       コメントの多い大きな配信は最初のほうしか見られない）

結果は手元の <chatDir>/_comment_overlap.json に入れる（実行のたびに作り直す。--resume で続きから。誰がどこでコメントしたかを含むので公開しない）。
公開用の人数だけのデータは scripts/build-overlap.py が作る。
"""
import argparse
import collections
import concurrent.futures
import glob
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIN_SUBSCRIBERS = 4  # 登録しているリスナーがこの人数以上のチャンネルを候補にする
DAYS = 7  # この日数以内の配信だけを見る
STREAMS_PER_CHANNEL = 10  # 1チャンネルあたりの上限（毎日2枠やる人でも1週間ぶんの大半が入る）
CHAT_TIMEOUT = 45
LIST_TIMEOUT = 40
WORKERS = 12
# 配信者を探す検索語。「参加型」に限らず、この配信に来る人が行きそうなジャンルを広めに入れる
SEARCHES = [
    "参加型", "視聴者参加型", "参加型 初見さん歓迎", "雑談配信 初見さん歓迎", "初見歓迎 ライブ配信",
    "マイクラ 参加型", "マイクラ 統合版 参加型", "マイクラ ハードコア 配信", "マイクラ サバイバル 配信", "マイクラ 鬼ごっこ 参加型",
    "マリオカート8DX 参加型", "マリオカートワールド 参加型", "APEX 参加型", "スマブラ 参加型", "フォートナイト 参加型",
    "スプラトゥーン3 参加型", "ポケモン 配信 初見", "原神 配信 初見", "アソビ大全 参加型", "ピクミン 配信",
    "マイクラ アドオン 配信", "マイクラ 建国 サーバー 参加型", "ベッドウォーズ 配信", "雑談 配信 深夜", "ゲーム配信 雑談 コメント読む",
]
SEARCH_RESULTS = 100

spec = importlib.util.spec_from_file_location("bl", os.path.join(ROOT, "scripts", "build-listeners.py"))
bl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bl)


def ytdlp(args, timeout):
    try:
        r = subprocess.run([sys.executable, "-m", "yt_dlp", "--no-warnings", "-q", *args],
                           capture_output=True, timeout=timeout,
                           # Windows だと yt-dlp の出力が cp932 になり、チャンネル名が文字化けするため
                           env={**os.environ, "PYTHONIOENCODING": "utf-8"})
        return r.stdout.decode("utf-8", "replace")
    except subprocess.TimeoutExpired as e:
        return (e.stdout or b"").decode("utf-8", "replace")


def recent_streams(channel_id):
    """この DAYS 日間のライブ配信アーカイブ [(動画ID, タイトル)]。ライブをしていないチャンネルは空。
    一覧の日付は「3日前」のような表示から逆算したおおよその値なので、境目は半日ぶん広めに取る"""
    out = ytdlp(["--flat-playlist", "--playlist-end", "25", "--extractor-args", "youtubetab:approximate_date",
                 "--print", "%(id)s|%(live_status)s|%(timestamp)s|%(playlist_channel)s|%(title)s",
                 f"https://www.youtube.com/channel/{channel_id}/streams"], LIST_TIMEOUT)
    rows = [l.split("|", 4) for l in out.splitlines() if l.count("|") >= 4]
    name = rows[0][3] if rows else ""
    since = time.time() - (DAYS + 0.5) * 86400
    recent = [(r[0], r[4]) for r in rows
              if r[1] not in ("is_live", "is_upcoming") and r[2].isdigit() and int(r[2]) >= since]
    return name, recent[:STREAMS_PER_CHANNEL]


def chatters_of(video_id, tmp):
    """その配信でコメントした人のチャンネルID（時間切れのときは取れたところまで）"""
    base = os.path.join(tmp, video_id)
    ytdlp(["--skip-download", "--write-subs", "--sub-langs", "live_chat", "-o", base,
           f"https://www.youtube.com/watch?v={video_id}"], CHAT_TIMEOUT)
    ids = set()
    files = glob.glob(base + "*")
    for path in files:
        if "live_chat" not in path or path.endswith(".ytdl"):
            continue
        try:
            for _, cid, _, _, _ in bl.load_chat(path):
                ids.add(cid)
        except Exception:
            pass
    for path in files:
        try:
            os.remove(path)
        except OSError:
            pass
    return ids, bool(files)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--add", nargs="*", default=[], help="候補に足すチャンネルID")
    ap.add_argument("--resume", action="store_true", help="途中で止まった続きから見る")
    ap.add_argument("--limit", type=int, default=0, help="今回見るチャンネル数の上限（試し用）")
    args = ap.parse_args()

    cfg = bl.load_local_config()
    chat_dir = cfg["chatDir"]
    ours = set()
    for path in glob.glob(os.path.join(chat_dir, "*.live_chat.json")):
        for _, cid, _, _, _ in bl.load_chat(path):
            ours.add(cid)
    ours.discard(bl.OWNER_CHANNEL)

    state_path = os.path.join(chat_dir, "_comment_overlap.json")
    state = json.load(open(state_path, encoding="utf-8")) if args.resume and os.path.exists(state_path) else {}
    meta = {"days": DAYS, "at": time.strftime("%Y-%m-%d %H:%M")}

    candidates = collections.OrderedDict()
    for ch in args.add:
        candidates[ch] = "add"
    # (1) リスナー自身のチャンネル。自分でも配信している人のところには、ほかのリスナーも集まりやすい。
    #     登録先を公開しているかどうかに関係なく、コメントした全員ぶんを見られる
    for ch in sorted(ours):
        candidates.setdefault(ch, "listener")
    # (2) 検索。今週の動画（sp=EgQIAxAB）と、いまライブ中（sp=EgJAAQ%3D%3D）から、配信者を広く拾う
    def search(q):
        found = []
        for sp in ("EgQIAxAB", "EgJAAQ%3D%3D"):
            out = ytdlp(["--flat-playlist", "--playlist-end", str(SEARCH_RESULTS), "--print", "%(channel_id)s",
                         f"https://www.youtube.com/results?sp={sp}&search_query=" + urllib.parse.quote(q)], 150)
            found += [ch for ch in out.split() if ch.startswith("UC")]
        return found
    with concurrent.futures.ThreadPoolExecutor(6) as ex:
        for found in ex.map(search, SEARCHES):
            for ch in found:
                candidates.setdefault(ch, "search")
    # (3) リスナーの登録先で人数の多いチャンネル（登録先を公開している人のぶんしか分からないので補助）
    subs_path = os.path.join(chat_dir, "_subs.json")
    if os.path.exists(subs_path):
        cnt = collections.Counter()
        for subs in json.load(open(subs_path, encoding="utf-8")).values():
            cnt.update({s[0] for s in (subs or [])})
        for ch, n in cnt.most_common():
            if n >= MIN_SUBSCRIBERS:
                candidates.setdefault(ch, "subs")
    candidates.pop(bl.OWNER_CHANNEL, None)
    state.pop("_meta", None)
    todo = [ch for ch in candidates if ch not in state]
    if args.limit:
        todo = todo[:args.limit]
    print(f"うちのリスナー {len(ours)}人・候補 {len(candidates)}チャンネル・これから見る {len(todo)}チャンネル", flush=True)

    lock = threading.Lock()
    done = [0]

    def work(ch):
        name, streams = recent_streams(ch)
        rec = {"name": name, "source": candidates[ch], "streams": {}}
        with tempfile.TemporaryDirectory() as tmp:
            for vid, title in streams:
                ids, got = chatters_of(vid, tmp)
                if got:
                    rec["streams"][vid] = {"title": title, "chatters": len(ids), "ours": sorted(ids & ours)}
        with lock:
            state[ch] = rec
            done[0] += 1
            json.dump({"_meta": meta, **state}, open(state_path, "w", encoding="utf-8"), ensure_ascii=False)
            people = {c for s in rec["streams"].values() for c in s["ours"]}
            print(f"[{done[0]}/{len(todo)}] {name or ch}  配信{len(rec['streams'])}本  うちのリスナー {len(people)}人", flush=True)

    with concurrent.futures.ThreadPoolExecutor(WORKERS) as ex:
        list(ex.map(work, todo))
    print("完了", flush=True)


if __name__ == "__main__":
    main()
