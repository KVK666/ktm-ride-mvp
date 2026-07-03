param(
  [string]$SourceUrl = $env:NEON_DATABASE_URL,
  [string]$TargetUrl = $env:AWS_DATABASE_URL,
  [string]$TargetSchema = $(if ($env:AWS_DB_SCHEMA) { $env:AWS_DB_SCHEMA } elseif ($env:DB_SCHEMA) { ($env:DB_SCHEMA -split ",")[0].Trim() } else { "ridepulse_db" }),
  [string]$DumpPath = $(Join-Path $env:TEMP "ridepulse-neon-export.dump"),
  [switch]$SkipConfirm,
  [switch]$AllowNonEmptyTarget
)

$ErrorActionPreference = "Stop"

$appTables = @(
  "users",
  "rides",
  "ride_points",
  "password_reset_tokens",
  "ride_album_photos",
  "trips",
  "trip_rides"
)

function Assert-PostgresTool {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found. Install PostgreSQL client tools and add them to PATH."
  }
}

function Assert-SchemaName {
  param([string]$Name)
  if ([string]::IsNullOrWhiteSpace($Name) -or $Name -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") {
    throw "Target schema must be a valid PostgreSQL identifier, for example ridepulse_db."
  }
}

function Invoke-PsqlScalar {
  param([string]$Url, [string]$Sql)
  $output = & psql $Url --tuples-only --no-align --command $Sql
  if ($LASTEXITCODE -ne 0) {
    throw "psql command failed."
  }
  return ($output | Select-Object -Last 1).Trim()
}

function Quote-Identifier {
  param([string]$Identifier)
  return '"' + $Identifier.Replace('"', '""') + '"'
}

if ([string]::IsNullOrWhiteSpace($SourceUrl)) {
  throw "Set NEON_DATABASE_URL or pass -SourceUrl. Do not commit this value."
}

if ([string]::IsNullOrWhiteSpace($TargetUrl)) {
  throw "Set AWS_DATABASE_URL or pass -TargetUrl. Do not commit this value."
}

Assert-SchemaName $TargetSchema
Assert-PostgresTool "pg_dump"
Assert-PostgresTool "pg_restore"
Assert-PostgresTool "psql"

$schemaIdentifier = Quote-Identifier $TargetSchema
$appTableList = ($appTables | ForEach-Object { "'$_'" }) -join ","

$targetTableCount = Invoke-PsqlScalar $TargetUrl "select count(*) from information_schema.tables where table_schema = '$TargetSchema' and table_name in ($appTableList);"
$publicTableCount = Invoke-PsqlScalar $TargetUrl "select count(*) from information_schema.tables where table_schema = 'public' and table_name in ($appTableList);"

if (-not $AllowNonEmptyTarget -and ([int]$targetTableCount -gt 0 -or ([int]$publicTableCount -gt 0 -and $TargetSchema -ne "public"))) {
  throw "Target already contains RidePulse tables. Re-run only after backup/review, or pass -AllowNonEmptyTarget if this is intentional."
}

Write-Host "This will copy RidePulse data from Neon into AWS schema '$TargetSchema'."
Write-Host "Dump file: $DumpPath"
Write-Host "Source and target URLs are read from environment/parameters and will not be written to the repo."

if (-not $SkipConfirm) {
  $answer = Read-Host "Type MIGRATE to continue"
  if ($answer -ne "MIGRATE") {
    throw "Migration cancelled."
  }
}

& pg_dump $SourceUrl --format=custom --no-owner --no-privileges --schema=public --file $DumpPath
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed."
}

& psql $TargetUrl --command "create schema if not exists $schemaIdentifier;"
if ($LASTEXITCODE -ne 0) {
  throw "Could not create target schema."
}

& pg_restore --dbname $TargetUrl --no-owner --no-privileges --clean --if-exists --schema=public $DumpPath
if ($LASTEXITCODE -ne 0) {
  throw "pg_restore failed."
}

if ($TargetSchema -ne "public") {
  foreach ($table in $appTables) {
    $tableIdentifier = Quote-Identifier $table
    & psql $TargetUrl --command "alter table if exists public.$tableIdentifier set schema $schemaIdentifier;"
    if ($LASTEXITCODE -ne 0) {
      throw "Could not move public.$table to $TargetSchema."
    }
  }
}

$restoredCount = Invoke-PsqlScalar $TargetUrl "select count(*) from information_schema.tables where table_schema = '$TargetSchema' and table_name in ($appTableList);"
$rideCount = Invoke-PsqlScalar $TargetUrl "select count(*) from $schemaIdentifier.rides;"
$userCount = Invoke-PsqlScalar $TargetUrl "select count(*) from $schemaIdentifier.users;"

Write-Host "Migration complete."
Write-Host "Restored app tables: $restoredCount"
Write-Host "Users: $userCount"
Write-Host "Rides: $rideCount"
