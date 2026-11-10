import { calculate, weighedIngredients, ingredientPlan } from "./math.mjs";
import { newBakeSession, validateBakeSession, bakeSessionKey, bakeDraft, recoverableBakeDraft } from "./bake-mode-model.mjs";
import { readDraft, writeDraft } from "./drafts.mjs";
import { $, api, post, same } from "./ui.mjs";
import { duration } from "./methods-model.mjs";
import { restDeadline } from "./bake-timing-model.mjs";
const params = new URLSearchParams(location.search);
let recipeId = params.get("recipeId"), sessionId = params.get("sessionId");
const g = (n) => `${Number(n.toFixed(1)).toLocaleString("en-GB")} g`;
let session, latest, rows, plan, record, lastAttempt, pending = false, saving = false, saveError = false;
const wide = matchMedia("(min-width: 900px)");
wide.addEventListener("change", () => { if (session) renderLayout(); });
function rememberDraft(acknowledged = false) {
  if (record) writeDraft(bakeSessionKey(sessionId), bakeDraft(session, record.revision, acknowledged, lastAttempt));
}
function persist() {
  pending = true;
  rememberDraft();
  // Keep the last failed attempt for retry reconciliation, even if the user
  // continues making changes while the connection is down.
  if (!saveError) saveProgress();
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
      rememberDraft();
      record = await post("/api/bake-sessions", { id: record.id, revision: record.revision, session: snapshot });
      lastAttempt = null;
      // A newer edit may have arrived during the request. Keep it pending
      // against the newly acknowledged revision rather than marking it saved.
      rememberDraft(!pending && same(session, snapshot));
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
    rememberDraft();
  } catch (e) {
    $("status").textContent = `Progress could not be saved: ${e.message}`;
    return;
  } finally { saving = false; }
  saveProgress();
});
window.addEventListener("beforeunload", (e) => {
  if (pending || saving || hasTimeEdits()) { e.preventDefault(); e.returnValue = ""; }
});
for (const link of document.querySelectorAll("a")) link.addEventListener("click", async (e) => {
  if (hasTimeEdits()) { e.preventDefault(); $("timingStatus").textContent = "Save or reset the edited action times before leaving this page."; $("timeEditor").open = true; return; }
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
  const prepared = plan.preparation.filter((row) => session.weighed.includes(row.originalIndex)).length;
  $("weighedProgress").textContent = `${prepared} of ${plan.preparation.length} preparation portions weighed`;
  $("weighedMeter").value = plan.preparation.length ? 100 * prepared / plan.preparation.length : 0;
  $("continueMethod").hidden = !session.recipe.method;
}
function weighRow(row, checked, onChange) {
  const label = document.createElement("label"); label.className = "weigh-row";
  const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = checked;
  checkbox.setAttribute("aria-label", `${ingredientLabel(row)}, ${g(row.grams)}${row.note ? `, ${row.note}` : ""}`);
  const name = document.createElement("span"); name.className = "ingredient-copy";
  const title = document.createElement("span"); title.textContent = ingredientLabel(row); name.append(title);
  const noteText = [row.note?.replace(/^\(|\)$/g, ""), row.percent < 100 ? `${row.percent}% of recipe quantity` : ""].filter(Boolean).join(" · ");
  if (noteText) { const note = document.createElement("span"); note.className = "ingredient-note"; note.textContent = noteText; name.append(note); }
  const mass = document.createElement("strong"); mass.textContent = g(row.grams);
  checkbox.addEventListener("change", () => onChange(checkbox.checked));
  label.append(checkbox, name, mass); return label;
}
function renderWeighing() {
  updateWeighedProgress();
  const preparation = plan.preparation;
  $("preparationHint").textContent = preparation.length
    ? "These quantities are not assigned to a method step. Weigh them whenever you need them; preparation is optional."
    : "All ingredients are assigned to method steps. Weigh them as you go.";
  $("weighLayout").value = session.layout; $("weighLayout").disabled = !preparation.length;
  $("weighList").hidden = session.layout !== "checklist";
  $("focusIngredient").hidden = session.layout !== "focus" || !preparation.length;
  $("weighList").replaceChildren();
  for (const row of preparation) $("weighList").append(weighRow(row, session.weighed.includes(row.originalIndex), (checked) => {
    session.weighed = toggle(session.weighed, row.originalIndex, checked); persist(); updateWeighedProgress();
  }));
  $("fullIngredients").replaceChildren();
  for (const row of rows) { const li = document.createElement("li"); li.textContent = `${ingredientLabel(row)} · ${g(row.grams)}${row.note ? ` ${row.note}` : ""}`; $("fullIngredients").append(li); }
  const focus = $("focusIngredient"); focus.replaceChildren();
  if (!preparation.length) return;
  let position = preparation.findIndex((row) => row.originalIndex === session.index); if (position < 0) position = 0;
  const row = preparation[position];
  const heading = document.createElement("h3"); heading.textContent = ingredientLabel(row);
  const note = document.createElement("p"); note.textContent = [row.note, row.percent < 100 ? `${row.percent}% of recipe quantity` : ""].filter(Boolean).join(" · ");
  const weight = document.createElement("p"); weight.className = "focus-weight"; weight.textContent = g(row.grams);
  const mark = document.createElement("button"); mark.className = "primary";
  mark.textContent = session.weighed.includes(row.originalIndex) ? (position < preparation.length - 1 ? "Weighed · continue →" : "Weighed ✓") : "Mark weighed";
  mark.addEventListener("click", () => {
    session.weighed = toggle(session.weighed, row.originalIndex, true);
    session.index = preparation[Math.min(preparation.length - 1, position + 1)].originalIndex; persist(); renderWeighing();
    $("focusIngredient").querySelector("button").focus({ preventScroll: true });
  });
  const navigation = document.createElement("div"); navigation.className = "bake-step-actions";
  for (const [text, delta] of [["Previous ingredient", -1], ["Next ingredient", 1]]) {
    const button = document.createElement("button"); button.textContent = text;
    button.disabled = position + delta < 0 || position + delta >= preparation.length;
    button.addEventListener("click", () => { session.index = preparation[position + delta].originalIndex; persist(); renderWeighing(); $("focusIngredient").querySelector("button").focus({ preventScroll: true }); });
    navigation.append(button);
  }
  focus.append(heading, note, weight, mark, navigation);
}
const clockLabel = (value) => new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
function localTime(value) {
  if (!value) return "";
  const date = new Date(value), shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 23);
}
function hasTimeEdits() {
  return ["actionStartedAt", "actionCompletedAt"].some((id) => $(id).dataset.initialValue !== undefined && $(id).value !== $(id).dataset.initialValue);
}
function guardTimeEdits() {
  if (!hasTimeEdits()) return true;
  $("timingStatus").textContent = "Save or reset the edited action times before changing steps."; $("timeEditor").open = true; return false;
}
function actionTiming(index) { return session.stepTimings[index] ?? { startedAt: null, completedAt: null }; }
function timingSummary(index) {
  const timing = actionTiming(index);
  return [timing.startedAt ? `Started ${clockLabel(timing.startedAt)}` : "Start not recorded",
    timing.completedAt ? `finished ${clockLabel(timing.completedAt)}` : session.completedSteps.includes(index) ? "marked complete; finish not recorded" : "finish not recorded"].join(" · ");
}
function updateClock() {
  if (!session) return;
  const steps = session.recipe.method?.steps ?? [], index = session.stepIndex, step = steps[index];
  $("restClock").hidden = !step;
  if (!step) return;
  const timing = actionTiming(index), next = steps[index + 1], nextTiming = actionTiming(index + 1), now = Date.now();
  let prompt = "", countdown = "";
  if (timing.completedAt) {
    const deadline = Date.parse(restDeadline(session, index) ?? timing.completedAt);
    prompt = next ? `Next: ${next.title}. ${step.restMinutes ? `Planned rest ends ${clockLabel(deadline)}.` : "No planned rest; continue when ready."}`
      : step.restMinutes ? `Final planned rest ends ${clockLabel(deadline)}.` : "Final action finished. Record your bake result when ready.";
    if (next && nextTiming.startedAt) countdown = `Next action started ${clockLabel(nextTiming.startedAt)}.`;
    else if (step.restMinutes) countdown = now < deadline ? `${duration(Math.ceil((deadline - now) / 60000))} of planned rest remaining` : `Planned rest elapsed${now - deadline >= 60000 ? ` · ${duration(Math.floor((now - deadline) / 60000))} since due` : ""}. Check dough condition.`;
  } else if (timing.startedAt) {
    prompt = "Action in progress. Finish the action to start its planned rest.";
    countdown = `Started ${clockLabel(timing.startedAt)} · ${duration(Math.max(0, Math.floor((now - Date.parse(timing.startedAt)) / 60000)))} elapsed`;
  } else {
    const previous = index > 0 ? actionTiming(index - 1) : null;
    if (previous?.completedAt) {
      const deadline = Date.parse(restDeadline(session, index - 1) ?? previous.completedAt);
      prompt = `This action is planned after the previous rest, at ${clockLabel(deadline)}.`;
      countdown = now < deadline ? `${duration(Math.ceil((deadline - now) / 60000))} until planned start` : "Planned start reached. Check dough condition, then start when ready.";
    } else prompt = session.completedSteps.includes(index) ? "Previously marked complete without actual times. Enter times if known." : "Start this action when you begin. Browsing steps does not record a time.";
  }
  if ($("nextPrompt").textContent !== prompt) $("nextPrompt").textContent = prompt;
  if ($("restCountdown").textContent !== countdown) $("restCountdown").textContent = countdown;
}
function saveActionTiming(timing) {
  try {
    const timings = [...session.stepTimings];
    while (timings.length <= session.stepIndex) timings.push({ startedAt: null, completedAt: null });
    timings[session.stepIndex] = timing;
    const hadTimedFinish = !!actionTiming(session.stepIndex).completedAt;
    const completed = timing.completedAt ? true : hadTimedFinish ? false : session.completedSteps.includes(session.stepIndex);
    const next = validateBakeSession({ ...session, stepTimings: timings, completedSteps: toggle(session.completedSteps, session.stepIndex, completed) });
    session = next; persist(); renderMethod(); $("timingStatus").textContent = "Actual action times updated.";
    return true;
  } catch (e) { $("timingStatus").textContent = e.message; return false; }
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
    const actual = document.createElement("small"); actual.className = "timeline-actual"; actual.textContent = timingSummary(index);
    const timing = actionTiming(index);
    if (timing.completedAt && item.restMinutes) actual.textContent += ` · planned rest ends ${clockLabel(Date.parse(timing.completedAt) + item.restMinutes * 60000)}`;
    title.append(actual);
    const state = document.createElement("span"); state.className = "method-step-state";
    state.textContent = complete ? "Done" : index === session.stepIndex ? "Current" : "";
    button.append(number, title, state);
    button.setAttribute("aria-label", `Step ${index + 1}: ${item.title}${complete ? ", completed" : ""}${index === session.stepIndex ? ", current" : ""}. ${actual.textContent}`);
    button.setAttribute("aria-pressed", String(index === session.stepIndex));
    button.addEventListener("click", () => {
      if (!guardTimeEdits()) return;
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
  $("stepTiming").hidden = !step;
  $("stepIngredients").hidden = !step;
  $("stepIngredientList").replaceChildren();
  for (const row of (plan.steps[session.stepIndex] ?? [])) $("stepIngredientList").append(weighRow(row, session.weighedAdditions.includes(row.id), (checked) => {
    session.weighedAdditions = toggle(session.weighedAdditions, row.id, checked); persist();
  }));
  $("stepIngredientsHint").textContent = (plan.steps[session.stepIndex]?.length ?? 0) ? "Tick each portion as you weigh it for this action." : "No ingredients assigned. Use Preparation for unassigned quantities; method steps do not infer ingredients from instructions.";
  const timing = actionTiming(session.stepIndex);
  $("actualTimes").textContent = timingSummary(session.stepIndex);
  $("startAction").disabled = !!timing.startedAt || session.completedSteps.includes(session.stepIndex);
  $("finishAction").disabled = !timing.startedAt || !!timing.completedAt;
  $("reopenAction").hidden = !session.completedSteps.includes(session.stepIndex);
  for (const [id, value] of [["actionStartedAt", timing.startedAt], ["actionCompletedAt", timing.completedAt]]) {
    $(id).value = localTime(value); $(id).dataset.initialValue = $(id).value; $(id).dataset.original = value ?? "";
  }
  $("timingStatus").textContent = "";
  updateClock();
  $("methodActions").hidden = !step;
  $("methodPlan").hidden = !steps.length;
  $("previousStep").disabled = !step || session.stepIndex === 0;
  $("nextStep").disabled = !step || session.stepIndex === steps.length - 1;
}
function render() {
  const c = calculate(session.recipe); rows = weighedIngredients(session.recipe); plan = ingredientPlan(session.recipe);
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
  renderLayout();
  $("newSession").disabled = !latest;
  renderWeighing(); renderMethod();
}
function renderLayout() {
  $("weighPanel").hidden = !wide.matches && session.tab !== "weigh"; $("methodPanel").hidden = !wide.matches && session.tab !== "method";
  $("weighTab").setAttribute("aria-pressed", String(session.tab === "weigh"));
  $("methodTab").setAttribute("aria-pressed", String(session.tab === "method"));
}
for (const [id, tab] of [["weighTab", "weigh"], ["methodTab", "method"]])
  $(id).addEventListener("click", () => { session.tab = tab; persist(); renderLayout(); });
$("continueMethod").addEventListener("click", () => {
  session.tab = "method"; persist(); renderLayout();
  $("methodPanel").scrollIntoView({ block: "start" });
  $("stepTitle").focus({ preventScroll: true });
});
$("bakeNotes").addEventListener("input", () => { session.notes = $("bakeNotes").value; persist(); });
$("weighLayout").addEventListener("change", () => { session.layout = $("weighLayout").value; persist(); renderWeighing(); });
$("startAction").addEventListener("click", () => {
  if (guardTimeEdits() && saveActionTiming({ ...actionTiming(session.stepIndex), startedAt: new Date().toISOString() })) $("finishAction").focus({ preventScroll: true });
});
$("finishAction").addEventListener("click", () => {
  if (guardTimeEdits() && saveActionTiming({ ...actionTiming(session.stepIndex), completedAt: new Date().toISOString() }))
    ($("nextStep").disabled ? $("reopenAction") : $("nextStep")).focus({ preventScroll: true });
});
$("reopenAction").addEventListener("click", () => {
  if (!guardTimeEdits()) return;
  if (!confirm("Reopen this action and clear its recorded finish time? Its start time will be kept.")) return;
  session.completedSteps = toggle(session.completedSteps, session.stepIndex, false);
  saveActionTiming({ ...actionTiming(session.stepIndex), completedAt: null });
});
$("saveTimes").addEventListener("click", () => {
  try {
    const parsed = (id) => {
      const input = $(id);
      if (!input.value) return null;
      if (input.value === input.dataset.initialValue) return input.dataset.original || null;
      const date = new Date(input.value);
      const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(input.value);
      if (!parts || !Number.isFinite(date.getTime())) throw Error("Invalid time");
      const expected = parts.slice(1, 7).map((part) => Number(part ?? 0));
      const actual = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
      if (!actual.every((part, index) => part === expected[index])) throw Error("Invalid local time");
      return date.toISOString();
    };
    saveActionTiming({ startedAt: parsed("actionStartedAt"), completedAt: parsed("actionCompletedAt") });
  } catch { $("timingStatus").textContent = "Enter valid local dates and times."; }
});
$("resetTimes").addEventListener("click", () => renderMethod());
setInterval(updateClock, 1000);
document.addEventListener("visibilitychange", updateClock);
window.addEventListener("pageshow", updateClock);
for (const [id, delta] of [["previousStep", -1], ["nextStep", 1]])
  $(id).addEventListener("click", () => { if (!guardTimeEdits()) return; session.stepIndex += delta; persist(); renderMethod(); });
$("newSession").addEventListener("click", () => {
  if (!guardTimeEdits()) return;
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
        const recovered = recoverableBakeDraft(local, record, same);
        if (recovered && confirm(recovered.conflict
          ? "This tab has older or unsaved progress, and the saved bake may have changed elsewhere. Restoring will replace the saved progress and may undo checks or notes made on another device. Restore this tab’s progress?"
          : "This tab has unsaved progress. Restoring it will replace the currently saved progress. Restore it?")) {
          session = recovered.session; pending = true;
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
    if (session.recipe.method) session.tab = "method";
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
  $("bakeNotes").value = session.notes;
  render(); $("bakeSession").hidden = false;
  if (pending) saveProgress();
  $("editRecipe").href = `/?recipeId=${encodeURIComponent(recipeId)}`;
  $("recordResult").href = `/bakes?sessionId=${encodeURIComponent(sessionId)}&fromBake=1#bakeForm`;
  $("recordResult").hidden = false;
  document.querySelector(".bake-bottom").hidden = false;
} catch (e) { $("status").textContent = e.message; }
