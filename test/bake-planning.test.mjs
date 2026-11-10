import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { defaults, validate, calculate, ingredientPlan, weighedIngredients, scale, toQuery, fromQuery } from "../public/math.mjs";
import { validateMethod, methodSnapshot } from "../public/methods-model.mjs";
import { newBakeSession, validateBakeSession } from "../public/bake-mode-model.mjs";
import { validateBake } from "../public/bakes-model.mjs";
import { validateStepTimings, restDeadline } from "../public/bake-timing-model.mjs";
const step = (ingredientAdditions = []) => ({ title: "Mix", instructions: "Mix the additions.", restMinutes: 30, ingredientAdditions });
const method = () => ({ name: "Split mix", steps: [
  step([{ key: "flour", percent: 100 }, { key: "water", percent: 90 }]),
  step([{ key: "leaven", percent: 100 }, { key: "water", percent: 10 }]),
] });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);

test("method ingredient portions reject invalid allocations and retain legacy shape", () => {
  const legacy = { name: "Legacy", steps: [{ title: "Mix", instructions: "", restMinutes: 0 }] };
  assert.deepEqual(validateMethod(legacy), legacy);
  assert.deepEqual(validateMethod({ ...legacy, steps: [step()] }).steps[0],
    { title: "Mix", instructions: "Mix the additions.", restMinutes: 30 });
  for (const additions of [null, {}, [{ key: ["water"], percent: 100 }], [{ key: "unknown", percent: 100 }], [{ key: "water", percent: "100" }],
    [{ key: "water", percent: NaN }], [{ key: "water", percent: Infinity }], [{ key: "water", percent: 0 }],
    [{ key: "water", percent: -1 }], [{ key: "water", percent: 101 }],
    [{ key: "water", percent: 50 }, { key: "water", percent: 50 }]]) {
    assert.throws(() => validateMethod({ name: "Bad", steps: [step(additions)] }));
  }
  assert.throws(() => validateMethod({ name: "Over", steps: [step([{ key: "water", percent: 60 }]), step([{ key: "water", percent: 50 }])] }));
  assert.deepEqual(validateMethod(method()), method());
});

test("ingredient plans preserve mass, mixed flours, arbitrary starter hydration and batch scaling", () => {
  for (const starterHydration of [0, 50, 100, 200, 500]) {
    const recipe = { ...defaults(), wholeWheat: 30, rye: 10, starterHydration, method: method() };
    for (const batch of [recipe, scale(recipe, 1234.567)]) {
      const plan = ingredientPlan(batch), all = [...plan.preparation, ...plan.steps.flat()];
      near(all.reduce((n, row) => n + row.grams, 0), calculate(batch).dough);
      assert.deepEqual(plan.preparation.map((row) => row.key), ["salt"]);
      near(plan.steps[0].filter((row) => ["whiteFlour", "wholeWheat", "rye"].includes(row.key)).reduce((n, row) => n + row.grams, 0), batch.flour);
      near(plan.steps[0].find((row) => row.key === "water").grams, calculate(batch).grams.water * 0.9);
      near(plan.steps[1].find((row) => row.key === "water").grams, calculate(batch).grams.water * 0.1);
      assert.equal(plan.steps[1].find((row) => row.key === "leaven").note, `(${starterHydration}% hydration)`);
      assert.equal(plan.preparation[0].originalIndex, weighedIngredients(batch).findIndex((row) => row.key === "salt"));
    }
  }
});

test("partial allocations leave an explicit preparation remainder; unused method ingredients add no mass", () => {
  const recipe = { ...defaults(), method: { name: "Partial", steps: [step([{ key: "water", percent: 25 }, { key: "eggs", percent: 100 }])] } };
  const plan = ingredientPlan(recipe);
  assert.equal(plan.steps[0].length, 1);
  near(plan.preparation.find((row) => row.key === "water").grams, 562.5);
  near(plan.steps[0][0].grams, 187.5);
  const legacy = ingredientPlan(defaults());
  assert.deepEqual(legacy.preparation.map(({ key, name, grams, note }) => ({ key, name, grams, note })), weighedIngredients(defaults()));
  assert.deepEqual(legacy.steps, []);
});

test("floating point complete splits do not allocate more than the full ingredient mass", () => {
  const percentages = [10.1, 10.1, 10.1, 10.1, 10.1, 10.1, 10.1, 10.1, 10.1, 9.1];
  const recipe = { ...defaults(), method: { name: "Decimal portions", steps: percentages.map((percent) => step([{ key: "water", percent }])) } };
  const plan = ingredientPlan(recipe);
  near([...plan.preparation, ...plan.steps.flat()].filter((row) => row.key === "water").reduce((n, row) => n + row.grams, 0), 750);
});

test("assigned method snapshots and per-portion checks remain independent of library and preparation changes", () => {
  const record = { id: randomUUID(), updatedAt: "2026-11-10T08:00:00Z", method: method() };
  const recipe = validate({ ...defaults(), method: methodSnapshot(record) });
  const session = newBakeSession({ id: randomUUID(), recipe });
  const original = structuredClone(session.recipe);
  record.method.steps[0].ingredientAdditions[0].percent = 50;
  assert.deepEqual(session.recipe, original);
  assert.deepEqual(fromQuery(toQuery(recipe)), recipe);
  const checked = validateBakeSession({ ...session, weighed: [0, 1, 2, 3], weighedAdditions: ["0:water", "0:water", "99:water", "0:salt", 1] });
  assert.deepEqual(checked.weighedAdditions, ["0:water"]);
  assert.equal(checked.weighedAdditions.includes("1:leaven"), false);
});

test("actual stage times survive validation independently of checked steps and measured fermentation", () => {
  const session = newBakeSession({ id: randomUUID(), recipe: { ...defaults(), method: method() } });
  const timing = { startedAt: "2026-11-10T23:30:00+01:00", completedAt: "2026-11-10T23:45:00+01:00" };
  const timed = validateBakeSession({ ...session, completedSteps: [0, 1], stepTimings: [timing] });
  assert.equal(restDeadline(timed, 0), "2026-11-10T23:15:00.000Z");
  assert.equal(restDeadline(timed, 1), null);
  assert.deepEqual(validateBakeSession({ ...session, completedSteps: [0] }).stepTimings, []);
  const bake = validateBake({ date: "2026-11-10", recipe: session.recipe, stepTimings: timed.stepTimings });
  assert.deepEqual(validateBake(JSON.parse(JSON.stringify(bake))), bake);
  assert.equal(bake.bulkMinutes, null);
  assert.equal(bake.proofMinutes, null);
  assert.deepEqual(bake.stepResults, []);
  timed.stepTimings[0].startedAt = "2026-11-10T00:00:00Z";
  assert.equal(bake.stepTimings[0].startedAt, timing.startedAt);
});

test("timing validation rejects coercion, invalid dates, missing starts, reversed times and wrong method sizes", () => {
  for (const startedAt of [[], {}, 123, "tomorrow", "2026-02-30T12:00:00Z", "2026-11-10T24:00:00Z", "2026-11-10T12:00:00"])
    assert.throws(() => validateStepTimings([{ startedAt }], 1));
  assert.throws(() => validateStepTimings([{ completedAt: "2026-11-10T12:00:00Z" }], 1));
  assert.throws(() => validateStepTimings([{ startedAt: "2026-11-10T12:00:00Z", completedAt: "2026-11-10T11:00:00Z" }], 1));
  assert.throws(() => validateStepTimings([{}], 0));
  assert.throws(() => validateStepTimings([[]], 1));
  assert.deepEqual(validateStepTimings([{}], 1), [{ startedAt: null, completedAt: null }]);
  assert.deepEqual(validateStepTimings([{ startedAt: "2026-11-10T12:00:00Z", completedAt: "2026-11-10T12:00:00Z" }], 1),
    [{ startedAt: "2026-11-10T12:00:00Z", completedAt: "2026-11-10T12:00:00Z" }]);
});
