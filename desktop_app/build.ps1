param(
  [switch]$SkipSmokeTest,
  [switch]$BuildInstaller,
  [string]$GtkRuntimeDir = "",
  [string]$InnoCompilerPath = "",
  [string]$SmokeExcel = "",
  [string[]]$SmokeTemplate = @()
)

Set-ExecutionPolicy -Scope Process Bypass
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

function Resolve-GtkPaths {
  param([string]$PreferredDir)

  $candidates = @()
  if ($PreferredDir) {
    $candidates += $PreferredDir
  }
  if ($env:WEASYPRINT_DLL_DIR) {
    $candidates += $env:WEASYPRINT_DLL_DIR
  }
  $candidates += @(
    "C:\Program Files\GTK3-Runtime Win64\bin",
    "C:\msys64\mingw64\bin"
  )

  foreach ($candidate in $candidates) {
    if (-not $candidate) {
      continue
    }
    $resolvedDllDir = $candidate
    if ((Test-Path $candidate) -and (Test-Path (Join-Path $candidate "bin"))) {
      $resolvedDllDir = Join-Path $candidate "bin"
    }
    if (-not (Test-Path $resolvedDllDir)) {
      continue
    }

    $etcCandidates = @(
      (Join-Path (Split-Path -Parent $resolvedDllDir) "etc"),
      (Join-Path (Split-Path -Parent (Split-Path -Parent $resolvedDllDir)) "etc")
    )

    foreach ($etcDir in $etcCandidates) {
      if (Test-Path (Join-Path $etcDir "fonts\\fonts.conf")) {
        return @{
          DllDir = (Resolve-Path $resolvedDllDir).Path
          EtcDir = (Resolve-Path $etcDir).Path
        }
      }
    }
  }

  throw "No se encontro GTK runtime para WeasyPrint. Usa -GtkRuntimeDir o define WEASYPRINT_DLL_DIR."
}

function Get-SmokeAssets {
  param(
    [string]$ExcelOverride,
    [string[]]$TemplateOverride
  )

  $repoRoot = Split-Path -Parent $scriptDir
  $excelPath = $ExcelOverride
  if (-not $excelPath) {
    $excelPath = Join-Path $repoRoot "plantillas\ejemplos\ejemplo_10_registros.xlsx"
  }

  $templatePaths = @($TemplateOverride | Where-Object { $_ })
  if ($templatePaths.Count -eq 0) {
    $templatePaths = @(
      (Join-Path $repoRoot "plantillas\ejemplos\plantilla_contrato.html")
    )
  }

  return @{
    Excel = (Resolve-Path $excelPath).Path
    Templates = @($templatePaths | ForEach-Object { (Resolve-Path $_).Path })
  }
}

function Stop-StaleDesktopProcesses {
  param([string]$ProjectDesktopDir)

  $normalizedProjectDir = [System.IO.Path]::GetFullPath($ProjectDesktopDir)
  $desktopProcesses = Get-Process -Name "ColegiosDesktop" -ErrorAction SilentlyContinue
  foreach ($process in $desktopProcesses) {
    $processPath = ""
    try {
      $processPath = $process.Path
    } catch {
      continue
    }
    if (-not $processPath) {
      continue
    }
    $normalizedProcessPath = [System.IO.Path]::GetFullPath($processPath)
    if ($normalizedProcessPath.StartsWith($normalizedProjectDir, [System.StringComparison]::OrdinalIgnoreCase)) {
      Stop-Process -Id $process.Id -Force
    }
  }
}

function Resolve-InnoCompiler {
  param([string]$PreferredPath)

  $candidates = @()
  if ($PreferredPath) {
    $candidates += $PreferredPath
  }

  $command = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($command -and $command.Source) {
    $candidates += $command.Source
  }

  $candidates += @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return (Resolve-Path $candidate).Path
    }
  }

  return $null
}

if (-not (Test-Path ".venv")) {
  py -m venv .venv
}

. .\.venv\Scripts\Activate.ps1

$gtkPaths = Resolve-GtkPaths -PreferredDir $GtkRuntimeDir
$env:WEASYPRINT_DLL_DIR = $gtkPaths.DllDir
$env:WEASYPRINT_ETC_DIR = $gtkPaths.EtcDir

Write-Host "GTK runtime detectado en:"
Write-Host "  DLLs: $($env:WEASYPRINT_DLL_DIR)"
Write-Host "  ETC : $($env:WEASYPRINT_ETC_DIR)"

python -m pip install --upgrade pip
pip install -r requirements.txt
pip install pyinstaller

Stop-StaleDesktopProcesses -ProjectDesktopDir $scriptDir

if (Test-Path "build") {
  Remove-Item -Recurse -Force "build"
}

if (Test-Path "dist") {
  Remove-Item -Recurse -Force "dist"
}

pyinstaller --noconfirm .\colegios-desktop.spec

$exePath = Join-Path $scriptDir "dist\ColegiosDesktop\ColegiosDesktop.exe"
if (-not (Test-Path $exePath)) {
  throw "PyInstaller termino sin generar $exePath"
}

$requiredDlls = @(
  "libpango-1.0-0.dll",
  "libharfbuzz-0.dll",
  "libfontconfig-1.dll",
  "libfreetype-6.dll"
)

foreach ($dllName in $requiredDlls) {
  $dllPath = Join-Path $scriptDir "dist\ColegiosDesktop\_internal\$dllName"
  if (-not (Test-Path $dllPath)) {
    throw "Falta $dllName en dist. El build no es distribuible."
  }
}

if (-not $SkipSmokeTest) {
  $assets = Get-SmokeAssets -ExcelOverride $SmokeExcel -TemplateOverride $SmokeTemplate
  $smokeRoot = Join-Path $env:TEMP ("colegios-desktop-smoke-" + [guid]::NewGuid().ToString("N"))
  $smokeAppDir = Join-Path $smokeRoot "app"
  $smokeInputDir = Join-Path $smokeRoot "input"
  $smokeOutputDir = Join-Path $smokeRoot "generated"
  $smokeReport = Join-Path $smokeRoot "smoke-report.json"

  New-Item -ItemType Directory -Force -Path $smokeAppDir | Out-Null
  New-Item -ItemType Directory -Force -Path $smokeInputDir | Out-Null

  Copy-Item -Recurse -Force (Join-Path $scriptDir "dist\ColegiosDesktop\*") $smokeAppDir

  $copiedExcel = Join-Path $smokeInputDir (Split-Path -Leaf $assets.Excel)
  Copy-Item -Force $assets.Excel $copiedExcel

  $copiedTemplates = @()
  foreach ($templatePath in $assets.Templates) {
    $copiedTemplate = Join-Path $smokeInputDir (Split-Path -Leaf $templatePath)
    Copy-Item -Force $templatePath $copiedTemplate
    $copiedTemplates += $copiedTemplate
  }

  $smokeExe = Join-Path $smokeAppDir "ColegiosDesktop.exe"
  $arguments = @(
    "--smoke-test",
    "--excel", $copiedExcel,
    "--output-root", $smokeOutputDir,
    "--json-out", $smokeReport
  )
  foreach ($templatePath in $copiedTemplates) {
    $arguments += @("--template", $templatePath)
  }

  $process = Start-Process -FilePath $smokeExe -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "El smoke test del ejecutable fallo con codigo $($process.ExitCode)"
  }
  if (-not (Test-Path $smokeReport)) {
    throw "El smoke test no genero el reporte JSON esperado."
  }

  $smokeData = Get-Content $smokeReport | ConvertFrom-Json
  if (-not $smokeData.ok) {
    throw "El smoke test devolvio un reporte no valido."
  }

  Write-Host ""
  Write-Host "Smoke test OK:"
  Write-Host "  Reporte : $smokeReport"
  Write-Host "  Salida  : $($smokeData.batch_dir)"
  Write-Host "  PDFs    : $($smokeData.generated_count)"
}

Write-Host ""
Write-Host "Ejecutable generado en:"
Write-Host "  $exePath"

if ($BuildInstaller) {
  $isccPath = Resolve-InnoCompiler -PreferredPath $InnoCompilerPath
  if (-not $isccPath) {
    throw "No se encontro ISCC.exe. Instala Inno Setup 6 o usa -InnoCompilerPath."
  }

  $installerDir = Join-Path $scriptDir "dist-installer"
  if (Test-Path $installerDir) {
    Remove-Item -Recurse -Force $installerDir
  }

  & $isccPath (Join-Path $scriptDir "installer.iss")
  if ($LASTEXITCODE -ne 0) {
    throw "La compilacion del instalador Inno fallo con codigo $LASTEXITCODE"
  }

  $setupExe = Join-Path $installerDir "colegios-desktop-setup.exe"
  if (-not (Test-Path $setupExe)) {
    throw "Inno termino sin generar $setupExe"
  }

  Write-Host ""
  Write-Host "Instalador generado en:"
  Write-Host "  $setupExe"
}
