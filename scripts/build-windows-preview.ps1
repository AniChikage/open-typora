$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$output = Join-Path $root 'build/windows-preview'
$sdk = Join-Path $root 'build/webview2-sdk'
$archive = Join-Path $root 'build/webview2-sdk.zip'
New-Item -ItemType Directory -Force $output | Out-Null
if (!(Test-Path (Join-Path $sdk 'build/native/include/WebView2.h'))) {
  curl.exe --fail --location --silent --show-error --retry 3 --connect-timeout 30 --max-time 180 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.4314.35/microsoft.web.webview2.1.0.4314.35.nupkg' --output $archive
  if ($LASTEXITCODE -ne 0) { throw 'WebView2 SDK download failed' }
  if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne '90778deb1b77e36292828b4b5833c9255c27533f40e0ddd55891ae718944edc4') { throw 'WebView2 SDK checksum mismatch' }
  Expand-Archive -Path $archive -DestinationPath $sdk -Force
}
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vs) { throw 'Visual C++ x64 build tools are required' }
$developer = Join-Path $vs 'Common7/Tools/VsDevCmd.bat'
$include = Join-Path $sdk 'build/native/include'
$library = Join-Path $sdk 'build/native/x64'
$source = Join-Path $root 'windows-preview/Preview.cpp'
$definition = Join-Path $root 'windows-preview/Preview.def'
$dll = Join-Path $output 'MarkdownPreview.dll'
$object = Join-Path $output 'Preview.obj'
$command = "`"$developer`" -no_logo -arch=x64 && cl.exe /nologo /std:c++20 /EHsc /MT /O2 /W4 /DUNICODE /D_UNICODE /I`"$include`" /Fo`"$object`" /LD `"$source`" /link /DEF:`"$definition`" /OUT:`"$dll`" /LIBPATH:`"$library`" WebView2LoaderStatic.lib user32.lib ole32.lib oleaut32.lib shlwapi.lib shell32.lib advapi32.lib version.lib"
& $env:ComSpec /d /s /c $command
if ($LASTEXITCODE -ne 0) { throw 'Native Markdown preview handler compilation failed' }
Copy-Item (Join-Path $sdk 'LICENSE.txt') (Join-Path $output 'Microsoft-WebView2-LICENSE.txt') -Force
if (Test-Path (Join-Path $output 'dist')) { Remove-Item (Join-Path $output 'dist') -Recurse -Force }
Copy-Item (Join-Path $root 'dist') (Join-Path $output 'dist') -Recurse
Write-Output 'PASS: built native Windows x64 COM preview handler and bundled offline renderer'
