/**
 * VEDNEX SUTRA — Live WebSocket bridge (v001)
 *
 * IMPORTANT:
 * Call this only AFTER the existing Sutra session/login checks have authenticated
 * the request and resolved a trusted identity. Never pass identity values directly
 * from client-supplied headers or query parameters.
 *
 * This module deliberately does not replace the main Worker or its API routes.
 */

const json = (body, status = 400) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/**
 * Forward an authenticated live-class WebSocket upgrade to the existing skm-live
 * Durable Object Worker. identity must be derived by the existing auth/session layer:
 * { uid, role: "student"|"teacher"|"staff", name, canControl: boolean, roomId?: string }
 */
export async function handleLiveUpgrade(request, env, identity) {
  if (request.method !== "GET") return json({ ok: false, error: "GET_required" }, 405);
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket upgrade required", { status: 426 });
  }
  if (!env.LIVE || typeof env.LIVE.idFromName !== "function") {
    return json({ ok: false, error: "LIVE_binding_missing" }, 503);
  }
  if (!identity || !String(identity.uid || "").trim()) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const role = String(identity.role || "").toLowerCase();
  if (!["student", "teacher", "staff"].includes(role)) {
    return json({ ok: false, error: "forbidden_role" }, 403);
  }

  // The existing skm-live class uses ctrl=1 to grant moderator actions.
  // Only trusted server-side authorization may set this flag.
  const canControl = Boolean(identity.canControl) && role !== "student";
  const roomId = String(identity.roomId || "main").trim().slice(0, 100) || "main";

  const headers = new Headers(request.headers);
  // Remove any client-supplied identity headers before setting trusted values.
  headers.delete("X-Live-Uid");
  headers.delete("X-Live-Role");
  headers.delete("X-Live-Name");
  headers.delete("X-Live-Ctrl");
  headers.set("X-Live-Uid", String(identity.uid).slice(0, 80));
  headers.set("X-Live-Role", role === "student" ? "student" : (canControl ? "teacher" : "staff"));
  headers.set("X-Live-Name", String(identity.name || "").slice(0, 100));
  headers.set("X-Live-Ctrl", canControl ? "1" : "0");

  const upstream = new Request(request, { headers });
  const id = env.LIVE.idFromName(roomId);
  return env.LIVE.get(id).fetch(upstream);
}

/**
 * Small route predicate; keep the actual path consistent with the frontend's
 * existing WebSocket URL when integrating this module.
 */
export function isLiveWebSocketRequest(request, pathname = "/live") {
  const url = new URL(request.url);
  return url.pathname === pathname && request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}
