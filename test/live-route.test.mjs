import test from "node:test";
import assert from "node:assert/strict";
import { handleLiveWebSocket } from "../src/live-route.js";

function req(path = "/api/live/ws?class=CL-A&t=not-validated-here", options = {}) {
  return new Request("https://sutra.skmishraofficial.workers.dev" + path, {
    method: options.method || "GET",
    headers: {
      Upgrade: options.upgrade === false ? "" : "websocket",
      "X-Live-Uid": "client-spoof",
      "X-Live-Role": "teacher",
      "X-Live-Ctrl": "1",
    },
  });
}

function envWithLive() {
  let captured;
  const env = {
    LIVE: {
      idFromName(name) { return { name }; },
      get(id) {
        return { async fetch(request) { captured = { request, room: id.name }; return new Response("forwarded", { status: 200 }); } };
      },
    },
  };
  return { env, get captured() { return captured; } };
}

test("uses the deployed /api/live/ws route and ?class= room contract", async () => {
  const mock = envWithLive();
  const res = await handleLiveWebSocket(req(), mock.env, { uid: "student-1", role: "student", name: "Student", ctrl: false });
  assert.equal(res.status, 200);
  assert.equal(mock.captured.room, "CL-A");
});

test("overwrites client-supplied identity headers with verified identity", async () => {
  const mock = envWithLive();
  await handleLiveWebSocket(req(), mock.env, { uid: "student-1", role: "student", name: "Trusted Student", ctrl: false });
  assert.equal(mock.captured.request.headers.get("X-Live-Uid"), "student-1");
  assert.equal(mock.captured.request.headers.get("X-Live-Role"), "student");
  assert.equal(mock.captured.request.headers.get("X-Live-Name"), "Trusted Student");
  assert.equal(mock.captured.request.headers.get("X-Live-Ctrl"), "0");
});

test("refuses a missing verified identity", async () => {
  const mock = envWithLive();
  const res = await handleLiveWebSocket(req(), mock.env, null);
  assert.equal(res.status, 401);
});

test("returns 503 when the LIVE binding is missing", async () => {
  const res = await handleLiveWebSocket(req(), {}, { uid: "s1", role: "student" });
  assert.equal(res.status, 503);
});

test("rejects missing or invalid class IDs", async () => {
  const mock = envWithLive();
  const missing = await handleLiveWebSocket(req("/api/live/ws?t=x"), mock.env, { uid: "s1", role: "student" });
  const invalid = await handleLiveWebSocket(req("/api/live/ws?class=bad%20id&t=x"), mock.env, { uid: "s1", role: "student" });
  assert.equal(missing.status, 400);
  assert.equal(invalid.status, 400);
});

test("rejects non-WebSocket and non-GET requests", async () => {
  const mock = envWithLive();
  const nonWs = await handleLiveWebSocket(req("/api/live/ws?class=CL-A", { upgrade: false }), mock.env, { uid: "s1", role: "student" });
  const post = await handleLiveWebSocket(req("/api/live/ws?class=CL-A", { method: "POST" }), mock.env, { uid: "s1", role: "student" });
  assert.equal(nonWs.status, 426);
  assert.equal(post.status, 405);
});

test("does not intercept unrelated application routes", async () => {
  const res = await handleLiveWebSocket(req("/api/config"), {}, { uid: "s1", role: "student" });
  assert.equal(res, null);
});
