import { createHash, randomUUID } from "node:crypto";
import { schemaRecipe, validate, calculate, weighedIngredients } from "./public/math.mjs";
import { InputError } from "./public/methods-model.mjs";
export class MealieError extends Error {}
// Export format changes must refresh previously synced recipes on their next save.
export const recipeHash = (recipe) =>
  createHash("sha256")
    .update(JSON.stringify({ format: 2, recipe: validate(recipe) }))
    .digest("hex");
const ingredientText = (r) =>
  (r.recipeIngredient ?? [])
    .map((i) => {
      if (typeof i === "string") return i;
      if (i.food || i.unit) {
        if (!i.food || !Number.isFinite(i.quantity) ||
            !["g", "gram", "grams"].includes(i.unit?.name?.toLowerCase())) return "";
        return `${Number(i.quantity.toFixed(1))} g ${i.food.name}${i.note ? ` ${i.note}` : ""}`;
      }
      return i.note || i.originalText || i.display || "";
    })
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
      const error = new MealieError(
        `Mealie returned HTTP ${response.status}. Your calculator copy is saved.`,
      );
      error.upstreamStatus = response.status;
      throw error;
    }
    return response.json();
  }
  async function libraryItem(kind, name, aliases = [name], create = { name }) {
    const names = aliases.map((s) => s.toLowerCase());
    async function find() {
      const matches = [];
      for (let page = 1; page <= 100; page++) {
        const q = new URLSearchParams({ search: name, perPage: "100", page: String(page) });
        const data = await request(`/api/${kind}?${q}`);
        matches.push(...(data.items ?? []).filter((item) =>
          names.includes(item.name?.trim().toLowerCase()),
        ));
        if (page * 100 >= (data.total ?? 0)) break;
        if (page === 100) throw new InputError("Too many Mealie ingredient matches. No ingredient was guessed.");
      }
      if (matches.length > 1)
        throw new InputError(`More than one matching ${kind === "units" ? "gram unit" : "food"} exists in Mealie. Resolve the duplicate before retrying.`);
      return matches[0];
    }
    let item = await find();
    if (!item) {
      try {
        item = await request(`/api/${kind}`, "POST", create);
      } catch (error) {
        // Another save may have created the same item after our lookup.
        if (![400, 409].includes(error.upstreamStatus)) throw error;
        item = await find();
        if (!item) throw error;
      }
    }
    if (!item.id || !names.includes(item.name?.trim().toLowerCase()))
      throw new MealieError("Mealie returned an invalid ingredient reference. Your calculator copy is saved.");
    // Only references: never echo defaults that could edit library metadata.
    return { id: item.id, name: item.name };
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
  // Resolve the existing organizer before any recipe write. Ben owns category creation.
  let breadCategory;
  try {
    breadCategory = await request("/api/organizers/categories/slug/bread");
  } catch (e) {
    if (e.upstreamStatus !== 404) throw e;
    throw new InputError(
      'Create the "Bread" category in Mealie before saving there. Your calculator copy is saved.',
    );
  }
  if (!breadCategory.id || breadCategory.slug !== "bread")
    throw new MealieError(
      "Mealie returned an invalid Bread category. Your calculator copy is saved.",
    );
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
  const categories = remote.recipeCategory ?? [],
    hasBreadCategory = categories.some((c) => c.id === breadCategory.id);
  if (record.mealieHash === hash && hasBreadCategory) {
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
  const unit = await libraryItem("units", "gram", ["gram", "grams", "g"], {
    name: "gram", pluralName: "grams", abbreviation: "g",
    pluralAbbreviation: "g", useAbbreviation: true, fraction: false,
  });
  const rows = weighedIngredients(record.recipe), recipeIngredient = [];
  for (const [index, row] of rows.entries()) {
    const food = await libraryItem("foods", row.name);
    recipeIngredient.push({
      quantity: row.grams, unit, food, note: row.note,
      originalText: schema.recipeIngredient[index], referenceId: randomUUID(),
    });
  }
  const patch = {
    name: record.recipe.name,
    // Organizer responses can contain groupId: null. PATCH would assign that
    // null to the existing category and violate Mealie's group foreign key.
    recipeCategory: (hasBreadCategory ? categories : [...categories, breadCategory])
      .map(({ id, name, slug }) => ({ id, name, slug })),
    description: schema.description,
    recipeServings: record.recipe.portions,
    recipeYieldQuantity: record.recipe.portions,
    recipeYield: `pieces of ${Number(c.portion.toFixed(1))} g dough before baking`,
    recipeIngredient,
    recipeInstructions: schema.recipeInstructions.map((s) => ({
      id: randomUUID(),
      title: s.name ?? "",
      summary: s.name ?? "",
      text: s.text,
      // Mealie 3.10 PATCH omits unset schema defaults before constructing steps.
      ingredientReferences: [],
    })),
    extras: {
      ...(remote.extras ?? {}),
      // Mealie 3.10 stores extras values in text columns despite an open API schema.
      breadCalculator: JSON.stringify({
        recipeId: record.id,
        formula: record.recipe,
      }),
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
