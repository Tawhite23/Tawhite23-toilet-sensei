#!/usr/bin/env python3
"""
needs-whisper.json の動画に「今は」自動字幕が付いていないかを調べる。

背景:
  YouTube の自動字幕は配信終了直後には無く、後から生成されることがある。
  needs-whisper.json は「その時点で字幕が無かった」記録でしかない。
  しかも CI は --subs-only のとき needs-whisper 入りの動画を再確認せず飛ばすため、
  あとから字幕が付いても永久に拾われない。

  字幕があれば Whisper は不要（数秒で終わる & CIでも処理できる）ので、
  手作業でWhisperを回す前にここを洗い出す価値が大きい。

使い方:
  python scripts/probe-subs.py            # 全件を確認（時間がかかる）
  python scripts/probe-subs.py --limit 20 # 先頭20本だけ試す
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NEEDS = ROOT / "public" / "data" / "transcripts" / "needs-whisper.json"


def has_ja_subs(video_id: str, timeout: int = 90) -> bool | None:
    """日本語の字幕(手動/自動)があるか。None は判定不能(取得エラー)。"""
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--no-warnings", "--skip-download", "--ignore-no-formats-error",
        "--list-subs", f"https://www.youtube.com/watch?v={video_id}",
    ]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None
    if p.returncode != 0:
        return None
    out = p.stdout
    # "ja" もしくは "ja-orig" の行があれば字幕あり
    for line in out.splitlines():
        tok = line.strip().split()
        if tok and tok[0] in ("ja", "ja-orig") or tok and tok[0].startswith("ja-"):
            return True
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="N本だけ調べる(0=全件)")
    ap.add_argument("--offset", type=int, default=0, help="先頭からN本読み飛ばす")
    args = ap.parse_args()

    items = json.loads(NEEDS.read_text(encoding="utf-8"))
    if args.offset:
        items = items[args.offset:]
    if args.limit:
        items = items[: args.limit]

    have, none_, err = [], [], []
    for i, it in enumerate(items, 1):
        vid = it.get("videoId")
        r = has_ja_subs(vid)
        mark = {True: "字幕あり", False: "字幕なし", None: "判定不能"}[r]
        (have if r else none_ if r is False else err).append(it)
        print(f"[{i}/{len(items)}] {vid} {mark}  {it.get('title','')[:34]}", flush=True)

    total = len(items)
    print()
    print(f"=== 結果 ({total}本を確認) ===")
    print(f"字幕あり(Whisper不要): {len(have)}本")
    print(f"字幕なし(Whisper必要): {len(none_)}本")
    print(f"判定不能            : {len(err)}本")
    if have:
        hours = sum(x.get("durationSec", 0) for x in have) / 3600
        print(f"→ Whisperを回さずに済む分: 約{hours:.1f}時間")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
