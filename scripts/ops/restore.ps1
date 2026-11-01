param(
  [Parameter(Mandatory = $true)][string]$DumpFile
)
$ErrorActionPreference = "Stop"
$root = "D:\MMS"
$restore = Get-ChildItem (Join-Path $root ".tools") -Recurse -Filter "pg_restore.exe" | Select-Object -First 1
if (-not $restore) { throw "pg_restore.exe was not found under .tools" }
if ($DumpFile -notmatch "mms_dev-") { throw "Refusing a dump whose name does not look like a local mms_dev backup." }
$passwordFile = Join-Path $root "data\db-password.local.txt"
$env:PGPASSWORD = (Get-Content $passwordFile -Raw).Trim()
try {
  & $restore.FullName -h 127.0.0.1 -p 54329 -U mms -d mms_dev --clean --if-exists $DumpFile
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed" }
  Write-Output "restore finished"
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
