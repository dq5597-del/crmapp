# CRM 開發伺服器啟動腳本 v2
# 下載 Node.js zip 解壓縮到 LOCALAPPDATA - 不需要管理員權限
$crmPath   = "C:\Users\10319\Claude\Projects\CRM APP製作"
$nodeVer   = "22.16.0"
$nodeDir   = "$env:LOCALAPPDATA\Programs\nodejs"
$zipUrl    = "https://nodejs.org/dist/v$nodeVer/node-v$nodeVer-win-x64.zip"
$zipFile   = "$env:TEMP\nodejs-lts.zip"
$extractTo = "$env:TEMP\node-extract"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  CRM APP 開發伺服器啟動器 v2"              -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: 刷新 PATH 先確認 node 是否已存在 ---
$env:PATH = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
$existingNode = Get-Command node -ErrorAction SilentlyContinue

if ($existingNode) {
    Write-Host "[OK] Node.js 已存在: $($existingNode.Source)" -ForegroundColor Green
    Write-Host "     版本: $(node --version)"
} elseif (Test-Path "$nodeDir\node.exe") {
    Write-Host "[OK] 找到 $nodeDir\node.exe，加入 PATH" -ForegroundColor Green
    $env:PATH = "$nodeDir;" + $env:PATH
} else {
    # --- Step 2: 下載 Node.js zip ---
    Write-Host "[1/4] 下載 Node.js v$nodeVer (無需管理員)..." -ForegroundColor Yellow
    Write-Host "      $zipUrl"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing
        Write-Host "      下載完成 ($(([IO.FileInfo]$zipFile).Length/1MB -as [int]) MB)" -ForegroundColor Green
    } catch {
        Write-Host "      下載失敗: $_" -ForegroundColor Red
        Write-Host "      請手動安裝 Node.js: https://nodejs.org/en/download/" -ForegroundColor Yellow
        Read-Host "按 Enter 關閉"
        exit 1
    }

    # --- Step 3: 解壓縮並移動 ---
    Write-Host "[2/4] 解壓縮..." -ForegroundColor Yellow
    if (Test-Path $extractTo) { Remove-Item $extractTo -Recurse -Force }
    Expand-Archive -Path $zipFile -DestinationPath $extractTo -Force
    Remove-Item $zipFile -ErrorAction SilentlyContinue

    $extracted = (Get-ChildItem $extractTo -Directory | Select-Object -First 1).FullName
    if (Test-Path $nodeDir) { Remove-Item $nodeDir -Recurse -Force }
    Move-Item $extracted $nodeDir

    Remove-Item $extractTo -Recurse -ErrorAction SilentlyContinue
    Write-Host "      安裝至: $nodeDir" -ForegroundColor Green

    # --- Step 4: 加入使用者 PATH ---
    Write-Host "[3/4] 設定 PATH (使用者層級)..." -ForegroundColor Yellow
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -notlike "*nodejs*") {
        [Environment]::SetEnvironmentVariable("Path", "$nodeDir;$userPath", "User")
    }
    $env:PATH = "$nodeDir;" + [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")

    Write-Host "      Node: $(node --version)" -ForegroundColor Green
    Write-Host "      npm:  $(npm --version)"  -ForegroundColor Green
}

# --- Step 5: npm run dev ---
Write-Host ""
Write-Host "[4/4] 進入 CRM 目錄並啟動開發伺服器..." -ForegroundColor Yellow
Set-Location $crmPath
Write-Host "      http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
npm run dev
