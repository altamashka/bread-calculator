import { InputError } from "./methods-model.mjs";

function timestamp(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > 40 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59 ||
      new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10))
    throw new InputError("Enter valid stage dates and times, including their time zone.");
  return value;
}

export function validateStepTimings(input, stepCount) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > stepCount)
    throw new InputError("Stage times must match the recorded method.");
  return input.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new InputError("Enter a valid stage timing.");
    const startedAt = timestamp(row.startedAt), completedAt = timestamp(row.completedAt);
    if (completedAt && (!startedAt || Date.parse(completedAt) < Date.parse(startedAt)))
      throw new InputError("A stage must start before it is completed.");
    return { startedAt, completedAt };
  });
}

// A method's rest begins when its action finishes, never when the page opens.
// Deadlines are wall-clock values so reloads and suspended tabs do not reset them.
export function restDeadline(session, index) {
  const step = session.recipe.method?.steps[index], completedAt = session.stepTimings?.[index]?.completedAt;
  if (!step || !completedAt || !step.restMinutes) return null;
  return new Date(Date.parse(completedAt) + step.restMinutes * 60000).toISOString();
}
