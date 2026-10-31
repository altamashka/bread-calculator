import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { defaults, validate, weighedIngredients, schemaRecipe } from "../public/math.mjs";
import { syncMealie, recipeHash } from "../mealie.mjs";

function fixture(t) {
  const old = { url: process.env.MEALIE_URL, token: process.env.MEALIE_TOKEN };
  process.env.MEALIE_URL = "http://mealie.test";
  process.env.MEALIE_TOKEN = "test-token";
  t.after(() => {
    for (const [key, value] of [["MEALIE_URL", old.url], ["MEALIE_TOKEN", old.token]])
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
  const bread = { id: randomUUID(), name: "Bread", slug: "bread" };
  const record = { id: randomUUID(), recipe: validate({ ...defaults(), leaven: 0 }),
    mealieSlug: "linked", mealieRecipeId: randomUUID() };
  const state = {
    units: [{ id: randomUUID(), name: "gram", description: "keep unit metadata" }],
    foods: [], patches: 0, creates: 0, conflict: false, failCreate: false,
    remote: { id: record.mealieRecipeId, slug: "linked", name: record.recipe.name,
      recipeCategory: [bread], extras: {} },
  };
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const u = new URL(url), method = options.method;
    assert.equal(options.headers.Authorization, "Bearer test-token");
    if (u.pathname.includes("/categories/")) return json(bread);
    if (["/api/units", "/api/foods"].includes(u.pathname)) {
      const items = state[u.pathname.slice(5)];
      if (method === "GET") {
        const start = (Number(u.searchParams.get("page")) - 1) * 100;
        return json({ total: items.length, items: items.slice(start, start + 100) });
      }
      state.creates++;
      const value = { ...JSON.parse(options.body), id: randomUUID() };
      if (state.failCreate) return json({}, 503);
      items.push(value);
      if (state.conflict) { state.conflict = false; return json({}, 409); }
      return json(value, 201);
    }
    if (u.pathname === "/api/recipes")
      return json({ items: [state.remote], total: 1 });
    assert.equal(u.pathname, "/api/recipes/linked");
    if (method === "PATCH") {
      state.patches++;
      Object.assign(state.remote, JSON.parse(options.body));
    }
    return json(state.remote);
  });
  return { state, record, persist: async () => {} };
}

test("structured export pages through exact food matches and preserves library metadata", async (t) => {
  const { state, record, persist } = fixture(t);
  state.foods = Array.from({ length: 100 }, (_, i) => ({ id: randomUUID(), name: `unrelated ${i}` }));
  const flour = { id: randomUUID(), name: "WHITE FLOUR", description: "keep food metadata" };
  state.foods.push(flour);
  await syncMealie(record, persist);
  const row = state.remote.recipeIngredient[0];
  assert.equal(row.food.id, flour.id);
  assert.deepEqual(row.food, { id: flour.id, name: flour.name });
  assert.deepEqual(row.unit, { id: state.units[0].id, name: "gram" });
  assert.equal(row.quantity, 1000);
  assert.equal(flour.description, "keep food metadata");
  assert.equal(state.creates, 2); // water and salt only
});

test("missing gram unit is created with decimal g display and reused on retry", async (t) => {
  const { state, record, persist } = fixture(t);
  state.units = [];
  await syncMealie(record, persist);
  assert.equal(state.units[0].fraction, false);
  assert.equal(state.units[0].abbreviation, "g");
  assert.equal(state.units[0].useAbbreviation, true);
  const count = state.creates;
  assert.deepEqual(await syncMealie(record, persist), { ok: true, changed: false });
  assert.equal(state.creates, count);
});

test("ambiguous exact food matches stop before patching or guessing", async (t) => {
  const { state, record, persist } = fixture(t);
  state.foods = [{ id: randomUUID(), name: "white flour" }, { id: randomUUID(), name: "White Flour" }];
  await assert.rejects(syncMealie(record, persist), /More than one matching food/);
  assert.equal(state.patches, 0);
  assert.equal(state.creates, 0);
});

test("a concurrent food creation is resolved by another exact lookup", async (t) => {
  const { state, record, persist } = fixture(t);
  state.conflict = true;
  await syncMealie(record, persist);
  assert.equal(state.foods.filter((item) => item.name === "white flour").length, 1);
  assert.equal(state.patches, 1);
});

test("failed food creation retains recipe identity and leaves the export retryable", async (t) => {
  const { state, record, persist } = fixture(t);
  state.failCreate = true;
  await assert.rejects(syncMealie(record, persist), /HTTP 503/);
  assert.equal(state.patches, 0);
  assert.ok(!record.mealieHash);
  assert.equal(record.mealieRecipeId, state.remote.id);
  state.failCreate = false;
  await syncMealie(record, persist);
  assert.equal(state.patches, 1);
});

test("unchanged text-only exports migrate once to the structured format", async (t) => {
  const { state, record, persist } = fixture(t);
  record.mealieHash = createHash("sha256").update(JSON.stringify(record.recipe)).digest("hex");
  assert.notEqual(record.mealieHash, recipeHash(record.recipe));
  await syncMealie(record, persist);
  assert.equal(state.patches, 1);
  assert.equal(record.mealieHash, recipeHash(record.recipe));
  assert.deepEqual(await syncMealie(record, persist), { ok: true, changed: false });
  assert.equal(state.patches, 1);
});


test("pending creates recover structured rows using actual weights, not stale original text", async (t) => {
  const { state, record, persist } = fixture(t);
  delete record.mealieSlug;
  delete record.mealieRecipeId;
  record.mealiePendingCreate = { recipe: record.recipe };
  state.remote.recipeIngredient = weighedIngredients(record.recipe).map((row, index) => ({
    quantity: row.grams, unit: { name: "gram" }, food: { name: row.name },
    note: row.note, originalText: schemaRecipe(record.recipe).recipeIngredient[index],
  }));
  state.remote.recipeIngredient[0].quantity = 1;
  await assert.rejects(syncMealie(record, persist), /Could not uniquely identify/);
  assert.equal(state.patches, 0);
  state.remote.recipeIngredient[0].quantity = record.recipe.flour;
  await syncMealie(record, persist);
  assert.equal(record.mealieRecipeId, state.remote.id);
  assert.equal(state.patches, 1);
});
