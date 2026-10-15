export class InputError extends Error {
  statusCode = 400;
}
export function validateMethod(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new InputError("A method is required.");
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 120
  )
    throw new InputError("Give the method a name of up to 120 characters.");
  if (
    !Array.isArray(input.steps) ||
    !input.steps.length ||
    input.steps.length > 40
  )
    throw new InputError("Add between 1 and 40 method steps.");
  const steps = input.steps.map((s, i) => {
    if (
      !s ||
      typeof s.title !== "string" ||
      !s.title.trim() ||
      s.title.length > 120
    )
      throw new InputError(
        `Give step ${i + 1} a title of up to 120 characters.`,
      );
    if (typeof s.instructions !== "string" || s.instructions.length > 2000)
      throw new InputError(
        `Keep step ${i + 1} instructions under 2,000 characters.`,
      );
    if (
      typeof s.restMinutes !== "number" ||
      !Number.isFinite(s.restMinutes) ||
      s.restMinutes < 0 ||
      s.restMinutes > 10080
    )
      throw new InputError(
        `Rest after step ${i + 1} must be between 0 and 10,080 minutes.`,
      );
    return {
      title: s.title.trim(),
      instructions: s.instructions,
      restMinutes: s.restMinutes,
    };
  });
  if (steps.reduce((n, s) => n + s.restMinutes, 0) > 43200)
    throw new InputError("Total planned rest must be no more than 30 days.");
  return { name: input.name.trim(), steps };
}
export function validateSnapshot(input) {
  if (input === null || input === undefined) return null;
  const method = validateMethod(input);
  const id = input.id ?? null,
    savedAt = input.savedAt ?? null;
  if (id !== null && (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)))
    throw new InputError("Invalid method reference.");
  if (
    savedAt !== null &&
    (typeof savedAt !== "string" ||
      savedAt.length > 40 ||
      !Number.isFinite(Date.parse(savedAt)))
  )
    throw new InputError("Invalid method version date.");
  return { id, savedAt, ...method };
}
export function methodSnapshot(record) {
  return validateSnapshot({
    id: record.id,
    savedAt: record.updatedAt,
    ...record.method,
  });
}
export function timeline(method) {
  let elapsed = 0;
  return validateMethod(method).steps.map((step, index) => {
    const result = { ...step, index, startMinutes: elapsed };
    elapsed += step.restMinutes;
    return result;
  });
}
export function duration(minutes) {
  const m = Number(minutes.toFixed(1)),
    h = Math.floor(m / 60),
    rest = Number((m % 60).toFixed(1));
  return h ? `${h} h${rest ? ` ${rest} min` : ""}` : `${rest} min`;
}
export function methodKey(method) {
  return method ? JSON.stringify(validateMethod(method)) : "none";
}
