/**
 * VEDNEX SUTRA — Live WebSocket gateway patch v001
 *
 * Import this helper into the EXISTING main Sutra Worker.
 * Call it only after the existing login/session/course authorization checks pass.
 * Do not replace the production Worker with this module by itself.
 */
export async function handleLiveWebSocket(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  // Keep this route narrow. Adjust the path only after confirming the frontend URL.
  if (path !== "/live" && path !== "/api/live") return null;

  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { "Allow": "GET", "Cache-Control": "no-store" },
    });
  }

  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket upgrade required", {
      status: 426,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!env.LIVE || typeof env.LIVE.idFromName !== "function") {
    return new Response("Live service is not configured", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Keep each class in a separate Durable Object room.
  // The frontend should send a stable room/class identifier in one of these query keys.
  const rawRoom = url.searchParams.get("room")
    || url.searchParams.get("roomId")
    || url.searchParams.get("classId")
    || "default";

  // Prevent unbounded or malformed room identifiers.
  const room = rawRoom.trim().slice(0, 120);
  if (!room || /[\u0000-\u001f]/.test(room)) {
    return new Response("Invalid room", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Preserve the request (including Upgrade and X-Live-* headers) when forwarding.
  const id = env.LIVE.idFromName(room);
  const stub = env.LIVE.get(id);
  return stub.fetch(request);
}
