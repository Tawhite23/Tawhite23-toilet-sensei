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

# --------------------------------------------------------------------------
# サーバーを起動する（ここまでのビルドだけでは PO Token は取得できない）
#
# 【重要】bgutil のプラグインは http://127.0.0.1:4416 で待ち受けるこのサーバーに
# 問い合わせてトークンを得る。起動していないと yt-dlp は
# "No video formats found!" で失敗する。
# メタデータ(タイトル・字幕一覧)だけは取れてしまうため原因を見誤りやすい。
# --------------------------------------------------------------------------
$potBase = "http://127.0.0.1:4416"
$serverDir = Join-Path $dest "server"

function Test-Pot {
    try {
        Invoke-WebRequest -Uri "$potBase/ping" -TimeoutSec 2 -UseBasicParsing | Out-Null
        return $true
    } catch {
        return $false
    }
}

if (Test-Pot) {
    Write-Host "[setup-pot] provider already running at $potBase"
} else {
    Write-Host "[setup-pot] starting provider server..."
    # 別ウィンドウを出さずにバックグラウンド起動する。
    # 文字起こしが終わっても起動したままなので、止めたい場合は
    # そのプロセス(node build\main.js)を終了すること。
    Start-Process -FilePath "node" -ArgumentList "build\main.js" `
        -WorkingDirectory $serverDir -WindowStyle Hidden | Out-Null

    $ready = $false
    for ($i = 1; $i -le 30; $i++) {
        if (Test-Pot) {
            Write-Host "[setup-pot] provider ready at $potBase (${i}s)"
            $ready = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) {
        Write-Error "[setup-pot] provider did not become ready within 30s"
        exit 1
    }
}

Write-Host "[setup-pot] done: $dest\server (built & running)"
