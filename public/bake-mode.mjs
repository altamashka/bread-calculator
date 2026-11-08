import { calculate, weighedIngredients } from "./math.mjs";
import { newBakeSession, validateBakeSession, bakeSessionKey } from "./bake-mode-model.mjs";
import { readDraft, writeDraft } from "./drafts.mjs";
import { $, api, post, same } from "./ui.mjs";
import { duration } from "./methods-model.mjs";
const params = new URLSearchParams(location.search);
let recipeId = params.get("recipeId"), sessionId = params.get("sessionId");
const g = (n) => `${Number(n.toFixed(1)).toLocaleString("en-GB")} g`;
let session, latest, rows, record, lastAttempt, pending = false, saving = false, saveError = false;
const wide = matchMedia("(min-width: 900px)");
wide.addEventListener("change", () => { if (session) render(); });
function persist() {
  writeDraft(bakeSessionKey(sessionId), session);
  pending = true;
  saveError = false;
  saveProgress();
}
async function saveProgress() {
  if (saving || !pending || !record) return;
  saving = true;
  $("status").textContent = "Saving progress…";
  try {
    while (pending) {
      pending = false;
      const snapshot = structuredClone(session);
      lastAttempt = { revision: record.revision, session: snapshot };
      record = await post("/api/bake-sessions", { id: record.id, revision: record.revision, session: snapshot });
      lastAttempt = null;
    }
    saveError = false;
    $("status").textContent = "Progress saved. Resume this bake from the bake log.";
  } catch (e) {
    pending = true; saveError = true;
    $("status").textContent = `Progress could not be saved: ${e.message} Keep this page open and retry.`;
  } finally { saving = false; $("retrySave").hidden = !saveError; }
}
$("retrySave").addEventListener("click", async () => {
  if (saving) return;
  saving = true;
  try {
    const current = (await api("/api/bake-sessions")).find((r) => r.id === record.id);
    if (!current || current.resultId) throw Error("This bake is unavailable or already has a result. Open the bake log.");
    if (current.revision !== record.revision) {
      if (!lastAttempt || current.revision !== lastAttempt.revision + 1 || !same(current.session, lastAttempt.session))
        throw Error("This bake changed elsewhere. Reload this page to review and recover this tab’s progress.");
      record = current;
    }
    lastAttempt = null; saveError = false;
  } catch (e) {
    $("status").textContent = `Progress could not be saved: ${e.message}`;
    return;
  } finally { saving = false; }
  saveProgress();
});
window.addEventListener("beforeunload", (e) => {
  if (pending || saving) { e.preventDefault(); e.returnValue = ""; }
});
for (const link of document.querySelectorAll("a")) link.addEventListener("click", async (e) => {
  if (!pending && !saving) return;
  e.preventDefault();
  while (saving) await new Promise((resolve) => setTimeout(resolve, 50));
  if (pending && !saveError) await saveProgress();
  if (!pending) location.href = link.href;
  else $("status").textContent = "Progress is not saved. Retry saving before leaving this page.";
});
function toggle(values, index, checked) {
  const next = values.filter((n) => n !== index);
  if (checked) next.push(index);
  return next;
}
function ingredientLabel(row) {
  const label = row.name === "Sourdough starter / leaven" ? "Starter / leaven" : row.name;
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function updateWeighedProgress() {
  $("weighedProgress").textContent = `${session.weighed.length} of ${rows.length} ingredients weighed`;
  $("weighedMeter").value = 100 * session.weighed.length / rows.length;
  $("continueMethod").hidden = session.weighed.length !== rows.length || !session.recipe.method;
  $("continueMethod").textContent = wide.matches ? "Go to current step →" : "Continue to method →";
}
function renderWeighing() {
  updateWeighedProgress();
  $("weighLayout").value = session.layout;
  $("weighList").hidden = session.layout !== "checklist";
  $("focusIngredient").hidden = session.layout !== "focus";
  $("weighList").replaceChildren();
  rows.forEach((row, index) => {
    const label = document.createElement("label"); label.className = "weigh-row";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox";
    checkbox.checked = session.weighed.includes(index);
    checkbox.setAttribute("aria-label", `${ingredientLabel(row)}${row.note ? ` ${row.note}` : ""}, ${g(row.grams)}`);
    const name = document.createElement("span");
    name.className = "ingredient-copy";
    const title = document.createElement("span"); title.textContent = ingredientLabel(row);
    name.append(title);
    if (row.note) {
      const note = document.createElement("span"); note.className = "ingredient-note";
      note.textContent = row.note.replace(/^\(|\)$/g, ""); name.append(note);
    }
    const mass = document.createElement("strong"); mass.textContent = g(row.grams).replace(/ g$/, "");
    const unit = document.createElement("span"); unit.className = "mass-unit"; unit.textContent = " g";
    mass.append(unit);
    checkbox.addEventListener("change", () => {
      session.weighed = toggle(session.weighed, index, checkbox.checked);
      persist();
      // Keep the focused checkbox in place while updating progress.
      updateWeighedProgress();
    });
    label.append(checkbox, name, mass); $("weighList").append(label);
  });
  const row = rows[session.index], focus = $("focusIngredient");
  focus.replaceChildren();
  const heading = document.createElement("h3"); heading.textContent = ingredientLabel(row);
  const note = document.createElement("p"); note.textContent = row.note;
  const weight = document.createElement("p"); weight.className = "focus-weight"; weight.textContent = g(row.grams);
  const mark = document.createElement("button"); mark.className = "primary";
  mark.textContent = session.weighed.includes(session.index)
    ? (session.index < rows.length - 1 ? "Weighed · continue →" : "Weighed ✓") : "Mark weighed";
  mark.addEventListener("click", () => {
    session.weighed = toggle(session.weighed, session.index, true);
    session.index = Math.min(rows.length - 1, session.index + 1); persist(); renderWeighing();
    $("focusIngredient").querySelector("button").focus({ preventScroll: true });
  });
  const navigation = document.createElement("div"); navigation.className = "bake-step-actions";
  for (const [text, delta] of [["Previous ingredient", -1], ["Next ingredient", 1]]) {
    const button = document.createElement("button"); button.textContent = text;
    button.disabled = session.index + delta < 0 || session.index + delta >= rows.length;
    button.addEventListener("click", () => { session.index += delta; persist(); renderWeighing();
      $("focusIngredient").querySelector("button").focus({ preventScroll: true }); });
    navigation.append(button);
  }
  focus.append(heading, note, weight, mark, navigation);
}
function renderMethod() {
  const steps = session.recipe.method?.steps ?? [], step = steps[session.stepIndex];
  $("methodSteps").replaceChildren();
  steps.forEach((item, index) => {
    const button = document.createElement("button");
    const complete = session.completedSteps.includes(index);
    const number = document.createElement("span"); number.className = "step-number";
    number.textContent = complete ? "✓" : String(index + 1); number.setAttribute("aria-hidden", "true");
    const title = document.createElement("span"); title.textContent = item.title;
    const state = document.createElement("span"); state.className = "method-step-state";
    state.textContent = complete ? "Done" : index === session.stepIndex ? "Current" : "";
    button.append(number, title, state);
    button.setAttribute("aria-label", `Step ${index + 1}: ${item.title}${complete ? ", completed" : ""}`);
    button.setAttribute("aria-pressed", String(index === session.stepIndex));
    button.addEventListener("click", () => {
      session.stepIndex = index; persist(); renderMethod();
      $("methodSteps").children[index].focus({ preventScroll: true });
    });
    $("methodSteps").append(button);
  });
  $("stepProgress").textContent = step
    ? `Step ${session.stepIndex + 1} of ${steps.length} · ${session.completedSteps.length} completed`
    : "No method saved with this recipe.";
  $("methodMeter").value = steps.length ? 100 * session.completedSteps.length / steps.length : 0;
  $("stepTitle").textContent = step?.title ?? "Ingredients only";
  $("stepInstructions").textContent = step?.instructions ?? "Edit and save the recipe to choose a method for your next bake.";
  $("stepRest").hidden = !step;
  $("stepRest").textContent = step
    ? (step.restMinutes ? `Planned rest after this step: ${duration(step.restMinutes)}. Check dough condition before continuing.` : "No planned rest after this step.") : "";
  $("stepCheck").hidden = !step;
  $("methodActions").hidden = !step;
  $("methodPlan").hidden = !steps.length;
  $("stepDone").checked = session.completedSteps.includes(session.stepIndex);
  $("previousStep").disabled = !step || session.stepIndex === 0;
  $("nextStep").disabled = !step || session.stepIndex === steps.length - 1;
}
function render() {
  const c = calculate(session.recipe); rows = weighedIngredients(session.recipe);
  $("recipeTitle").textContent = session.recipe.name;
  $("batchSummary").textContent = `${g(c.dough)} dough · ${session.recipe.portions} pieces of ${g(c.portion)}`;
  const recipeChanged = latest && !same(latest.recipe, session.recipe);
  $("snapshotNotice").hidden = !!latest && !recipeChanged;
  $("snapshotNotice").textContent = recipeChanged
    ? "The saved recipe has changed. This bake keeps the version you started with."
    : !latest ? "Using your recovered bake. The latest saved recipe could not be checked." : "";
  $("snapshotHint").textContent = recipeChanged
    ? "The saved recipe has changed. This bake keeps the formula and method you started with; start a new bake to use the latest recipe."
    : latest ? `Formula captured ${new Date(session.capturedAt).toLocaleString("en-GB")}.`
    : "Using the recovered baking snapshot. The latest saved recipe could not be checked.";
  $("weighPanel").hidden = !wide.matches && session.tab !== "weigh"; $("methodPanel").hidden = !wide.matches && session.tab !== "method";
  $("weighTab").setAttribute("aria-pressed", String(session.tab === "weigh"));
  $("methodTab").setAttribute("aria-pressed", String(session.tab === "method"));
  $("newSession").disabled = !latest;
  renderWeighing(); renderMethod();
}
for (const [id, tab] of [["weighTab", "weigh"], ["methodTab", "method"]])
  $(id).addEventListener("click", () => { session.tab = tab; persist(); render(); });
$("continueMethod").addEventListener("click", () => {
  session.tab = "method"; persist(); render();
  $("methodPanel").scrollIntoView({ block: "start" });
  $("stepTitle").focus({ preventScroll: true });
});
$("weighLayout").addEventListener("change", () => { session.layout = $("weighLayout").value; persist(); renderWeighing(); });
$("stepDone").addEventListener("change", () => { session.completedSteps = toggle(session.completedSteps, session.stepIndex, $("stepDone").checked); persist(); renderMethod(); });
for (const [id, delta] of [["previousStep", -1], ["nextStep", 1]])
  $(id).addEventListener("click", () => { session.stepIndex += delta; persist(); renderMethod(); });
$("newSession").addEventListener("click", () => {
  if (pending || saving) { $("status").textContent = "Wait for progress to save before starting another bake."; return; }
  if (confirm("Start another bake using the latest saved recipe? This bake will remain in the bake log."))
    location.href = `/bake?recipeId=${encodeURIComponent(recipeId)}&new=1`;
});
try {
  if (sessionId) {
    record = (await api("/api/bake-sessions")).find((r) => r.id === sessionId);
    if (!record) throw Error("This baking session could not be found. Open the bake log or the recipe to start a new bake.");
    if (record.resultId) throw Error("This bake has a saved result. Open it in the bake log.");
    session = validateBakeSession(record.session); recipeId = session.recipeId;
    const local = readDraft(bakeSessionKey(sessionId));
    if (local) {
      try {
        const recovered = validateBakeSession(local);
        if (recovered.recipeId === session.recipeId && recovered.capturedAt === session.capturedAt &&
            same(recovered.recipe, session.recipe) && !same(recovered, session) &&
            confirm("This tab has progress that differs from the saved bake. Restore this tab’s progress?")) {
          session = recovered; pending = true;
        }
      } catch {}
    }
  } else {
    if (!/^[0-9a-f-]{36}$/.test(recipeId ?? "")) throw Error("Open a saved recipe in the calculator, then choose Bake.");
    latest = (await api("/api/recipes")).find((r) => r.id === recipeId);
    if (!latest) throw Error("This saved recipe could not be found. Open it in the calculator first.");
    // Recover an older tab-local session once, without replacing any saved sessions.
    const marker = `bread-bake-migrated:${recipeId}`;
    let stored = null, migrated = false;
    try { if (!params.has("new") && !sessionStorage.getItem(marker)) stored = readDraft(bakeSessionKey(recipeId)); } catch {}
    if (stored) { try { session = validateBakeSession(stored); if (session.recipeId !== recipeId) session = null; else migrated = true; } catch {} }
    session ??= newBakeSession(latest);
    sessionId = crypto.randomUUID();
    history.replaceState(null, "", `/bake?sessionId=${encodeURIComponent(sessionId)}`);
    try { record = await post("/api/bake-sessions", { id: sessionId, session }); }
    catch (e) {
      // A response can be lost after the server commits. Keep the ID in the URL
      // so reloading can find that same session instead of creating another.
      try { record = (await api("/api/bake-sessions")).find((r) => r.id === sessionId); } catch {}
      if (!record) throw Error("Could not confirm the new bake was saved. Reload this page to check, or open the recipe to try again.");
    }
    if (migrated) { try { sessionStorage.setItem(marker, "1"); } catch {} }
    sessionId = record.id;
    history.replaceState(null, "", `/bake?sessionId=${encodeURIComponent(sessionId)}`);
  }
  try { latest = (await api("/api/recipes")).find((r) => r.id === recipeId); } catch {}
  $("status").textContent = "Progress saved. Resume this bake from the bake log.";
  render(); $("bakeSession").hidden = false;
  if (pending) saveProgress();
  $("editRecipe").href = `/?recipeId=${encodeURIComponent(recipeId)}`;
  $("recordResult").href = `/bakes?sessionId=${encodeURIComponent(sessionId)}&fromBake=1#bakeForm`;
  $("recordResult").hidden = false;
  document.querySelector(".bake-bottom").hidden = false;
} catch (e) { $("status").textContent = e.message; }
