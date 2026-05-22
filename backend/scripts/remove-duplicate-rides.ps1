param(
  [Parameter(Mandatory = $true)]
  [string] $Rider,

  [switch] $Apply
)

$ErrorActionPreference = "Stop"

function ConvertTo-PlainText {
  param([Security.SecureString] $SecureValue)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

if ($Rider -notmatch "^[0-9A-Fa-f]{8}$") {
  throw "Rider must be the 8-character Rider ID from the app, for example FC19BC08."
}

if ($Apply) {
  $confirmation = Read-Host "This will delete duplicate rides for rider $Rider. Type DELETE to continue"
  if ($confirmation -ne "DELETE") {
    Write-Host "Cancelled."
    exit 0
  }
}

$databaseUrl = ConvertTo-PlainText (Read-Host "DATABASE_URL" -AsSecureString)
if (-not $databaseUrl) {
  throw "DATABASE_URL cannot be empty."
}

$env:DATABASE_URL = $databaseUrl
$arguments = @("scripts/removeDuplicateRides.js", "--rider=$Rider")
if ($Apply) {
  $arguments += "--apply=true"
}

node @arguments
