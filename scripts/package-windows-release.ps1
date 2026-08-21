[CmdletBinding()]
param(
    [string]$SourcePath = 'build\win-unpacked',
    [string]$OutputDirectory = 'build\release',
    [string]$ReleaseLabel = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$source = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $SourcePath))
$output = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputDirectory))

if (-not (Test-Path -LiteralPath $source -PathType Container)) {
    throw "Windows package directory does not exist: $source"
}

if ([string]::IsNullOrWhiteSpace($ReleaseLabel)) {
    $packageJson = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'package.json') | ConvertFrom-Json
    $ReleaseLabel = $packageJson.version
}

if ($ReleaseLabel -notmatch '^[0-9A-Za-z][0-9A-Za-z._-]*$') {
    throw 'ReleaseLabel may contain only letters, numbers, dots, underscores, and hyphens.'
}

$requiredFiles = @(
    'Web MiniDisc Pro.exe',
    'resources\app\package.json',
    'resources\app\MODIFIED-BUILD-NOTICE.txt',
    'resources\app\extras\WMDP-WINUSB-DRIVER-NOTICE.txt',
    'resources\app\extras\drivers\winusb\web_minidisc_winusb.inf',
    'resources\app\extras\drivers\winusb\web_minidisc_winusb.cat',
    'resources\app\extras\drivers\winusb\web_minidisc_winusb.cer'
)

$missing = @($requiredFiles | Where-Object {
    -not (Test-Path -LiteralPath (Join-Path $source $_) -PathType Leaf)
})
if ($missing.Count -gt 0) {
    throw "Windows package is incomplete. Missing: $($missing -join ', ')"
}

$removedHelper = Join-Path $source 'resources\app\extras\wmdp-driver-helper.exe'
if (Test-Path -LiteralPath $removedHelper -PathType Leaf) {
    throw "Obsolete WinUSB helper must not be distributed: $removedHelper"
}

New-Item -ItemType Directory -Force -Path $output | Out-Null
$baseName = "Web-MiniDisc-Pro-$ReleaseLabel-Windows-x64"
$zipPath = Join-Path $output "$baseName.zip"
$checksumPath = Join-Path $output "$baseName.sha256.txt"

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
if (Test-Path -LiteralPath $checksumPath) {
    Remove-Item -LiteralPath $checksumPath -Force
}

Compress-Archive -Path (Join-Path $source '*') -DestinationPath $zipPath -CompressionLevel Optimal
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$stream = [System.IO.File]::OpenRead($zipPath)
try {
    $hashBytes = $sha256.ComputeHash($stream)
} finally {
    $stream.Dispose()
    $sha256.Dispose()
}
$hash = ([System.BitConverter]::ToString($hashBytes) -replace '-', '').ToLowerInvariant()
[System.IO.File]::WriteAllText(
    $checksumPath,
    "$hash  $([System.IO.Path]::GetFileName($zipPath))`r`n",
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Verified Windows package: $source"
Write-Host "Release ZIP: $zipPath"
Write-Host "SHA-256: $hash"
