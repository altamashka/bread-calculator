import { validate, weighedIngredients } from "./math.mjs";
export const bakeSessionKey = (id) => `bread-bake:${id}`;
export function newBakeSession(record, capturedAt = new Date().toISOString()) {
  return validateBakeSession({
    recipeId: record.id, recipe: record.recipe, capturedAt,
    weighed: [], completedSteps: [], index: 0, stepIndex: 0,
    layout: "checklist", tab: "weigh",
  });
}
export function validateBakeSession(value) {
  if (!value || !/^[0-9a-f-]{36}$/.test(value.recipeId) ||
      !Number.isFinite(Date.parse(value.capturedAt))) throw Error("Invalid baking session.");
  const recipe = validate(value.recipe), ingredients = weighedIngredients(recipe),
    steps = recipe.method?.steps.length ?? 0;
  const index = (n, max) => Number.isInteger(n) && n >= 0 && n < Math.max(1, max) ? n : 0;
  const checked = (values, max) => Array.isArray(values)
    ? [...new Set(values.filter((n) => Number.isInteger(n) && n >= 0 && n < max))] : [];
  return {
    recipeId: value.recipeId, recipe, capturedAt: value.capturedAt,
    weighed: checked(value.weighed, ingredients.length),
    completedSteps: checked(value.completedSteps, steps),
    index: index(value.index, ingredients.length), stepIndex: index(value.stepIndex, steps),
    layout: value.layout === "focus" ? "focus" : "checklist",
    tab: value.tab === "method" ? "method" : "weigh",
  };
}
