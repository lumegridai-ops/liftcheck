# OpenAI Sites hosting

The hosted version uses the same graph engine, MBTA source validation, real MCP SDK tools and visual client as the local prototype. A Worker replaces the local Express listener; D1 replaces the filesystem journey store. `npm run build` bundles the actual frontend assets and Worker, plus the generated migration metadata.

Each anonymous browser receives a 256-bit random, HttpOnly, Secure, SameSite=Lax cookie. Only its SHA-256 digest scopes D1 rows. Every journey lookup and conditional revision write uses that scope. Opening a second browser starts a separate workspace. Clearing or expiring the cookie loses access; there is no account recovery or cross-device synchronization. The 30-day cookie lifetime is not a promise that database rows are deleted on that date.

The hosted MCP URL is `/api/mcp`; the local server continues to use `/mcp`. Sites reserves the root MCP route for its own connector integration.

External MCP clients must retain their own cookie to reuse saved journeys. They do not inherit a browser's journeys. Remote Alexa account linking and device testing remain unperformed.

The public endpoint rejects cross-origin browser requests and bodies over 32KB. A per-browser budget allows 90 MCP requests per minute. Fresh cookies can bypass that budget; this is a bounded public prototype, not hardened abuse prevention. MBTA fetches share the existing 60-second cache within a Worker instance. There are no model keys or generated transit answers.

## Verified before publication

- Original 48 core/transport checks and five local browser stories pass after Web Crypto and asynchronous-store compatibility changes.
- Five new hosted tests execute the actual compiled MCP Worker against real SQLite and the production schema: negotiation/replays, visitor isolation, stored reload, competing first saves, stale writes, body/origin boundaries and cookie scope.
- A separate workerd run with a real local D1 binding exercised protocol 2025-11-25, six tools, save/read/isolation and a real complete MBTA fetch. See [the runtime receipt](../artifacts/hosted-runtime-qa.json).
- Independent review found that a Strict cookie would be replaced after returning from an external entry link. The hosted cookie now uses Lax while mutation requests still enforce the exact Origin and JSON content type.

The hosted additions are separate from the v0.2.0 recording. The public deployment succeeded at https://liftcheck.dgkv.chatgpt.site. An anonymous HTTP check returned 200 without sign-in, negotiated MCP 2025-11-25, discovered all six tools, reproduced alternative → blocked → unknown, saved and reloaded a journey, verified a second visitor saw an empty list, and fetched a complete current MBTA snapshot. [Public check receipt](../artifacts/public-hosting-qa.json).

## Reproduce

```sh
npm ci
npm test
npm run test:hosted
npm run test:browser
node scripts/preview-site.mjs
```

The preview uses workerd and local D1 at port 4326. Production bindings and migrations are managed by OpenAI Sites. Source schemas are in `db/schema.ts`, and generated migrations are immutable after deployment. The dev runtime currently uses Miniflare's official v4-option compatibility converter.
