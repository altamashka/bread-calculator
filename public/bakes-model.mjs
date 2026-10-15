import { validate, calculate } from "./math.mjs";
import { InputError, methodKey } from "./methods-model.mjs";
const fields = {
  roomTempC: [-20, 60],
  doughTempC: [-20, 70],
  bulkMinutes: [0, 10080],
  proofMinutes: [0, 10080],
  bakedWeightG: [0.1, 1000000],
  rating: [1, 5],
  spring: [1, 5],
  sourness: [1, 5],
};
export function validateBake(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new InputError("A bake log entry is required.");
  const r = { date: input.date, recipe: validate(input.recipe) };
  if (
    typeof r.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
    !Number.isFinite(Date.parse(r.date)) ||
    new Date(r.date).toISOString().slice(0, 10) !== r.date
  )
    throw new InputError("Choose a valid bake date.");
  for (const [key, [min, max]] of Object.entries(fields)) {
    const v = input[key] ?? null;
    if (
      v !== null &&
      (typeof v !== "number" ||
        !Number.isFinite(v) ||
        v < min ||
        v > max ||
        (["rating", "spring", "sourness"].includes(key) &&
          !Number.isInteger(v)))
    )
      throw new InputError(
        `Enter a valid value for ${{ roomTempC: "room temperature", doughTempC: "dough temperature", bulkMinutes: "bulk fermentation time", proofMinutes: "final proof time", bakedWeightG: "baked batch weight", rating: "overall result", spring: "oven spring", sourness: "sourness" }[key]}.`,
      );
    r[key] = v;
  }
  if (r.bakedWeightG !== null && r.bakedWeightG > calculate(r.recipe).dough)
    throw new InputError(
      "Baked batch weight cannot exceed the calculated dough weight.",
    );
  for (const key of ["observations", "nextTime"]) {
    const v = input[key] ?? "";
    if (typeof v !== "string" || v.length > 4000)
      throw new InputError("Keep each bake note under 4,000 characters.");
    r[key] = v;
  }
  return r;
}
const mean = (values) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export function compareMethods(records) {
  const groups = new Map();
  for (const { bake } of records) {
    const key = methodKey(bake.recipe.method),
      g = groups.get(key) ?? {
        method: bake.recipe.method ?? null,
        count: 0,
        ratings: [],
        hydrations: [],
        temperatures: [],
        bulks: [],
      };
    g.count++;
    if (bake.rating !== null) g.ratings.push(bake.rating);
    g.hydrations.push(calculate(bake.recipe).hydration);
    if (bake.doughTempC !== null) g.temperatures.push(bake.doughTempC);
    if (bake.bulkMinutes !== null) g.bulks.push(bake.bulkMinutes);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({
    method: g.method,
    count: g.count,
    ratedCount: g.ratings.length,
    rating: mean(g.ratings),
    minHydration: Math.min(...g.hydrations),
    maxHydration: Math.max(...g.hydrations),
    doughTempC: mean(g.temperatures),
    bulkMinutes: mean(g.bulks),
  }));
}
