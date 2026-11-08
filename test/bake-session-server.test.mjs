import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { defaults } from "../public/math.mjs";
import { newBakeSession } from "../public/bake-mode-model.mjs";

process.env.DATA_DIR = await mkdtemp(`${tmpdir()}/bread-sessions-`);
const { createServer } = await import("../server.mjs");

test("in-progress bakes survive reload, reject stale writes, and retain their snapshot", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(process.env.DATA_DIR, { recursive: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(base + path, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const list = async () => (await fetch(base + "/api/bake-sessions")).json();
  const session = newBakeSession({ id: randomUUID(), recipe: defaults() });
  const created = await (await post("/api/bake-sessions", { session })).json();
  assert.equal(created.revision, 1);
  const second = await (await post("/api/bake-sessions", { session })).json();
  assert.notEqual(created.id, second.id);
  const progressed = { ...session, weighed: [0], tab: "method" };
  const updated = await (await post("/api/bake-sessions", {
    id: created.id, revision: created.revision, session: progressed,
  })).json();
  assert.equal(updated.revision, 2);
  assert.equal((await post("/api/bake-sessions", {
    id: created.id, revision: created.revision, session,
  })).status, 409);
  assert.equal((await post("/api/bake-sessions", {
    id: created.id, revision: updated.revision,
    session: { ...progressed, recipe: { ...session.recipe, name: "Changed" } },
  })).status, 400);
  assert.deepEqual((await list()).find((r) => r.id === created.id).session, progressed);
  assert.equal((await (await fetch(base + "/api/archive")).json()).bakeSessions.length, 2);
  const result = await (await post("/api/bakes", {
    bake: { date: "2026-11-08", recipe: session.recipe },
  })).json();
  assert.equal((await post("/api/bake-sessions", {
    id: created.id, revision: updated.revision, session: progressed, resultId: randomUUID(),
  })).status, 400);
  const finished = await (await post("/api/bake-sessions", {
    id: created.id, revision: updated.revision, session: progressed, resultId: result.id,
  })).json();
  assert.equal(finished.resultId, result.id);
  assert.equal((await post("/api/bake-sessions", {
    id: created.id, revision: finished.revision, session: progressed,
  })).status, 400);
  assert.equal((await list()).length, 2);
});
