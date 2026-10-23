# VEDNEX SUTRA Live Class — diagnosis v002

## Findings from the saved Worker source

The saved file `sutra-worker-v001.js` contains the real live-class route and authorization flow:

- Route: `GET /api/live/ws?class=<ClassID>&t=<session-token>`
- The route verifies student/staff session tokens.
- Students are checked against their entitled classes.
- Staff are checked against the Classes list / ownership.
- The Worker forwards the WebSocket to `env.LIVE`.
- The same source exports `LiveRoom`.

This means the isolated `live-route.js` helper is **not** the correct production fix for this source: the actual endpoint is `/api/live/ws`, with `class` and `t` parameters, and the existing `liveConnect()` already performs authorization. Do not replace that auth flow with a second bridge.

## Most likely configuration failure

The source explicitly returns `503 {"error":"live_not_configured"}` when `env.LIVE` is missing. The required binding name is exactly `LIVE`; a binding called `LIVE_ROOM` or `LiveRoom` is not equivalent.

In Cloudflare Worker settings, inspect the **main** `sutra` Worker and confirm its Durable Object binding is named `LIVE` and targets the intended `LiveRoom` class/namespace. Do not create a new namespace or migration until the currently deployed class and migration history are checked.

## Safe verification

1. Open the existing Worker settings and inspect the Durable Objects binding before changing anything.
2. If `LIVE` is absent, verify whether `LiveRoom` is exported by the exact deployed source and whether its existing migration has already been applied. Add only the missing binding/configuration.
3. Test using a logged-in entitled student and authorized teacher in the same class.
4. In browser Network tools, the WebSocket request should be `/api/live/ws?class=...` and successful handshake status is `101 Switching Protocols`.
5. Interpret failures:
   - `503 live_not_configured`: missing/misnamed binding.
   - `401 login_again`: token/session verification.
   - `403 not_entitled` or `forbidden`: course entitlement or staff class ownership.
   - `101` but no message relay: inspect room ID and frontend message protocol.

## Production safety

No production deployment has been performed. Keep `SKM_KV`, Apps Script variables, login, payment, and all other routes unchanged. Do not publish secrets to GitHub. The helper patch is only a reference and should not be deployed as a replacement Worker.
