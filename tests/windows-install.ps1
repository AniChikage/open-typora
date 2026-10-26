$ErrorActionPreference = 'Stop'
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$installer = Join-Path $PWD "release/windows/Open-Typora-$version-windows-x64-Setup.exe"
$destination = Join-Path $env:RUNNER_TEMP 'OpenTyporaInstalled'
$env:OPEN_TYPORA_QA_DIR = Join-Path $env:RUNNER_TEMP 'open-typora-windows-qa'
New-Item -ItemType Directory -Force $env:OPEN_TYPORA_QA_DIR | Out-Null
$previous = Join-Path $env:RUNNER_TEMP 'Open-Typora-0.15.0-Setup.exe'
curl.exe --fail --location --silent --show-error --retry 3 --connect-timeout 30 --max-time 180 'https://github.com/AniChikage/open-typora/releases/download/v0.15.0/Open-Typora-0.15.0-windows-x64-Setup.exe' --output $previous
if ($LASTEXITCODE -ne 0 -or (Get-FileHash $previous -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'f0563c64e25fd7b116c61d761a2d48233b28857401e8ae79ba49293f9369e59e') { throw 'Previous public installer download verification failed' }
$prior = Start-Process -FilePath $previous -ArgumentList @('/S', "/D=$destination") -Wait -PassThru
if ($prior.ExitCode -ne 0) { throw 'Previous-version installation failed' }
$process = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$destination") -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
$env:OPEN_TYPORA_EXECUTABLE = Join-Path $destination 'Open Typora.exe'
if (!(Test-Path $env:OPEN_TYPORA_EXECUTABLE)) { throw 'Installer did not produce the application executable' }
node tests/context-menu-desktop.mts
if ($LASTEXITCODE -ne 0) { throw 'Installed context-menu, clipboard and safe tab-close acceptance failed' }
node tests/community-plugins-desktop.mts
if ($LASTEXITCODE -ne 0) { throw 'Installed community plugin acceptance failed' }
node tests/huge-blocks-desktop.mts
if ($LASTEXITCODE -ne 0) { throw 'Giant blocks and beyond-20-MiB editing/recovery acceptance failed' }
node tests/next-desktop.mts
if ($LASTEXITCODE -ne 0) { throw 'Large document, theme and print acceptance failed' }
& pwsh.exe -NoProfile -ExecutionPolicy Bypass -File tests/windows-preview.ps1
if ($LASTEXITCODE -ne 0) { throw 'Native and actual Everything preview acceptance failed' }
node tests/desktop.mts
$desktopExit = $LASTEXITCODE
node tests/electron-shell.mts
$shellExit = $LASTEXITCODE
node tests/parity-desktop.mts
$parityExit = $LASTEXITCODE
node tests/indentation-desktop.mts
$indentationExit = $LASTEXITCODE
node tests/workspace-desktop.mts
$workspaceExit = $LASTEXITCODE
node tests/compatibility-desktop.mts
$compatibilityExit = $LASTEXITCODE
node tests/ime-desktop.mts
$imeExit = $LASTEXITCODE
node tests/plugin-package-desktop.mts
$packageExit = $LASTEXITCODE
if ($indentationExit -ne 0) { throw 'Installed indentation shortcut regression failed' }
if ($workspaceExit -ne 0) { throw 'Installed tabs and split-pane regression failed' }
if ($packageExit -ne 0) { throw 'Installed plugin package regression failed' }
if ($imeExit -ne 0) { throw 'Installed composition and plugin regression failed' }
if ($desktopExit -ne 0) { throw 'Installed desktop regression failed' }
if ($shellExit -ne 0) { throw 'Windows shell and plugin regression failed' }
if ($compatibilityExit -ne 0) { throw 'Installed image and office-format regression failed' }
if ($parityExit -ne 0) { throw 'Installed editing parity regression failed' }
$extension = Get-ItemPropertyValue 'HKCU:\Software\Classes\.md' '(default)'
$command = Get-ItemPropertyValue "HKCU:\Software\Classes\$extension\shell\open\command" '(default)'
if (!$command.Contains($env:OPEN_TYPORA_EXECUTABLE) -or !$command.Contains('%1')) { throw "Invalid Markdown file association: $command" }
$retained = (Get-Content (Join-Path $env:OPEN_TYPORA_QA_DIR 'desktop-results.json') -Raw | ConvertFrom-Json).dataDir
$sessionFile = Join-Path $retained 'session.json'
$sessionHash = (Get-FileHash $sessionFile -Algorithm SHA256).Hash
$previewMapping='HKCU:\Software\Classes\.md\shellex\{8895b1c6-b41f-4c1c-a562-0d564250836f}'
$previousPreview='{11111111-2222-3333-4444-555555555555}'
New-Item $previewMapping -Force | Out-Null;Set-Item $previewMapping -Value $previousPreview
$previewRegistration=Start-Process (Join-Path $env:SystemRoot 'System32/regsvr32.exe') -ArgumentList @('/s',"`"$(Join-Path $destination 'resources/markdown-preview/MarkdownPreview.dll')`"") -Wait -PassThru
if($previewRegistration.ExitCode -ne 0){throw 'Cannot enable preview before uninstall acceptance'}
$uninstaller = Join-Path $destination 'Uninstall Open Typora.exe'
Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait | Out-Null
for ($attempt = 0; $attempt -lt 60 -and ((Test-Path $env:OPEN_TYPORA_EXECUTABLE) -or (Test-Path (Join-Path $destination 'resources/markdown-preview/MarkdownPreview.dll'))); $attempt++) { Start-Sleep -Milliseconds 500 }
if (Test-Path $env:OPEN_TYPORA_EXECUTABLE) { throw 'Uninstaller left the application executable behind' }
if (Test-Path (Join-Path $destination 'resources/markdown-preview/MarkdownPreview.dll')) { throw 'Uninstaller left the preview DLL behind' }
if ((Get-Item $previewMapping).GetValue('') -ne $previousPreview) { throw 'Uninstall did not restore the previous preview handler' }
if (Test-Path 'HKCU:\Software\Classes\CLSID\{726747EB-6A31-4BF2-898F-11620814C1F2}') { throw 'Uninstall retained preview component registration' }
if ((Get-FileHash $sessionFile -Algorithm SHA256).Hash -ne $sessionHash) { throw 'Uninstall changed document recovery data' }
@{ upgradeFrom = '0.15.0'; install = 'passed'; installedRegression = 'passed'; fileAssociation = 'passed'; uninstall = 'passed'; recoveryPreserved = $true } | ConvertTo-Json | Set-Content (Join-Path $env:OPEN_TYPORA_QA_DIR 'installer-results.json')
Write-Output 'PASS: NSIS install, installed application tests, Markdown association and uninstall with retained recovery data'
