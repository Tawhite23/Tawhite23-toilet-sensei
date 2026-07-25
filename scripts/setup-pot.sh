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

echo "[setup-pot] done: $DEST/server (built)"
