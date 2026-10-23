# VEDNEX SUTRA — Live WebSocket gateway patch v001

This repository now contains an **isolated integration helper**, not a replacement for the production Sutra Worker.

## Current files

- `src/live-route.js` — validates a WebSocket request, requires a verified server-side identity, overwrites client-supplied `X-Live-*` headers, and forwards to the `LIVE` Durable Object namespace.

## Important: this does not deploy or repair production by itself

The existing Sutra Worker source was not present in this repository when this patch was created. Therefore the helper has **not** been wired into the production request handler, and no production deployment was triggered.

Do not connect this repository to automatic production deployment until the existing Worker code and configuration have been recovered and reviewed.

## Integration requirements

1. Recover the exact current source of the deployed `sutra.skmishraofficial.workers.dev` Worker.
2. Identify the existing login/session and course/live-access authorization path. Preserve it.
3. In that authorized path, import `handleLiveWebSocket` from `./live-route.js`, pass identity values derived from the verified server-side session, and return its response when non-null. Never use client-provided `X-Live-Uid`, `X-Live-Role`, `X-Live-Name`, or `X-Live-Ctrl` as trusted identity.
4. Confirm the actual frontend WebSocket URL before selecting `/live` or `/api/live`; these are provisional paths in v001.
5. Configure the main Worker’s `LIVE` binding to the deployed `LiveRoom` Durable Object in the `skm-live` script, following the current Cloudflare configuration. Do not create a second Durable Object namespace or migration without checking the deployed setup.
6. Verify the existing frontend's expected room ID, role names, message types, and authentication flow against `skm-live/src/index.js`.
7. Test in a preview/staging deployment first: unauthenticated request, normal student, teacher/staff controls, multiple students in one room, invalid room, and disconnect/reconnect.
8. Deploy production only after the preview passes and a rollback version is available.

## Known contract in `skm-live/src/index.js`

The Durable Object expects a WebSocket upgrade and these headers:

- `X-Live-Uid`
- `X-Live-Role` (the current implementation checks `student` for student actions; other users need `X-Live-Ctrl: 1` for staff actions)
- `X-Live-Name`
- `X-Live-Ctrl` (`1` for authorized live control, otherwise `0`)

Supported message types currently include `hand`, `lower`, `poll`, `pollClose`, `vote`, `chat`, and `reply`.

## Safety boundaries

- Keep the existing `SKM_KV` binding, login/payment flows, and other production routes unchanged.
- Never commit API keys, tokens, passwords, session secrets, or other Cloudflare secrets.
- Do not deploy this helper as the complete Worker.
- Use sequential version labels (v001, v002, …), not “FINAL” variants.
