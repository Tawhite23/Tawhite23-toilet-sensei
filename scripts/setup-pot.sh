#!/usr/bin/env bash
# PO Token プロバイダ(bgutil-ytdlp-pot-provider)の「サーバースクリプト」を
# デフォルトの配置場所（$HOME/bgutil-ytdlp-pot-provider）にセットアップする。
#
# 前提: `pip install -r scripts/requirements.txt` で bgutil-ytdlp-pot-provider
#       (Pythonプラグイン)がインストール済みであること。Node.js 20+ が必要。
#
# GitHub Actions / Linux / macOS 用。Windowsは scripts/setup-pot.ps1 を使う。
set -euo pipefail

POT_VER=$(python3 -c "import importlib.metadata as m; print(m.version('bgutil-ytdlp-pot-provider'))")
DEST="$HOME/bgutil-ytdlp-pot-provider"

echo "[setup-pot] bgutil-ytdlp-pot-provider version: $POT_VER"

if [ -d "$DEST/.git" ]; then
  CURRENT=$(git -C "$DEST" describe --tags --exact-match 2>/dev/null || echo "")
  if [ "$CURRENT" = "$POT_VER" ]; then
    echo "[setup-pot] already set up at $DEST (version $POT_VER), skipping clone"
  else
    echo "[setup-pot] version mismatch (have: $CURRENT, want: $POT_VER) -> re-cloning"
    rm -rf "$DEST"
  fi
fi

if [ ! -d "$DEST" ]; then
  git clone --depth 1 --single-branch --branch "$POT_VER" \
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git "$DEST"
fi

cd "$DEST/server"
npm ci
npx tsc

# --------------------------------------------------------------------------
# サーバーを起動する（ここまでのビルドだけでは PO Token は取得できない）
#
# 【重要】bgutil のプラグインは http://127.0.0.1:4416 で待ち受けるこのサーバーに
# 問い合わせてトークンを得る。サーバーが起動していないとトークンが空のままとなり、
# yt-dlp は "No video formats found!" で失敗する。
# 厄介なのは「メタデータ(タイトル・字幕一覧)は取れてしまう」点で、
# 一見ネットワークもボット判定も問題なく見えるため原因を見誤りやすい。
# 実際このリポジトリでは、ビルドだけして起動を忘れていたため
# 「CIからは音声を取得できない」と誤って結論づけていた。
#
# GitHub Actions ではステップをまたいでバックグラウンドプロセスが生き残るので、
# ここで起動しておけば後続の Transcribe ステップから利用できる。
# --------------------------------------------------------------------------
POT_BASE="http://127.0.0.1:4416"
POT_LOG="${RUNNER_TEMP:-/tmp}/bgutil-pot.log"

if curl -sf --max-time 2 "$POT_BASE/ping" >/dev/null 2>&1; then
  echo "[setup-pot] provider already running at $POT_BASE"
else
  echo "[setup-pot] starting provider server..."
  nohup node build/main.js >"$POT_LOG" 2>&1 &
  disown || true

  for i in $(seq 1 30); do
    if curl -sf --max-time 2 "$POT_BASE/ping" >/dev/null 2>&1; then
      echo "[setup-pot] provider ready at $POT_BASE (${i}s)"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "[setup-pot] ERROR: provider did not become ready within 30s" >&2
      echo "--- $POT_LOG ---" >&2
      cat "$POT_LOG" >&2 || true
      # ここで失敗させる。黙って進むと後段が "No video formats found!" で
      # 失敗し、原因がPO Tokenだと分からなくなるため。
      exit 1
    fi
    sleep 1
  done
fi

echo "[setup-pot] done: $DEST/server (built & running)"
