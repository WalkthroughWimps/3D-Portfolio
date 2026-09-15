param(
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][string]$Word,
    [string]$VoiceName = "Microsoft Zira Desktop"
)

$ErrorActionPreference = "Stop"
$speaker = New-Object -ComObject SAPI.SpVoice
$matchingVoice = $speaker.GetVoices() | Where-Object { $_.GetDescription() -like "$VoiceName*" } | Select-Object -First 1
if ($matchingVoice) { $speaker.Voice = $matchingVoice }
$stream = New-Object -ComObject SAPI.SpFileStream
$stream.Open($OutputPath, 3, $false)
$speaker.AudioOutputStream = $stream
$speaker.Rate = -2
$speaker.Volume = 92
[void]$speaker.Speak($Word)
$stream.Close()
