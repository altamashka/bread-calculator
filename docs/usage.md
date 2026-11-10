# User guide

[Back to README](../README.md)

## Calculate and save

Edit grams or percentages directly; both remain visible. Percentages use flour added to the bowl. Total hydration includes starter flour and water. Weights display to 0.1 g; calculations keep full precision. Portions are raw dough weights.

The default is 1,000 g added flour, 750 g water, 20 g salt and 200 g starter at 100% hydration: 1,970 g dough and 77.2727% total water hydration.

Use **Flour blend and starter hydration** beside flour weight to set white, whole-wheat and rye percentages. White is the remainder. Save named blends for reuse across devices, then apply them explicitly. Updating a preset does not change existing recipes or bake snapshots. Starter hydration and flour composition are independent.

Open saved recipes from the top list. **Save in Mealie too** adds a method confirmation dialog and creates or updates the linked Mealie recipe; leave it unchecked to save only here. A method is optional. **Duplicate** under the secondary controls creates a separately named recipe. On phones, the fixed action bar keeps Save and local/Mealie status visible. Sync status records the last successful export, not live edits in Mealie.

**Plan your water temperature** estimates mixing water temperature from measured room, flour and starter temperatures and your mixing factor. Calibrate that factor from a completed mix. All temperatures use °C. The helper is separate from the formula and does not predict fermentation.

Old BRDCLC links still work: `starter`, `poolish` and `leaven` become one starter with one hydration. Flour absorption and yeast substitutions are not inferred. See [calculation rules](research.md).

## Build a method

Create ordered actions with instructions and a planned rest after each, in minutes. Reorder steps, undo a removal and preview elapsed time or a schedule. Rest totals exclude hands-on time.

Assign ingredients to actions as percentages of their full recipe quantities: for example, 90% of the water at autolyse and 10% later. Assignments must total at most 100% per ingredient; the remainder stays in optional **Preparation**. Flour assignments apply to every added flour type. Absent ingredients are skipped; starter is weighed whole at its saved hydration.

Save a named method for reuse. Recipes retain the method version selected when saved. Select and save an updated library method explicitly to use its new steps or ingredient assignments in future bakes.

## Follow a bake

Open a saved recipe and choose **Bake with this recipe** (**Bake** on phones). The current action leads the view, with its ingredient portions and timeline. Preparation is optional; weighing ahead never blocks the method. The full ingredient list remains available, and checking portions cannot change the formula.

Choose **Start action now**, then **Finish action / start rest**, or enter actual times later. A planned rest starts when its action finishes, including the final action's rest. The view shows actual starts/finishes, the next due time and elapsed/remaining rest. Browsing steps records no time; corrections update the schedule. Dates use your device's local time, and saved timestamps keep clocks correct after reload.

Planned rests do not predict readiness. Check the dough before continuing. This page does not send phone alarms.

Each bake keeps its starting formula and method. Portion checks, times, position and notes save to the server; resume from the bake log on any device. Multiple bakes can run for one recipe. **Start a new bake** captures the latest saved recipe separately. Retry failed saves in the workspace; older tab-local sessions can migrate to server storage.

**Record bake result** carries the captured formula, method and action times into the result. Copy bake notes into observations explicitly. Action timestamps stay separate from manually recorded fermentation and step durations. If a bake snapshot is missing, select a recipe explicitly.

## Record and compare results

Record the actual recipe and method, temperatures in °C, bulk/proof times in minutes, optional batch weight, 1–5 ratings, observations and next changes. You can change the method for one result without editing the recipe or Mealie. Past formulas and methods remain inspectable.

Optional sections cover bulk rise, fridge temperature, room/cold proof, oven stages, per-step time, dough temperature, measured pH and notes. Separate proof times replace the total with their sum. Step durations include rest and never add to bulk/proof automatically.

Filter history by recipe, compare method versions or export CSV. Missing measurements and ratings are excluded from averages. Comparisons describe recorded bakes; they do not establish causes or an optimal method.

## Drafts, sharing and backups

Saved recipe URLs reopen the server record. Unsaved formula drafts remain in the current tab. Method and result forms offer explicit draft recovery; restoration does not save to the server or silently replace an opened recipe/bake snapshot. Browser storage may be unavailable and is not a backup.

Unsaved share links contain the formula, notes and selected method. Save or download long drafts. Keep secrets out of notes and protect downloaded files containing personal observations.

Download recipes or methods individually, a bake CSV, or a full JSON archive containing recipes, methods, flour blends, bake sessions and results. Individual recipe/method files can be imported; full archive restoration is an operator task. Every optional measurement is included in JSON and CSV.

The data volume stores recipes at its root and other records in `methods/`, `blends/`, `bake-sessions/` and `bakes/`. Writes replace files atomically; later saves to the same item win. Existing recipes need no bulk migration, and library edits cannot rewrite historical snapshots.

Nightly volume backups run at 03:30 Berlin time and retain 30 automatic copies. They protect against local mistakes, not loss of the host disk. See [backup and recovery](deployment.md#scheduled-backups).
