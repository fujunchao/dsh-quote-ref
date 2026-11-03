<#
.SYNOPSIS
  Remove dsh-quote-ref from a DeepSeekRuntime desktop profile.
.DESCRIPTION
  Restores cordis.patch.yml from the .bak-before-quote-ref backup when available, otherwise strips
  the generated insert block, then renames the installed plugin folder to *.bak-<timestamp>.
.PARAMETER Profile
  Profile name under %USERPROFILE%\.dsh\profiles (default: desktop).
#>
param(
  [string]$Profile = 'desktop'
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

$dshHome = Resolve-DshHome
$profileDir = Join-Path $dshHome (Join-Path 'profiles' $Profile)
$patchFile = Join-Path $profileDir 'cordis.patch.yml'
$backupFile = Join-Path $profileDir 'cordis.patch.yml.bak-before-quote-ref'
$target = Join-Path $dshHome 'plugins\dsh-quote-ref'

if (-not (Test-Path $patchFile)) { throw "profile patch not found: $patchFile" }

if (Test-Path $backupFile) {
  Copy-Item -Force $backupFile $patchFile
  Write-Step "restored $patchFile from $backupFile"
} else {
  $text = Get-Content -Raw -Path $patchFile
  if ($text -match 'id:\s*quote-ref') {
    $pattern = '(?ms)^# dsh-quote-ref:.*?^\s*- insert:\r?\n\s+- id: quote-ref\r?\n(?:\s+.*\r?\n)*'
    $updated = [regex]::Replace($text, $pattern, '')
    if ($updated -notmatch 'id:\s*quote-ref') {
      $encoding = New-Object System.Text.UTF8Encoding($false)
      [System.IO.File]::WriteAllText($patchFile, $updated, $encoding)
      Write-Step 'removed the quote-ref insert block'
    } else {
      Write-Warn 'quote-ref row found but the generated block markers are missing; edit cordis.patch.yml by hand'
    }
  } else {
    Write-Step 'no quote-ref row found; nothing to remove from cordis.patch.yml'
  }
}

if (Test-Path $target) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $moved = "$target.bak-$stamp"
  Move-Item -Force $target $moved
  Write-Step "moved plugin folder to $moved"
}

Write-Host ''
Write-Host 'Removed. Restart DeepSeekRuntime for the change to take effect.' -ForegroundColor Green
Write-Host 'Note: quote chips left inside an old draft block sending until removed (the framework cannot find the codec).'
