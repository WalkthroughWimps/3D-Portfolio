@echo off
setlocal
set "HERE=%~dp0"
echo Enter folder path:
set /p FOLDER=
cmd /k node "%HERE%tools\imslp_importer.mjs" "%FOLDER%"
