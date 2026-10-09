#!/usr/bin/env python3
"""リスナーかぶりのデータ(public/data/overlap.json)を作る。

配信でコメントした人が、ほかのどの配信者のところにいるかを、チャンネルごとの人数だけで出す。
  - コメントした場所: scripts/crawl-comment-overlap.py が、ほかの配信者のチャットを見て回った結果
  - 登録しているチャンネル: 登録チャンネルを公開している人の登録先（YouTube API）
誰がどこにいるかは出力しない（人数が MIN_PEOPLE 未満のチャンネルも載せない）。

  1. 別のターミナルで、YouTube API を呼ぶ道具を起動しておく（APIキーを手元に置かないため）
       cd worker
       npx.cmd wrangler dev tools/subs.ts --remote --port 8799 --ip 127.0.0.1
  2. python scripts/build-overlap.py

- 調べた結果（人ごとの登録チャンネル）はチャットの置き場所に _subs.json として残し、
  次からは新しく来た人だけを調べる。全員を調べ直すときは --refresh。
- API消費: 1人あたり1〜4u（登録チャンネル50件ごとに1u・最大200件まで見る）。
"""
import argparse
import collections
import datetime as dt
import glob
import importlib.util
import json
import os
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "overlap.json")
TOOL = "http://127.0.0.1:8799"
MIN_PEOPLE = 3  # これ未満の人数しかいないチャンネルは載せない（個人が特定されないように）
TOP = 40
BATCH = 10
JST = dt.timezone(dt.timedelta(hours=9))

# チャットの読み方と手元の設定は build-listeners.py と同じものを使う
spec = importlib.util.spec_from_file_location("bl", os.path.join(ROOT, "scripts", "build-listeners.py"))
bl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bl)


def call_tool(body, path="/subs"):
    req = urllib.request.Request(
        TOOL + path, data=json.dumps(body).encode(), headers={"content-type": "application/json", "user-agent": "build-overlap"}
    )
    return json.loads(urllib.request.urlopen(req, timeout=120).read().decode("utf-8"))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--refresh", action="store_true", help="前に調べた人も含めて全員を調べ直す")
    args = ap.parse_args()

    cfg = bl.load_local_config()
    hidden = bl.read_id_list(cfg["hiddenFile"])
    attended = collections.Counter()  # チャンネルID → コメントした配信の数
    for path in glob.glob(os.path.join(cfg["chatDir"], "*.live_chat.json")):
        seen = set()
        for _, cid, name, _, _ in bl.load_chat(path):
            if cid != bl.OWNER_CHANNEL and cid not in hidden and name not in hidden:
                seen.add(cid)
        attended.update(seen)
    chatters = set(attended)
    # 常連 = 名鑑に載る人と同じ基準
    regulars = {cid for cid, n in attended.items() if n >= bl.MIN_ATTEND}

    cache_path = os.path.join(cfg["chatDir"], "_subs.json")
    cache = {} if args.refresh or not os.path.exists(cache_path) else json.load(open(cache_path, encoding="utf-8"))
    todo = sorted(chatters - set(cache))
    print(f"コメントした人 {len(chatters)}人・これから調べる人 {len(todo)}人")
    for i in range(0, len(todo), BATCH):
        try:
            res = call_tool({"ids": todo[i:i + BATCH], "maxPages": 4})
        except Exception as e:
            sys.exit(f"道具を呼べませんでした（{e}）。wrangler dev が起動しているか確認してください。")
        cache.update(res)
        json.dump(cache, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False)
        print(f"  {min(i + BATCH, len(todo))}/{len(todo)}")

    # ---- 登録しているチャンネル（公開している人だけ） ----
    people = collections.Counter()
    regular_people = collections.Counter()
    info = {}
    public = 0
    for cid in chatters:
        subs = cache.get(cid)
        if not subs:  # None=非公開 / []=公開だが登録なし
            continue
        public += 1
        for ch, title, icon in {s[0]: s for s in subs}.values():
            if ch == bl.OWNER_CHANNEL:
                continue
            people[ch] += 1
            regular_people[ch] += cid in regulars
            info[ch] = (title, icon)
    subscribed = [
        {"id": ch, "title": info[ch][0], "icon": info[ch][1], "n": n, "regular": regular_people[ch]}
        for ch, n in people.most_common(TOP) if n >= MIN_PEOPLE
    ]

    # ---- コメントした場所（scripts/crawl-comment-overlap.py が見て回った結果） ----
    crawl_path = os.path.join(cfg["chatDir"], "_comment_overlap.json")
    crawl = json.load(open(crawl_path, encoding="utf-8")) if os.path.exists(crawl_path) else {}
    crawl_meta = crawl.pop("_meta", {})
    rows = []
    checked = streams = 0
    for ch, rec in crawl.items():
        if not rec["streams"]:
            continue
        checked += 1
        streams += len(rec["streams"])
        who = {c for s in rec["streams"].values() for c in s["ours"]} & chatters
        if len(who) >= MIN_PEOPLE:
            rows.append({"id": ch, "title": rec.get("name") or "", "icon": "", "n": len(who),
                         "regular": len(who & regulars), "streams": len(rec["streams"])})
    rows.sort(key=lambda r: (-r["n"], -r["regular"]))
    rows = rows[:TOP]

    # チャンネル名とアイコン（手元に覚えておき、足りないぶんだけ道具に聞く。道具が止まっていたら名前だけで出す）
    info_path = os.path.join(cfg["chatDir"], "_channel_info.json")
    known = json.load(open(info_path, encoding="utf-8")) if os.path.exists(info_path) else {}
    known.update({ch: list(v) for ch, v in info.items() if ch not in known})
    missing = [r["id"] for r in rows if r["id"] not in known]
    for i in range(0, len(missing), 50):
        try:
            known.update(call_tool({"ids": missing[i:i + 50]}, "/channels"))
        except Exception as e:
            print(f"（アイコンを取れませんでした: {e}。wrangler dev を起動して実行し直すと入ります）")
            break
    json.dump(known, open(info_path, "w", encoding="utf-8"), ensure_ascii=False)
    for r in rows:
        if r["id"] in known:
            r["title"], r["icon"] = known[r["id"]][0] or r["title"], known[r["id"]][1]

    out = {
        "generated": dt.datetime.now(JST).strftime("%Y-%m-%d %H:%M"),
        "chatters": len(chatters),
        "regulars": len(regulars),
        "minPeople": MIN_PEOPLE,
        "commented": {"days": crawl_meta.get("days", 7), "at": crawl_meta.get("at", ""), "checked": checked, "streams": streams, "channels": rows},
        "subscribed": {"public": public, "publicRegular": sum(1 for cid in regulars if cache.get(cid)), "channels": subscribed},
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"コメントした場所: {checked}チャンネル・配信{streams}本を見て、{MIN_PEOPLE}人以上が {len(rows)}チャンネル")
    for c in rows[:30]:
        print(f"  {c['n']:>3}人（常連{c['regular']}）  {c['title']}")
    print(f"登録しているチャンネル: 公開している人 {public}人 / {len(chatters)}人 → {len(subscribed)}チャンネル")


if __name__ == "__main__":
    main()
