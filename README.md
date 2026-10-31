# Bread calculator

Private bread dough calculator, reusable methods and bake results for Ben. Independently written, inspired by BRDCLC. No analytics, third-party scripts or runtime package dependencies.

Live on Tailscale: [Calculator](https://bread.tail10db36.ts.net) · [Methods](https://bread.tail10db36.ts.net/methods) · [Bake log](https://bread.tail10db36.ts.net/bakes).

## Everyday use

**Calculator:** edit ingredient percentages or grams; both units are visible on every row. Percentages use flour added to the bowl. Total hydration includes starter flour and water. Scale a batch, choose its method and save. Existing saved recipes reopen from the list at the top. The saved recipe ID stays in a short URL across reloads; unsaved formula drafts are retained in this browser tab. Duplicate is an explicit action under the secondary controls and gives the new recipe a different name.

On phones, a fixed action bar keeps Save, unsaved state and the last successful Mealie sync state reachable. The flour breakdown is visible above the ingredients. There is one main save action. With **Save in Mealie too** checked, choose the method in the confirmation dialog; saving keeps the editable recipe here and creates or updates its linked Mealie recipe. With the checkbox off, only the calculator copy is saved. Methods can be omitted for an ingredients-only recipe.

The optional **Plan your water temperature** helper estimates mixing water temperature from measured room, flour and starter temperatures and your own mixing factor. It can calculate that factor from a completed mix. All temperatures use °C; the helper does not change the recipe or predict fermentation.

**Bake view:** open a saved recipe and choose **Bake with this recipe** (or **Bake** in the phone action bar). Weigh ingredients with a checklist or one ingredient at a time, then follow the method and mark completed steps. Desktop shows ingredients and the current method step side by side, with the full step list below. Phones use compact Weigh/Method controls. Checking things off cannot edit the formula. A tab-local snapshot keeps the formula and method you started with, even if the saved recipe or method library changes. Reloading or returning in that tab restores progress. **Start a new bake** explicitly captures the latest saved recipe and resets progress. **Record bake result** carries the captured formula and method into the bake log; planned rests and checked steps are not automatically converted into actual fermentation times.

**Methods:** build ordered actions with instructions and a rest after each step, in minutes. Reorder steps, undo a removal and preview elapsed time or a schedule from a chosen start time. Rest totals exclude hands-on time and do not predict fermentation. Save named methods to reuse across recipes. Each recipe retains a snapshot of the method selected at save time; choosing an updated library method is explicit.

**Bake log:** the recording form appears first, with essential measurements and notes before optional detail. Record the recipe and method actually used, room/dough temperatures in °C, actual bulk and proof times in minutes, optional batch weight, 1–5 ratings, observations and what to change next time. A method can be changed for one bake without editing the recipe or Mealie. Past entries retain their full weighed formula and method version; both can be inspected. Compare method versions, filter by recipe and export CSV. Unrated or missing measurements are excluded from averages. These are descriptive comparisons, not controlled experiments or claims about an optimal method. Optional sections collect bulk rise, fridge temperature, separate room/cold proof times, oven settings and per-step actual time, dough temperature, measured pH and notes. Separate proof times sum to the total; step times never add to bulk/proof automatically. All optional fields are included in the JSON backup and CSV export.

The default formula is Ben’s recipe: 1,000 g added flour, 750 g water, 20 g salt and 200 g starter at 100% hydration. It weighs 1,970 g and has **77.2727% total water hydration**. Portions are raw dough weights, not baked weights. Calculations retain full precision; weights are displayed to 0.1 g.

In **Flour blend and starter hydration**, save named white/whole-wheat/rye blends for reuse across recipes and devices. White flour is the remainder of the added flour. Select a blend and apply it explicitly, or update the selected preset from the current percentages. Recipes and bake snapshots retain their own percentages when presets change. Full JSON archives and volume backups include presets. Starter flour composition and hydration are independent.

Old BRDCLC query links remain compatible. `starter` and `poolish` are combined with `leaven`; they share a single adjustable hydration. The calculator does not infer different flour absorption or yeast substitutions. See [research.md](docs/research.md).

## Storage and Mealie

The calculator owns editable formulas, reusable methods and bake records. Mealie is a linked recipe destination. Its ingredients and chosen method steps are updated when you save with the checkbox enabled. Formula and method snapshots are also stored in the linked recipe’s JSON text in `extras.breadCalculator` metadata. Every Mealie save assigns the existing **Bread** category and preserves any other categories, tags, photos and unrelated fields. Create the Bread category in Mealie before the first sync; if it is missing, the calculator copy is retained and no remote recipe is created. Added white, whole-wheat and rye flours are exported as separate weighed ingredient rows from the saved recipe percentages. Mealie receives numeric gram quantities, food/unit references and separate starter-hydration notes, ready for its ingredient editor and scaling. The backend reuses exact existing food names and the gram unit, creating missing entries; ambiguous food matches stop rather than guessing. Its next save upgrades an older text-only export in place. Bread Bench remains the source of the formula; save scaling changes here to keep both copies aligned. Edits made directly to Mealie ingredients or instructions are not pulled back here.

The backend uses the installed **Mealie v3.10.2** API: first creation uses `POST /api/recipes/create/html-or-json`, then subsequent saves use `PATCH /api/recipes/{slug}`. A stored immutable Mealie ID guards the link. If a linked recipe is renamed in Mealie, its ID is used to resolve the new slug. If it is removed or its identity changes, the app stops instead of creating another copy or overwriting a different recipe.

Existing exports from v1 are linked on first save only when their original name and exact weighed ingredients identify one Mealie recipe. Ambiguous matches stop with a message. A new calculator recipe cannot silently duplicate an existing Mealie name. A failed creation/update retains its link or pending attempt before retrying, avoiding duplicate creates. Unchanged saves do not repeat the update when Bread is already assigned; a later save restores Bread if it was removed. No recipes are deleted by this app.

`MEALIE_URL` and `MEALIE_TOKEN` remain backend-only environment variables. On altamacmini Ben approved reuse of the existing server-side credential; the backend connects to `http://mealie:9000` over the existing `web` Docker network. The browser receives only a configured flag. Redirects are refused. Keep the app private on Tailscale; it has no separate account system.

## Data and backups

The Compose volume contains recipe JSON files at its root, methods in `methods/`, flour blends in `blends/` and bake logs in `bakes/`. Files are atomically replaced. Existing recipe files require no bulk migration; optional method fields default to empty. Method changes cannot rewrite previous recipe or bake snapshots. This is a household tool; later saves to the same item win.

Unsaved method and bake-result forms are retained in the current browser tab. After reload or return, a recovery banner lets you restore the earlier draft or keep the current form. Restore never writes to the server until you save; an explicit recipe or baking-snapshot link is not silently replaced by a draft. Browser storage can be unavailable and tab-local data is not a backup.

Download a recipe or method individually, or download the full JSON archive of recipes, methods, flour blends and bakes. Full archive restoration is currently an operator task; the recipe and method import controls accept their individual exported files. Bake CSV is also available for spreadsheet analysis. Protected volume backups run nightly at 03:30 Berlin time and keep 30 automatic copies. An isolated restore drill verified recipes, Mealie identities and historical method/bake snapshots. See [backup and recovery](docs/deployment.md#scheduled-backups-configured-2026-10-16). These are same-host backups; off-host protection is separate.

Saved links identify a server recipe. Unsaved share links include the formula, notes and selected method; long drafts must be saved or downloaded as files. Do not put secrets in notes. Browser draft storage is not a backup and is cleared with the tab/browser session. Downloaded archives and CSV contain personal baking notes; protect them accordingly.

## Development and Docker

Use Node 24 or newer. No package installation is required.

```sh
npm test
npm start
```

Open http://127.0.0.1:8080. `HOST`, `PORT` and `DATA_DIR` override defaults. Local `data/` is ignored.

```sh
docker compose config --quiet
docker compose up -d --build bread-calculator
docker compose ps
curl -fsS http://127.0.0.1:8078/healthz
```

The container runs as an unprivileged user, with a read-only root filesystem, dropped capabilities, resource limits, a persistent volume and an HTTP healthcheck. The published port binds loopback only. Watchtower is disabled. Automatic tested-image publishing and a host updater are prepared; server activation is pending approval. See [deployment.md](docs/deployment.md) for the exact server rollout, protected backups and rollback. Preserve the backend token when updating `BREAD_REVISION`.
