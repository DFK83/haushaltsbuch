; Standard-Installationsordner unter einem Vendor-Ordner "DFK83".
; Ergebnis z. B.: %LOCALAPPDATA%\Programs\DFK83\Haushaltsbuch
; Der Nutzer kann den Ordner im Installer weiterhin ändern
; (allowToChangeInstallationDirectory: true).
!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\DFK83\${PRODUCT_FILENAME}"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\DFK83\${PRODUCT_FILENAME}"
  SetRegView 32
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES32\DFK83\${PRODUCT_FILENAME}"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\DFK83\${PRODUCT_FILENAME}"
!macroend
