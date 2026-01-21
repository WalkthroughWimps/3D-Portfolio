@echo off
REM Always open a persistent cmd window and run the converter inside it.
set "HERE=%~dp0"
start "MP3->WEBM" cmd /k ""%HERE%mp3_to_webm.bat" %*"
