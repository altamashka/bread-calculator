import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { defaults, schemaRecipe } from "../public/math.mjs";
process.env.DATA_DIR = await mkdtemp(`${tmpdir()}/bread-test-`);
const { createServer } = await import("../server.mjs");
test("HTTP persistence, method snapshots and Mealie create/update/retry avoid duplicates", async (t) => {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const remote = new Map();
  let creates = 0,
    patches = 0,
    failPatch = false;
  const mock = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, "Bearer test-token");
    let body = "";
    for await (const c of req) body += c;
    const value = body ? JSON.parse(body) : null,
      url = new URL(req.url, "http://localhost");
    const send = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/api/recipes" && req.method === "GET")
      return send(200, {
        items: [...remote.values()].map((r) => ({
          id: r.id,
          slug: r.slug,
          name: r.name,
        })),
        total: remote.size,
      });
    if (
      url.pathname === "/api/recipes/create/html-or-json" &&
      req.method === "POST"
    ) {
      creates++;
      const j = JSON.parse(value.data),
        slug = "test-loaf-" + creates;
      remote.set(slug, {
        id: randomUUID(),
        slug,
        name: j.name,
        recipeIngredient: j.recipeIngredient.map((note) => ({ note })),
        recipeInstructions: [],
        extras: { keep: "untouched" },
      });
      return send(201, slug);
    }
    const slug = decodeURIComponent(url.pathname.split("/").at(-1)),
      r = remote.get(slug);
    if (!r) return send(404, {});
    if (req.method === "GET") return send(200, r);
    if (req.method === "PATCH") {
      patches++;
      if (Object.values(value.extras ?? {}).some((v) => typeof v !== "string"))
        return send(500, { error: "Mealie extras values must be text" });
      // Installed Mealie 3.10.2 drops unset defaults on PATCH; its ORM then
      // requires ingredient_references even though OpenAPI defaults it to [].
      if (
        value.recipeInstructions.some(
          (step) => !Array.isArray(step.ingredientReferences),
        )
      )
        return send(500, {
          error: "RecipeInstruction requires ingredient_references",
        });
      if (failPatch) {
        failPatch = false;
        return send(500, {});
      }
      Object.assign(r, value);
      return send(200, r);
    }
    return send(405, {});
  });
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await Promise.all([
      new Promise((r) => server.close(r)),
      new Promise((r) => mock.close(r)),
    ]);
    await rm(process.env.DATA_DIR, { recursive: true });
    delete process.env.MEALIE_URL;
    delete process.env.MEALIE_TOKEN;
  });
  const post = (path, value, headers = {}) =>
      fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(value),
      }),
    get = async (path) => (await fetch(base + path)).json();
  for (const path of ["/", "/methods", "/bakes", "/healthz"])
    assert.equal((await fetch(base + path)).status, 200);
  assert.equal(
    (await post("/api/recipes", { recipe: { flour: 0 } })).status,
    400,
  );
  assert.equal(
    (
      await post(
        "/api/recipes",
        { recipe: {} },
        { Origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post("/api/methods", {
        id: "../../bad",
        method: {
          name: "x",
          steps: [{ title: "x", instructions: "", restMinutes: 0 }],
        },
      })
    ).status,
    400,
  );
  const method = await (
    await post("/api/methods", {
      method: {
        name: "Fold test",
        steps: [
          {
            title: "Autolyse",
            instructions: "Mix flour and water.",
            restMinutes: 30,
          },
          { title: "Fold", instructions: "Stretch and fold.", restMinutes: 20 },
        ],
      },
    })
  ).json();
  const snapshot = {
    id: method.id,
    savedAt: method.updatedAt,
    ...method.method,
  };
  const saved = await (
    await post("/api/recipes", {
      recipe: { name: "Test loaf", method: snapshot },
      mealieEnabled: true,
    })
  ).json();
  assert.ok(saved.id);
  assert.equal((await post("/api/mealie", { id: saved.id })).status, 503);
  process.env.MEALIE_URL = `http://127.0.0.1:${mock.address().port}`;
  process.env.MEALIE_TOKEN = "test-token";
  assert.equal((await post("/api/mealie", { id: saved.id })).status, 200);
  assert.equal(creates, 1);
  const linked = (await get("/api/recipes"))[0];
  assert.ok(linked.mealieSlug);
  assert.equal(linked.mealieRecipeId, [...remote.values()][0].id);
  assert.equal([...remote.values()][0].recipeInstructions[0].title, "Autolyse");
  assert.deepEqual(
    [...remote.values()][0].recipeInstructions[0].ingredientReferences,
    [],
  );
  assert.match(
    [...remote.values()][0].recipeInstructions[0].text,
    /30 minutes/,
  );
  assert.equal([...remote.values()][0].extras.keep, "untouched");
  const metadata = JSON.parse([...remote.values()][0].extras.breadCalculator);
  assert.equal(metadata.recipeId, saved.id);
  assert.deepEqual(metadata.formula, saved.recipe);
  assert.equal((await post("/api/mealie", { id: saved.id })).status, 200);
  assert.equal(creates, 1);
  assert.equal(patches, 1);
  const changed = { ...saved.recipe, water: 70 };
  await post("/api/recipes", {
    id: saved.id,
    recipe: changed,
    mealieEnabled: true,
  });
  assert.equal((await post("/api/mealie", { id: saved.id })).status, 200);
  assert.equal(creates, 1);
  assert.equal(patches, 2);
  assert.ok(
    [...remote.values()][0].recipeIngredient.some(
      (i) => i.note === "700 g Water",
    ),
  );
  await post("/api/methods", {
    id: method.id,
    method: {
      ...method.method,
      steps: [{ title: "Changed method", instructions: "", restMinutes: 1 }],
    },
  });
  const frozen = (await get("/api/recipes"))[0].recipe;
  assert.equal(frozen.method.steps[0].title, "Autolyse");
  const bake = await (
    await post("/api/bakes", {
      bake: { date: "2026-10-15", recipe: frozen, rating: 4, roomTempC: 21 },
    })
  ).json();
  assert.equal(bake.bake.recipe.method.steps[0].title, "Autolyse");
  assert.equal((await get("/api/archive")).bakes.length, 1);
  const duplicate = await (
    await post("/api/recipes", { recipe: changed })
  ).json();
  assert.equal((await post("/api/mealie", { id: duplicate.id })).status, 400);
  assert.equal(creates, 1);
  // A successful create followed by a failed update is linked before failure; retry updates, never creates twice.
  const retry = await (
    await post("/api/recipes", { recipe: { name: "Retry loaf" } })
  ).json();
  failPatch = true;
  const failedSync = await post("/api/mealie", { id: retry.id });
  assert.equal(failedSync.status, 502);
  assert.deepEqual(await failedSync.json(), {
    error: "Mealie returned HTTP 500. Your calculator copy is saved.",
  });
  assert.equal(creates, 2);
  assert.equal((await post("/api/mealie", { id: retry.id })).status, 200);
  assert.equal(creates, 2);
  // Legacy exported records resolve their existing copy by the original name AND exact weighed ingredients.
  const legacyId = randomUUID(),
    legacyRecipe = { ...defaults(), name: "Legacy loaf" },
    j = schemaRecipe(legacyRecipe);
  remote.set("legacy", {
    id: randomUUID(),
    slug: "legacy",
    name: j.name,
    recipeIngredient: j.recipeIngredient.map((note) => ({ note })),
    recipeInstructions: [],
    extras: {},
  });
  await writeFile(
    `${process.env.DATA_DIR}/${legacyId}.json`,
    JSON.stringify({
      id: legacyId,
      recipe: legacyRecipe,
      mealieExportedAt: "2026-10-15T00:00:00Z",
    }),
  );
  await post("/api/recipes", {
    id: legacyId,
    recipe: { ...legacyRecipe, water: 72 },
  });
  assert.equal((await post("/api/mealie", { id: legacyId })).status, 200);
  assert.equal(creates, 2);
  assert.equal(
    JSON.parse(
      await readFile(`${process.env.DATA_DIR}/${legacyId}.json`, "utf8"),
    ).mealieSlug,
    "legacy",
  );
  assert.ok(
    remote.get("legacy").recipeIngredient.some((i) => i.note === "720 g Water"),
  );
});
