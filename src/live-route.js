/**
 * VEDNEX SUTRA — Live WebSocket gateway patch v002
 *
 * Isolated helper for the EXISTING main Sutra Worker.
 * Call only after the existing session/login AND course/live-access checks pass.
 * identity must come from the verified server-side session, never from request
 * headers, query parameters, or client-provided role/UID values.
 *
 * Known frontend contract:
 *   wss://sutra.skmishraofficial.workers.dev/api/live/ws?class=<ClassID>&t=<session-token>
 *
 * The main Worker must validate the session token and class entitlement itself
 * before calling this helper. This helper does not authenticate the token.
 *
 * Example after verified session + entitlement:
 *   const liveResponse = await handleLiveWebSocket(request, env, {
 *     uid: verifiedUser.id,
 *     role: verifiedUser.isTeacher ? "teacher" : "student",
 *     name: verifiedUser.displayName,
 *     ctrl: verifiedUser.canControlLive === true
 *   });
 *   if (liveResponse) return liveResponse;
 *
 * Adapt verifiedUser fields to the actual production session model before integration.
 * This helper is NOT a standalone replacement for the production Worker.
 */
const NO_STORE = { "Cache-Control": "no-store" };

const LIVE_PATHS = new Set(["/api/live/ws", "/api/live", "/live"]);

export async function handleLiveWebSocket(request, env, identity) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (!LIVE_PATHS.has(path)) return null;

  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...NO_STORE, "Allow": "GET" },
    });
  }

  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket upgrade required", {
      status: 426,
      headers: NO_STORE,
    });
  }

  if (
    !identity ||
    !String(identity.uid || "").trim() ||
    !["student", "teacher", "staff", "admin"].includes(identity.role)
  ) {
    return new Response("Live authorization required", {
      status: 401,
      headers: NO_STORE,
    });
  }

  if (!env.LIVE || typeof env.LIVE.idFromName !== "function" || typeof env.LIVE.get !== "function") {
    return new Response("Live service is not configured", {
      status: 503,
      headers: NO_STORE,
    });
  }

  // The deployed frontend uses ?class=<ClassID>. Keep aliases for older callers.
  const rawRoom =
    url.searchParams.get("class") ||
    url.searchParams.get("room") ||
    url.searchParams.get("roomId") ||
    url.searchParams.get("classId");

  if (!rawRoom || /[\u0000-\u001f]/.test(rawRoom) || rawRoom.length > 120) {
    return new Response("A valid room/class ID is required", {
      status: 400,
      headers: NO_STORE,
    });
  }

  // Replace all client-supplied identity headers with trusted server-side values.
  const headers = new Headers(request.headers);
  for (const key of ["X-Live-Uid", "X-Live-Role", "X-Live-Name", "X-Live-Ctrl"]) {
    headers.delete(key);
  }

  const role = identity.role;
  const canControl = identity.ctrl === true && ["teacher", "staff", "admin"].includes(role);
  headers.set("X-Live-Uid", String(identity.uid).trim().slice(0, 80));
  headers.set("X-Live-Role", role === "student" ? "student" : "teacher");
  headers.set("X-Live-Name", String(identity.name || "").replace(/[\u0000-\u001f]/g, " ").slice(0, 100));
  headers.set("X-Live-Ctrl", canControl ? "1" : "0");

  const forwardRequest = new Request(request, { headers });
  return env.LIVE.get(env.LIVE.idFromName(rawRoom)).fetch(forwardRequest);
}
