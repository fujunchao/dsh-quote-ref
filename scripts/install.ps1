<#
.SYNOPSIS
  Install dsh-quote-ref into a DeepSeekRuntime desktop profile (idempotent, backed up).
.DESCRIPTION
  1. copies this plugin folder to %USERPROFILE%\.dsh\plugins\dsh-quote-ref
  2. appends one insert row to <profile>\cordis.patch.yml, using a file:// module specifier
     so neither pnpm install nor a package.json edit is required
  3. validates the generated block against the shipped web profile (--dump-config) and rolls
     back automatically when the YAML does not compose
  4. prints the restart instructions
.PARAMETER Profile
  Profile name under %USERPROFILE%\.dsh\profiles (default: desktop).
.PARAMETER SkipValidate
  Skip the --dump-config validation step.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
.EXAMPLE
  .\scripts\install.ps1 -Profile desktop -SkipValidate
#>
param(
  [string]$Profile = 'desktop',
  [switch]$SkipValidate
)
$ErrorActionPreference = 'Stop'

function Write-Step($text) { Write-Host "[dsh-quote-ref] $text" -ForegroundColor Cyan }
function Write-Warn($text) { Write-Host "[dsh-quote-ref] $text" -ForegroundColor Yellow }

function Resolve-DshHome {
  if ($env:DSH_HOME -and (Test-Path $env:DSH_HOME)) { return $env:DSH_HOME }
  $profileHome = $env:USERPROFILE
  if (-not $profileHome) { $profileHome = [Environment]::GetFolderPath('UserProfile') }
  if (-not $profileHome) { throw 'cannot resolve the user profile directory' }
  return (Join-Path $profileHome '.dsh')
}

function Resolve-DshCli {
  if ($env:DSH_CLI -and (Test-Path $env:DSH_CLI)) { return $env:DSH_CLI }
  $candidates = @()
  $cmd = Get-Command dsh.cmd -ErrorAction SilentlyContinue
  if ($cmd) { $candidates += $cmd.Source }
  if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeekRuntime\resources\runtime\cli\bin\dsh.cmd') }
  if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'DeepSeekRuntime\resources\runtime\cli\bin\dsh.cmd') }
  $candidates += 'D:\Programs\DeepSeekRuntime\resources\runtime\cli\bin\dsh.cmd'
  foreach ($candidate in $candidates) { if ($candidate -and (Test-Path $candidate)) { return $candidate } }
  return $null
}

$pluginSource = Split-Path -Parent $PSScriptRoot
$dshHome = Resolve-DshHome
$target = Join-Path $dshHome 'plugins\dsh-quote-ref'
$profileDir = Join-Path $dshHome (Join-Path 'profiles' $Profile)
$patchFile = Join-Path $profileDir 'cordis.patch.yml'
$backupFile = Join-Path $profileDir 'cordis.patch.yml.bak-before-quote-ref'

if (-not (Test-Path $patchFile)) { throw "profile patch not found: $patchFile (is profile '$Profile' initialised?)" }

Write-Step "copy plugin -> $target"
New-Item -ItemType Directory -Path $target -Force | Out-Null
foreach ($item in @('package.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'lib', 'scripts', 'test')) {
  $source = Join-Path $pluginSource $item
  if (-not (Test-Path $source)) { continue }
  $destination = Join-Path $target $item
  if (Test-Path $destination) { Remove-Item -Recurse -Force $destination }
  Copy-Item -Recurse -Force $source $destination
}

$patchText = Get-Content -Raw -Path $patchFile
if ($patchText -match 'id:\s*quote-ref') {
  Write-Step 'cordis.patch.yml already contains a quote-ref row; leaving it untouched'
} else {
  if (-not (Test-Path $backupFile)) { Copy-Item $patchFile $backupFile; Write-Step "backup -> $backupFile" }
  $moduleUrl = 'file:///' + ($target -replace '\\', '/') + '/lib/index.js'
  $blockLines = @(
    '',
    '# dsh-quote-ref: select transcript text -> quote chip in the composer (browser-only plugin)',
    '# remove this block (or restore .bak-before-quote-ref) to uninstall',
    '- insert:',
    '    - id: quote-ref',
    "      name: '$moduleUrl'",
    '      config:',
    '        maxChars: 4000',
    '        includeOrigin: true'
  )
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::AppendAllText($patchFile, ($blockLines -join "`r`n") + "`r`n", $encoding)
  Write-Step "added insert row to $patchFile"

  if (-not $SkipValidate) {
    $cli = Resolve-DshCli
    if ($cli) {
      $probe = Join-Path ([System.IO.Path]::GetTempPath()) 'dsh-quote-ref-block.yml'
      [System.IO.File]::WriteAllText($probe, ($blockLines -join "`r`n") + "`r`n", $encoding)
      & $cli --profile web --patch $probe --dump-config 2>&1 | Out-Null
      $code = $LASTEXITCODE
      Remove-Item -Force $probe -ErrorAction SilentlyContinue
      if ($code -ne 0) {
        Write-Warn 'generated block does not compose; restoring the previous patch file'
        if (Test-Path $backupFile) { Copy-Item -Force $backupFile $patchFile }
        throw 'rollback complete: the generated insert row was rejected'
      }
      Write-Step 'generated block composes OK'
    } else {
      Write-Warn 'DSH CLI not found (set $env:DSH_CLI); skipped the composition check'
    }
  }
}

Write-Host ''
Write-Host 'Installed. To activate:' -ForegroundColor Green
Write-Host '  1. quit DeepSeekRuntime from the tray menu (Exit), not with taskkill'
Write-Host '  2. start DeepSeekRuntime again'
Write-Host '  3. select text inside a conversation -> a floating Quote / Copy bar appears'
Write-Host ''
Write-Host 'Verify in DevTools (F12): __DSH_BOOT__.entries.some(e => e.id === "dsh-quote-ref")'
Write-Host 'Uninstall with: scripts\uninstall.ps1'
