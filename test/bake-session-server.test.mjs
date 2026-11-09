import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { defaults } from "../public/math.mjs";
import { newBakeSession } from "../public/bake-mode-model.mjs";

process.env.DATA_DIR = await mkdtemp(`${tmpdir()}/bread-sessions-`);
const { createServer } = await import("../server.mjs");

test("in-progress notes and snapshots survive restart and reject stale writes", async (t) => {
  let server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(process.env.DATA_DIR, { recursive: true });
  });
  let base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(base + path, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const list = async () => (await fetch(base + "/api/bake-sessions")).json();
  const session = newBakeSession({ id: randomUUID(), recipe: defaults() });
  assert.equal(session.notes, "");
  const created = await (await post("/api/bake-sessions", { session })).json();
  assert.equal(created.revision, 1);
  const { notes: omittedNotes, ...legacySession } = session;
  let second = await (await post("/api/bake-sessions", { session: legacySession })).json();
  assert.notEqual(created.id, second.id);
  assert.equal(second.session.notes, "");
  // Simulate a session actually stored by an older version before notes existed.
  await writeFile(`${process.env.DATA_DIR}/bake-sessions/${second.id}.json`,
    JSON.stringify({ ...second, session: legacySession }));
  const legacyRecord = (await list()).find((r) => r.id === second.id);
  assert.equal(Object.hasOwn(legacyRecord.session, "notes"), false);
  second = await (await post("/api/bake-sessions", {
    id: second.id, revision: legacyRecord.revision, session: legacyRecord.session,
  })).json();
  assert.equal(second.session.notes, "");
  const progressed = { ...session, weighed: [0], tab: "method",
    notes: "Measured flour tonight.\n  Cold proof starts tomorrow.  " };
  const updated = await (await post("/api/bake-sessions", {
    id: created.id, revision: created.revision, session: progressed,
  })).json();
  assert.equal(updated.revision, 2);
  assert.equal((await post("/api/bake-sessions", {
    id: created.id, revision: created.revision,
    session: { ...session, notes: "A stale device's note" },
  })).status, 409);
  assert.equal((await post("/api/bake-sessions", {
    id: created.id, revision: updated.revision,
    session: { ...progressed, recipe: { ...session.recipe, name: "Changed" } },
  })).status, 400);
  assert.deepEqual((await list()).find((r) => r.id === created.id).session, progressed);

  // Restart the HTTP server against the same isolated data directory, as when
  // the application container is replaced while its persistent volume remains.
  await new Promise((resolve) => server.close(resolve));
  server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual((await list()).find((r) => r.id === created.id), updated);
  assert.equal((await list()).find((r) => r.id === second.id).session.notes, "");
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
