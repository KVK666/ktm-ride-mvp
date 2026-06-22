param(
  [switch]$BuildOnly
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileDir = Join-Path $repoRoot "mobile"
$androidDir = Join-Path $mobileDir "android"
$apkPath = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"

if (!(Test-Path $adb)) {
  throw "ADB not found at $adb"
}

$env:Path = "C:\Program Files\nodejs;" + $env:Path

function Assert-NativeSuccess($Action) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Action failed with exit code $LASTEXITCODE"
  }
}

Push-Location $androidDir
try {
  & .\gradlew.bat app:assembleRelease -x lint -x test --configure-on-demand --build-cache "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a"
  Assert-NativeSuccess "Release APK build"
} finally {
  Pop-Location
}

if (!(Test-Path $apkPath)) {
  throw "Release APK was not created at $apkPath"
}

Write-Host "Built standalone APK: $apkPath"

if ($BuildOnly) {
  return
}

$devices = @(& $adb devices |
  Select-String "device$" |
  ForEach-Object { ($_ -split "\s+")[0] })

if ($devices.Count -ne 1) {
  throw "Expected exactly one connected Android device, found $($devices.Count)."
}

$device = $devices[0]
Write-Host "Installing standalone release APK on $device..."
& $adb -s $device install -r $apkPath
Assert-NativeSuccess "APK install"

Write-Host "Launching RidePulse..."
& $adb -s $device logcat -c
Assert-NativeSuccess "Logcat clear"
& $adb -s $device shell am force-stop com.example.dukeride
Assert-NativeSuccess "App force-stop"
& $adb -s $device shell am start -n com.example.dukeride/.MainActivity
Assert-NativeSuccess "App launch"
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "Recent app/crash logs:"
& $adb -s $device logcat -d -t 250 |
  Select-String "com.example.dukeride|ReactNativeJS|AndroidRuntime|FATAL EXCEPTION|Unable to load script"
