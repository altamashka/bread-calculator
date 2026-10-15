export const defaults = () => ({
  version: 1,
  name: "Everyday sourdough",
  flour: 1000,
  water: 75,
  salt: 2,
  leaven: 20,
  starterHydration: 100,
  milk: 0,
  yeast: 0,
  bakingpowder: 0,
  oil: 0,
  sugar: 0,
  butter: 0,
  eggs: 0,
  honey: 0,
  wholeWheat: 0,
  rye: 0,
  portions: 2,
  notes: "",
});
export const ingredients = {
  water: "Water",
  salt: "Salt",
  leaven: "Sourdough starter / leaven",
  milk: "Milk",
  yeast: "Instant yeast",
  bakingpowder: "Baking powder",
  oil: "Oil",
  sugar: "Sugar",
  butter: "Butter",
  eggs: "Eggs",
  honey: "Honey",
};
export function validate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("A recipe object is required.");
  const r = defaults();
  for (const key of Object.keys(r)) if (key in input) r[key] = input[key];
  for (const key of Object.keys(r).filter(
    (k) => typeof defaults()[k] === "number",
  )) {
    if (
      typeof r[key] !== "number" ||
      !Number.isFinite(r[key]) ||
      r[key] < 0 ||
      r[key] > 100000
    )
      throw Error(`Enter a valid non-negative number for ${key}.`);
  }
  if (r.version !== 1) throw Error("Unsupported recipe version.");
  if (
    r.flour <= 0 ||
    r.flour > 100000 ||
    r.portions < 1 ||
    r.portions > 1000 ||
    !Number.isInteger(r.portions)
  )
    throw Error(
      "Flour must be positive and portions must be a whole number from 1 to 1000.",
    );
  if (r.wholeWheat + r.rye > 100)
    throw Error("Whole wheat and rye must total no more than 100%.");
  if (r.starterHydration > 500)
    throw Error("Starter hydration must be between 0 and 500%.");
  if (
    typeof r.name !== "string" ||
    !r.name.trim() ||
    r.name.length > 120 ||
    typeof r.notes !== "string" ||
    r.notes.length > 10000
  )
    throw Error(
      "Use a recipe name up to 120 characters and notes up to 10,000 characters.",
    );
  return r;
}
export function calculate(input) {
  const r = validate(input),
    grams = Object.fromEntries(
      Object.keys(ingredients).map((k) => [k, (r.flour * r[k]) / 100]),
    );
  const starterFlour = grams.leaven / (1 + r.starterHydration / 100),
    starterWater = grams.leaven - starterFlour;
  const totalFlour = r.flour + starterFlour,
    totalWater = grams.water + starterWater;
  const dough = r.flour + Object.values(grams).reduce((a, b) => a + b, 0);
  return {
    grams,
    starterFlour,
    starterWater,
    totalFlour,
    totalWater,
    dough,
    hydration: (100 * totalWater) / totalFlour,
    liquidHydration: (100 * (totalWater + grams.milk)) / totalFlour,
    prefermented: (100 * starterFlour) / totalFlour,
    saltTotal: (100 * grams.salt) / totalFlour,
    portion: dough / r.portions,
  };
}
export function scale(input, target) {
  if (!Number.isFinite(target) || target <= 0)
    throw Error("Enter a positive target dough weight.");
  return validate({
    ...input,
    flour: (input.flour * target) / calculate(input).dough,
  });
}
export function fromQuery(query) {
  const p = new URLSearchParams(query),
    r = defaults();
  for (const key of Object.keys(r))
    if (p.has(key))
      r[key] =
        typeof r[key] === "number"
          ? p.get(key).trim()
            ? Number(p.get(key))
            : NaN
          : p.get(key);
  // BRDCLC names its three identical 100%-hydration preferments separately.
  const aliases = ["starter", "poolish"];
  if (!p.has("leaven") && aliases.some((k) => p.has(k))) r.leaven = 0;
  for (const alias of aliases)
    if (p.has(alias))
      r.leaven += p.get(alias).trim() ? Number(p.get(alias)) : NaN;
  return validate(r);
}
export function toQuery(r) {
  return new URLSearchParams(Object.entries(validate(r))).toString();
}
const g = (n) => `${Number(n.toFixed(1))} g`;
export function schemaRecipe(input) {
  const r = validate(input),
    c = calculate(r);
  const flours = [
    `${g((r.flour * (100 - r.wholeWheat - r.rye)) / 100)} white flour`,
    ...(r.wholeWheat
      ? [`${g((r.flour * r.wholeWheat) / 100)} whole wheat flour`]
      : []),
    ...(r.rye ? [`${g((r.flour * r.rye) / 100)} rye flour`] : []),
  ].filter((s) => !s.startsWith("0 g"));
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: r.name,
    recipeYield: `${r.portions} dough portions of ${g(c.portion)} before baking`,
    description: `${c.hydration.toFixed(2)}% water hydration including starter; ${g(c.dough)} dough. Percentages use added flour. Starter hydration ${r.starterHydration}%. Milk counted separately: ${c.liquidHydration.toFixed(2)}% liquid hydration.`,
    recipeIngredient: [
      ...flours,
      ...Object.entries(c.grams)
        .filter(([, v]) => v > 0)
        .map(
          ([k, v]) =>
            `${g(v)} ${ingredients[k]}${k === "leaven" ? ` (${r.starterHydration}% hydration)` : ""}`,
        ),
    ],
    recipeInstructions: r.notes.trim()
      ? r.notes
          .split("\n")
          .filter((s) => s.trim())
          .map((text) => ({ "@type": "HowToStep", text }))
      : [],
    keywords: "bread, baker percentage, sourdough",
  };
}
