// Password gate for labs.matthallportfolio.com/top-fruit
//
// The TOP FRUIT preview contains a client's product photography, so it is not stored in this (public)
// repository. The real site lives in a separate private Cloudflare Pages project. This file only:
//   1. asks for a password (the browser's standard sign-in box; any user name works),
//   2. then forwards the request to the private project, adding a secret key that project requires.
//
// Nothing secret is in this file. Three settings come from Cloudflare (Pages > labs-root > Settings > Variables and
// Secrets), and the gate refuses everything until the two secrets exist:
//   TOP_FRUIT_PASSWORD      the password people type (secret)
//   TOP_FRUIT_UPSTREAM_KEY  the key the private project requires (secret)
//   TOP_FRUIT_UPSTREAM      optional: the private project's address (default below)
//
// build-labs-root.js copies this file into the build as _worker.js, with a _routes.json that runs it ONLY for
// /top-fruit and /top-fruit/*. Every other Labs page is served exactly as before.

const PREFIX = '/top-fruit'
const DEFAULT_UPSTREAM = 'https://top-fruit-private.pages.dev'

// Compare two strings without revealing, through timing, how much of them matched.
async function same(a, b) {
  const encoder = new TextEncoder()
  const [x, y] = await Promise.all([a, b].map(async text => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))))
  let difference = 0
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i]
  return difference === 0
}

const quiet = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return env.ASSETS.fetch(request) // not ours

    // Fail closed: with no password configured, show nothing.
    if (!env.TOP_FRUIT_PASSWORD || !env.TOP_FRUIT_UPSTREAM_KEY) {
      return new Response('This preview is not set up yet.', { status: 503, headers: quiet })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { ...quiet, Allow: 'GET, HEAD' } })
    }

    // 1. The password. The browser's sign-in box sends it as "Authorization: Basic base64(user:password)".
    let allowed = false
    const [scheme, encoded] = (request.headers.get('Authorization') ?? '').split(' ')
    if (scheme === 'Basic' && encoded) {
      try {
        const decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), character => character.charCodeAt(0)))
        allowed = await same(decoded.slice(decoded.indexOf(':') + 1), env.TOP_FRUIT_PASSWORD)
      } catch { /* not valid base64: treated as no password */ }
    }
    if (!allowed) {
      return new Response('A password is needed to see this preview.', {
        status: 401,
        headers: { ...quiet, 'WWW-Authenticate': 'Basic realm="TOP FRUIT preview", charset="UTF-8"' },
      })
    }

    if (url.pathname === PREFIX) return new Response(null, { status: 301, headers: { Location: `${PREFIX}/${url.search}`, ...quiet } })

    // 2. Forward to the private project, with its key.
    const upstream = new URL(env.TOP_FRUIT_UPSTREAM || DEFAULT_UPSTREAM)
    const headers = new Headers({ 'X-Labs-Key': env.TOP_FRUIT_UPSTREAM_KEY })
    for (const name of ['Accept', 'Accept-Encoding', 'Accept-Language', 'Range']) {
      if (request.headers.has(name)) headers.set(name, request.headers.get(name))
    }
    const response = await fetch(new URL(url.pathname + url.search, upstream), { method: request.method, headers, redirect: 'manual' })

    const out = new Response(response.body, response)
    out.headers.set('Cache-Control', 'private, no-store')
    out.headers.delete('Set-Cookie')
    const location = out.headers.get('Location') // keep any redirect on this address, not the private one
    if (location) out.headers.set('Location', location.replace(upstream.origin, url.origin))
    return out
  },
}
