import {
  defaults,
  ingredients,
  calculate,
  validate,
  scale,
  fromQuery,
  toQuery,
  schemaRecipe,
} from "./math.mjs";
import { methodSnapshot, duration } from "./methods-model.mjs";
import {
  $,
  api,
  post,
  notice,
  download,
  methodPreview,
  same,
  guard,
  guardUnload,
} from "./ui.mjs";
const fmt = (n) =>
    Number(n.toFixed(1)).toLocaleString("en-GB", { maximumFractionDigits: 1 }),
  g = (n) => `${fmt(n)} g`;
let recipe = defaults(),
  savedId = null,
  records = [],
  methods = [],
  valid = true,
  dirty = false,
  ready = false,
  busy = false,
  mealie = false;
const initialQuery = new URLSearchParams(location.search),
  requestedId = initialQuery.get("recipeId"),
  formulaLink = [...initialQuery.keys()].some(
    (k) => !["recipeId", "draft"].includes(k),
  );
let restoredDraft = null;
try {
  const value = JSON.parse(sessionStorage.getItem("bread-draft") ?? "null");
  if (value?.recipe)
    restoredDraft = { ...value, recipe: validate(value.recipe) };
} catch {}
let draftBaseline = structuredClone(recipe);
const current = () => records.find((r) => r.id === savedId);
function status(text, error = false) {
  notice(text, error);
}
try {
  recipe = location.search ? fromQuery(location.search) : defaults();
} catch (e) {
  status(`Could not load the recipe link: ${e.message}`, true);
}
draftBaseline = structuredClone(recipe);
function savedState() {
  const record = current();
  dirty = !!savedId
    ? !same(validateSafe(recipe), validateSafe(record?.recipe)) ||
      (mealie &&
        (record?.mealieEnabled ?? !!record?.mealieExportedAt) !==
          $("saveMealie").checked)
    : !same(recipe, draftBaseline);
  $("saveState").textContent = !savedId
    ? "Not saved"
    : dirty
      ? "Unsaved changes"
      : "Saved";
  $("saveState").dataset.dirty = String(dirty);
  $("save").disabled = !ready || !valid || busy;
  $("save").textContent = busy
    ? "Saving…"
    : savedId
      ? "Save changes"
      : "Save recipe";
  $("saveMealie").disabled = !mealie || busy;
  $("saved").disabled = !ready || busy;
  $("reset").disabled = busy;
  $("duplicate").disabled = busy;
  $("logBake").href = savedId
    ? `/bakes?recipeId=${encodeURIComponent(savedId)}`
    : "/bakes";
  if (mealie)
    $("mealieHint").textContent =
      record?.mealieSlug || record?.mealieExportedAt
        ? "Linked to Mealie. Saving updates its ingredients and method."
        : "First save creates one linked Mealie recipe. Later saves update it.";
}
function validateSafe(value) {
  try {
    return validate(value);
  } catch {
    return value;
  }
}
for (const [key, label] of Object.entries(ingredients)) {
  const row = document.createElement("div");
  row.className = "ingredient";
  const lab = document.createElement("label");
  lab.htmlFor = key;
  lab.textContent = key === "leaven" ? "Starter / leaven" : label;
  row.append(lab);
  for (const [suffix, unit] of [
    ["", "%"],
    ["Grams", "g"],
  ]) {
    const wrap = document.createElement("div");
    wrap.className = "unit-input";
    const input = document.createElement("input");
    Object.assign(input, {
      id: key + suffix,
      type: "number",
      min: "0",
      step: "any",
      inputMode: "decimal",
    });
    input.setAttribute(
      "aria-label",
      `${label} ${suffix ? "grams" : "percent"}`,
    );
    const symbol = document.createElement("span");
    symbol.textContent = unit;
    symbol.setAttribute("aria-hidden", "true");
    wrap.append(input, symbol);
    row.append(wrap);
  }
  $(
    ["water", "salt", "leaven"].includes(key) ? "ingredients" : "extras",
  ).append(row);
  $(`${key}Grams`).addEventListener("input", () => {
    recipe[key] = (100 * $(`${key}Grams`).valueAsNumber) / recipe.flour;
    $(key).value = Number.isFinite(recipe[key]) ? recipe[key] : "";
    status("");
    render(`${key}Grams`);
  });
}
function methodOptions(select, selected) {
  select.replaceChildren(new Option("No method — ingredients only", ""));
  for (const r of methods) select.add(new Option(r.method.name, r.id));
  if (selected) {
    const latest = methods.find((r) => r.id === selected.id);
    if (latest && same(methodSnapshot(latest), selected))
      select.value = selected.id;
    else {
      select.add(
        new Option(`${selected.name} (recipe’s saved version)`, "snapshot"),
      );
      select.value = "snapshot";
    }
  }
}

function showMethod() {
  methodOptions($("methodSelect"), recipe.method);
  methodPreview($("methodPreview"), recipe.method);
  $("methodInfo").textContent = recipe.method
    ? `${recipe.method.steps.length} steps · ${duration(recipe.method.steps.reduce((n, s) => n + s.restMinutes, 0))} planned rest. This recipe keeps the selected method version.`
    : "No steps selected. Choose a method or create one on the Methods page.";
}
function fill() {
  for (const key of Object.keys(defaults()))
    if ($(key)) $(key).value = recipe[key];
  showMethod();
  $("extraDetails").open = Object.keys(ingredients).some(
    (k) => !["water", "salt", "leaven"].includes(k) && recipe[k] > 0,
  );
  render();
}
function render(active) {
  try {
    const c = calculate(recipe);
    valid = true;
    $("validation").hidden = true;
    for (const [k, v] of Object.entries(c.grams)) {
      if (active !== `${k}Grams`) $(`${k}Grams`).value = Number(v.toFixed(3));
      $(k).closest(".ingredient").dataset.used = String(v > 0);
    }
    $("printNotes").textContent = recipe.notes;
    for (const k of [
      "hydration",
      "prefermented",
      "saltTotal",
      "liquidHydration",
    ])
      $(k).textContent = fmt(c[k]) + (k === "hydration" ? "" : "%");
    for (const k of ["dough", "totalFlour", "totalWater", "portion"])
      $(k).textContent = g(c[k]) + (k === "portion" ? " each" : "");
    $("mobileHydration").textContent = fmt(c.hydration) + "%";
    $("mobileDough").textContent = g(c.dough);
    $("starterSplit").textContent =
      `Starter: ${g(c.starterFlour)} flour + ${g(c.starterWater)} water.`;
    $("blend").textContent =
      `Added flour: ${g((recipe.flour * (100 - recipe.wholeWheat - recipe.rye)) / 100)} white · ${g((recipe.flour * recipe.wholeWheat) / 100)} whole wheat · ${g((recipe.flour * recipe.rye) / 100)} rye.`;
    $("liquidRow").hidden = !recipe.milk;
    const count = Object.keys(ingredients).filter(
      (k) => !["water", "salt", "leaven"].includes(k) && recipe[k] > 0,
    ).length;
    $("extraCount").textContent = count ? `(${count} used)` : "";
    const query = savedId
      ? new URLSearchParams({ recipeId: savedId })
      : new URLSearchParams({ draft: "1" });
    history.replaceState(null, "", `?${query}`);
  } catch (e) {
    valid = false;
    $("validation").hidden = false;
    $("validation").textContent = e.message;
    for (const k of [
      "hydration",
      "dough",
      "totalFlour",
      "totalWater",
      "portion",
      "prefermented",
      "saltTotal",
      "liquidHydration",
      "mobileHydration",
      "mobileDough",
    ])
      $(k).textContent = "—";
    $("starterSplit").textContent = "";
    $("blend").textContent = "";
  }
  savedState();
  if (ready && valid)
    try {
      sessionStorage.setItem(
        "bread-draft",
        JSON.stringify({
          recipe,
          savedId,
          dirty,
          baseline: draftBaseline,
          mealieEnabled: $("saveMealie").checked,
        }),
      );
    } catch {}
}
for (const key of Object.keys(defaults()))
  if ($(key))
    $(key).addEventListener("input", () => {
      recipe[key] =
        typeof defaults()[key] === "number"
          ? $(key).valueAsNumber
          : $(key).value;
      status("");
      render(key);
    });
$("saveMealie").addEventListener("change", () => render());
async function refresh() {
  records = await api("/api/recipes");
  $("saved").replaceChildren(new Option("Choose a saved recipe…", ""));
  records
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .forEach((r) => $("saved").add(new Option(r.recipe.name, r.id)));
  $("saved").value = savedId ?? "";
}
async function refreshMethods() {
  methods = await api("/api/methods");
  methods.sort((a, b) => a.method.name.localeCompare(b.method.name));
  showMethod();
}
function chooseMethodForMealie() {
  methodOptions($("exportMethod"), recipe.method);
  methodPreview($("exportPreview"), recipe.method);
  $("methodDialog").returnValue = "cancel";
  $("methodDialog").showModal();
  return new Promise((resolve) => {
    $("methodDialog").addEventListener(
      "close",
      () => {
        if ($("methodDialog").returnValue !== "save") return resolve(false);
        const selected = methods.find((r) => r.id === $("exportMethod").value);
        if (selected) recipe.method = methodSnapshot(selected);
        else if (!$("exportMethod").value) recipe.method = null;
        showMethod();
        resolve(true);
      },
      { once: true },
    );
  });
}
$("exportMethod").addEventListener("change", () => {
  const selected = methods.find((r) => r.id === $("exportMethod").value);
  methodPreview(
    $("exportPreview"),
    selected
      ? methodSnapshot(selected)
      : $("exportMethod").value
        ? recipe.method
        : null,
  );
});
async function save() {
  validate(recipe);
  const includeMealie = mealie && $("saveMealie").checked;
  if (includeMealie) {
    await refreshMethods();
    if (!(await chooseMethodForMealie())) return;
  }
  const snapshot = validate(recipe);
  busy = true;
  savedState();
  let localSaved = false;
  try {
    const record = await post("/api/recipes", {
      id: savedId ?? undefined,
      recipe: snapshot,
      mealieEnabled: includeMealie,
    });
    savedId = record.id;
    localSaved = true;
    if (includeMealie) await post("/api/mealie", { id: savedId });
    await refresh();
    render();
    status(
      dirty
        ? "Saved the previous values. Your latest edits are not saved yet."
        : includeMealie
          ? "Saved here and in Mealie."
          : "Saved in this calculator.",
    );
  } catch (e) {
    await refresh().catch(() => {});
    status(
      `${localSaved ? "Saved here. Mealie could not be updated: " : ""}${e.message}`,
      true,
    );
  } finally {
    busy = false;
    render();
  }
}
function action(id, fn) {
  $(id).addEventListener("click", async () => {
    try {
      await fn();
    } catch (e) {
      status(e.message, true);
    }
  });
}
action("save", save);
action("reset", () => {
  if (!guard(dirty)) return;
  recipe = { ...defaults(), name: "New bread recipe" };
  draftBaseline = structuredClone(recipe);
  savedId = null;
  $("saveMealie").checked = mealie;
  fill();
  $("saved").value = "";
  status("New recipe.");
});
action("duplicate", () => {
  validate(recipe);
  recipe = validate({ ...recipe, name: `${recipe.name.slice(0, 110)} (copy)` });
  draftBaseline = null;
  savedId = null;
  $("saveMealie").checked = mealie;
  fill();
  $("saved").value = "";
  status("New copy. Change its name or quantities, then save.");
  $("name").focus();
});
$("saved").addEventListener("change", () => {
  const id = $("saved").value,
    r = records.find((r) => r.id === id);
  if (!r) {
    $("saved").value = savedId ?? "";
    return;
  }
  if (!guard(dirty)) {
    $("saved").value = savedId ?? "";
    return;
  }
  recipe = validate(r.recipe);
  savedId = id;
  $("saveMealie").checked = r.mealieEnabled ?? !!r.mealieExportedAt;
  fill();
  status("Recipe opened.");
});
$("methodSelect").addEventListener("change", () => {
  const r = methods.find((r) => r.id === $("methodSelect").value);
  recipe.method = r
    ? methodSnapshot(r)
    : $("methodSelect").value === "snapshot"
      ? recipe.method
      : null;
  showMethod();
  render();
});
action("scale", () => {
  recipe = scale(recipe, $("target").valueAsNumber);
  fill();
  status("Batch scaled. Save to keep the new quantities.");
});
action("setHydration", () => {
  const c = calculate(recipe),
    t = $("targetHydration").valueAsNumber,
    w = (((t * c.totalFlour) / 100 - c.starterWater) / recipe.flour) * 100;
  if (!Number.isFinite(t) || t < 0 || w < 0)
    throw Error("That target is below the water already in your starter.");
  recipe = validate({ ...recipe, water: w });
  fill();
  status("Water adjusted. Save to keep the change.");
});
for (const [id, delta] of [
  ["less", -250],
  ["more", 250],
])
  action(id, () => {
    recipe = validate({
      ...recipe,
      flour: Math.max(0.1, recipe.flour + delta),
    });
    fill();
  });
action("share", async () => {
  validate(recipe);
  const link =
    savedId && !dirty
      ? `${location.origin}/?recipeId=${savedId}`
      : `${location.origin}/?${toQuery(recipe)}`;
  if (link.length > 6000)
    throw Error(
      "This draft is too long for a link. Save it first or download its recipe file.",
    );
  await navigator.clipboard.writeText(link);
  status("Recipe link copied.");
});
action("export", () => {
  download("bread-recipe.json", {
    breadBench: validate(recipe),
    ...schemaRecipe(recipe),
  });
  status("Recipe downloaded.");
});
action("archive", async () => {
  download("bread-backup.json", await api("/api/archive"));
  status("Recipes, methods and bake logs downloaded.");
});
action("print", () => window.print());
$("import").addEventListener("change", async () => {
  try {
    const file = $("import").files[0];
    if (!file) return;
    if (file.size > 524288) throw Error("File is too large (maximum 512 KB).");
    const json = JSON.parse(await file.text());
    if (!json?.breadBench && !Object.hasOwn(json ?? {}, "flour"))
      throw Error("Choose a recipe file downloaded from this calculator.");
    const next = validate(json.breadBench ?? json);
    if (!guard(dirty)) return;
    recipe = next;
    draftBaseline = null;
    savedId = null;
    fill();
    status("Recipe imported. Save to keep it.");
  } catch (e) {
    status(e.message, true);
  } finally {
    $("import").value = "";
  }
});
guardUnload(() => ready && dirty);
fill();
Promise.all([refresh(), refreshMethods(), api("/api/config")])
  .then(([, , c]) => {
    mealie = c.mealie;
    ready = true;
    const explicit = records.find((r) => r.id === requestedId),
      matches = records.filter((r) => same(validateSafe(r.recipe), recipe)),
      record = explicit ?? (matches.length === 1 ? matches[0] : null);
    if (record) {
      savedId = record.id;
      if (!formulaLink) recipe = validate(record.recipe);
      $("saved").value = savedId;
      $("saveMealie").checked =
        record.mealieEnabled ?? !!record.mealieExportedAt;
    } else $("saveMealie").checked = mealie;
    if (
      !formulaLink &&
      restoredDraft &&
      ((!requestedId &&
        (initialQuery.has("draft") ||
          !initialQuery.size ||
          restoredDraft.dirty)) ||
        (restoredDraft.savedId === requestedId && restoredDraft.dirty))
    ) {
      const saved = records.find((r) => r.id === restoredDraft.savedId);
      savedId = saved?.id ?? null;
      recipe =
        saved && !restoredDraft.dirty
          ? validate(saved.recipe)
          : restoredDraft.recipe;
      draftBaseline = restoredDraft.baseline ?? null;
      $("saveMealie").checked = restoredDraft.mealieEnabled ?? mealie;
      if (restoredDraft.dirty)
        status(
          "Unsaved draft restored in this tab. Save to keep it on the server.",
        );
    }
    fill();
    $("saved").value = savedId ?? "";
    if (!mealie)
      $("mealieHint").textContent =
        "Mealie is unavailable. You can still save and edit recipes here.";
    render();
  })
  .catch((e) => {
    ready = false;
    status(`Could not load saved recipes or methods: ${e.message}`, true);
    savedState();
  });
window.addEventListener("focus", () => {
  if (ready && !busy) refreshMethods().catch(() => {});
});

let printDetails = [];
window.addEventListener("beforeprint", () => {
  printDetails = [...document.querySelectorAll(".recipe details")].map((d) => [
    d,
    d.open,
  ]);
  for (const [d] of printDetails) d.open = true;
});
window.addEventListener("afterprint", () => {
  for (const [d, open] of printDetails) d.open = open;
});
