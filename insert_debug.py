from pathlib import Path
pages = ['about.html', 'docs.html', 'videos.html', 'games.html', 'graphics.html', 'music-2d.html', 'music.html']
snippet = '<script type= module>import { loadDebugIfEnabled } from ./debug/debug-loader.js; loadDebugIfEnabled();</script>'
for page in pages:
    path = Path(page)
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8', errors='ignore')
    lines = text.splitlines()
    if any(snippet in line for line in lines):
        continue
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip().lower() == '</body>':
            lines.insert(i, snippet)
            path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
            break
    else:
        raise SystemExit(f'no closing body found in {page}')
