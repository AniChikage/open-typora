$ErrorActionPreference = 'Stop'
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$installer = Join-Path $PWD "release/windows/Open-Typora-$version-windows-x64-Setup.exe"
$destination = Join-Path $env:RUNNER_TEMP 'OpenTyporaInstalled'
$env:OPEN_TYPORA_QA_DIR = Join-Path $env:RUNNER_TEMP 'open-typora-windows-qa'
New-Item -ItemType Directory -Force $env:OPEN_TYPORA_QA_DIR | Out-Null
$previous = Join-Path $env:RUNNER_TEMP 'Open-Typora-0.13.4-Setup.exe'
curl.exe --fail --location --silent --show-error --retry 3 --connect-timeout 30 --max-time 180 'https://github.com/AniChikage/open-typora/releases/download/v0.13.4/Open-Typora-0.13.4-windows-x64-Setup.exe' --output $previous
if ($LASTEXITCODE -ne 0 -or (Get-FileHash $previous -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'a0834529fce968d8586fe8676be42368f9c9b6e909c6aca2c023b96fa9c34f27') { throw 'Previous public installer download verification failed' }
$prior = Start-Process -FilePath $previous -ArgumentList @('/S', "/D=$destination") -Wait -PassThru
if ($prior.ExitCode -ne 0) { throw 'Previous-version installation failed' }
$process = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$destination") -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
$env:OPEN_TYPORA_EXECUTABLE = Join-Path $destination 'Open Typora.exe'
if (!(Test-Path $env:OPEN_TYPORA_EXECUTABLE)) { throw 'Installer did not produce the application executable' }
node tests/desktop.mjs
$desktopExit = $LASTEXITCODE
node tests/electron-shell.mjs
$shellExit = $LASTEXITCODE
node tests/parity-desktop.mjs
$parityExit = $LASTEXITCODE
node tests/indentation-desktop.mjs
$indentationExit = $LASTEXITCODE
node tests/workspace-desktop.mjs
$workspaceExit = $LASTEXITCODE
node tests/compatibility-desktop.mjs
$compatibilityExit = $LASTEXITCODE
node tests/ime-desktop.mjs
$imeExit = $LASTEXITCODE
node tests/plugin-package-desktop.mjs
$packageExit = $LASTEXITCODE
if ($indentationExit -ne 0) { throw 'Installed indentation shortcut regression failed' }
if ($workspaceExit -ne 0) { throw 'Installed tabs and split-pane regression failed' }
if ($packageExit -ne 0) { throw 'Installed plugin package regression failed' }
if ($imeExit -ne 0) { throw 'Installed composition and plugin regression failed' }
if ($desktopExit -ne 0) { throw 'Installed desktop regression failed' }
if ($shellExit -ne 0) { throw 'Windows shell and plugin regression failed' }
if ($compatibilityExit -ne 0) { throw 'Installed image and office-format regression failed' }
if ($parityExit -ne 0) { throw 'Installed editing parity regression failed' }
node tests/next-desktop.mjs
if ($LASTEXITCODE -ne 0) { throw 'Large document, theme and print acceptance failed' }
& pwsh.exe -NoProfile -ExecutionPolicy Bypass -File tests/windows-preview.ps1
if ($LASTEXITCODE -ne 0) { throw 'Native and actual Everything preview acceptance failed' }
$extension = Get-ItemPropertyValue 'HKCU:\Software\Classes\.md' '(default)'
$command = Get-ItemPropertyValue "HKCU:\Software\Classes\$extension\shell\open\command" '(default)'
if (!$command.Contains($env:OPEN_TYPORA_EXECUTABLE) -or !$command.Contains('%1')) { throw "Invalid Markdown file association: $command" }
$retained = (Get-Content (Join-Path $env:OPEN_TYPORA_QA_DIR 'desktop-results.json') -Raw | ConvertFrom-Json).dataDir
$sessionFile = Join-Path $retained 'session.json'
$sessionHash = (Get-FileHash $sessionFile -Algorithm SHA256).Hash
$uninstaller = Join-Path $destination 'Uninstall Open Typora.exe'
Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait | Out-Null
for ($attempt = 0; $attempt -lt 60 -and (Test-Path $env:OPEN_TYPORA_EXECUTABLE); $attempt++) { Start-Sleep -Milliseconds 500 }
if (Test-Path $env:OPEN_TYPORA_EXECUTABLE) { throw 'Uninstaller left the application executable behind' }
if ((Get-FileHash $sessionFile -Algorithm SHA256).Hash -ne $sessionHash) { throw 'Uninstall changed document recovery data' }
@{ upgradeFrom = '0.13.4'; install = 'passed'; installedRegression = 'passed'; fileAssociation = 'passed'; uninstall = 'passed'; recoveryPreserved = $true } | ConvertTo-Json | Set-Content (Join-Path $env:OPEN_TYPORA_QA_DIR 'installer-results.json')
Write-Output 'PASS: NSIS install, installed application tests, Markdown association and uninstall with retained recovery data'
