@echo off
setlocal EnableExtensions
title MP3 to WEBM Converter

echo --------------------------------------------
echo MP3 to WEBM (audio-only) converter
echo --------------------------------------------
echo.

if "%~1"=="" (
  echo No files were dropped.
  echo Drag one or more .mp3 files onto RUN_MP3_TO_WEBM.cmd
  echo.
  pause
  exit /b 1
)

where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo ERROR: ffmpeg not found on PATH.
  echo Put ffmpeg.exe in this same folder, OR install ffmpeg and add to PATH.
  echo Folder: %~dp0
  echo.
  pause
  exit /b 2
)

:loop
if "%~1"=="" goto done

if /I not "%~x1"==".mp3" (
  echo Skipping (not mp3): "%~1"
  shift
  goto loop
)

set "IN=%~f1"
set "OUT=%~dpn1.webm"

echo Converting:
echo   "%IN%"
echo   -> "%OUT%"

ffmpeg -y -hide_banner -loglevel error -i "%IN%" -vn -c:a libopus -b:a 128k "%OUT%"

if errorlevel 1 (
  echo ERROR converting "%IN%"
) else (
  echo Done.
)
echo.
shift
goto loop

:done
echo --------------------------------------------
echo All done.
echo --------------------------------------------
pause
