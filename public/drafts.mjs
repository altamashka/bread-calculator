// Tab-local recovery only; saving a draft never writes to the server.
export function readDraft(key, storage) {
  try {
    storage ??= globalThis.sessionStorage;
    const draft = JSON.parse(storage.getItem(key) ?? "null");
    return draft?.version === 1 ? draft.value : null;
  } catch { return null; }
}
export function writeDraft(key, value, storage) {
  try {
    storage ??= globalThis.sessionStorage;
    storage.setItem(key, JSON.stringify({ version: 1, value }));
    return true;
  } catch { return false; }
}
export function draftRecovery({ key, element, capture, restore, isDirty }) {
  let pending = readDraft(key), ready = false;
  if (!pending?.dirty) pending = null;
  const track = () => {
    if (ready && !pending && !writeDraft(key, capture())) {
      element.hidden = false;
      element.textContent = "Draft recovery is unavailable in this browser. Save your work or keep this page open.";
    }
  };
  return {
    track,
    start() {
      ready = true;
      if (!pending) return track();
      element.hidden = false;
      const text = document.createElement("p");
      text.textContent = "An unsaved draft is available in this tab. Restore it, or keep the form below.";
      const recover = document.createElement("button");
      recover.textContent = "Restore draft";
      recover.addEventListener("click", () => {
        if (isDirty() && !confirm("Replace the current unsaved form with the recovered draft?")) return;
        const value = pending;
        try {
          restore(value);
          pending = null;
          element.hidden = true;
          track();
        } catch {
          text.textContent = "This draft could not be restored. The saved records have not changed. You can keep the form below.";
        }
      });
      const discard = document.createElement("button");
      discard.textContent = "Keep current form";
      discard.addEventListener("click", () => {
        pending = null;
        element.hidden = true;
        track();
      });
      element.replaceChildren(text, recover, discard);
    },
  };
}
