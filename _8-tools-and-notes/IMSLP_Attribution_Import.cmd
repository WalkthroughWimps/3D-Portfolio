@echo off
setlocal EnableExtensions DisableDelayedExpansion
title IMSLP Attribution Import (keeps window open)

if "%~1"=="" (
  echo.
  echo Drag a FOLDER onto this file to import IMSLP attributions.
  echo.
  echo Example:
  echo   Drag C:\Music\IMSLP\ onto IMSLP_Attribution_Import.cmd
  echo.
  pause
  exit /b 1
)

set "FOLDER=%~1"
set "HERE=%~dp0"

if not exist "%HERE%tools\imslp_importer.mjs" (
  echo.
  echo ERROR: Missing tools\imslp_importer.mjs
  echo Expected:
  echo   %HERE%tools\imslp_importer.mjs
  echo.
  pause
  exit /b 2
)

echo.
echo Running importer on:
echo   "%FOLDER%"
echo.

REM /k keeps the window open no matter what
cmd /k node "%HERE%tools\imslp_importer.mjs" "%FOLDER%"
