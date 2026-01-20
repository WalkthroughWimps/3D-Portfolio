from pathlib import Path
pages = ['index.html', 'about.html', 'docs.html', 'videos.html', 'games.html', 'graphics.html', 'music-2d.html', 'music.html']
old = '<script type= module>import { loadDebugIfEnabled } from ./debug/debug-loader.js; loadDebugIfEnabled();</script>'
new = '<script type= module>import { loadDebugIfEnabled } from ./debug/debug-loader.js; loadDebugIfEnabled();</script>'
for page in pages:
    path = Path(page)
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8', errors='ignore')
    if old in text:
        text = text.replace(old, new)
        path.write_text(text, encoding='utf-8')
