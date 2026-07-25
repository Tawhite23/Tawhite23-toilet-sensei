# PO Token プロバイダ(bgutil-ytdlp-pot-provider)の「サーバースクリプト」を
# デフォルトの配置場所（%USERPROFILE%\bgutil-ytdlp-pot-provider）にセットアップする。
#
# 前提: pip install -r scripts\requirements.txt で bgutil-ytdlp-pot-provider
#       (Pythonプラグイン)がインストール済みであること。Node.js 20+ が必要。
#
# 実行方法（PowerShellで）:
#   cd C:\Users\user\yt-wiki\Tawhite23-toilet-sensei
#   powershell -ExecutionPolicy Bypass -File scripts\setup-pot.ps1

$ErrorActionPreference = "Stop"

$potVer = (python -c "import importlib.metadata as m; print(m.version('bgutil-ytdlp-pot-provider'))").Trim()
$dest = Join-Path $env:USERPROFILE "bgutil-ytdlp-pot-provider"

Write-Host "[setup-pot] bgutil-ytdlp-pot-provider version: $potVer"

if (Test-Path (Join-Path $dest ".git")) {
    Push-Location $dest
    $current = (git describe --tags --exact-match 2>$null)
    Pop-Location
    if ($current -eq $potVer) {
        Write-Host "[setup-pot] already set up at $dest (version $potVer), skipping clone"
    } else {
        Write-Host "[setup-pot] version mismatch (have: $current, want: $potVer) -> re-cloning"
        Remove-Item -Recurse -Force $dest
    }
}

if (-not (Test-Path $dest)) {
    git clone --depth 1 --single-branch --branch $potVer `
        https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git $dest
}

Push-Location (Join-Path $dest "server")
npm ci
npx tsc
Pop-Location

Write-Host "[setup-pot] done: $dest\server (built)"
