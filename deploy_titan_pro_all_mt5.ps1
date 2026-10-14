# ==============================================================================
# Deploy-TitanProAllMT5.ps1
# Automatischer Rollout der besten Titan Pro Versionen & Set-Dateien
# auf alle erreichbaren MT5 Terminals (Roaming Data Folders & Portable Instanzen)
# ==============================================================================

param(
    [switch]$VerboseLog = $true
)

$ErrorActionPreference = "Continue"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "         TITAN PRO ENTERPRISE ROLLOUT - ALLE MT5 TERMINALS" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

$sourceDir = "C:\Users\zirku\Downloads\testing"
$editorPath = "C:\Program Files\PU Prime MT5 Terminal\metaeditor64.exe"
$includeDir = "C:\Users\zirku\Documents\goldm5\.mt5-puprime\MQL5"

# 1. Kompilierung verifizieren
Write-Host "[1/4] Frische Kompilierung von Titan Pro & Titan Pro 25k..." -ForegroundColor Yellow

$eaSources = @(
    @{ Name = "XAU_Titan_Pro"; File = "$sourceDir\XAU_Titan_Pro.mq5"; Out = "$sourceDir\XAU_Titan_Pro.ex5" },
    @{ Name = "XAU_Titan_Pro_25k"; File = "$sourceDir\XAU_Titan_Pro_25k.mq5"; Out = "$sourceDir\XAU_Titan_Pro_25k.ex5" }
)

foreach ($ea in $eaSources) {
    $logFile = "$sourceDir\compile_$($ea.Name).log"
    if (Test-Path $logFile) { Remove-Item $logFile -Force }
    
    $p = Start-Process -FilePath $editorPath -ArgumentList "/compile:`"$($ea.File)`"", "/include:`"$includeDir`"", "/log:`"$logFile`"" -PassThru -Wait
    
    $compiledOk = $false
    if (Test-Path $logFile) {
        $logContent = Get-Content $logFile -Raw
        if ($logContent -match "0 errors, 0 warnings") {
            $compiledOk = $true
            Write-Host "  [OK] $($ea.Name): Kompiliert ohne Fehler (0 errors, 0 warnings)." -ForegroundColor Green
        } else {
            Write-Host "  [WARN] $($ea.Name) Compiler Log:" -ForegroundColor Red
            Write-Host $logContent -ForegroundColor DarkRed
        }
        Remove-Item $logFile -Force -ErrorAction SilentlyContinue
    }
    
    if (-not $compiledOk -and (Test-Path $ea.Out)) {
        Write-Host "  [INFO] Existierende Binary $($ea.Name).ex5 wird verwendet." -ForegroundColor Yellow
    }
}

# 2. Quell-Dateien zusammenstellen
$expertFiles = @(
    "$sourceDir\XAU_Titan_Pro.ex5",
    "$sourceDir\XAU_Titan_Pro.mq5",
    "$sourceDir\XAU_Titan_Pro_25k.ex5",
    "$sourceDir\XAU_Titan_Pro_25k.mq5"
)

$setFilePatterns = @(
    "$sourceDir\XAU_Titan_Pro*.set",
    "$sourceDir\siegerset.set",
    "$sourceDir\endstation.set"
)

$setFiles = @()
foreach ($pat in $setFilePatterns) {
    $setFiles += Get-ChildItem -Path $pat -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
}
$setFiles = $setFiles | Select-Object -Unique

Write-Host ""
Write-Host "[2/4] Zu verteilende Dateien:" -ForegroundColor Yellow
Write-Host "  Expert Advisors ($($expertFiles.Count)): " -ForegroundColor Cyan
foreach ($f in $expertFiles) {
    $item = Get-Item $f -ErrorAction SilentlyContinue
    if ($item) {
        Write-Host "    - $($item.Name) ($($item.Length) Bytes, Stand: $($item.LastWriteTime))" -ForegroundColor Gray
    }
}

Write-Host "  Set-Dateien ($($setFiles.Count)): " -ForegroundColor Cyan
foreach ($f in $setFiles) {
    $item = Get-Item $f -ErrorAction SilentlyContinue
    if ($item) {
        Write-Host "    - $($item.Name) ($($item.Length) Bytes)" -ForegroundColor Gray
    }
}

# 3. Alle MT5 Terminal-Ziele ermitteln
Write-Host ""
Write-Host "[3/4] Ermittle alle MT5 Terminals..." -ForegroundColor Yellow

$targetMql5Dirs = @()

# 3a. Alle Roaming Terminal Data Folders
$roamingBase = "C:\Users\zirku\AppData\Roaming\MetaQuotes\Terminal"
if (Test-Path $roamingBase) {
    Get-ChildItem -Path $roamingBase -Directory | ForEach-Object {
        if ($_.Name -notin @("Common", "Community", "Help")) {
            $originFile = Join-Path $_.FullName "origin.txt"
            $origin = if (Test-Path $originFile) { (Get-Content $originFile -Raw).Trim() } else { "Unbekannt" }
            $mql5 = Join-Path $_.FullName "MQL5"
            $targetMql5Dirs += [PSCustomObject]@{
                Type = "Roaming MT5 Data"
                Identifier = $_.Name
                Origin = $origin
                MQL5Path = $mql5
            }
        }
    }
}

# 3b. Alle lokalen / portable MT5 Instanzen
$localInstalls = @(
    "C:\Program Files\PU Prime MT5 Terminal",
    "C:\Program Files\MetaTrader 5",
    "C:\Program Files\MetaTrader 5 IC Markets EU",
    "C:\Program Files\Beyond IQ Capital MT5 Terminal",
    "C:\Program Files\VT Markets (Pty) MT5 Terminal",
    "C:\Users\zirku\Documents\goldm5\.mt5-demo",
    "C:\Users\zirku\Documents\goldm5\.mt5-puprime",
    "C:\Users\zirku\Documents\goldm5\.mt5-puprime-700194619",
    "C:\Users\zirku\Documents\goldm5\.mt5-lab",
    "C:\Users\zirku\Documents\goldm5\.mt5",
    "C:\Users\zirku\Downloads\mt5_strategy_research\rev\hermes_ea_work\portable",
    "E:\trading\tom\build\test-terminal",
    "E:\trading\cock\prop\build\icmarkets-calendar",
    "E:\trading\cock\prop\build\icmarkets-native",
    "E:\trading\cock\prop\build\icmarkets-test",
    "E:\trading\cock\prop\build\test-terminal",
    "E:\trading\cock\prop\build\vtmarkets-test"
)

foreach ($loc in $localInstalls) {
    if (Test-Path $loc) {
        $mql5 = Join-Path $loc "MQL5"
        $targetMql5Dirs += [PSCustomObject]@{
            Type = "Local / Portable Installation"
            Identifier = (Split-Path $loc -Leaf)
            Origin = $loc
            MQL5Path = $mql5
        }
    }
}

# Duplikate filtern
$uniqueTargets = $targetMql5Dirs | Sort-Object MQL5Path -Unique
Write-Host "  Gefundene MT5 Ziele: $($uniqueTargets.Count)" -ForegroundColor Green

# 4. Rollout durchführen
Write-Host ""
Write-Host "[4/4] Rollout auf alle Terminals..." -ForegroundColor Yellow

$successCount = 0
$failCount = 0
$stats = @()

foreach ($target in $uniqueTargets) {
    $mql5Path = $target.MQL5Path
    $expertsDir = Join-Path $mql5Path "Experts"
    $expertsSubDir = Join-Path $expertsDir "TitanPro"
    $presetsDir = Join-Path $mql5Path "Presets"
    $testerProfilesDir = Join-Path $mql5Path "Profiles\Tester"
    
    try {
        # Verzeichnisse anlegen falls nicht existent
        if (-not (Test-Path $expertsDir)) { New-Item -Path $expertsDir -ItemType Directory -Force | Out-Null }
        if (-not (Test-Path $expertsSubDir)) { New-Item -Path $expertsSubDir -ItemType Directory -Force | Out-Null }
        if (-not (Test-Path $presetsDir)) { New-Item -Path $presetsDir -ItemType Directory -Force | Out-Null }
        if (-not (Test-Path $testerProfilesDir)) { New-Item -Path $testerProfilesDir -ItemType Directory -Force | Out-Null }
        
        # 1. EAs kopieren (sowohl nach Experts\ als auch nach Experts\TitanPro\)
        foreach ($ea in $expertFiles) {
            Copy-Item -Path $ea -Destination $expertsDir -Force
            Copy-Item -Path $ea -Destination $expertsSubDir -Force
        }
        
        # 2. Set-Dateien kopieren (nach Presets\ und Profiles\Tester\)
        foreach ($set in $setFiles) {
            Copy-Item -Path $set -Destination $presetsDir -Force
            Copy-Item -Path $set -Destination $testerProfilesDir -Force
        }
        
        $successCount++
        $stats += [PSCustomObject]@{
            Target = "$($target.Type) [$($target.Identifier)]"
            Origin = $target.Origin
            Status = "OK"
            EAsDeployed = $expertFiles.Count
            SetsDeployed = $setFiles.Count
        }
        Write-Host "  [OK] $($target.Type) -> $($target.Origin)" -ForegroundColor Green
    }
    catch {
        $failCount++
        $stats += [PSCustomObject]@{
            Target = "$($target.Type) [$($target.Identifier)]"
            Origin = $target.Origin
            Status = "Fehler: $($_.Exception.Message)"
            EAsDeployed = 0
            SetsDeployed = 0
        }
        Write-Host "  [FEHLER] $($target.Type) ($($target.Origin)): $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "                             ROLLOUT ZUSAMMENFASSUNG" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "  Erfolgreich ausgerollt auf : $successCount Terminals" -ForegroundColor Green
Write-Host "  Fehlgeschlagen             : $failCount Terminals" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
Write-Host "  EAs pro Terminal           : $($expertFiles.Count) (in Experts\ und Experts\TitanPro\)" -ForegroundColor Cyan
Write-Host "  Set-Dateien pro Terminal   : $($setFiles.Count) (in Presets\ und Profiles\Tester\)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan
