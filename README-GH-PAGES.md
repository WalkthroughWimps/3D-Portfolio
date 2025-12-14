Hosting this site on GitHub Pages

Quick steps (PowerShell)

1) Optional: rename the GLB to remove spaces (if you already renamed on disk, skip this)
   # Run in the project directory
   Rename-Item -LiteralPath "glb\Tablet 23.glb" -NewName "tablet-23.glb"

2) Initialize a git repository and commit files
   cd 'C:\Dropbox\Resume Website'
   git init
   git add --all
   git commit -m "Initial website for GitHub Pages"

3) Create a GitHub repo and push
   # Option A: using gh (recommended if you have gh installed and authenticated)
   gh repo create <your-username>/<your-repo> --public --source=. --remote=origin --push

   # Option B: using the web UI - create a repo on github.com, then run:
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git branch -M main
   git push -u origin main

4) Enable GitHub Pages
   - On github.com open the repository Settings → Pages and select the main branch (root), then Save.
   - The site will publish at: https://<your-username>.github.io/<your-repo>/videos-tablet.html

Notes
- If you need a private site, use a private repo and GitHub's paid Pages features or a different host.
- Avoid committing secrets.

If you want, I can also create a .gitignore and a small PowerShell helper script to rename and commit for you.

LFS and GitHub Desktop notes
--------------------------------
We added a `.gitattributes` file to track `.glb` and `.webm` files with Git LFS. If you installed Git LFS during the Git for Windows setup (or later), run:

```powershell
git lfs install
git add .gitattributes
git add glb/tablet-23.glb
git commit -m "Track GLB and video assets with Git LFS"
git push origin main
```

If you prefer GUI-first, use GitHub Desktop: add the local repository, commit the above changes, then Publish repository. GitHub Desktop handles the remote creation and push for you.

Next steps I recommend you run locally (in Git Bash or PowerShell):
1. `git lfs install` (if using LFS)
2. `git add --all && git commit -m "Prepare site for GitHub Pages"`
3. create a GitHub repo and push (via gh or the web UI as described above)

Troubleshooting: running PowerShell scripts from Git Bash
--------------------------------------------------------
If you see this in Git Bash when trying to run a .ps1 file:

```
bash: ./set-git-recommended.ps1: command not found
```

That's expected—Git Bash can't execute PowerShell scripts directly. Use one of these options:

Option A) Stay in Git Bash, but call PowerShell explicitly

```
powershell.exe -ExecutionPolicy Bypass -File "C:\\Dropbox\\Resume Website\\set-git-recommended.ps1"
powershell.exe -ExecutionPolicy Bypass -File "C:\\Dropbox\\Resume Website\\serve.ps1"
```

Option B) Use Windows PowerShell directly

Open Windows PowerShell, then:

```
cd 'C:\Dropbox\Resume Website'
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
./set-git-recommended.ps1
./serve.ps1
```

Notes
- The `-ExecutionPolicy Bypass` flag lets a single script run without changing your system policy. For a permanent, safer setting, use `RemoteSigned` as shown above.
- In Git Bash, you can still run all git commands; just invoke PowerShell when you need to run the helper scripts.

Media hosting with `MEDIA_BASE`
-------------------------------

You can host large runtime assets (GLB models, videos, audio) on an external CDN or object store (e.g. Cloudflare R2). This repository includes a small helper and manifest to make that easy:

- `site-config.js`: set `window.siteConfig.MEDIA_BASE = 'https://your-bucket.example';` to point all media requests to that base URL.
- The code provides `window.mediaUrl(path)` which returns the full URL when `MEDIA_BASE` is set, otherwise it leaves the original local-relative path so the site keeps working locally.
- `media-manifest.json` (root): lists the media files expected by the site (models under `glb/*`, videos under `videos/*`, audio under `audio/*`, and thumbnails under `images/*`). Keep the same folder layout in your external bucket.

Fallback behavior
-----------------

- If `MEDIA_BASE` is an empty string the site loads media from local-relative paths exactly as before.
- If `MEDIA_BASE` is set, the site will attempt to load the same logical paths from that base. For example `window.mediaUrl('glb/video-tablet.glb')` -> `https://your-bucket.example/glb/video-tablet.glb`.

Required R2 / bucket layout
--------------------------

Create the following top-level folders (matching `media-manifest.json`): `glb/`, `videos/`, `audio/`, `images/` (and optional subfolders like `images/overlays/`). Upload the manifest-listed files into the corresponding folders. `media-manifest.json` is intentionally editable — update it when you add different media files.

Security & caching
------------------

- Serve static media with appropriate cache headers (long TTL for immutable hashed files).
- If you use signed URLs or restricted access, you will need to adapt `window.mediaUrl()` to generate signed URLs at runtime (not included here).

