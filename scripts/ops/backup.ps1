$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $root "package.json"))) { $root = "D:\MMS" }
$dump = Get-ChildItem (Join-Path $root ".tools") -Recurse -Filter "pg_dump.exe" | Select-Object -First 1
if (-not $dump) { throw "pg_dump.exe was not found under .tools" }
$passwordFile = Join-Path $root "data\db-password.local.txt"
if (-not (Test-Path $passwordFile)) { throw "Local database password file is missing." }
$outDir = Join-Path $root "data\backups"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$out = Join-Path $outDir ("mms_dev-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".dump")
$env:PGPASSWORD = (Get-Content $passwordFile -Raw).Trim()
try {
  & $dump.FullName -h 127.0.0.1 -p 54329 -U mms -d mms_dev -Fc -f $out
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
  Write-Output "backup written"
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
