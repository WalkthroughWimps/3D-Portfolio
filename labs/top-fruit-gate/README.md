# TOP FRUIT password gate

`labs.matthallportfolio.com/top-fruit` is protected by a password. Because this repository is public and the
TOP FRUIT preview contains a client's product photography, the preview itself is **not** stored here.

## How it works

1. `_worker.js` (this folder) is copied into the Labs build by `labs/build-labs-root.js`, together with a
   `_routes.json` that runs it **only** for `/top-fruit` and `/top-fruit/*`. All other Labs pages are served as before.
2. It asks for a password (the browser's standard sign-in box; any user name works).
3. With the right password it forwards the request to a separate **private** Cloudflare Pages project,
   `top-fruit-private`, adding a secret key. That project answers only requests that carry the key.

Nothing secret is in this repository. Before the gate has its secrets it refuses everything (HTTP 503).

## Settings (Cloudflare > Workers & Pages > labs-root > Settings > Variables and Secrets)

| Name | Kind | What it is |
| --- | --- | --- |
| `TOP_FRUIT_PASSWORD` | secret | the password people type |
| `TOP_FRUIT_UPSTREAM_KEY` | secret | must equal the `LABS_KEY` secret on `top-fruit-private` |
| `TOP_FRUIT_UPSTREAM` | optional | the private project's address; defaults to `https://top-fruit-private.pages.dev` |

Secrets are applied to the next deployment of `labs-root`. Preview deployments (pull request branches) need their own
copy of the secrets, set in the same place under "Preview"; without them, `/top-fruit/` shows the 503 message there.

To change the password: `wrangler pages secret put TOP_FRUIT_PASSWORD --project-name labs-root`, then redeploy `labs-root`.

## Updating the private TOP FRUIT preview

It is built and deployed from the TOP FRUIT workspace (not from this repository):

```
npm run deploy:labs
```

## Taking the password off, or removing the page

Delete the two lines in `labs/build-labs-root.js` that copy `_worker.js` and write `_routes.json`. `/top-fruit/`
then serves the older static placeholder from `labs/top-fruit-source/`, which holds no client photos.
