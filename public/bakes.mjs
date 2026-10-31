import { draftRecovery, readDraft } from "./drafts.mjs";
import { bakeSessionKey, validateBakeSession } from "./bake-mode-model.mjs";
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
  "bulkRisePercent",
  "fridgeTempC",
  "ambientProofMinutes",
  "coldProofMinutes",
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
const recovery = draftRecovery({
  key: "bread-bake-draft", element: $("draftRecovery"), isDirty: () => dirty,
  capture: () => ({ form: formValue(), baseline, savedId, dirty }),
  restore(value) {
    const b = value.form;
    if (!b || typeof b.observations !== "string" || typeof b.nextTime !== "string") throw Error("Invalid draft");
    const snapshot = b.recipe ? validate(b.recipe) : null;
    if (!Array.isArray(b.stepResults) || !Array.isArray(b.ovenStages) || b.ovenStages.length > 12 ||
        b.stepResults.length > (snapshot?.method?.steps.length ?? 0) ||
        [...b.stepResults, ...b.ovenStages].some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw Error("Invalid draft");
    selectedRecipe = snapshot; selectedMethod = snapshot?.method ?? null;
    savedId = records.some((r) => r.id === value.savedId) ? value.savedId : null;
    $("bakeRecipe").querySelector('option[value="snapshot"]')?.remove();
    if (snapshot) {
      $("bakeRecipe").add(new Option(`${snapshot.name} (draft formula)`, "snapshot"));
      $("bakeRecipe").value = "snapshot";
    } else $("bakeRecipe").value = "";
    $("bakeDate").value = b.date ?? "";
    for (const k of [...numbers, "observations", "nextTime"]) $(k).value = b[k] ?? "";
    methodOptions(); renderMeasurements(b);
    baseline = value.baseline ?? {};
    $("bakeHeading").textContent = savedId ? "Edit bake result" : "Record a bake";
    update(); notice("Bake draft restored. Save to keep it on the server.");
    $("observations").focus();
  },
});
function formValue() {
  return {
    date: $("bakeDate").value,
    recipe: selectedRecipe
      ? { ...selectedRecipe, method: selectedMethod }
      : null,
    ...Object.fromEntries(
      numbers.map((k) => [k, $(k).value === "" ? null : Number($(k).value)]),
    ),
    stepResults: readRows("stepResults"),
    ovenStages: readRows("ovenStages"),
    observations: $("observations").value,
    nextTime: $("nextTime").value,
  };
}
function update() {
  $("bakeRecipe").dataset.previous = $("bakeRecipe").value;
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

  $("proofMinutes").readOnly =
    $("ambientProofMinutes").value !== "" && $("coldProofMinutes").value !== "";
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
  $("quickSave").disabled = $("saveBake").disabled;
  $("quickSave").textContent = $("saveBake").textContent;
  $("quickSaveState").textContent = dirty ? "Unsaved changes" : savedId ? "Saved here" : "Not saved";
  recovery.track();
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
  renderMeasurements({});
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
  renderMeasurements(b);
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
  td.dataset.label =
    ["Date", "Recipe", "Method", "Hydration", "Result", ""][
      row.children.length
    ] ?? "";
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
    if (["ambientProofMinutes", "coldProofMinutes"].includes(k)) {
      const a = $("ambientProofMinutes").value,
        c = $("coldProofMinutes").value;
      if (a !== "" && c !== "") $("proofMinutes").value = Number(a) + Number(c);
    }
    update();
  });
$("bakeRecipe").addEventListener("change", () => {
  if (
    readRows("stepResults").some((row) =>
      Object.values(row).some((v) => v !== null && v !== ""),
    ) &&
    !confirm(
      "Changing the recipe clears this entry’s step observations. Continue?",
    )
  ) {
    $("bakeRecipe").value = $("bakeRecipe").dataset.previous;
    return;
  }
  const r = recipes.find((r) => r.id === $("bakeRecipe").value);
  if (!$("bakeRecipe").value) {
    selectedRecipe = null;
    selectedMethod = null;
    methodOptions();
    renderMeasurements();
    update();
  }
  if (r) {
    selectedRecipe = validate(r.recipe);
    selectedMethod = selectedRecipe.method;
    methodOptions();
    renderMeasurements();
    update();
  }
});
$("bakeMethod").addEventListener("change", () => {
  if (
    readRows("stepResults").some((row) =>
      Object.values(row).some((v) => v !== null && v !== ""),
    ) &&
    !confirm(
      "Changing the method clears this entry’s step observations. Continue?",
    )
  ) {
    methodOptions();
    return;
  }
  const r = methods.find((r) => r.id === $("bakeMethod").value);
  selectedMethod = r
    ? methodSnapshot(r)
    : $("bakeMethod").value === "snapshot"
      ? selectedMethod
      : null;
  renderMeasurements();
  update();
});
$("newBake").addEventListener("click", () => {
  if (guard(dirty)) clear();
});
$("saveBake").addEventListener("click", async () => {
  try {
    const submitted = formValue();
    const bake = validateBake(submitted);
    busy = true;
    update();
    const r = await post("/api/bakes", { id: savedId ?? undefined, bake });
    savedId = r.id;
    baseline = submitted;
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
    "Bulk rise (%)",
    "Fridge (C)",
    "Room proof (min)",
    "Cold proof (min)",
    "Actual steps JSON",
    "Oven stages JSON",
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
      b.bulkRisePercent,
      b.fridgeTempC,
      b.ambientProofMinutes,
      b.coldProofMinutes,
      JSON.stringify(b.stepResults),
      JSON.stringify(b.ovenStages),
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

function readRows(id) {
  return [...$(id).querySelectorAll(":scope > .step-card")].map((card) =>
    Object.fromEntries(
      [...card.querySelectorAll("[data-field]")].map((input) => [
        input.dataset.field,
        input.type === "number"
          ? input.value === ""
            ? null
            : Number(input.value)
          : input.value,
      ]),
    ),
  );
}
function measurementCard(parent, title, row = {}, oven = false) {
  const card = document.createElement("div");
  card.className = "step-card";
  const heading = document.createElement("h3");
  heading.textContent = title;
  card.append(heading);
  const grid = document.createElement("div");
  grid.className = "two";
  card.append(grid);
  for (const [key, text, min, max] of [
    [
      "minutes",
      oven ? "Time (min)" : "Actual step and rest (min)",
      0,
      oven ? 1440 : 10080,
    ],
    [
      "tempC",
      oven ? "Oven setting (°C)" : "Dough temperature (°C)",
      oven ? 0 : -30,
      oven ? 500 : 100,
    ],
    ...(!oven ? [["ph", "Measured pH", 0, 14]] : []),
  ]) {
    const label = document.createElement("label");
    label.textContent = text;
    const input = document.createElement("input");
    Object.assign(input, {
      type: "number",
      min,
      max,
      step: "any",
      value: row[key] ?? "",
    });
    input.dataset.field = key;
    label.append(input);
    grid.append(label);
  }
  if (oven) {
    const label = document.createElement("label");
    label.textContent = "Covered or steam";
    const select = document.createElement("select");
    select.dataset.field = "mode";
    for (const [v, t] of [
      ["", "Not recorded"],
      ["covered", "Covered"],
      ["steam", "Steam"],
      ["uncovered", "Uncovered"],
    ])
      select.add(new Option(t, v));
    select.value = row.mode ?? "";
    label.append(select);
    grid.append(label);
  }
  const label = document.createElement("label");
  label.textContent = "Stage notes";
  const notes = document.createElement("textarea");
  notes.rows = 2;
  notes.maxLength = 1000;
  notes.dataset.field = "notes";
  notes.value = row.notes ?? "";
  label.append(notes);
  card.append(label);
  if (oven) {
    const button = document.createElement("button");
    button.textContent = "Remove stage";
    button.addEventListener("click", () => {
      card.remove();
      update();
    });
    card.append(button);
  }
  card.addEventListener("input", update);
  parent.append(card);
}
function renderMeasurements(b = { ovenStages: readRows("ovenStages") }) {
  $("stepResults").replaceChildren();
  $("ovenStages").replaceChildren();
  const steps = selectedMethod?.steps ?? [];
  steps.forEach((s, i) =>
    measurementCard(
      $("stepResults"),
      `${i + 1}. ${s.title} · planned rest: ${duration(s.restMinutes)}`,
      b.stepResults?.[i],
    ),
  );
  if (!steps.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Choose a method to record its steps.";
    $("stepResults").append(p);
  }
  (b.ovenStages ?? []).forEach((row, i) =>
    measurementCard($("ovenStages"), "Oven stage", row, true),
  );
}
$("addOvenStage").addEventListener("click", () => {
  if ($("ovenStages").children.length >= 12)
    return notice("Use at most 12 oven stages.", true);
  measurementCard($("ovenStages"), "Oven stage", {}, true);
  update();
});

$("quickSave").addEventListener("click", () => $("saveBake").click());
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
      renderMeasurements();
    }
    const query = new URLSearchParams(location.search);
    if (query.get("fromBake") === "1") {
      const stored = readDraft(bakeSessionKey(requested));
      try {
        const session = validateBakeSession(stored);
        if (session.recipeId !== requested) throw Error("Wrong snapshot");
        selectedRecipe = session.recipe; selectedMethod = session.recipe.method;
        $("bakeRecipe").add(new Option(`${session.recipe.name} (baking snapshot)`, "snapshot"));
        $("bakeRecipe").value = "snapshot";
        methodOptions(); renderMeasurements();
        notice("Baking snapshot loaded. Your original formula and method are retained.");
      } catch {
        selectedRecipe = null; selectedMethod = null; $("bakeRecipe").value = "";
        methodOptions(); renderMeasurements();
        notice("The baking snapshot is unavailable. Choose the recipe and method you actually used before saving.", true);
      }
    }
    baseline = formValue();
    update(); recovery.start();
  })
  .catch((e) => notice(e.message, true));
