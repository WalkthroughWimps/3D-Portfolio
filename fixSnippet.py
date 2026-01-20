from pathlib import Path
path = Path('index.html')
text = path.read_text()
snippet = '<script type=  +  module>import { loadDebugIfEnabled } from  + ./debug/debug-loader.js; loadDebugIfEnabled();</script>'
old = '<script type= module>import { loadDebugIfEnabled } from ./debug/debug-loader.js; loadDebugIfEnabled();</script>'
if old not in text:
    raise SystemExit('old snippet missing')
text = text.replace(old, snippet, 1)
path.write_text(text)
