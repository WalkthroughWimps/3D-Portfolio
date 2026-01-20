import base64
s='<script type= module>import { loadDebugIfEnabled } from ./debug/debug-loader.js; loadDebugIfEnabled();</script>'
print(base64.b64encode(s.encode()).decode())
