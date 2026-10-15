# Bread calculator

Private bread dough calculator, reusable methods and bake results for Ben. Independently written, inspired by BRDCLC. No analytics, third-party scripts or runtime package dependencies.

Live on Tailscale: [Calculator](https://bread.tail10db36.ts.net) · [Methods](https://bread.tail10db36.ts.net/methods) · [Bake log](https://bread.tail10db36.ts.net/bakes).

## Everyday use

**Calculator:** edit ingredient percentages or grams; both units are visible on every row. Percentages use flour added to the bowl. Total hydration includes starter flour and water. Scale a batch, choose its method and save. Existing saved recipes reopen from the list at the top. The saved recipe ID stays in a short URL across reloads; unsaved formula drafts are retained in this browser tab. Duplicate is an explicit action under the secondary controls and gives the new recipe a different name.

There is one main save action. With **Save in Mealie too** checked, choose the method in the confirmation dialog; saving keeps the editable recipe here and creates or updates its linked Mealie recipe. With the checkbox off, only the calculator copy is saved. Methods can be omitted for an ingredients-only recipe.

**Methods:** build ordered actions with instructions and a rest after each step, in minutes. Reorder steps, undo a removal and preview elapsed time or a schedule from a chosen start time. Rest totals exclude hands-on time and do not predict fermentation. Save named methods to reuse across recipes. Each recipe retains a snapshot of the method selected at save time; choosing an updated library method is explicit.

**Bake log:** record the recipe and method actually used, room/dough temperatures in °C, actual bulk and proof times in minutes, optional batch weight, 1–5 ratings, observations and what to change next time. A method can be changed for one bake without editing the recipe or Mealie. Past entries retain their full weighed formula and method version; both can be inspected. Compare method versions, filter by recipe and export CSV. Unrated or missing measurements are excluded from averages. These are descriptive comparisons, not controlled experiments or claims about an optimal method.

The default formula is Ben’s recipe: 1,000 g added flour, 750 g water, 20 g salt and 200 g starter at 100% hydration. It weighs 1,970 g and has **77.2727% total water hydration**. Portions are raw dough weights, not baked weights. Calculations retain full precision; weights are displayed to 0.1 g.

Old BRDCLC query links remain compatible. `starter` and `poolish` are combined with `leaven`; they share a single adjustable hydration. The calculator does not infer different flour absorption or yeast substitutions. See [research.md](docs/research.md).

## Storage and Mealie

The calculator owns editable formulas, reusable methods and bake records. Mealie is a linked recipe destination. Its ingredients and chosen method steps are updated when you save with the checkbox enabled. Formula and method snapshots are also stored in the linked recipe’s `extras.breadCalculator` metadata. Mealie-only tags, photos, categories and other fields are preserved. Ingredient weights are plain text in Mealie; scale them in this calculator. Edits made directly to Mealie ingredients or instructions are not pulled back here.

The backend uses the installed **Mealie v3.10.2** API: first creation uses `POST /api/recipes/create/html-or-json`, then subsequent saves use `PATCH /api/recipes/{slug}`. A stored immutable Mealie ID guards the link. If a linked recipe is renamed in Mealie, its ID is used to resolve the new slug. If it is removed or its identity changes, the app stops instead of creating another copy or overwriting a different recipe.

Existing exports from v1 are linked on first save only when their original name and exact weighed ingredients identify one Mealie recipe. Ambiguous matches stop with a message. A new calculator recipe cannot silently duplicate an existing Mealie name. A failed creation/update retains its link or pending attempt before retrying, avoiding duplicate creates. Unchanged saves do not repeat the update. No recipes are deleted by this app.

`MEALIE_URL` and `MEALIE_TOKEN` remain backend-only environment variables. On altamacmini Ben approved reuse of the existing server-side credential; the backend connects to `http://mealie:9000` over the existing `web` Docker network. The browser receives only a configured flag. Redirects are refused. Keep the app private on Tailscale; it has no separate account system.

## Data and backups

The Compose volume contains recipe JSON files at its root, methods in `methods/` and bake logs in `bakes/`. Files are atomically replaced. Existing recipe files require no bulk migration; optional method fields default to empty. Method changes cannot rewrite previous recipe or bake snapshots. This is a household tool; later saves to the same item win.

Download a recipe or method individually, or download the full JSON archive of recipes, methods and bakes. Full archive restoration is currently an operator task; the recipe and method import controls accept their individual exported files. Bake CSV is also available for spreadsheet analysis. Protected volume backups are the recovery source for server operations; scheduling and a restore drill remain [issue #2](https://github.com/altamashka/bread-calculator/issues/2).

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

The container runs as an unprivileged user, with a read-only root filesystem, dropped capabilities, resource limits, a persistent volume and an HTTP healthcheck. The published port binds loopback only. Watchtower is disabled. See [deployment.md](docs/deployment.md) for the exact server rollout, protected backups and rollback. Preserve the backend token when updating `BREAD_REVISION`.
