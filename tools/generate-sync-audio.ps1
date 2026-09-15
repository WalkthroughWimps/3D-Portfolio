param(
    [string]$VoiceName = "Microsoft Zira Desktop"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $projectRoot "_0-start\audio"
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$tempRoot = Join-Path $outputDir (".sync-build-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    $cues = @(
        @{ Word = "Ready"; Offset = 1600 },
        @{ Word = "Set"; Offset = 2400 },
        @{ Word = "Go"; Offset = 3200 },
        @{ Word = "Three"; Offset = 4000 },
        @{ Word = "Two"; Offset = 4800 },
        @{ Word = "One"; Offset = 5600 },
        @{ Word = "Go"; Offset = 6400 }
    )

    $trimmed = @()
    foreach ($cue in $cues) {
        $slug = $cue.Word.ToLowerInvariant()
        $rawPath = Join-Path $tempRoot ("$slug-raw.wav")
        $trimPath = Join-Path $tempRoot ("$slug.wav")
        & "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "generate-sync-word.ps1") -OutputPath $rawPath -Word $cue.Word -VoiceName $VoiceName
        if ($LASTEXITCODE -ne 0) { throw "Voice generation failed for $($cue.Word)." }
        & ffmpeg -hide_banner -loglevel error -y -i $rawPath -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.01,apad=pad_dur=0.15" -ar 48000 -ac 1 $trimPath
        $trimmed += @{ Path = $trimPath; Offset = $cue.Offset }
    }

    $voiceArgs = @("-hide_banner", "-loglevel", "error", "-y")
    foreach ($item in $trimmed) { $voiceArgs += @("-i", $item.Path) }
    $filters = @()
    for ($i = 0; $i -lt $trimmed.Count; $i++) {
        $delay = $trimmed[$i].Offset
        $filters += "[$i`:a]adelay=$delay|$delay[v$i]"
    }
    $inputs = (0..($trimmed.Count - 1) | ForEach-Object { "[v$_]" }) -join ""
    $filters += "${inputs}amix=inputs=$($trimmed.Count):duration=longest:normalize=0,alimiter=limit=0.9,apad=whole_dur=7.4,atrim=0:7.4[voice]"
    $voiceArgs += @("-filter_complex", ($filters -join ";"), "-map", "[voice]", "-c:a", "pcm_s16le", (Join-Path $outputDir "sync-voice.wav"))
    & ffmpeg @voiceArgs
    if ($LASTEXITCODE -ne 0) { throw "Unable to assemble sync-voice.wav." }

    $tickExpression = "if(lt(mod(t,0.8),0.075),(sin(2*PI*920*mod(t,0.8))+0.34*sin(2*PI*1840*mod(t,0.8)))*exp(-52*mod(t,0.8))*0.55,0)+if(between(mod(t,0.8),0.4,0.465),(sin(2*PI*610*(mod(t,0.8)-0.4))+0.22*sin(2*PI*1220*(mod(t,0.8)-0.4)))*exp(-58*(mod(t,0.8)-0.4))*0.34,0)"
    $tickExpression = $tickExpression.Replace(",", "\,")
    & ffmpeg -hide_banner -loglevel error -y -f lavfi -i "aevalsrc=$tickExpression`:s=48000:d=7.4" -af "aecho=0.7:0.22:24:0.16,alimiter=limit=0.82" -ar 48000 -ac 1 -c:a pcm_s16le (Join-Path $outputDir "sync-ticks.wav")
    if ($LASTEXITCODE -ne 0) { throw "Unable to generate sync-ticks.wav." }
}
finally {
    $resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
    $resolvedOutput = [IO.Path]::GetFullPath($outputDir)
    if ($resolvedTemp.StartsWith($resolvedOutput, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
        Start-Sleep -Milliseconds 120
        try { Remove-Item -LiteralPath $resolvedTemp -Recurse -Force } catch { Write-Warning "Temporary voice sources remain at $resolvedTemp" }
    }
}
