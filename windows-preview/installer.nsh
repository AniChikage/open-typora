!macro customInstall
  ExecWait '"$SYSDIR\regsvr32.exe" /s /n /i:refresh "$INSTDIR\resources\markdown-preview\MarkdownPreview.dll"' $0
  ${If} $0 != 0
    DetailPrint "Markdown preview component registration returned $0. Enable previews from Preferences after installation."
  ${EndIf}
!macroend

!macro customUnInstall
  ExecWait '"$SYSDIR\regsvr32.exe" /s /u "$INSTDIR\resources\markdown-preview\MarkdownPreview.dll"' $0
!macroend
