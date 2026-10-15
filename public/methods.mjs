import { validateMethod, timeline, duration } from "./methods-model.mjs";
import {
  $,
  api,
  post,
  notice,
  download,
  same,
  guard,
  guardUnload,
} from "./ui.mjs";
let method = {
    name: "",
    steps: [{ title: "", instructions: "", restMinutes: 0 }],
  },
  savedId = null,
  records = [],
  baseline = structuredClone(method),
  dirty = false,
  removed = null,
  busy = false;
function update() {
  dirty = !same(method, baseline);
  $("methodState").textContent = savedId
    ? dirty
      ? "Unsaved changes"
      : "Saved"
    : "Not saved";
  $("methodState").dataset.dirty = String(dirty);
  $("saveMethod").disabled = busy;
  $("savedMethod").disabled = busy;
  $("newMethod").disabled = busy;
  $("schedule").replaceChildren();
  try {
    const rows = timeline(method),
      total = rows.reduce((n, s) => n + s.restMinutes, 0),
      start = $("startAt").value ? new Date($("startAt").value) : null;
    $("methodTotal").textContent =
      `${rows.length} steps · ${duration(total)} planned rest`;
    for (const s of rows) {
      const li = document.createElement("li"),
        time = document.createElement("span"),
        title = document.createElement("strong"),
        text = document.createElement("p");
      time.textContent = start
        ? new Date(start.getTime() + s.startMinutes * 60000).toLocaleString(
            "en-GB",
            {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            },
          )
        : `+${duration(s.startMinutes)}`;
      title.textContent = s.title;
      text.textContent = [
        s.instructions,
        s.restMinutes
          ? `Then rest ${duration(s.restMinutes)}.`
          : "Continue without a rest.",
      ]
        .filter(Boolean)
        .join(" ");
      li.append(time, title, text);
      $("schedule").append(li);
    }
  } catch (e) {
    $("methodTotal").textContent = !method.name.trim()
      ? "Add a method name and steps to see the schedule."
      : e.message;
  }
}
function renderSteps() {
  $("methodName").value = method.name;
  $("stepsEditor").replaceChildren();
  method.steps.forEach((s, index) => {
    const card = document.createElement("section");
    card.className = "step-card";
    const head = document.createElement("div");
    head.className = "section-title";
    const number = document.createElement("h3");
    number.textContent = `Step ${index + 1}`;
    const controls = document.createElement("div");
    controls.className = "step-controls";
    for (const [label, delta] of [
      ["Move up", -1],
      ["Move down", 1],
    ]) {
      const button = document.createElement("button");
      button.textContent = delta < 0 ? "↑" : "↓";
      button.setAttribute("aria-label", `${label} step ${index + 1}`);
      button.disabled =
        index + delta < 0 || index + delta >= method.steps.length;
      button.addEventListener("click", () => {
        [method.steps[index], method.steps[index + delta]] = [
          method.steps[index + delta],
          method.steps[index],
        ];
        renderSteps();
      });
      controls.append(button);
    }
    const remove = document.createElement("button");
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove step ${index + 1}`);
    remove.addEventListener("click", () => {
      removed = { index, step: structuredClone(s) };
      method.steps.splice(index, 1);
      $("undoStep").hidden = false;
      renderSteps();
    });
    controls.append(remove);
    head.append(number, controls);
    card.append(head);
    for (const [key, label, type] of [
      ["title", "Action", "text"],
      ["instructions", "Instructions", "textarea"],
      ["restMinutes", "Rest after this step (min)", "number"],
    ]) {
      const lab = document.createElement("label");
      lab.textContent = label;
      const input = document.createElement(
        type === "textarea" ? "textarea" : "input",
      );
      input.id = `step-${index}-${key}`;
      lab.htmlFor = input.id;
      if (type !== "textarea") input.type = type;
      else input.rows = 3;
      if (type === "number") {
        input.min = "0";
        input.max = "10080";
        input.step = "any";
      } else input.maxLength = key === "title" ? 120 : 2000;
      input.value = s[key];
      if (key === "title")
        input.placeholder = "e.g. Autolyse or Stretch and fold";
      input.addEventListener("input", () => {
        s[key] = type === "number" ? input.valueAsNumber : input.value;
        notice("");
        update();
      });
      card.append(lab, input);
    }
    $("stepsEditor").append(card);
  });
  update();
}
async function refresh() {
  records = await api("/api/methods");
  $("savedMethod").replaceChildren(new Option("Choose a method…", ""));
  records
    .sort((a, b) => a.method.name.localeCompare(b.method.name))
    .forEach((r) => $("savedMethod").add(new Option(r.method.name, r.id)));
  $("savedMethod").value = savedId ?? "";
}
$("methodName").addEventListener("input", () => {
  method.name = $("methodName").value;
  notice("");
  update();
});
$("startAt").addEventListener("input", update);
$("addStep").addEventListener("click", () => {
  if (method.steps.length >= 40)
    return notice("A method can contain up to 40 steps.", true);
  method.steps.push({ title: "", instructions: "", restMinutes: 0 });
  renderSteps();
  $(`step-${method.steps.length - 1}-title`).focus();
});
$("undoStep").addEventListener("click", () => {
  if (removed) {
    method.steps.splice(
      Math.min(removed.index, method.steps.length),
      0,
      removed.step,
    );
    removed = null;
    $("undoStep").hidden = true;
    renderSteps();
  }
});
$("newMethod").addEventListener("click", () => {
  if (!guard(dirty)) return;
  method = {
    name: "",
    steps: [{ title: "", instructions: "", restMinutes: 0 }],
  };
  baseline = structuredClone(method);
  savedId = null;
  $("savedMethod").value = "";
  renderSteps();
  notice("New method.");
});
$("savedMethod").addEventListener("change", () => {
  const selected = records.find((r) => r.id === $("savedMethod").value);
  if (!selected) return;
  if (!guard(dirty)) {
    $("savedMethod").value = savedId ?? "";
    return;
  }
  savedId = selected.id;
  method = validateMethod(selected.method);
  baseline = structuredClone(method);
  renderSteps();
  notice("Method opened.");
});
$("saveMethod").addEventListener("click", async () => {
  try {
    const snapshot = validateMethod(method);
    busy = true;
    update();
    const r = await post("/api/methods", {
      id: savedId ?? undefined,
      method: snapshot,
    });
    savedId = r.id;
    baseline = r.method;
    await refresh();
    notice("Method saved. Existing recipes keep their selected version.");
  } catch (e) {
    notice(e.message, true);
  } finally {
    busy = false;
    update();
  }
});
$("duplicateMethod").addEventListener("click", () => {
  method.name = `${method.name.slice(0, 110)} (copy)`;
  savedId = null;
  baseline = null;
  $("savedMethod").value = "";
  renderSteps();
  notice("New copy. Give it a name and save.");
});
$("downloadMethod").addEventListener("click", () => {
  try {
    download("bread-method.json", { method: validateMethod(method) });
  } catch (e) {
    notice(e.message, true);
  }
});
$("importMethod").addEventListener("change", async () => {
  try {
    const f = $("importMethod").files[0];
    if (!f) return;
    if (f.size > 524288) throw Error("File is too large.");
    const json = JSON.parse(await f.text()),
      next = validateMethod(json.method ?? json);
    if (!guard(dirty)) return;
    method = next;
    baseline = null;
    savedId = null;
    renderSteps();
    notice("Method imported. Save to keep it.");
  } catch (e) {
    notice(e.message, true);
  } finally {
    $("importMethod").value = "";
  }
});
guardUnload(() => dirty);
renderSteps();
refresh()
  .then(update)
  .catch((e) => notice(e.message, true));
