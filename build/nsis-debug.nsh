!macro customHeader
  ShowInstDetails show
!macroend

!macro customInit
  SetDetailsPrint both
  DetailPrint "Installer initialized"
!macroend

!macro customFiles_x64
  SetDetailsPrint both
  DetailPrint "Finished extracting x64 application payload"
!macroend

!macro customFiles_arm64
  SetDetailsPrint both
  DetailPrint "Finished extracting arm64 application payload"
!macroend

!macro customFiles_ia32
  SetDetailsPrint both
  DetailPrint "Finished extracting ia32 application payload"
!macroend

!macro customInstall
  SetDetailsPrint both
  DetailPrint "Finalizing install: registry entries, shortcuts, and associations"
!macroend
