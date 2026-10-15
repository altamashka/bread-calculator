import { duration } from "./methods-model.mjs";
export const $ = (id) => document.getElementById(id);
export async function api(path, options) {
  const res = await fetch(path, options);
  let value;
  try {
    value = await res.json();
  } catch {
    throw Error("The server could not be reached. Try again.");
  }
  if (!res.ok) throw Error(value.error || "Request failed.");
  return value;
}
export const post = (path, value) =>
  api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
export function notice(message, error = false, id = "status") {
  const n = $(id);
  n.textContent = message;
  n.dataset.kind = error ? "error" : "success";
}
export function download(name, value, type = "application/json") {
  const blob = new Blob(
      [type === "application/json" ? JSON.stringify(value, null, 2) : value],
      { type },
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function methodPreview(element, method) {
  element.replaceChildren();
  if (!method) {
    element.textContent = "No method selected.";
    return;
  }
  let elapsed = 0;
  const list = document.createElement("ol");
  list.className = "method-preview";
  for (const s of method.steps) {
    const li = document.createElement("li"),
      title = document.createElement("strong"),
      time = document.createElement("span"),
      text = document.createElement("p");
    title.textContent = s.title;
    time.textContent = `+${duration(elapsed)}${s.restMinutes ? ` · rest ${duration(s.restMinutes)}` : ""}`;
    text.textContent = s.instructions;
    li.append(title, time, text);
    list.append(li);
    elapsed += s.restMinutes;
  }
  element.append(list);
}
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
export const same = (a, b) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export function guard(dirty) {
  return !dirty || window.confirm("Discard your unsaved changes?");
}
export function guardUnload(isDirty) {
  window.addEventListener("beforeunload", (e) => {
    if (isDirty()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}
export function dateLabel(value) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
