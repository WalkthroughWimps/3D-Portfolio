# About ring artwork

Place up to 100 JPEG, PNG, WebP, or GIF images directly in this folder, then refresh the About page. The rings discover every supported file automatically; filenames sort naturally (for example, `01 First.jpg`, `02 Second.jpg`). Captions start blank. Subfolders and names beginning with a dot are ignored. Remove a file here to remove it from the rings.

The local review server scans this folder on every catalog request. For a static site artifact, the release builder generates `index.json` in the artifact from the files present at build time. If you add art after building, build a new artifact so its catalog includes the new files. The source `index.json` stays empty.
