import { validate, calculate, schemaRecipe } from "./math.mjs";
import { validateBake, compareMethods } from "./bakes-model.mjs";
import { methodSnapshot, methodKey, duration } from "./methods-model.mjs";
import {
  $,
  api,
  post,
  notice,
  download,
  same,
  guard,
  guardUnload,
  today,
  dateLabel,
  methodPreview,
} from "./ui.mjs";
let records = [],
  recipes = [],
  methods = [],
  selectedRecipe = null,
  selectedMethod = null,
  savedId = null,
  baseline = null,
  dirty = false,
  busy = false;
const numbers = [
  "roomTempC",
  "doughTempC",
  "bulkMinutes",
  "proofMinutes",
  "rating",
  "bakedWeightG",
  "spring",
  "sourness",
];
const fmt = (n) =>
  n === null ? "—" : Number(n.toFixed(1)).toLocaleString("en-GB");
function formValue() {
  return {
    date: $("bakeDate").value,
    recipe: selectedRecipe
      ? { ...selectedRecipe, method: selectedMethod }
      : null,
    ...Object.fromEntries(
      numbers.map((k) => [k, $(k).value === "" ? null : Number($(k).value)]),
    ),
    observations: $("observations").value,
    nextTime: $("nextTime").value,
  };
}
function update() {
  $("bakeSnapshot").replaceChildren();
  if (selectedRecipe) {
    const heading = document.createElement("h3");
    heading.textContent = "Weighed ingredients";
    const list = document.createElement("ul");
    for (const text of schemaRecipe(selectedRecipe).recipeIngredient) {
      const li = document.createElement("li");
      li.textContent = text;
      list.append(li);
    }
    const preview = document.createElement("div");
    methodPreview(preview, selectedMethod);
    $("bakeSnapshot").append(heading, list, preview);
  }

  dirty = baseline !== null && !same(formValue(), baseline);
  $("bakeState").textContent = dirty
    ? "Unsaved changes"
    : savedId
      ? "Saved"
      : "";
  $("saveBake").disabled = busy || !selectedRecipe;
  $("saveBake").textContent = busy
    ? "Saving…"
    : savedId
      ? "Save changes"
      : "Save bake result";
  $("bakeRecipe").disabled = busy;
  $("newBake").disabled = busy;
  if (selectedRecipe) {
    const c = calculate(selectedRecipe);
    $("bakeFormula").textContent =
      `${selectedRecipe.name} · ${fmt(c.hydration)}% hydration · ${fmt(c.dough)} g dough · ${selectedRecipe.portions} pieces. The formula is kept with this entry.`;
  } else
    $("bakeFormula").textContent =
      "Choose a saved recipe. Its quantities and method will be kept with this entry.";
}
function methodOptions() {
  const s = $("bakeMethod");
  s.replaceChildren(new Option("No method recorded", ""));
  for (const m of methods) s.add(new Option(m.method.name, m.id));
  if (selectedMethod) {
    const latest = methods.find((m) => m.id === selectedMethod.id);
    if (latest && same(methodSnapshot(latest), selectedMethod))
      s.value = selectedMethod.id;
    else {
      s.add(
        new Option(`${selectedMethod.name} (this bake’s version)`, "snapshot"),
      );
      s.value = "snapshot";
    }
  }
}
function clear() {
  $("bakeRecipe").querySelector('option[value="snapshot"]')?.remove();
  savedId = null;
  selectedRecipe = null;
  selectedMethod = null;
  $("bakeDate").value = today();
  for (const k of [...numbers, "observations", "nextTime"]) $(k).value = "";
  $("bakeRecipe").value = "";
  $("bakeHeading").textContent = "Record a bake";
  methodOptions();
  baseline = formValue();
  update();
  notice("");
}
function open(record) {
  if (!guard(dirty)) return;
  const b = validateBake(record.bake);
  savedId = record.id;
  selectedRecipe = b.recipe;
  selectedMethod = b.recipe.method;
  const old = $("bakeRecipe").querySelector('option[value="snapshot"]');
  old?.remove();
  $("bakeRecipe").add(
    new Option(`${b.recipe.name} (recorded formula)`, "snapshot"),
  );
  $("bakeRecipe").value = "snapshot";
  $("bakeDate").value = b.date;
  for (const k of [...numbers, "observations", "nextTime"])
    $(k).value = b[k] ?? "";
  methodOptions();
  baseline = formValue();
  $("bakeHeading").textContent = "Edit bake result";
  update();
  notice("Recorded formula loaded. Later recipe edits have not changed it.");
  $("bakeForm").scrollIntoView({ behavior: "smooth" });
}
function filtered() {
  const recipe = $("filterRecipe").value,
    key = $("filterMethod").value;
  return records.filter(
    (r) =>
      (!recipe || r.bake.recipe.name === recipe) &&
      (!key || methodKey(r.bake.recipe.method) === key),
  );
}
function cell(row, text) {
  const td = document.createElement("td");
  td.textContent = text;
  row.append(td);
  return td;
}
function versionName(m) {
  return m
    ? `${m.name}${m.savedAt ? ` · ${new Date(m.savedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}`
    : "No method";
}
function renderLog() {
  const rows = filtered();
  $("logRows").replaceChildren();
  for (const r of rows) {
    const b = r.bake,
      c = calculate(b.recipe),
      tr = document.createElement("tr");
    cell(tr, dateLabel(b.date + "T12:00:00"));
    cell(tr, b.recipe.name);
    cell(tr, versionName(b.recipe.method));
    cell(tr, fmt(c.hydration) + "%");
    cell(tr, b.rating === null ? "Not rated" : `${b.rating} / 5`);
    const td = cell(tr, ""),
      button = document.createElement("button");
    button.textContent = "Open";
    button.setAttribute(
      "aria-label",
      `Open ${b.recipe.name} bake from ${b.date}`,
    );
    button.addEventListener("click", () => open(r));
    td.append(button);
    $("logRows").append(tr);
  }
  $("emptyLog").hidden = rows.length > 0;
  const rated = rows.filter((r) => r.bake.rating !== null),
    average = rated.length
      ? rated.reduce((n, r) => n + r.bake.rating, 0) / rated.length
      : null;
  $("logSummary").textContent =
    `${rows.length} bake${rows.length === 1 ? "" : "s"}${average !== null ? ` · average result ${fmt(average)} / 5 across ${rated.length} rated` : ""}`;
  $("comparisonRows").replaceChildren();
  for (const g of compareMethods(rows)) {
    const tr = document.createElement("tr");
    for (const text of [
      versionName(g.method),
      String(g.count),
      g.rating === null
        ? "Not rated"
        : `${fmt(g.rating)} / 5 (${g.ratedCount} rated)`,
      `${fmt(g.minHydration)}–${fmt(g.maxHydration)}%`,
      g.doughTempC === null ? "—" : `${fmt(g.doughTempC)} °C`,
      g.bulkMinutes === null ? "—" : duration(g.bulkMinutes),
    ])
      cell(tr, text);
    $("comparisonRows").append(tr);
  }
}
async function refreshLogs() {
  records = (await api("/api/bakes"))
    .map((r) => ({ ...r, bake: validateBake(r.bake) }))
    .sort(
      (a, b) =>
        b.bake.date.localeCompare(a.bake.date) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const oldRecipe = $("filterRecipe").value,
    oldMethod = $("filterMethod").value;
  $("filterRecipe").replaceChildren(new Option("All recipes", ""));
  [...new Set(records.map((r) => r.bake.recipe.name))]
    .sort()
    .forEach((n) => $("filterRecipe").add(new Option(n, n)));
  $("filterRecipe").value = oldRecipe;
  $("filterMethod").replaceChildren(new Option("All methods", ""));
  const seen = new Set();
  for (const { bake } of records) {
    const key = methodKey(bake.recipe.method);
    if (!seen.has(key)) {
      $("filterMethod").add(new Option(versionName(bake.recipe.method), key));
      seen.add(key);
    }
  }
  $("filterMethod").value = oldMethod;
  renderLog();
}
for (const k of [...numbers, "observations", "nextTime", "bakeDate"])
  $(k).addEventListener("input", () => {
    notice("");
    update();
  });
$("bakeRecipe").addEventListener("change", () => {
  const r = recipes.find((r) => r.id === $("bakeRecipe").value);
  if (!$("bakeRecipe").value) {
    selectedRecipe = null;
    selectedMethod = null;
    methodOptions();
    update();
  }
  if (r) {
    selectedRecipe = validate(r.recipe);
    selectedMethod = selectedRecipe.method;
    methodOptions();
    update();
  }
});
$("bakeMethod").addEventListener("change", () => {
  const r = methods.find((r) => r.id === $("bakeMethod").value);
  selectedMethod = r
    ? methodSnapshot(r)
    : $("bakeMethod").value === "snapshot"
      ? selectedMethod
      : null;
  update();
});
$("newBake").addEventListener("click", () => {
  if (guard(dirty)) clear();
});
$("saveBake").addEventListener("click", async () => {
  try {
    const bake = validateBake(formValue());
    busy = true;
    update();
    const r = await post("/api/bakes", { id: savedId ?? undefined, bake });
    savedId = r.id;
    baseline = bake;
    await refreshLogs();
    notice("Bake result saved. Its recipe and method version are retained.");
  } catch (e) {
    notice(e.message, true);
  } finally {
    busy = false;
    update();
  }
});
for (const id of ["filterRecipe", "filterMethod"])
  $(id).addEventListener("change", renderLog);
function csvCell(v) {
  if (v === null || v === undefined) return '""';
  const text =
    typeof v === "number"
      ? String(v)
      : String(v).replace(/^[=+\-@\t\r]/, "'$&");
  return '"' + text.replaceAll('"', '""') + '"';
}
$("csv").addEventListener("click", () => {
  const headings = [
    "Date",
    "Recipe",
    "Method",
    "Method version",
    "Hydration (%)",
    "Dough (g)",
    "Room (C)",
    "Dough (C)",
    "Bulk (min)",
    "Proof (min)",
    "Result (1-5)",
    "Spring (1-5)",
    "Sourness (1-5)",
    "Baked batch (g)",
    "Observations",
    "Next time",
    "Method steps JSON",
  ];
  const data = filtered().map(({ bake: b }) => {
    const c = calculate(b.recipe);
    return [
      b.date,
      b.recipe.name,
      b.recipe.method?.name,
      b.recipe.method?.savedAt,
      c.hydration,
      c.dough,
      b.roomTempC,
      b.doughTempC,
      b.bulkMinutes,
      b.proofMinutes,
      b.rating,
      b.spring,
      b.sourness,
      b.bakedWeightG,
      b.observations,
      b.nextTime,
      JSON.stringify(b.recipe.method?.steps ?? []),
    ];
  });
  download(
    "bread-bakes.csv",
    [headings, ...data].map((row) => row.map(csvCell).join(",")).join("\r\n"),
    "text/csv;charset=utf-8",
  );
});
$("backup").addEventListener("click", async () => {
  try {
    download("bread-backup.json", await api("/api/archive"));
  } catch (e) {
    notice(e.message, true);
  }
});
guardUnload(() => dirty);
clear();
Promise.all([api("/api/recipes"), api("/api/methods"), refreshLogs()])
  .then(([r, m]) => {
    recipes = r;
    methods = m;
    for (const record of recipes)
      $("bakeRecipe").add(new Option(record.recipe.name, record.id));
    const requested = new URLSearchParams(location.search).get("recipeId"),
      selected = recipes.find((r) => r.id === requested);
    if (selected) {
      selectedRecipe = validate(selected.recipe);
      selectedMethod = selectedRecipe.method;
      $("bakeRecipe").value = selected.id;
      methodOptions();
    }
    baseline = formValue();
    update();
  })
  .catch((e) => notice(e.message, true));
