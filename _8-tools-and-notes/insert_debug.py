from pathlib import Path
repo_root = Path(__file__).resolve().parents[1]
pages = [
    repo_root / '_1-about' / 'about.html',
    repo_root / '_6-docs' / 'docs.html',
    repo_root / '_2-videos' / 'videos.html',
    repo_root / '_4-games' / 'games.html',
    repo_root / '_3-graphics' / 'graphics.html',
    repo_root / '_5-music' / 'music-2d.html',
    repo_root / '_5-music' / 'music.html',
]
snippet = '<script type= module>import { loadDebugIfEnabled } from ../debug/debug-loader.js; loadDebugIfEnabled();</script>'
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
