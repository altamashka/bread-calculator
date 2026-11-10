import { validate, weighedIngredients, ingredientPlan } from "./math.mjs";
import { validateStepTimings } from "./bake-timing-model.mjs";
export const bakeSessionKey = (id) => `bread-bake:${id}`;
export function newBakeSession(record, capturedAt = new Date().toISOString()) {
  return validateBakeSession({
    recipeId: record.id, recipe: record.recipe, capturedAt,
    weighed: [], completedSteps: [], index: 0, stepIndex: 0,
    layout: "checklist", tab: record.recipe.method ? "method" : "weigh",
  });
}
export function validateBakeSession(value) {
  if (!value || !/^[0-9a-f-]{36}$/.test(value.recipeId) ||
      !Number.isFinite(Date.parse(value.capturedAt))) throw Error("Invalid baking session.");
  const notes = value.notes === undefined ? "" : value.notes;
  if (typeof notes !== "string" || notes.length > 4000) throw Error("Bake notes must be text of at most 4,000 characters.");
  const recipe = validate(value.recipe), ingredients = weighedIngredients(recipe),
    steps = recipe.method?.steps.length ?? 0;
  const index = (n, max) => Number.isInteger(n) && n >= 0 && n < Math.max(1, max) ? n : 0;
  const checked = (values, max) => Array.isArray(values)
    ? [...new Set(values.filter((n) => Number.isInteger(n) && n >= 0 && n < max))] : [];
  const additionIds = new Set(ingredientPlan(recipe).steps.flat().map((row) => row.id));
  return {
    recipeId: value.recipeId, recipe, capturedAt: value.capturedAt, notes,
    weighed: checked(value.weighed, ingredients.length),
    weighedAdditions: Array.isArray(value.weighedAdditions)
      ? [...new Set(value.weighedAdditions.filter((id) => additionIds.has(id)))] : [],
    stepTimings: validateStepTimings(value.stepTimings, steps),
    completedSteps: checked(value.completedSteps, steps),
    index: index(value.index, ingredients.length), stepIndex: index(value.stepIndex, steps),
    layout: value.layout === "focus" ? "focus" : "checklist",
    tab: value.tab === "method" ? "method" : "weigh",
  };
}

// Keep a tab copy until a later edit replaces it. An acknowledgement means this
// exact snapshot reached the server, not that it is still the latest revision.
export function bakeDraft(session, revision, acknowledged, attempt = null) {
  return { kind: "bake-session-draft", session: structuredClone(session), revision, acknowledged,
    attempt: attempt ? structuredClone(attempt) : null };
}
export function recoverableBakeDraft(value, record, equal) {
  if (!value) return null;
  const tagged = value.kind === "bake-session-draft";
  if (tagged && (typeof value.acknowledged !== "boolean" ||
      !Number.isInteger(value.revision) || value.revision < 1)) return null;
  const recovered = validateBakeSession(tagged ? value.session : value);
  const saved = validateBakeSession(record.session);
  if (recovered.recipeId !== saved.recipeId || recovered.capturedAt !== saved.capturedAt ||
      !equal(recovered.recipe, saved.recipe) || equal(recovered, saved) ||
      (tagged && value.acknowledged)) return null;
  return { session: recovered, conflict: !tagged || value.revision !== record.revision, legacy: !tagged };
}
