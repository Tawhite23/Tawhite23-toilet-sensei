#!/usr/bin/env python3
"""リスナー名鑑のデータ(public/data/listeners.json)を作る。

配信アーカイブの公開チャット(チャットリプレイ)を集計し、
レポートページの「名鑑 / ランキング / 日報」タブが読む1本のJSONにまとめる。

  python scripts/build-listeners.py            # 手元にあるチャットだけで集計し直す
  python scripts/build-listeners.py --fetch    # まだ取っていない配信のチャットを取得してから集計

■ 手元PCで実行する（CIでは動かさない）
  チャットの生データ(1配信あたり数百KB〜数MB)はリポジトリに入れない。
  置き場所・非表示リスト・キーのソルトは scripts/listeners.local.json
  (gitignore済み。無ければ初回実行時に作る) に書く。

    { "chatDir": ".listener-chat", "hiddenFile": "scripts/listeners-hidden.local.txt", "salt": "..." }

■ 公開するもの / しないもの
  - リスナーはチャンネルIDで見分けるが、**チャンネルIDは出力しない**。
    URL用のキーは「ソルト付きハッシュ」にして、キーからチャンネルIDを逆引きできないようにする。
    ソルトを失うとキーが変わり、共有済みのURLと「自分の記録」の登録が外れるので消さないこと。
  - 表示名とアイコンは最後にコメントしたときのもの（2026-10-08 オーナー判断でアイコンも載せる）。発言の本文は載せない
    。
  - MIN_ATTEND 回未満しか来ていない人は名鑑に載せない（配信ごとの人数には数える）。
  - hiddenFile に書いたチャンネルID / 表示名の人は名鑑・ランキングに出さない（非表示の申請用）。
  - scripts/exclude.txt の配信は集計しない（文字起こしの掲載をやめた配信と同じ一覧）。
"""
import argparse
import collections
import datetime as dt
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENTS = os.path.join(ROOT, "public", "data", "contents.json")
OUT = os.path.join(ROOT, "public", "data", "listeners.json")
QUOTES = os.path.join(ROOT, "public", "data", "quotes.json")
SUMMARIES = os.path.join(ROOT, "scripts", "stream-summaries.json")
# キー → チャンネルID の対応表（D1用）。チャンネルIDを含むので out/（gitignore済み）にだけ書く
IDS_SQL = os.path.join(ROOT, "out", "listeners", "listener-ids.sql")
LOCAL_CONFIG = os.path.join(ROOT, "scripts", "listeners.local.json")
EXCLUDE_FILE = os.path.join(ROOT, "scripts", "exclude.txt")

OWNER_CHANNEL = "UCmxpPhu7kAWWnoQ_cY0clTQ"
MIN_ATTEND = 3  # これ未満の出席回数の人は名鑑に載せない
QUOTES_PER_STREAM = 2  # 日報に出す「先生のひとこと」の数（名言集 quotes.json から点数の高い順）
QUOTE_MAX_LEN = 60
RETRY_DAYS = 3  # 終了からこの日数は、チャットが取れなくても「まだ処理中」とみて次回も試す
JST = dt.timezone(dt.timedelta(hours=9))
SEASON_NAMES = {3: "春", 6: "夏", 9: "秋", 12: "冬"}
CHAT_KINDS = {
    "liveChatTextMessageRenderer",
    "liveChatPaidMessageRenderer",
    "liveChatPaidStickerRenderer",
    "liveChatMembershipItemRenderer",
}


def load_local_config():
    cfg = {}
    if os.path.exists(LOCAL_CONFIG):
        cfg = json.load(open(LOCAL_CONFIG, encoding="utf-8"))
    changed = False
    for key, default in (
        ("chatDir", ".listener-chat"),
        ("hiddenFile", "scripts/listeners-hidden.local.txt"),
        ("salt", secrets.token_hex(16)),
    ):
        if not cfg.get(key):
            cfg[key] = default
            changed = True
    if changed:
        json.dump(cfg, open(LOCAL_CONFIG, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"{os.path.relpath(LOCAL_CONFIG, ROOT)} を作成/更新しました（コミットしないこと）")
    for key in ("chatDir", "hiddenFile"):
        cfg[key] = os.path.normpath(os.path.join(ROOT, cfg[key]))
    return cfg


def read_id_list(path):
    """1行1件。# 以降はコメント"""
    if not os.path.exists(path):
        return set()
    out = set()
    for line in open(path, encoding="utf-8"):
        v = line.split("#")[0].strip()
        if v:
            out.add(v)
    return out


def season_of(date):
    """季節ごとのシーズン（春3〜5月・夏6〜8月・秋9〜11月・冬12〜2月）。冬は12月の年で数える"""
    y, m = date.year, date.month
    start = 12 if m in (12, 1, 2) else (m - 3) // 3 * 3 + 3
    if m in (1, 2):
        y -= 1
    end = 2 if start == 12 else start + 2
    return f"{y}-{start:02d}", f"{y} {SEASON_NAMES[start]}", f"{start}〜{end}月"


def category(title):
    if re.search(r"マイクラ|マインクラフト|minecraft", title, re.I):
        return "マイクラ"
    if re.search(r"マリオカート|マリカ", title):
        return "マリカ"
    if re.search(r"参加型", title):
        return "参加型"
    return "雑談・その他"


def text_of(runs):
    return "".join(r.get("text", "") for r in runs or [])


def load_chat(path):
    """(オフセット秒, チャンネルID, 表示名, アイコンのURL, 本文) のリスト"""
    msgs = []
    for line in open(path, encoding="utf-8"):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        rep = d.get("replayChatItemAction", {})
        off = int(rep.get("videoOffsetTimeMsec", 0)) / 1000
        for a in rep.get("actions", []):
            item = a.get("addChatItemAction", {}).get("item", {})
            for kind, r in item.items():
                if kind not in CHAT_KINDS:
                    continue
                cid = r.get("authorExternalChannelId")
                if not cid:
                    continue
                name = r.get("authorName", {}).get("simpleText", "")
                # アイコンはサイズ指定（=s64-...）を外して持つ。表示する大きさはページ側で付ける
                thumbs = r.get("authorPhoto", {}).get("thumbnails") or [{}]
                icon = thumbs[-1].get("url", "").split("=")[0]
                msgs.append((off, cid, name, icon, text_of(r.get("message", {}).get("runs"))))
    return msgs


def fetch_missing(streams, chat_dir):
    """チャットをまだ持っていない配信ぶんを yt-dlp で取得する（動画本体は落とさない）"""
    os.makedirs(chat_dir, exist_ok=True)
    nochat_path = os.path.join(chat_dir, "_nochat.json")
    nochat = json.load(open(nochat_path, encoding="utf-8")) if os.path.exists(nochat_path) else {}
    now = dt.datetime.now(dt.timezone.utc)
    todo = [
        s for s in streams
        if s["videoId"] not in nochat and not os.path.exists(os.path.join(chat_dir, f"{s['videoId']}.live_chat.json"))
    ]
    print(f"チャット未取得の配信: {len(todo)}本")
    for n, s in enumerate(todo, 1):
        vid = s["videoId"]
        subprocess.run(
            [sys.executable, "-m", "yt_dlp", "--skip-download", "--write-subs", "--sub-langs", "live_chat",
             "--no-warnings", "-q", "-o", os.path.join(chat_dir, "%(id)s"), f"https://www.youtube.com/watch?v={vid}"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        ok = os.path.exists(os.path.join(chat_dir, f"{vid}.live_chat.json"))
        print(f"  [{n}/{len(todo)}] {vid} {'取得' if ok else 'チャットなし'}  {s['title'][:40]}")
        ended = s["start"] + dt.timedelta(seconds=s["durationSec"])
        # 終わったばかりの配信はリプレイの準備中のことがあるので、古いものだけ「チャットなし」と記録する
        if not ok and (now - ended).days >= RETRY_DAYS:
            nochat[vid] = s["title"]
    json.dump(nochat, open(nochat_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def load_quotes():
    """配信ごとの「先生のひとこと」。名言集(quotes.json)がその回から拾った発言を点数の高い順に使う。
    どんな配信だったかを、チャットの数字ではなく先生が実際に言った一言で伝えるため。"""
    by_video = collections.defaultdict(list)
    if not os.path.exists(QUOTES):
        return by_video
    for q in json.load(open(QUOTES, encoding="utf-8")).get("items", []):
        if len(q["text"]) > QUOTE_MAX_LEN:
            continue
        by_video[q["videoId"]].append(q)
    return {
        vid: [[q["text"], int(q["start"])] for q in sorted(qs, key=lambda q: -q["score"])[:QUOTES_PER_STREAM]]
        for vid, qs in by_video.items()
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--fetch", action="store_true", help="未取得の配信のチャットを yt-dlp で取得してから集計する")
    args = ap.parse_args()

    cfg = load_local_config()
    chat_dir = cfg["chatDir"]
    hidden = read_id_list(cfg["hiddenFile"])
    excluded = read_id_list(EXCLUDE_FILE)

    streams = []
    for c in json.load(open(CONTENTS, encoding="utf-8")):
        if c.get("type") != "live" or c.get("status") == "upcoming" or not c.get("durationSec"):
            continue
        if c["videoId"] in excluded:
            continue
        c["start"] = dt.datetime.fromisoformat(c["date"].replace("Z", "+00:00"))
        streams.append(c)
    streams.sort(key=lambda c: c["start"])

    if args.fetch:
        fetch_missing(streams, chat_dir)

    streams = [s for s in streams if os.path.exists(os.path.join(chat_dir, f"{s['videoId']}.live_chat.json"))]
    if not streams:
        sys.exit(f"チャットがありません（{chat_dir}）。--fetch を付けて実行してください。")

    quotes = load_quotes()
    # 配信の一言（どんな回だったか）。人が書く。{ "動画ID": "一言" }
    summaries = json.load(open(SUMMARIES, encoding="utf-8")) if os.path.exists(SUMMARIES) else {}
    L = collections.defaultdict(lambda: {"name": "", "icon": "", "att": [], "comments": 0, "cats": collections.Counter()})
    daily = []
    seen = set()
    for idx, s in enumerate(streams):
        per = collections.Counter()
        names = {}
        icons = {}
        bins = collections.Counter()
        for off, cid, name, icon, body in load_chat(os.path.join(chat_dir, f"{s['videoId']}.live_chat.json")):
            if cid == OWNER_CHANNEL:
                continue
            per[cid] += 1
            names[cid] = name
            icons[cid] = icon
            bins[max(0, int(off // 60))] += 1
        cat = category(s["title"])
        firsts = 0
        for cid, n in per.items():
            p = L[cid]
            p["name"] = names[cid]
            p["icon"] = icons[cid] or p["icon"]
            p["att"].append([idx, n])
            p["comments"] += n
            p["cats"][cat] += 1
            if cid not in seen:
                firsts += 1
                seen.add(cid)
        minutes = max(1, s["durationSec"] // 60)
        local = s["start"].astimezone(JST)
        daily.append({
            "id": s["videoId"], "title": s["title"],
            "date": local.strftime("%Y-%m-%d"), "start": local.strftime("%H:%M"),
            "min": minutes, "cat": cat, "comments": sum(per.values()), "chatters": len(per),
            # 集計の最初の5回は常連も「初めて」に数えてしまうので出さない
            "first": firsts if idx >= 5 else None,
            # いちばん盛り上がった時刻 [開始からの分, その1分の件数]。最初の3分はあいさつが集中するので除く
            "peak": next(([m, c] for m, c in sorted(bins.items(), key=lambda kv: -kv[1]) if m >= 3), None),
            "summary": summaries.get(s["videoId"], ""),
            "quotes": quotes.get(s["videoId"], []),
            "_start": local,
        })

    n = len(daily)
    seasons = []
    for i, d in enumerate(daily):
        key, label, months = season_of(d.pop("_start"))
        if not seasons or seasons[-1]["key"] != key:
            seasons.append({"key": key, "label": label, "months": months, "from": i, "to": i})
        seasons[-1]["to"] = i

    salt = cfg["salt"]
    listeners = []
    for cid, p in L.items():
        if cid in hidden or p["name"] in hidden or len(p["att"]) < MIN_ATTEND:
            continue
        idxs = [i for i, _ in p["att"]]
        s = set(idxs)
        # いまの連続出席（最新の配信からさかのぼって何回続いているか）と最長の連続出席
        cur = 0
        while n - 1 - cur in s:
            cur += 1
        best = run = 0
        for i in range(idxs[0], n):
            run = run + 1 if i in s else 0
            best = max(best, run)
        listeners.append({
            "key": hashlib.sha256(f"{salt}:{cid}".encode()).hexdigest()[:10],
            "_cid": cid,
            "name": p["name"],
            "icon": p["icon"],
            "attend": len(idxs),
            "rate": round(len(idxs) / (n - idxs[0]) * 100),  # 初めて来た回から後の配信のうち、来た割合
            "comments": p["comments"],
            "streak": cur,
            "best": best,
            "fav": p["cats"].most_common(1)[0][0],
            "att": p["att"],
        })
    listeners.sort(key=lambda x: (-x["attend"], -x["comments"]))

    # Worker が最新の名前とアイコンを取るための対応表（npm run sync-listeners で D1 に入れる）
    os.makedirs(os.path.dirname(IDS_SQL), exist_ok=True)
    with open(IDS_SQL, "w", encoding="utf-8") as f:
        print("DELETE FROM listener_ids;", file=f)
        for l in listeners:
            print(f"INSERT INTO listener_ids (key, cid) VALUES ('{l['key']}', '{l.pop('_cid')}');", file=f)

    out = {
        "generated": dt.datetime.now(JST).strftime("%Y-%m-%d %H:%M"),
        "minAttend": MIN_ATTEND,
        "totalChatters": len(L),
        "seasons": seasons,
        "streams": daily,
        "listeners": listeners,
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(
        f"配信 {n}本（{daily[0]['date']}〜{daily[-1]['date']}）・コメントした人 {len(L)}人"
        f"（名鑑に載る人 {len(listeners)}人）・コメント {sum(d['comments'] for d in daily)}件"
        f" → {os.path.relpath(OUT, ROOT)}（{os.path.getsize(OUT) // 1024}KB）"
    )
    missing = [d for d in daily if not d["summary"]]
    if missing:
        print(f"一言がまだ無い配信: {len(missing)}本（scripts/stream-summaries.json に足す）")
        for d in missing[-10:]:
            print(f"  {d['id']}  {d['date']}  {d['title'][:50]}")


if __name__ == "__main__":
    main()
