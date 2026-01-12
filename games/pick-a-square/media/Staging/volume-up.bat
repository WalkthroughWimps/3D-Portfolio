@echo off
setlocal

:: If no file was dropped
if "%~1"=="" (
    echo Drag a video or audio file onto this .bat file.
    pause
    exit /b
)

:: Input file
set "IN=%~1"

:: Parts of the filename
set "DIR=%~dp1"
set "NAME=%~n1"
set "EXT=%~x1"

:: Output file
set "OUT=%DIR%%NAME%_v-up%EXT%"

:: Volume boost (change this)
set GAIN=6

echo.
echo Input : %IN%
echo Output: %OUT%
echo Boost : +%GAIN%dB
echo.

ffmpeg -y -i "%IN%" -af "volume=%GAIN%dB" "%OUT%"

echo.
echo Done.
pause
