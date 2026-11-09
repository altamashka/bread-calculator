import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { defaults, calculate, weighedIngredients } from "../public/math.mjs";
import { newBakeSession, validateBakeSession, bakeDraft, recoverableBakeDraft } from "../public/bake-mode-model.mjs";
import { readDraft, writeDraft } from "../public/drafts.mjs";

test("a running bake keeps its captured recipe and method when saved definitions change", () => {
  const record = { id: randomUUID(), recipe: { ...defaults(), starterHydration: 50,
    wholeWheat: 30, rye: 10, method: { id: randomUUID(), savedAt: "2026-10-31T10:00:00Z", name: "Demo method",
      steps: [{ title: "Mix", instructions: "Mix ingredients", restMinutes: 30 }] } } };
  const session = newBakeSession(record);
  const before = structuredClone(session.recipe);
  record.recipe.flour = 3000;
  record.recipe.method.steps[0].instructions = "Changed library instructions";
  assert.deepEqual(session.recipe, before);
  assert.equal(session.recipe.flour, 1000);
  assert.equal(session.recipe.method.steps[0].instructions, "Mix ingredients");
  assert.ok(Math.abs(weighedIngredients(session.recipe).reduce((n, r) => n + r.grams, 0) - calculate(session.recipe).dough) < 1e-9);
});

test("recovered baking progress is bounded by its captured weights and method", () => {
  const session = newBakeSession({ id: randomUUID(), recipe: defaults() });
  const restored = validateBakeSession({ ...session, weighed: [0, 0, 1, -1, 100],
    completedSteps: [0], index: 999, stepIndex: -1, layout: "focus", tab: "method" });
  assert.deepEqual(restored.weighed, [0, 1]);
  assert.deepEqual(restored.completedSteps, []);
  assert.equal(restored.index, 0);
  assert.equal(restored.stepIndex, 0);
  assert.equal(restored.layout, "focus");
  assert.equal(restored.tab, "method");
  assert.throws(() => validateBakeSession({ ...session, recipe: { flour: 0 } }));
});

test("draft recovery round-trips incomplete form data and fails safely if storage is unavailable", () => {
  const data = new Map(), storage = { getItem: (k) => data.get(k), setItem: (k, v) => data.set(k, v) };
  const value = { dirty: true, observations: "Draft note", form: { proofMinutes: null, coldProofMinutes: 60 } };
  assert.equal(writeDraft("test", value, storage), true);
  assert.deepEqual(readDraft("test", storage), value);
  data.set("test", "broken JSON");
  assert.equal(readDraft("test", storage), null);
  const blocked = { getItem() { throw Error("blocked"); }, setItem() { throw Error("full"); } };
  assert.equal(readDraft("test", blocked), null);
  assert.equal(writeDraft("test", value, blocked), false);
});

test("storage security errors do not prevent the page from loading", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw Error("denied"); } });
  try {
    assert.equal(readDraft("test"), null);
    assert.equal(writeDraft("test", { dirty: true }), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "sessionStorage", descriptor);
    else delete globalThis.sessionStorage;
  }
});

test("acknowledged tab copies do not replace later cross-device progress", () => {
  const start = newBakeSession({ id: randomUUID(), recipe: defaults() });
  const local = { ...start, weighed: [0] };
  const remote = { ...start, weighed: [0, 1] };
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const acknowledged = bakeDraft(local, 2, true);
  assert.equal(recoverableBakeDraft(acknowledged, { session: remote, revision: 3 }, equal), null);
  assert.deepEqual(acknowledged.session.weighed, [0]); // The copy was not deleted or modified.
});

test("unsaved, conflicting, and legacy tab copies require explicit recovery", () => {
  const start = newBakeSession({ id: randomUUID(), recipe: defaults() });
  const local = { ...start, weighed: [0] };
  const remote = { ...start, weighed: [1] };
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const draft = bakeDraft(local, 2, false, { revision: 2, session: start });
  assert.deepEqual(recoverableBakeDraft(draft, { session: start, revision: 2 }, equal),
    { session: local, conflict: false, legacy: false });
  assert.deepEqual(recoverableBakeDraft(draft, { session: remote, revision: 3 }, equal),
    { session: local, conflict: true, legacy: false });
  assert.deepEqual(recoverableBakeDraft(local, { session: remote, revision: 3 }, equal),
    { session: local, conflict: true, legacy: true });
  assert.equal(recoverableBakeDraft(draft, { session: local, revision: 3 }, equal), null);
  const other = newBakeSession({ id: randomUUID(), recipe: defaults() });
  assert.equal(recoverableBakeDraft(draft, { session: other, revision: 2 }, equal), null);
  // A draft created while a request is in flight is independent of later edits.
  local.weighed.push(2);
  assert.deepEqual(draft.session.weighed, [0]);
  assert.deepEqual(draft.attempt.session.weighed, []);
});
