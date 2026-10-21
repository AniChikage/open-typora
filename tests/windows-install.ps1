$ErrorActionPreference = 'Stop'
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$installer = Join-Path $PWD "release/windows/Open-Typora-$version-windows-x64-Setup.exe"
$destination = Join-Path $env:RUNNER_TEMP 'OpenTyporaInstalled'
$env:OPEN_TYPORA_QA_DIR = Join-Path $env:RUNNER_TEMP 'open-typora-windows-qa'
New-Item -ItemType Directory -Force $env:OPEN_TYPORA_QA_DIR | Out-Null
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
@{ install = 'passed'; installedRegression = 'passed'; fileAssociation = 'passed'; uninstall = 'passed'; recoveryPreserved = $true } | ConvertTo-Json | Set-Content (Join-Path $env:OPEN_TYPORA_QA_DIR 'installer-results.json')
Write-Output 'PASS: NSIS install, installed application tests, Markdown association and uninstall with retained recovery data'
