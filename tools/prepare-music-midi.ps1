param(
    [string]$Recipe = 'woods',
    [switch]$Check,
    [switch]$Install,
    [string[]]$Inspect,
    [string]$Python
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$dependencyDir = Join-Path $projectRoot 'tmp/music-midi-deps'
$oldPythonPath = $env:PYTHONPATH
try {
    $env:PYTHONPATH = "$dependencyDir;$oldPythonPath"
    if (-not $Python) {
        $candidates = @(
            (Join-Path $projectRoot '.venv/Scripts/python.exe'),
            (Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')
        )
        $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
        if ($pythonCommand) { $candidates += $pythonCommand.Source }
        foreach ($candidate in $candidates) {
            if (-not (Test-Path -LiteralPath $candidate)) { continue }
            try {
                $null = & $candidate -c 'import sys; assert sys.version_info >= (3, 10)' 2>$null
                if ($LASTEXITCODE -eq 0) { $Python = $candidate; break }
            } catch { }
        }
    }
    if (-not $Python) { throw 'Python 3.10+ was not found. Supply -Python with its full executable path.' }
    if ($Install) {
        & $Python -m pip install --disable-pip-version-check --target $dependencyDir -r (Join-Path $PSScriptRoot 'music-midi-requirements.txt')
        if ($LASTEXITCODE -ne 0) { throw 'Mido installation failed.' }
    }
    if ($Inspect) {
        $arguments = @((Join-Path $PSScriptRoot 'music-midi-import.py'), 'inspect') + $Inspect
    } else {
        if ($Recipe -match '\.json$') { $recipePath = (Resolve-Path -LiteralPath $Recipe).Path }
        else { $recipePath = Join-Path $projectRoot "source-files/music-midi/$Recipe.json" }
        $arguments = @((Join-Path $PSScriptRoot 'music-midi-import.py'), 'prepare', $recipePath)
        if ($Check) { $arguments += '--check' }
    }
    & $Python @arguments
    if ($LASTEXITCODE -ne 0) { throw "MIDI preparation failed (exit $LASTEXITCODE)." }
} finally {
    $env:PYTHONPATH = $oldPythonPath
}
