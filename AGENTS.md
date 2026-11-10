# Working on Bread Bench

## Code and validation

Read [README.md](README.md) and [docs/research.md](docs/research.md).

- Keep shared calculations in `public/math.mjs`, method validation in `public/methods-model.mjs`, and bake records/comparisons in `public/bakes-model.mjs`.
- Preserve recipe and bake method snapshots when library definitions change.
- Use Node's built-in test runner; no runtime dependencies are needed. Test known recipes, mass balance, arbitrary starter hydration and batch scaling.
- Run `npm test` and Docker checks. Test with isolated preview data and mock Mealie before touching the live store. Never add synthetic methods or bake results to production.

## Mealie

Keep integration changes in `mealie.mjs`. Check the installed schema first. Preserve remote identity, unrelated metadata, retry links and duplicate-name guards. Never silently overwrite recipes or replace a missing link by blindly creating another recipe.

## Safety

Keep credentials and recipe data out of Git, images, logs and browser code. Preserve loopback binding, private HTTPS and the non-root container. No sudo. Ask Ben before access changes, personal data deletion or server administrator operations.

Do not add automatic fermentation predictions or unlabelled flour hydration recommendations. Do not alter other workspace repositories or restart unrelated services.

## Delivery

Use `codex/` branches and PRs. Review the staged diff and push only explicit files. Record follow-up work in GitHub Issues.
