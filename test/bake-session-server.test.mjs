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
  const session = newBakeSession({ id: randomUUID(), recipe: { ...defaults(), method: {
    name: "Session timing", steps: [{ title: "Mix", instructions: "Mix flour and water.", restMinutes: 30,
      ingredientAdditions: [{ key: "water", percent: 100 }] }],
  } } });
  assert.equal(session.notes, "");
  const created = await (await post("/api/bake-sessions", { session })).json();
  assert.equal(created.revision, 1);
  const oldSession = structuredClone(session);
  delete oldSession.recipe.method.steps[0].ingredientAdditions;
  const { notes: omittedNotes, stepTimings: omittedTimes, weighedAdditions: omittedPortions, ...legacySession } = oldSession;
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
  assert.equal(Object.hasOwn(second.session.recipe.method.steps[0], "ingredientAdditions"), false);
  assert.deepEqual(second.session.stepTimings, []);
  const progressed = { ...session, weighed: [0], tab: "method", weighedAdditions: ["0:water"],
    stepTimings: [{ startedAt: "2026-11-10T08:00:00Z", completedAt: "2026-11-10T08:10:00Z" }],
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
  assert.equal((await post("/api/bake-sessions", {
    id: created.id, revision: updated.revision,
    session: { ...progressed, stepTimings: [{ completedAt: "2026-11-10T08:10:00Z" }] },
  })).status, 400);
  const changedAssignment = structuredClone(progressed);
  changedAssignment.recipe.method.steps[0].ingredientAdditions[0].percent = 50;
  assert.equal((await post("/api/bake-sessions", {
    id: created.id, revision: updated.revision, session: changedAssignment,
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
    bake: { date: "2026-11-08", recipe: session.recipe, stepTimings: progressed.stepTimings },
  })).json();
  assert.equal((await post("/api/bake-sessions", {
    id: created.id, revision: updated.revision, session: progressed, resultId: randomUUID(),
  })).status, 400);
  const finished = await (await post("/api/bake-sessions", {
    id: created.id, revision: updated.revision, session: progressed, resultId: result.id,
  })).json();
  assert.equal(finished.resultId, result.id);
  assert.deepEqual(result.bake.stepTimings, progressed.stepTimings);
  assert.deepEqual((await (await fetch(base + "/api/archive")).json()).bakes[0].bake.stepTimings, progressed.stepTimings);
  assert.equal((await post("/api/bake-sessions", {
    id: created.id, revision: finished.revision, session: progressed,
  })).status, 400);
  assert.equal((await list()).length, 2);
  // A raw pre-feature ingredients-only bake remains editable without a method.
  const noMethod = newBakeSession({ id: randomUUID(), recipe: defaults() });
  delete noMethod.stepTimings;
  delete noMethod.weighedAdditions;
  let oldNoMethod = await (await post("/api/bake-sessions", { session: noMethod })).json();
  await writeFile(`${process.env.DATA_DIR}/bake-sessions/${oldNoMethod.id}.json`,
    JSON.stringify({ ...oldNoMethod, session: noMethod }));
  oldNoMethod = await (await post("/api/bake-sessions", {
    id: oldNoMethod.id, revision: oldNoMethod.revision, session: { ...noMethod, weighed: [0] },
  })).json();
  assert.deepEqual(oldNoMethod.session.recipe, noMethod.recipe);
  assert.deepEqual(oldNoMethod.session.stepTimings, []);
  assert.deepEqual(oldNoMethod.session.weighedAdditions, []);
  assert.deepEqual(oldNoMethod.session.weighed, [0]);
});
