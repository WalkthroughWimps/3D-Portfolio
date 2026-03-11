from pathlib import Path
repo_root = Path(__file__).resolve().parents[1]
pages = [
    repo_root / 'index.html',
    repo_root / '_1-about' / 'about.html',
    repo_root / '_6-docs' / 'docs.html',
    repo_root / '_2-videos' / 'videos.html',
    repo_root / '_4-games' / 'games.html',
    repo_root / '_3-graphics' / 'graphics.html',
    repo_root / '_5-music' / 'music-2d.html',
    repo_root / '_5-music' / 'music.html',
]
old = '<script type= module>import { loadDebugIfEnabled } from ./debug/debug-loader.js; loadDebugIfEnabled();</script>'
new = '<script type= module>import { loadDebugIfEnabled } from ./debug/debug-loader.js; loadDebugIfEnabled();</script>'
for path in pages:
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8', errors='ignore')
    if old in text:
        text = text.replace(old, new)
        path.write_text(text, encoding='utf-8')
