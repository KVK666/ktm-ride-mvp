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

function New-JwtSecret {
  $bytes = New-Object byte[] 48
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
    [Convert]::ToBase64String($bytes)
  } finally {
    $rng.Dispose()
  }
}

function Set-WorkerSecret {
  param(
    [string] $Name,
    [string] $Value
  )

  if (-not $Value) {
    throw "$Name cannot be empty."
  }

  Write-Host "Setting Cloudflare secret: $Name"
  $Value | npx wrangler secret put $Name
}

Write-Host "Duke Ride Cloudflare Worker secret setup"
Write-Host "Paste the Neon pooled PostgreSQL URL when prompted. Input is hidden."

$databaseUrl = ConvertTo-PlainText (Read-Host "DATABASE_URL" -AsSecureString)
$jwtSecretInput = ConvertTo-PlainText (Read-Host "JWT_SECRET (leave blank to generate one)" -AsSecureString)
$jwtSecret = if ($jwtSecretInput) { $jwtSecretInput } else { New-JwtSecret }

Set-WorkerSecret "DATABASE_URL" $databaseUrl
Set-WorkerSecret "JWT_SECRET" $jwtSecret

Write-Host "Secrets saved. Run npm run deploy, then check /health."
