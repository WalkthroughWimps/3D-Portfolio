# Apply recommended git config for this machine (safe defaults)
git config --global core.editor "code --wait"
git config --global core.autocrlf true
git config --global core.fscache true
git config --global pull.rebase false
Write-Host "Applied recommended git config: core.editor=code --wait, core.autocrlf=true, core.fscache=true, pull.rebase=false"
