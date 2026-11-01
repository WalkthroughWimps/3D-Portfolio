@echo off
setlocal

rem === 1) Set the output file name (optional: override via first argument) ===
set "OUT=combined_files.txt"
if not "%~1"=="" set "OUT=%~1"

rem === 2) Create/overwrite the output file with a header ===
> "%OUT%" echo ===== Combined file generated on %date% at %time% =====
>> "%OUT%" echo.

rem === 3) List of extensions you want to include ===
rem Add/remove extensions here as needed.
for %%E in (html htm css js json txt) do (
    rem Loop over all files in the current folder with that extension
    for %%F in ("*.%%E") do (
        if exist "%%~F" (
            rem Skip the output file itself if it happens to match an extension
            if /I not "%%~nxF"=="%OUT%" (
                >> "%OUT%" echo.
                >> "%OUT%" echo ===== START FILE: %%~nxF =====
                >> "%OUT%" echo.
                type "%%~F" >> "%OUT%"
                >> "%OUT%" echo.
                >> "%OUT%" echo ===== END FILE: %%~nxF =====
                >> "%OUT%" echo.
            )
        )
    )
)

echo Done. Output written to "%OUT%".
endlocal
