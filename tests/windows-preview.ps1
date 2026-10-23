$ErrorActionPreference = 'Stop'
$qa = Join-Path $env:OPEN_TYPORA_QA_DIR 'system-preview'
New-Item -ItemType Directory -Force $qa | Out-Null
$destination = Split-Path $env:OPEN_TYPORA_EXECUTABLE -Parent
$dll = Join-Path $destination 'resources/markdown-preview/MarkdownPreview.dll'
if (!(Test-Path $dll)) { throw 'Installed preview handler missing' }
$regsvr = Join-Path $env:SystemRoot 'System32/regsvr32.exe'
$handler = '{726747EB-6A31-4BF2-898F-11620814C1F2}'
$key = 'shellex\{8895b1c6-b41f-4c1c-a562-0d564250836f}'
$extensions = @('.md','.markdown','.mdown')
$original = @{}
foreach ($ext in $extensions) {
  $path = "HKCU:\Software\Classes\$ext\$key"
  $original[$ext] = if (Test-Path $path) { (Get-ItemProperty $path).'(default)' } else { $null }
  New-Item $path -Force | Out-Null
  Set-Item $path -Value '{11111111-2222-3333-4444-555555555555}'
}
try {
  $register = Start-Process $regsvr -ArgumentList @('/s',"`"$dll`"") -Wait -PassThru
  if ($register.ExitCode -ne 0) { throw "Register preview handler failed: $($register.ExitCode)" }
  foreach ($ext in $extensions) { if ((Get-Item "HKCU:\Software\Classes\$ext\$key").GetValue('') -ne $handler) { throw "Missing preview registration for $ext" } }
  $first = Join-Path $qa '中文 preview one.md'; $second = Join-Path $qa 'preview two.markdown'
  Add-Type -AssemblyName System.Drawing
  $bitmap=[Drawing.Bitmap]::new(300,100);$graphics=[Drawing.Graphics]::FromImage($bitmap);$graphics.Clear([Drawing.Color]::SteelBlue);$graphics.FillRectangle([Drawing.Brushes]::LightSkyBlue,20,20,80,60);$bitmap.Save((Join-Path $qa 'preview-image.png'),[Drawing.Imaging.ImageFormat]::Png);$graphics.Dispose();$bitmap.Dispose()
  [IO.File]::WriteAllText($first,"# Native preview one`n`n中文预览 👋 **bold**`n`n| Key | Value |`n|---|---|`n| Alpha | 123 |`n`n``````js`nconst answer = 42;`n```````n`n<script>document.title='injected'</script>`n![Local diagram](preview-image.png)`n`n![Blocked](https://example.invalid/private.png)`n",[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText($second,"# Native preview two`n`nStream initialization and rapid selection.`n`n| Key | Value |`n|---|---|`n| Alpha | 456 |`n",[Text.UnicodeEncoding]::new($false,$true))
  $hashes = @((Get-FileHash $first).Hash,(Get-FileHash $second).Hash)
  $framework = Join-Path $env:SystemRoot 'Microsoft.NET/Framework64/v4.0.30319'
  $previewHost = Join-Path $qa 'PreviewHost.exe'
  & (Join-Path $framework 'csc.exe') /nologo /codepage:65001 /platform:x64 /target:exe "/out:$previewHost" /r:System.Windows.Forms.dll /r:System.Drawing.dll "/r:$framework/WPF/UIAutomationClient.dll" "/r:$framework/WPF/UIAutomationTypes.dll" "/r:$framework/WPF/WindowsBase.dll" tests/PreviewHost.cs
  if ($LASTEXITCODE -ne 0) { throw 'Native preview acceptance host compilation failed' }
  & $previewHost $qa $first $second
  if ($LASTEXITCODE -ne 0) { throw 'Native preview COM acceptance failed' }
  $archive = Join-Path $qa 'Everything.zip'; $everything = Join-Path $qa 'Everything'
  curl.exe --fail --location --silent --show-error --retry 3 --retry-all-errors --connect-timeout 30 --max-time 180 'https://www.voidtools.com/Everything-1.4.1.1032.x64.zip' --output $archive
  if ($LASTEXITCODE -ne 0) { throw 'Everything download failed' }
  if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne '698df475ec44e638f66f1b6a32d28fea613cec78d3b6310e6abe53431eeb940c') { throw 'Everything official checksum mismatch' }
  Expand-Archive $archive $everything -Force
  & $previewHost everything (Join-Path $everything 'Everything.exe') $qa $first $second
  if ($LASTEXITCODE -ne 0) { throw 'Actual Everything preview pane acceptance failed' }
  if ((Get-FileHash $first).Hash -ne $hashes[0] -or (Get-FileHash $second).Hash -ne $hashes[1]) { throw 'Preview altered source documents' }
  $unregister = Start-Process $regsvr -ArgumentList @('/s','/u',"`"$dll`"") -Wait -PassThru
  if ($unregister.ExitCode -ne 0) { throw 'Preview unregister failed' }
  foreach ($ext in $extensions) { if ((Get-Item "HKCU:\Software\Classes\$ext\$key").GetValue('') -ne '{11111111-2222-3333-4444-555555555555}') { throw 'Preview disable did not restore earlier handler' } }
  @{nativeCOM=$true;fileAndStream=$true;everythingVersion='1.4.1.1032';everythingPane=$true;resizeFocusUnload=$true;sourceBytesUnchanged=$true;previousHandlerRestored=$true;webview2SandboxDisabled=$false} | ConvertTo-Json | Set-Content (Join-Path $qa 'preview-results.json')
} finally {
  Start-Process $regsvr -ArgumentList @('/s','/u',"`"$dll`"") -Wait | Out-Null
  foreach ($ext in $extensions) { $path="HKCU:\Software\Classes\$ext\$key"; if ($null -eq $original[$ext]) { Remove-Item $path -Force -ErrorAction SilentlyContinue } else { New-Item $path -Force | Out-Null; Set-Item $path -Value $original[$ext] } }
}
