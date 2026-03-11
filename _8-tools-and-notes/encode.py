import base64
snippet = '<script type= module>import { loadDebugIfEnabled } from ./debug/debug-loader.js; loadDebugIfEnabled();</script>'
print(base64.b64encode(snippet.encode()).decode())
