@echo off
setlocal EnableDelayedExpansion

echo =====================================
echo Converting WEBM files to MP3 (320kbps)
echo =====================================

for %%F in (*.webm) do (
    echo Processing: %%F
    ffmpeg -y -i "%%F" ^
        -vn ^
        -acodec libmp3lame ^
        -ab 320k ^
        "%%~nF.mp3"
)

echo.
echo Done!
pause
