import { calculate, weighedIngredients } from "./math.mjs";
import { newBakeSession, validateBakeSession, bakeSessionKey } from "./bake-mode-model.mjs";
import { readDraft, writeDraft } from "./drafts.mjs";
import { $, api, same } from "./ui.mjs";
import { duration } from "./methods-model.mjs";
const recipeId = new URLSearchParams(location.search).get("recipeId");
const g = (n) => `${Number(n.toFixed(1)).toLocaleString("en-GB")} g`;
let session, latest, rows;
const wide = matchMedia("(min-width: 900px)");
wide.addEventListener("change", () => { if (session) render(); });
function persist() {
  if (!writeDraft(bakeSessionKey(recipeId), session))
    $("status").textContent = "Progress cannot be recovered in this browser. Keep this page open while baking.";
}
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
$("newSession").addEventListener("click", async () => {
  if (!confirm("Start a new bake from the latest saved recipe? This resets this tab’s weighing and step progress.")) return;
  try {
    latest = (await api("/api/recipes")).find((r) => r.id === recipeId);
    if (!latest) throw Error("This recipe is no longer available. Your current baking snapshot is retained.");
    session = newBakeSession(latest); persist(); render();
  } catch (e) { $("status").textContent = e.message; }
});
try {
  if (!/^[0-9a-f-]{36}$/.test(recipeId ?? "")) throw Error("Open a saved recipe in the calculator, then choose Bake.");
  const stored = readDraft(bakeSessionKey(recipeId));
  if (stored) { try { session = validateBakeSession(stored); if (session.recipeId !== recipeId) session = null; } catch {} }
  try { latest = (await api("/api/recipes")).find((r) => r.id === recipeId); }
  catch (e) { if (!session) throw e; }
  if (!session) {
    if (!latest) throw Error("This saved recipe could not be found. Open it in the calculator first.");
    session = newBakeSession(latest);
  }
  $("status").textContent = "";
  persist(); render(); $("bakeSession").hidden = false;
  $("editRecipe").href = `/?recipeId=${encodeURIComponent(recipeId)}`;
  $("recordResult").href = `/bakes?recipeId=${encodeURIComponent(recipeId)}&fromBake=1#bakeForm`;
  $("recordResult").hidden = false;
  document.querySelector(".bake-bottom").hidden = false;
} catch (e) { $("status").textContent = e.message; }
