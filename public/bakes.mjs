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
  sessions = [],
  selectedRecipe = null,
  selectedMethod = null,
  savedId = null,
  baseline = null,
  dirty = false,
  busy = false,
  bakingSession = null,
  timingReviewRequired = false;
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
  capture: () => ({ form: formValue(), baseline, savedId, dirty, sessionId: bakingSession?.id ?? null,
    sessionRevision: bakingSession?.revision ?? null }),
  restore(value) {
    const b = value.form;
    if (!b || typeof b.observations !== "string" || typeof b.nextTime !== "string") throw Error("Invalid draft");
    const snapshot = b.recipe ? validate(b.recipe) : null;
    if ((b.stepTimings !== undefined && (!Array.isArray(b.stepTimings) ||
        b.stepTimings.length > (snapshot?.method?.steps.length ?? 0))) ||
        !Array.isArray(b.stepResults) || !Array.isArray(b.ovenStages) || b.ovenStages.length > 12 ||
        b.stepResults.length > (snapshot?.method?.steps.length ?? 0) ||
        [...b.stepResults, ...b.ovenStages].some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw Error("Invalid draft");
    const recoveredSession = value.sessionId ? sessions.find((r) => r.id === value.sessionId) : null;
    if (value.sessionId && (!recoveredSession || recoveredSession.resultId ||
        (value.savedId && value.savedId !== recoveredSession.id)))
      throw Error("The original baking session is unavailable or already completed.");
    if (recoveredSession && value.sessionRevision !== recoveredSession.revision) {
      notice("The in-progress bake changed after this result draft was made. Keep the current form to review its latest timeline; the old draft remains in this tab.", true);
      throw Error("The bake changed after this draft was made.");
    }
    bakingSession = recoveredSession;
    selectedRecipe = snapshot; selectedMethod = snapshot?.method ?? null;
    savedId = records.some((r) => r.id === value.savedId) ? value.savedId : null;
    timingReviewRequired = !!savedId && !!recoveredSession && !sameTimings(b.stepTimings, recoveredSession.session.stepTimings);
    $("keepResultTimes").checked = false;
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
    stepTimings: readStepTimings(),
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
  $("copyBakeNotesControls").hidden = !bakingSession || !!bakingSession.resultId ||
    !bakingSession.session.notes?.trim();
  $("copyBakeNotes").disabled = busy;
  const liveTimes = bakingSession?.session.stepTimings ?? [];
  $("liveTimingReview").hidden = !bakingSession || !!bakingSession.resultId || !timingReviewRequired;
  $("keepResultTimesLabel").hidden = !timingReviewRequired;
  $("copyLiveTimes").disabled = busy || !same(selectedMethod, bakingSession?.session.recipe.method);
  $("liveTimingSummary").textContent = (bakingSession?.session.recipe.method?.steps ?? []).map((step, index) => {
    const timing = liveTimes[index];
    return `${index + 1}. ${step.title}: ${timing?.startedAt ? `started ${new Date(timing.startedAt).toLocaleString("en-GB")}` : "start not recorded"}; ${timing?.completedAt ? `finished ${new Date(timing.completedAt).toLocaleString("en-GB")}` : "finish not recorded"}.`;
  }).join("\n");
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
  bakingSession = null;
  timingReviewRequired = false; $("keepResultTimes").checked = false;
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
  bakingSession = null;
  timingReviewRequired = false; $("keepResultTimes").checked = false;
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
async function refreshSessions() {
  const sessions = await api("/api/bake-sessions");
  const active = sessions.filter((r) => !r.resultId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $("sessionList").replaceChildren();
  for (const record of active) {
    const session = validateBakeSession(record.session);
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `/bake?sessionId=${encodeURIComponent(record.id)}`;
    link.textContent = `Resume ${session.recipe.name}`;
    const detail = document.createElement("span");
    const viewedStep = session.recipe.method?.steps[session.stepIndex];
    const lastSaved = new Date(record.updatedAt);
    const savedLabel = Number.isNaN(lastSaved.getTime()) ? "" : ` · last saved ${lastSaved.toLocaleString("en-GB")}`;
    const timing = session.stepTimings?.[session.stepIndex];
    const timingLabel = timing?.completedAt
      ? ` · action finished ${new Date(timing.completedAt).toLocaleString("en-GB")}`
      : timing?.startedAt ? ` · action started ${new Date(timing.startedAt).toLocaleString("en-GB")}` : "";
    detail.textContent = ` · captured ${new Date(session.capturedAt).toLocaleString("en-GB")}${savedLabel} · ${session.weighed.length} ingredients weighed · ${session.completedSteps.length} steps completed${viewedStep ? ` · selected step ${session.stepIndex + 1}: ${viewedStep.title}${timingLabel}` : ""}`;
    item.append(link, detail); $("sessionList").append(item);
  }
  $("sessionsStatus").textContent = active.length ? "" : "No bakes in progress.";
  return sessions;
}
function sameTimings(left = [], right = []) {
  const length = Math.max(left.length, right.length);
  return Array.from({ length }, (_, index) => index).every((index) =>
    same(left[index] ?? { startedAt: null, completedAt: null }, right[index] ?? { startedAt: null, completedAt: null }));
}
async function currentSessionForResult() {
  const sessions = await api("/api/bake-sessions");
  const latest = sessions.find((r) => r.id === bakingSession.id);
  if (!latest) throw Error("The in-progress bake could not be found. Reload to review before saving.");
  if (latest.resultId && latest.resultId !== savedId)
    throw Error("This bake is already linked to another result. Reload to review it.");
  if (!latest.resultId && latest.revision !== bakingSession.revision)
    throw Error("This bake changed after the result page opened. Reload to review the latest timeline before completing it.");
  return latest;
}
async function finishSession() {
  if (!bakingSession) return;
  const latest = await currentSessionForResult();
  if (!latest.resultId)
    await post("/api/bake-sessions", { id: latest.id, session: latest.session, revision: latest.revision, resultId: savedId });
  bakingSession = null;
  await refreshSessions();
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
$("copyLiveTimes").addEventListener("click", () => {
  if (!bakingSession || !same(selectedMethod, bakingSession.session.recipe.method)) return;
  if (!confirm("Replace the result’s action timestamps with the loaded live bake times? Other observations and measurements stay as entered.")) return;
  renderMeasurements({ stepResults: readRows("stepResults"), ovenStages: readRows("ovenStages"),
    stepTimings: structuredClone(bakingSession.session.stepTimings ?? []) });
  timingReviewRequired = false; $("keepResultTimes").checked = false;
  update(); notice("Loaded live bake times copied. Save the result to keep them and complete the bake.");
});
$("copyBakeNotes").addEventListener("click", () => {
  const notes = bakingSession?.session.notes;
  if (!notes?.trim() || bakingSession.resultId) return;
  if (notes.length > 4000) {
    notice("Bake notes exceed the 4,000-character limit for observations. Please shorten them before copying.", true);
    return;
  }
  if ($("observations").value && !confirm("Replace the existing observations with the loaded bake notes?")) return;
  $("observations").value = notes;
  update();
  notice("Bake notes copied. Changes to either field remain separate; save the result to keep these observations.");
});
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
    (readStepTimings().some((row) => row.startedAt || row.completedAt) ||
    readRows("stepResults").some((row) =>
      Object.values(row).some((v) => v !== null && v !== ""),
    )) &&
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
    (readStepTimings().some((row) => row.startedAt || row.completedAt) ||
    readRows("stepResults").some((row) =>
      Object.values(row).some((v) => v !== null && v !== ""),
    )) &&
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
    if (bakingSession) await currentSessionForResult();
    if (timingReviewRequired && !$("keepResultTimes").checked)
      throw Error("Review the loaded live bake timeline. Use its times, or confirm that you want to keep the result times before completing this bake.");
    // A session's UUID is also its result UUID. If the response was lost,
    // locate the existing result before retrying rather than creating another.
    if (bakingSession && !savedId) {
      const existing = (await api("/api/bakes")).find((r) => r.id === bakingSession.id);
      if (existing) {
        if (!same(validateBake(existing.bake), bake))
          throw Error("A different result already uses this bake's ID. It was not overwritten; open the existing result from the log.");
        const sessionToFinish = bakingSession;
        dirty = false; open(existing); bakingSession = sessionToFinish;
        await finishSession();
        await refreshLogs();
        notice("Your previously saved result was recovered and linked to this bake.");
        return;
      }
    }
    const r = await post("/api/bakes", { id: savedId ?? bakingSession?.id ?? undefined, bake });
    savedId = r.id;
    baseline = submitted;
    await refreshLogs();
    if (bakingSession) {
      try { await finishSession(); }
      catch (e) { notice(`Result saved, but the bake is still listed in progress: ${e.message} Reload to review the latest timeline, or save again if only linking failed.`, true); return; }
    }
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
    "Step timestamps JSON",
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
      JSON.stringify(b.stepTimings ?? []),
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
// Keep untouched ISO values exactly as recorded. Converting an existing instant
// through a local date input can otherwise change precision or an ambiguous DST hour.
function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n, width = 2) => String(n).padStart(width, "0");
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}
function readTiming(input) {
  if (!input.value) return null;
  if (input.value === input.dataset.initial) return input.dataset.original;
  const date = new Date(input.value);
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(input.value);
  if (!parts || !Number.isFinite(date.getTime())) return input.value;
  const expected = parts.slice(1, 7).map((part) => Number(part ?? 0));
  const actual = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
  // A local time inside the spring DST gap is normalized by Date. Keep it
  // invalid for the validator rather than silently recording a different time.
  return actual.every((part, index) => part === expected[index]) ? date.toISOString() : input.value;
}
function readStepTimings() {
  return [...$("stepResults").querySelectorAll(":scope > .step-card")].map((card) =>
    Object.fromEntries([...card.querySelectorAll("[data-timing-field]")]
      .map((input) => [input.dataset.timingField, readTiming(input)])));
}
function timingControls(card, timing) {
  const summary = document.createElement("p"); summary.className = "hint";
  const grid = document.createElement("div"); grid.className = "two";
  for (const [key, title] of [["startedAt", "Action started (local time)"], ["completedAt", "Action finished (before rest, local time)"]]) {
    const label = document.createElement("label"); label.textContent = title;
    const input = document.createElement("input"); input.type = "datetime-local"; input.step = "0.001";
    input.dataset.timingField = key;
    input.value = localDateTime(timing?.[key]);
    input.dataset.original = timing?.[key] ?? "";
    input.dataset.initial = input.value;
    label.append(input); grid.append(label);
  }
  const describe = () => {
    const times = Object.fromEntries([...grid.querySelectorAll("input")].map((input) => [input.dataset.timingField, readTiming(input)]));
    const parts = [];
    for (const [key, title] of [["startedAt", "Started"], ["completedAt", "Finished"]]) {
      if (times[key] && Number.isFinite(Date.parse(times[key]))) parts.push(`${title} ${new Date(times[key]).toLocaleString("en-GB")}`);
    }
    if (times.startedAt && times.completedAt && Date.parse(times.completedAt) >= Date.parse(times.startedAt))
      parts.push(`${duration((Date.parse(times.completedAt) - Date.parse(times.startedAt)) / 60000)} action elapsed`);
    summary.textContent = parts.join(" · ") || "No actual start or finish recorded. Checked steps do not supply missing times.";
  };
  grid.addEventListener("input", describe);
  describe(); card.append(summary, grid);
}
function measurementCard(parent, title, row = {}, oven = false, timing = {}) {
  const card = document.createElement("div");
  card.className = "step-card";
  const heading = document.createElement("h3");
  heading.textContent = title;
  card.append(heading);
  if (!oven) timingControls(card, timing);
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
      false, b.stepTimings?.[i],
    ),
  );
  if (b.stepTimings?.some((row) => row.startedAt || row.completedAt)) $("stepObservations").open = true;
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
Promise.all([api("/api/recipes"), api("/api/methods"), refreshLogs(), refreshSessions().catch((e) => { $("sessionsStatus").textContent = `Could not load in-progress bakes: ${e.message}`; return []; })])
  .then(([r, m, , loadedSessions]) => {
    sessions = loadedSessions;
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
      const sessionId = query.get("sessionId");
      const storedRecord = sessionId ? sessions.find((r) => r.id === sessionId) : null;
      const stored = sessionId ? storedRecord?.session : readDraft(bakeSessionKey(requested));
      try {
        const session = validateBakeSession(stored);
        if (!sessionId && session.recipeId !== requested) throw Error("Wrong snapshot");
        if (sessionId) {
          bakingSession = storedRecord;
          const existing = records.find((r) => r.id === (storedRecord.resultId ?? storedRecord.id));
          if (existing) {
            if (!same(existing.bake.recipe, session.recipe))
              throw Error("A different result already uses this bake's ID; it was not overwritten.");
            open(existing); bakingSession = storedRecord;
            timingReviewRequired = !sameTimings(existing.bake.stepTimings, session.stepTimings);
            notice(timingReviewRequired
              ? "This bake already has a saved result with different action times. Review the loaded live timeline below, then use its times or explicitly keep the result times before linking."
              : "A result already uses this bake’s ID. Review it, then save to link it to this bake.");
            baseline = formValue(); update(); recovery.start(); return;
          }
          if (storedRecord.resultId) throw Error("The linked result could not be found.");
        }
        selectedRecipe = session.recipe; selectedMethod = session.recipe.method;
        $("bakeRecipe").add(new Option(`${session.recipe.name} (baking snapshot)`, "snapshot"));
        $("bakeRecipe").value = "snapshot";
        methodOptions(); renderMeasurements({ stepTimings: structuredClone(session.stepTimings ?? []) });
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
