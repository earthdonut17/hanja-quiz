# 바탕화면에 "초등 한자 공부" 바로가기를 만든다.
# 사용법: powershell -NoProfile -ExecutionPolicy Bypass -File tools\create-desktop-shortcut.ps1
#         (이 폴더의 index.html을 서버 없이 직접 열고 싶으면 -Local 을 붙인다)
#
# 기본: GitHub Pages 주소(https://earthdonut17.github.io/hanja-quiz/)를 Edge(없으면 Chrome)의
#       "앱 창" 모드(주소창·탭 없는 창)로 연다. 두 브라우저가 모두 없으면 인터넷 바로가기(.url)를 만든다.
# -Local: 이 폴더의 index.html을 파일로 직접 연다(인터넷 없이도 동작).
# 학습 기록은 주소마다 따로 저장된다(사이트 주소, 파일 주소, localhost는 서로 기록이 다르다).
param([switch]$Local)
$ErrorActionPreference = 'Stop'

$siteUrl = 'https://earthdonut17.github.io/hanja-quiz/'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$index = Join-Path $root 'index.html'
$icon = Join-Path $root 'icon.ico'
if (-not (Test-Path $icon)) { throw "icon.ico가 없어요. python tools\make-icon.py로 먼저 만드세요." }
if ($Local -and -not (Test-Path $index)) { throw "index.html을 찾을 수 없어요: $index" }

if ($Local) { $url = ([System.Uri]$index).AbsoluteUri } else { $url = $siteUrl }

$candidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

$desktop = [Environment]::GetFolderPath('Desktop')
$name = '초등 한자 공부'

if ($browser) {
  $linkPath = Join-Path $desktop "$name.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($linkPath)
  $shortcut.TargetPath = $browser
  $shortcut.Arguments = '--app="' + $url + '"'
  $shortcut.IconLocation = "$icon,0"
  $shortcut.WorkingDirectory = $root
  $shortcut.Description = '초등 한자 공부 - 대한검정회 8~5급 한자 퀴즈'
  $shortcut.Save()
  Write-Host "바로가기를 만들었어요: $linkPath"
  Write-Host "열 주소: $url ($browser 앱 창)"
} else {
  $linkPath = Join-Path $desktop "$name.url"
  Set-Content -Path $linkPath -Encoding ASCII -Value @("[InternetShortcut]", "URL=$url", "IconFile=$icon", "IconIndex=0")
  Write-Host "인터넷 바로가기를 만들었어요: $linkPath"
  Write-Host "열 주소: $url (기본 브라우저)"
}
