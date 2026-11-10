# Mealie integration

[Back to README](../README.md)

## Setup

Bread Bench owns editable formulas, methods and bake records. Mealie receives a linked copy; edits made in Mealie are not imported back. Scale and save recipes here to keep both copies aligned. This app never deletes Mealie recipes.

Set `MEALIE_URL` and `MEALIE_TOKEN` in the protected backend environment. The browser receives only a configured flag; redirects are refused. The recorded server setup uses `http://mealie:9000` on the Docker `web` network and Ben's authorized existing credential. New credentials or access changes require Ben's approval. Keep the app private: it has no separate account system.

Create the **Bread** category in Mealie before the first sync. If it is missing, the local recipe is retained and no remote recipe is created. See [server operations](deployment.md) before changing configuration.

## What a save does

With **Save in Mealie too** checked, a save updates weighed ingredients and the chosen method. It also stores formula/method snapshots as JSON text in `extras.breadCalculator`.

- White, whole-wheat and rye flour have separate rows. Numeric gram quantities use food/unit references; starter hydration is a separate note.
- Exact food names and the gram unit are reused; missing entries are created. Ambiguous matches stop the save.
- Bread is added without removing other categories, tags, photos or unrelated metadata.
- Older text-only ingredients are upgraded in place on the next save. Unchanged saves skip updates unless Bread needs restoring.

Bread Bench keeps full precision; the installed Mealie stores quantities to three decimals. Downloaded JSON-LD retains readable weighed strings.

## Identity and retries

The stored immutable Mealie ID guards every link. Renames resolve the new slug by ID. A deleted recipe or mismatched identity stops sync rather than creating a replacement or overwriting another recipe.

Legacy v1 exports link only when the original name and exact weighed ingredients identify one recipe. Ambiguous matches and duplicate names stop with a message. Explicit duplication needs a different name.

Failed creates retain the pending attempt; failed updates retain the link. Retrying must not create duplicates. Upstream errors return a safe 502 with only the upstream status, never response bodies or recipe data.

## Installed API requirements

These findings apply to **Mealie v3.10.2**, inspected on 2026-10-15 and rechecked on 2026-10-31. Check the installed `/openapi.json` before integration changes.

| Area | Required behavior |
| --- | --- |
| Create/update | `POST /api/recipes/create/html-or-json` with `ScrapeRecipeData.data` as a string; later `PATCH /api/recipes/{slug}` |
| Snapshots | Store JSON text in extras: nested objects pass the schema but fail in SQLite |
| Instructions | Use `title`, `summary`, `text` and explicit `ingredientReferences: []`; omitting the array causes HTTP 500 |
| Categories | Resolve `GET /api/organizers/categories/slug/bread`; send only `{id, name, slug}` references |
| Category ownership | Never echo organizer fields such as `groupId: null`; they can corrupt the PATCH and produce a misleading duplicate error |
| Foods/units | Paginate `/api/foods` and `/api/units`; match names case-insensitively and exactly; after a concurrent-create conflict, retry one exact lookup |

Keep changes in [mealie.mjs](../mealie.mjs), merge namespaced extras and preserve unrelated fields. Use shared `weighedIngredients` masses, not parsed display strings or remote NLP. Keep starter flour/water inside the single starter row. Export-format hash changes trigger one upgrade save; food/unit references must omit unrelated library metadata. Test isolated preview data against mock Mealie before live writes. Mocks cover these installed quirks, identity, retries, category preservation and ingredient migration.

References: [Mealie API guide](https://mealie.io/documentation/getting-started/api-usage/), [Schema.org Recipe](https://schema.org/Recipe).
