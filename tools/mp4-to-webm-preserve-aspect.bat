@echo off
setlocal EnableExtensions EnableDelayedExpansion

:: ==============================
:: MP4 -> WEBM (HQ 1080p silent + LQ 360p silent; preserve aspect ratio) + AUDIO (.opus)
:: - Double-click: processes all .mp4 next to the .bat
:: - Drag & drop: processes dropped files/folders
:: - Output names replace underscores with hyphens; source names stay unchanged.
:: - Existing output files are overwritten.
:: - Put this file beside your MP4s, or drag files/folders onto it.
:: ==============================

:: ---------- tunables ----------
set "HQ_HEIGHT=1080"
set "LQ_HEIGHT=360"

:: VP9 quality knobs (lower CRF = higher quality)
set "CRF_HQ=30"
set "CRF_LQ=38"

:: Threads (VP9 benefits from row-mt)
set "THREADS=4"

:: Audio encode settings (Opus is great for web)
set "AUDIO_BITRATE=96k"
:: -----------------------------

where /q ffmpeg || (
  echo [ERROR] ffmpeg.exe not found in PATH.
  echo Put ffmpeg.exe next to this .bat or add it to PATH.
  pause
  exit /b 1
)

set "COUNT=0"
set "HERE=%~dp0"
pushd "%HERE%" || exit /b 1
echo Scanning folder: "%HERE%"

:: If no args: process all mp4 in same folder as bat
if "%~1"=="" (
  for /f "delims=" %%F in ('dir /b /a:-d "%HERE%*.mp4" 2^>nul') do (
    call :QUEUE "%%~fF"
  )
) else (
  :: Args can be files and/or folders
  for %%A in (%*) do (
    if exist "%%~A" (
      if /i "%%~xA"==".mp4" (
        call :QUEUE "%%~fA"
      ) else if exist "%%~A\." (
        for /f "delims=" %%F in ('dir /b /a:-d "%%~A\*.mp4" 2^>nul') do (
          call :QUEUE "%%~A\%%F"
        )
      )
    )
  )
)

if %COUNT%==0 (
  echo No .mp4 files found.
  echo Drag .mp4 files/folders onto this .bat or place .mp4s next to it.
  pause
  exit /b 1
)

echo Found %COUNT% file^(s^).
echo.

for /L %%i in (1,1,%COUNT%) do (
  set "SRC=!SRC%%i!"
  call :ENCODE_HQ "!SRC!"
  call :ENCODE_LQ "!SRC!"
  call :EXTRACT_AUDIO "!SRC!"
)

echo.
popd
echo Done. Review FFmpeg output above for any errors.
pause
exit /b

:QUEUE
set /a COUNT+=1
set "SRC%COUNT%=%~1"
echo   queued: "%~1"
exit /b

:ENCODE_HQ
set "IN=%~1"
set "DIR=%~dp1"
set "BASE=%~n1"
set "BASE=!BASE:_=-!"
set "OUT=%DIR%%BASE%-hq.webm"

echo [HQ] "%BASE%" -> %HQ_HEIGHT%p, original proportions  (silent)

ffmpeg -y -i "%IN%" ^
  -vf "scale=-2:%HQ_HEIGHT%,setsar=1" ^
  -c:v libvpx-vp9 -row-mt 1 -threads %THREADS% -pix_fmt yuv420p -b:v 0 -crf %CRF_HQ% ^
  -an ^
  "%OUT%"

exit /b

:ENCODE_LQ
set "IN=%~1"
set "DIR=%~dp1"
set "BASE=%~n1"
set "BASE=!BASE:_=-!"
set "OUT=%DIR%%BASE%-lq.webm"

echo [LQ] "%BASE%" -> %LQ_HEIGHT%p, original proportions  (silent)

ffmpeg -y -i "%IN%" ^
  -vf "scale=-2:%LQ_HEIGHT%,setsar=1" ^
  -c:v libvpx-vp9 -row-mt 1 -threads %THREADS% -pix_fmt yuv420p -b:v 0 -crf %CRF_LQ% ^
  -an ^
  "%OUT%"

exit /b

:EXTRACT_AUDIO
set "IN=%~1"
set "DIR=%~dp1"
set "BASE=%~n1"
set "BASE=!BASE:_=-!"
set "OUT=%DIR%%BASE%.opus"

echo [AUD] "%BASE%" -> .opus (%AUDIO_BITRATE%)

:: Extract + encode audio to Opus-in-Ogg container (browser-friendly)
ffmpeg -y -i "%IN%" ^
  -vn -c:a libopus -b:a %AUDIO_BITRATE% ^
  "%OUT%"

exit /b
