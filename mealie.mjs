import { createHash, randomUUID } from "node:crypto";
import { schemaRecipe, validate, calculate } from "./public/math.mjs";
import { InputError } from "./public/methods-model.mjs";
export const recipeHash = (recipe) =>
  createHash("sha256")
    .update(JSON.stringify(validate(recipe)))
    .digest("hex");
const ingredientText = (r) =>
  (r.recipeIngredient ?? [])
    .map((i) =>
      typeof i === "string" ? i : i.note || i.originalText || i.display || "",
    )
    .map((s) => s.trim().toLowerCase());
export async function syncMealie(record, persist) {
  const base = process.env.MEALIE_URL,
    token = process.env.MEALIE_TOKEN;
  async function request(path, method = "GET", payload) {
    const response = await fetch(new URL(path, base), {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    if (!response.ok) {
      const error = new Error(
        `Mealie returned HTTP ${response.status}. Your calculator copy is saved.`,
      );
      error.upstreamStatus = response.status;
      throw error;
    }
    return response.json();
  }
  async function search(name) {
    const q = new URLSearchParams({ search: name, perPage: "100" }),
      data = await request(`/api/recipes?${q}`);
    if ((data.total ?? 0) > 100)
      throw new InputError(
        "Too many Mealie matches. Use a more specific recipe name.",
      );
    return (data.items ?? data.data ?? []).filter((r) => r.name === name);
  }
  function link(remote) {
    if (
      typeof remote.slug !== "string" ||
      !remote.slug ||
      remote.slug.length > 300 ||
      !remote.id
    )
      throw Error("Mealie returned an invalid recipe link.");
    record.mealieSlug = remote.slug;
    record.mealieRecipeId = remote.id;
  }
  const hash = recipeHash(record.recipe);
  let remote;
  if (record.mealieSlug) {
    try {
      remote = await request(
        `/api/recipes/${encodeURIComponent(record.mealieSlug)}`,
      );
    } catch (e) {
      if (e.upstreamStatus !== 404 || !record.mealieRecipeId) throw e;
      const q = new URLSearchParams({
          queryFilter: `id = "${record.mealieRecipeId}"`,
          perPage: "1",
        }),
        result = await request(`/api/recipes?${q}`),
        candidate = (result.items ?? result.data ?? [])[0];
      if (!candidate)
        throw new InputError(
          "The linked Mealie recipe was removed. Saving here will not create a duplicate.",
        );
      remote = await request(
        `/api/recipes/${encodeURIComponent(candidate.slug)}`,
      );
    }
    if (record.mealieRecipeId && remote.id !== record.mealieRecipeId)
      throw new InputError(
        "The Mealie recipe link has changed. No recipe was overwritten.",
      );
  } else if (record.mealieExportedAt || record.mealiePendingCreate) {
    const baseline =
        record.mealieLegacyRecipe ??
        record.mealiePendingCreate?.recipe ??
        record.recipe,
      expected = schemaRecipe(baseline),
      matches = await search(baseline.name),
      found = [];
    for (const candidate of matches) {
      const full = await request(
        `/api/recipes/${encodeURIComponent(candidate.slug)}`,
      );
      if (
        JSON.stringify(ingredientText(full)) ===
        JSON.stringify(
          expected.recipeIngredient.map((s) => s.trim().toLowerCase()),
        )
      )
        found.push(full);
    }
    if (found.length !== 1)
      throw new InputError(
        "Could not uniquely identify the existing Mealie copy. No duplicate was created. Check the recipe in Mealie before retrying.",
      );
    remote = found[0];
    link(remote);
    await persist(record);
  } else {
    if ((await search(record.recipe.name)).length)
      throw new InputError(
        "This name already exists in Mealie. Open the linked calculator recipe, or give this new recipe a different name.",
      );
    record.mealiePendingCreate = {
      recipe: record.recipe,
      at: new Date().toISOString(),
    };
    await persist(record);
    const created = await request("/api/recipes/create/html-or-json", "POST", {
      data: JSON.stringify(schemaRecipe(record.recipe)),
    });
    const slug = typeof created === "string" ? created : created?.slug;
    if (typeof slug !== "string" || !slug || slug.length > 300)
      throw Error(
        "Mealie did not return a recipe link. Check Mealie before retrying.",
      );
    record.mealieSlug = slug;
    await persist(record);
    remote = await request(`/api/recipes/${encodeURIComponent(slug)}`);
    link(remote);
    await persist(record);
  }
  link(remote);
  if (record.mealieHash === hash) {
    await persist(record);
    return { ok: true, changed: false };
  }
  if (
    remote.name !== record.recipe.name &&
    (await search(record.recipe.name)).some((r) => r.id !== remote.id)
  )
    throw new InputError(
      "Another Mealie recipe already uses this name. Choose a different name.",
    );
  const schema = schemaRecipe(record.recipe),
    c = calculate(record.recipe);
  const patch = {
    name: record.recipe.name,
    description: schema.description,
    recipeServings: record.recipe.portions,
    recipeYieldQuantity: record.recipe.portions,
    recipeYield: `pieces of ${Number(c.portion.toFixed(1))} g dough before baking`,
    recipeIngredient: schema.recipeIngredient.map((note) => ({
      note,
      quantity: 0,
      referenceId: randomUUID(),
    })),
    recipeInstructions: schema.recipeInstructions.map((s) => ({
      id: randomUUID(),
      title: s.name ?? "",
      summary: s.name ?? "",
      text: s.text,
    })),
    extras: {
      ...(remote.extras ?? {}),
      breadCalculator: { recipeId: record.id, formula: record.recipe },
    },
  };
  await request(
    `/api/recipes/${encodeURIComponent(remote.slug)}`,
    "PATCH",
    patch,
  );
  // Re-read after the patch to retain Mealie's actual slug if its name changed.
  let updated;
  try {
    updated = await request(`/api/recipes/${encodeURIComponent(remote.slug)}`);
  } catch (e) {
    if (e.upstreamStatus !== 404) throw e;
    const matches = await search(record.recipe.name),
      candidate = matches.find((r) => r.id === record.mealieRecipeId);
    if (!candidate) throw e;
    updated = await request(
      `/api/recipes/${encodeURIComponent(candidate.slug)}`,
    );
  }
  link(updated);
  record.mealieHash = hash;
  record.mealieExportedAt = new Date().toISOString();
  delete record.mealiePendingCreate;
  delete record.mealieLegacyRecipe;
  await persist(record);
  return { ok: true, changed: true };
}
