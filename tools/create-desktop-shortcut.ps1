# 바탕화면에 "초등 한자 공부" 바로가기를 만든다.
# 사용법: powershell -NoProfile -ExecutionPolicy Bypass -File tools\create-desktop-shortcut.ps1
#
# 서버 없이 index.html을 그대로 연다. Edge(없으면 Chrome)의 "앱 창" 모드(주소창·탭 없는 창)로 열고,
# 둘 다 없으면 기본 브라우저로 연다. 학습 기록은 그 브라우저(file:// 주소)에 저장된다.
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$index = Join-Path $root 'index.html'
$icon = Join-Path $root 'icon.ico'
if (-not (Test-Path $index)) { throw "index.html을 찾을 수 없어요: $index" }
if (-not (Test-Path $icon)) { throw "icon.ico가 없어요. python tools\make-icon.py로 먼저 만드세요." }

$candidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop '초등 한자 공부.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($linkPath)
if ($browser) {
  $shortcut.TargetPath = $browser
  $shortcut.Arguments = '--app="' + ([System.Uri]$index).AbsoluteUri + '"'
} else {
  $shortcut.TargetPath = $index
}
$shortcut.IconLocation = "$icon,0"
$shortcut.WorkingDirectory = $root
$shortcut.Description = '초등 한자 공부 - 대한검정회 8~5급 한자 퀴즈'
$shortcut.Save()

Write-Host "바로가기를 만들었어요: $linkPath"
if ($browser) { Write-Host "열기 방식: $browser (앱 창)" } else { Write-Host '열기 방식: 기본 브라우저' }
