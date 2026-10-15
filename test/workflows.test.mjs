import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateMethod,
  methodSnapshot,
  timeline,
  duration,
} from "../public/methods-model.mjs";
import {
  defaults,
  validate,
  toQuery,
  fromQuery,
  schemaRecipe,
} from "../public/math.mjs";
import { validateBake, compareMethods } from "../public/bakes-model.mjs";
const method = {
  name: "Three folds",
  steps: [
    {
      title: "Autolyse",
      instructions: "Mix flour and water.",
      restMinutes: 45,
    },
    {
      title: "Add starter and salt",
      instructions: "Mix until combined.",
      restMinutes: 30,
    },
    {
      title: "Stretch and fold",
      instructions: "Fold the dough.",
      restMinutes: 30,
    },
  ],
};
test("step schedule adds rests once and handles overnight waits", () => {
  assert.deepEqual(
    timeline(method).map((s) => s.startMinutes),
    [0, 45, 75],
  );
  assert.equal(duration(90), "1 h 30 min");
  assert.equal(duration(720), "12 h");
  assert.throws(() =>
    validateMethod({
      ...method,
      steps: [{ ...method.steps[0], restMinutes: -1 }],
    }),
  );
  assert.throws(() => validateMethod({ ...method, steps: [] }));
});
test("recipes and logs retain immutable method versions and round-trip in links", () => {
  const record = {
      id: "9b561572-49b4-42db-bffa-2bad50d71fe9",
      updatedAt: "2026-10-15T10:00:00Z",
      method: structuredClone(method),
    },
    snapshot = methodSnapshot(record),
    recipe = validate({ ...defaults(), method: snapshot });
  record.method.steps[0].restMinutes = 99;
  assert.equal(recipe.method.steps[0].restMinutes, 45);
  assert.deepEqual(fromQuery(toQuery(recipe)), recipe);
  const bake = validateBake({ date: "2026-10-15", recipe });
  snapshot.steps[0].title = "Changed";
  assert.equal(bake.recipe.method.steps[0].title, "Autolyse");
});
test("Mealie exports method titles, rests and notes without losing gram weights", () => {
  const schema = schemaRecipe({
    ...defaults(),
    method,
    notes: "Try less water next time.",
  });
  assert.equal(schema.recipeInstructions[0].name, "Autolyse");
  assert.match(schema.recipeInstructions[0].text, /Rest for 45 minutes/);
  assert.match(schema.description, /Try less water/);
  assert.match(schema.recipeIngredient.join("\n"), /750 g Water/);
  assert.equal(schema.recipeInstructions.length, 3);
});
test("bake validation preserves zero measurements, rejects impossible data and leaves blanks null", () => {
  const b = validateBake({
    date: "2026-10-15",
    recipe: defaults(),
    roomTempC: 0,
  });
  assert.equal(b.roomTempC, 0);
  assert.equal(b.rating, null);
  assert.throws(() => validateBake({ ...b, date: "2026-02-30" }));
  assert.throws(() => validateBake({ ...b, bakedWeightG: 2000 }));
  assert.throws(() => validateBake({ ...b, rating: 6 }));
  assert.throws(() => validateBake({ ...b, bulkMinutes: NaN }));
});
test("comparison excludes unrated entries and keeps changed method versions separate", () => {
  const make = (rating, m = method) => ({
    bake: validateBake({
      date: "2026-10-15",
      recipe: { ...defaults(), method: m },
      rating,
      doughTempC: rating === null ? null : 24,
    }),
  });
  const changed = structuredClone(method);
  changed.steps[0].restMinutes = 60;
  const groups = compareMethods([
    make(3),
    make(5),
    make(null),
    make(1, changed),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[0].ratedCount, 2);
  assert.equal(groups[0].rating, 4);
  assert.equal(groups[0].doughTempC, 24);
  assert.equal(groups[1].rating, 1);
  assert.deepEqual(compareMethods([]), []);
});
