import { validate, calculate } from "./math.mjs";
import { InputError, methodKey } from "./methods-model.mjs";
const fields = {
  bulkRisePercent: [0, 1000],
  fridgeTempC: [-30, 40],
  ambientProofMinutes: [0, 10080],
  coldProofMinutes: [0, 10080],
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
        `Enter a valid value for ${{ bulkRisePercent: "bulk rise", fridgeTempC: "fridge temperature", ambientProofMinutes: "room-temperature proof", coldProofMinutes: "cold proof", roomTempC: "room temperature", doughTempC: "dough temperature", bulkMinutes: "bulk fermentation time", proofMinutes: "final proof time", bakedWeightG: "baked batch weight", rating: "overall result", spring: "oven spring", sourness: "sourness" }[key]}.`,
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
  const split = [r.ambientProofMinutes, r.coldProofMinutes];
  if (split.some((v) => v !== null)) {
    if (split.some((v) => v === null))
      throw new InputError(
        "Enter both proof times, using 0 for a stage you skipped.",
      );
    const total = split[0] + split[1];
    if (total > 10080)
      throw new InputError("Total proof time must be at most 10,080 minutes.");
    r.proofMinutes = total;
  }
  r.stepResults = validateRows(
    input.stepResults,
    "step",
    r.recipe.method?.steps.length ?? 0,
  );
  r.ovenStages = validateRows(input.ovenStages, "oven", 12);
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

function validateRows(input, kind, max) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > max)
    throw new InputError(
      kind === "step"
        ? "Step observations must match the recorded method."
        : "Use at most 12 oven stages.",
    );
  return input.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new InputError("Enter a valid measurement row.");
    const out = {};
    const ranges =
      kind === "step"
        ? { minutes: [0, 10080], tempC: [-30, 100], ph: [0, 14] }
        : { minutes: [0, 1440], tempC: [0, 500] };
    for (const [key, [min, max]] of Object.entries(ranges)) {
      const v = row[key] ?? null;
      if (
        v !== null &&
        (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
      )
        throw new InputError(
          `Check ${kind === "step" ? "method step" : "oven stage"} ${index + 1}: ${key === "ph" ? "pH must be between 0 and 14" : key === "minutes" ? "enter a valid time in minutes" : "enter a valid temperature in °C"}.`,
        );
      out[key] = v;
    }
    if (kind === "oven") {
      if (!["", "covered", "steam", "uncovered"].includes(row.mode ?? ""))
        throw new InputError("Choose an oven setting from the list.");
      out.mode = row.mode ?? "";
    }
    const notes = row.notes ?? "";
    if (typeof notes !== "string" || notes.length > 1000)
      throw new InputError("Keep each stage note under 1,000 characters.");
    out.notes = notes;
    return out;
  });
}
