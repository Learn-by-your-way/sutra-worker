/**
 * VEDNEX SUTRA — Live WebSocket gateway patch v001
 *
 * Integration helper for the EXISTING main Sutra Worker.
 * Invoke only after existing session/login AND course/live-access checks pass.
 * Pass identity values derived from the verified server-side session, never from
 * query parameters or client-supplied X-Live-* headers.
 *
 * Example after your existing authorization:
 *   const liveResponse = await handleLiveWebSocket(request, env, {
 *     uid: verifiedUser.id,
 *     role: verifiedUser.isTeacher ? "teacher" : "student",
 *     name: verifiedUser.displayName,
 *     ctrl: verifiedUser.canControlLive === true
 *   });
 *   if (liveResponse) return liveResponse;
 *
 * Adapt verifiedUser fields to your real session model before integrating.
 * Do NOT deploy this helper as a standalone replacement for the production Worker.
 */
export async function handleLiveWebSocket(request, env, identity) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

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

  if (!identity || !identity.uid || !["student", "teacher", "staff", "admin"].includes(identity.role)) {
    return new Response("Live authorization required", {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!env.LIVE || typeof env.LIVE.idFromName !== "function") {
    return new Response("Live service is not configured", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const rawRoom = url.searchParams.get("room")
    || url.searchParams.get("roomId")
    || url.searchParams.get("classId");

  if (!rawRoom || /[\u0000-\u001f]/.test(rawRoom) || rawRoom.length > 120) {
    return new Response("A valid room/class ID is required", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Override client-supplied identity headers with values from verified server-side auth.
  const headers = new Headers(request.headers);
  headers.set("X-Live-Uid", String(identity.uid).slice(0, 80));
  headers.set("X-Live-Role", identity.role === "teacher" || identity.role === "staff" || identity.role === "admin" ? "teacher" : "student");
  headers.set("X-Live-Name", String(identity.name || "").replace(/[\u0000-\u001f]/g, " ").slice(0, 100));
  headers.set("X-Live-Ctrl", identity.ctrl === true && ["teacher", "staff", "admin"].includes(identity.role) ? "1" : "0");

  const forwardRequest = new Request(request, { headers });
  const id = env.LIVE.idFromName(rawRoom);
  return env.LIVE.get(id).fetch(forwardRequest);
}
