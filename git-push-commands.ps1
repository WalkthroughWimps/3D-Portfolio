param(
  [string]$Repo = "<your-username>/<your-repo>"
)

Write-Host "Run the following commands to create a remote and push your site to GitHub Pages"
Write-Host "Replace <your-username>/<your-repo> with your repository name when running this script."

Write-Host "git remote add origin https://github.com/$Repo.git"
Write-Host "git branch -M main"
Write-Host "git push -u origin main"

Write-Host "To create the repo with gh (if installed):"
Write-Host "gh repo create $Repo --public --source=. --remote=origin --push"
