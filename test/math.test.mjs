import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculate,
  defaults,
  scale,
  fromQuery,
  toQuery,
  validate,
  schemaRecipe,
} from "../public/math.mjs";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test("Ben’s BRDCLC recipe includes starter flour and water", () => {
  const c = calculate(defaults());
  assert.equal(c.dough, 1970);
  assert.equal(c.totalFlour, 1100);
  assert.equal(c.totalWater, 850);
  near(c.hydration, (850 / 1100) * 100);
  near(c.prefermented, (100 / 1100) * 100);
});
test("King Arthur worked example: 500 flour, 375 water, 100 starter", () => {
  const c = calculate({ ...defaults(), flour: 500, water: 75, salt: 2.2 });
  assert.equal(c.totalWater, 425);
  assert.equal(c.totalFlour, 550);
  near(c.hydration, (425 / 550) * 100);
});
test("stiff and liquid starters use the correct ratio", () => {
  for (const h of [0, 50, 100, 125, 200, 500]) {
    const c = calculate({ ...defaults(), starterHydration: h });
    near(c.starterFlour + c.starterWater, 200);
    near((c.starterWater / c.starterFlour) * 100, h);
  }
});
test("zero starter, milk, enriched ingredients and mass balance", () => {
  const c = calculate({
    ...defaults(),
    leaven: 0,
    milk: 10,
    eggs: 20,
    butter: 10,
  });
  assert.equal(c.hydration, 75);
  assert.equal(c.liquidHydration, 85);
  assert.equal(c.dough, 2170);
});
test("scaling conserves percentages, hydration and target weight", () => {
  const r = defaults(),
    scaled = scale(r, 1800),
    c = calculate(scaled);
  near(c.dough, 1800);
  near(c.hydration, calculate(r).hydration);
  assert.equal(scaled.salt, 2);
  assert.equal(scaled.leaven, 20);
});
test("links round trip and import old preferments", () => {
  const r = {
    ...defaults(),
    notes: "Mix & fold\nThen bake",
    name: "Ben’s loaf",
  };
  assert.deepEqual(fromQuery(toQuery(r)), r);
  assert.equal(fromQuery("?flour=1000&water=75&salt=2&leaven=20").leaven, 20);
  assert.equal(fromQuery("?poolish=10").leaven, 10);
  assert.equal(fromQuery("?leaven=10&starter=20&poolish=30").leaven, 60);
});
test("invalid inputs never produce misleading results", () => {
  for (const patch of [
    { flour: 0 },
    { water: NaN },
    { salt: -1 },
    { rye: 60, wholeWheat: 50 },
    { portions: 1.5 },
    { starterHydration: 501 },
    { name: "" },
    { water: Infinity },
  ])
    assert.throws(() => calculate({ ...defaults(), ...patch }));
  assert.throws(() => fromQuery("?water="));
  assert.throws(() => scale(defaults(), 0));
  assert.throws(() => validate(null));
});
test("recipe export contains weighed blend and method without invented instructions", () => {
  const j = schemaRecipe({
    ...defaults(),
    wholeWheat: 20,
    rye: 10,
    notes: "Mix\nBake",
  });
  assert.equal(j["@type"], "Recipe");
  assert.ok(j.recipeIngredient.includes("700 g white flour"));
  assert.ok(j.recipeIngredient.includes("200 g whole wheat flour"));
  assert.equal(j.recipeInstructions.length, 2);
  assert.deepEqual(schemaRecipe(defaults()).recipeInstructions, []);
});

test("water temperature and mixing calibration use three or four factors in Celsius", async () => {
  const { waterTemperature, mixingFriction } = await import(
    "../public/math.mjs"
  );
  const input = { target: 25, room: 22, flour: 23, starter: 20, friction: 5 };
  assert.equal(waterTemperature(input), 30);
  assert.equal(waterTemperature({ ...input, starter: null }), 25);
  assert.equal(mixingFriction({ ...input, actual: 25, water: 30 }), 5);
  assert.equal(
    mixingFriction({ ...input, starter: null, actual: 25, water: 25 }),
    5,
  );
  assert.throws(() => waterTemperature({ ...input, flour: NaN }));
  assert.throws(() => waterTemperature({ ...input, friction: undefined }));
});

test("structured ingredient weights preserve blend, starter mass and arbitrary scaling", async () => {
  const { weighedIngredients } = await import("../public/math.mjs");
  for (const starterHydration of [0, 50, 100, 200, 500]) {
    const recipe = { ...defaults(), wholeWheat: 35, rye: 15, starterHydration, milk: 4, oil: 1 };
    for (const scaled of [recipe, scale(recipe, 1234.567)]) {
      const rows = weighedIngredients(scaled);
      near(rows.reduce((sum, row) => sum + row.grams, 0), calculate(scaled).dough);
      near(rows.filter((row) => row.name.endsWith("flour")).reduce((sum, row) => sum + row.grams, 0), scaled.flour);
      assert.equal(rows.find((row) => row.name.includes("starter")).note, `(${starterHydration}% hydration)`);
    }
  }
  assert.ok(!weighedIngredients({ ...defaults(), wholeWheat: 100 }).some((row) => row.name === "white flour"));
});
