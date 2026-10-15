# Working on Bread Bench

Read README.md and docs/research.md. Keep calculations in public/math.mjs so browser and backend agree. Test changes against known recipes, mass balance, arbitrary starter hydration and batch scaling. Use Node’s built-in test runner; no runtime dependencies are currently needed.

Keep credentials and recipe data out of Git, images, logs and browser code. Preserve loopback binding, private HTTPS access and the non-root container. No sudo. Ask Ben before access changes, personal data deletion or server administrator operations. No automatic fermentation predictions or unlabelled flour hydration recommendations.

Use codex/ branches and PRs. Run npm test and Docker checks. Record follow-up work in GitHub Issues. Review the staged diff and push explicit files. Do not alter other workspace repositories or restart unrelated services. Check the installed Mealie schema before changing API integration; never silently overwrite existing Mealie recipes.

Methods are validated in public/methods-model.mjs; bake records and comparisons in public/bakes-model.mjs. Keep recipe and bake method snapshots immutable when library definitions change. Mealie updates belong in mealie.mjs and must preserve remote identity, unrelated metadata, retry links and duplicate-name guards. Never replace a missing link by blindly creating another recipe. Test with isolated preview data and mock Mealie before touching the live recipe store; do not populate production with synthetic methods or bake results.
