# Calculation research — 2026-10-15

## Reference behavior

Inspected the live HTML and JavaScript of [BRDCLC](http://brdclc.com/?flour=1000&water=75&salt=2&leaven=20). It calculates ingredient weights relative to added flour, supports grams and percentages, scales flour, stores settings in URL parameters, adds optional ingredients and reports total dough weight and hydration. Its leaven, poolish and starter are all assumed to be 100% hydration. Milk counts fully as liquid; eggs, butter and honey do not contribute hydration. Its default starter split expression only works at 100% hydration and is not reused here. No original source or assets are copied into this repository.

Bread Bench preserves the familiar added-flour basis, with explicit labels, and adds adjustable starter hydration, flour blending, target hydration, target batch weight, portions, persistent saved recipes, notes and export. It uses grams rather than approximate cup conversions. Multiple preferments are folded into one combined starter when importing old links.

## Sources and conventions

- [King Arthur: Hydration in bread dough](https://www.kingarthurbaking.com/blog/2023/01/11/bread-hydration): include flour and water in sourdough preferments; flour type changes absorption and handling, not the ratio’s definition. Other liquids can be counted conventionally; eggs and butter are usually excluded from the reported bread hydration despite containing water.
- [King Arthur: Baker’s math](https://www.kingarthurbaking.com/blog/2022/04/28/what-is-bakers-math-and-how-can-i-use-it-in-my-everyday-bread-baking): ingredient percentages express mass relative to flour. Prefermented flour is distinct from starter mass.
- [King Arthur: Stiff starter](https://www.kingarthurbaking.com/blog/2015/10/13/artisan-sourdough-bread-tips-part-1): a 50% hydration starter has twice as much flour as water by mass.
- [Mealie API guide](https://mealie.io/documentation/getting-started/api-usage/): long-lived tokens are created in the profile; the installed instance’s `/docs` and `/openapi.json` describe its actual API.
- The installed Mealie instance returned version v3.10.2 on 2026-10-15. Its schema requires `ScrapeRecipeData.data` as a string at `/api/recipes/create/html-or-json`. This differs from newer upstream API routes; use the installed schema, not an assumed current upstream endpoint.
- [Schema.org Recipe](https://schema.org/Recipe) defines the exported recipe representation. No external service is needed to generate it.

## Equations

Let F be added flour, p the starter percentage relative to F, h starter hydration as a ratio (100% = 1), and S = F × p / 100.

- Starter flour = S / (1 + h).
- Starter water = S − starter flour.
- Total flour = F + starter flour.
- Total water = added water + starter water.
- Total water hydration = 100 × total water / total flour.
- Conventional liquid hydration = 100 × (total water + milk mass) / total flour, shown separately when milk is present.
- Prefermented flour percentage = 100 × starter flour / total flour.
- Total-flour salt percentage = 100 × salt / total flour.
- Dough mass = added flour + every weighed ingredient including the entire starter once.
- Scaling factor = target dough mass / present dough mass; multiply F by this factor, retaining percentages.
- Added water for target hydration H = total flour × H / 100 − starter water. A negative result is impossible and rejected.

The flour blend describes added flour only. Starter flour type is not inferred. No automatic absorption multiplier is applied to whole wheat or rye. No universal hydration range or yeast/starter substitution is prescribed. Flour behavior, fermentation temperature, starter maturity and technique vary. Enriched dough’s reported water hydration is not an estimate of its total chemical water content. Poolish and biga yeast contributions are not modeled separately.

## Worked examples

Ben: F=1,000, water=750, salt=20, starter=200 at 100%. Total flour=1,100, water=850, dough=1,970, hydration=77.2727%, prefermented flour=9.0909%, salt/total flour=1.8182%.

King Arthur’s hydration article: 500 g added flour, 375 g water and 100 g starter at 100%. Total flour=550, total water=425; hydration=77.2727%.

With 200 g starter at 50%, starter flour=133.3333 g and starter water=66.6667 g, not an equal split.

## Methods and bake records

[King Arthur’s bulk fermentation guide](https://www.kingarthurbaking.com/blog/2019/07/22/bulk-fermentation) discusses folds within bulk fermentation and the importance of dough condition. Its [sourdough baking guide](https://www.kingarthurbaking.com/learn/guides/sourdough/bake) explains the flour-and-water autolyse. These support collecting actual temperatures, fermentation durations and observations rather than treating a fixed timer as a prediction.

Storage is a product design choice: formulas and reusable method definitions live in separate collections; a recipe captures the chosen method version, and a bake captures the formula and method actually used. Editing a library method cannot change the apparent procedure of an earlier bake. Method comparisons group by their full saved steps, not just an unchanged name, exclude missing ratings and expose sample counts and temperature/hydration context. The app does not infer causal effects or recommend fermentation timings from small samples.

Mealie is a one-way, linked destination, not a second method library. The installed 3.10.2 schema supports partial recipe PATCH with native `recipeInstructions` step `title`, `summary` and `text` fields. The app updates only its managed recipe fields and merges its namespaced extras into existing extras. It retains the remote recipe ID and slug; legacy linking requires one exact name-and-ingredient match. This addresses the original export-only workflow’s inability to update a recipe without copies.

## Additional reference: breadcalc spreadsheet

Ben supplied [breadcalc](https://docs.google.com/spreadsheets/d/1xGGlesIknh4VE1UL9jeBnUatF8gWRAlbvTgt-FbFx6c/edit#gid=1837644571). Read all four tabs and the bounded calculation cells on 2026-10-15; the source was not edited or copied into the app.

The Dough Calculator separates total ingredients, ripe starter, levain build and the main-dough additions. Its percentages use total flour, unlike this app's explicitly labelled added-flour input basis. At its displayed 3,600 g batch, 80% hydration and 2% salt, total flour is 3,600/1.82 = 1,978.02 g. Its 396 g levain contains about 198 g flour, or 10% prefermented flour. Compare formulas by total hydration and prefermented flour, not by assuming a displayed starter percentage has the same denominator.

The Discard Calculator models discard and a yeasted preferment separately. This is useful inspiration for a future multi-build formula model; it must account for seed flour/water and preferment yeast exactly once. The current combined-starter model cannot represent those builds independently.

The tracker separates method actions from actual observations: temperatures, bulk rise, ambient/cold proof, oven stages and optional pH. This supports the app's separate method library and immutable bake snapshots. Future optional measurements should stay collapsed so recording a simple result remains quick. Its example pH targets and fixed timings are examples, not defaults or recommendations for Ben's dough.

The Dough temperature tab calculates water temperature as 4 × desired dough temperature − levain − flour − room − friction factor. Its shown inputs give 30°C water. [King Arthur's desired dough temperature guide](https://www.kingarthurbaking.com/blog/2018/05/29/desired-dough-temperature) describes the three-factor calculation without a preferment and four-factor calculation with one, and notes that friction varies with the mixing process. A future helper should describe this as an estimate, take measured inputs and compare the resulting mixed-dough temperature; it is not a heat-capacity model or fermentation prediction.

Live acceptance found that Mealie 3.10.2's open `extras` API schema permits nested objects, but its SQLite extras value column does not: a nested object produces HTTP 500. Store the namespaced snapshot as JSON text. Integration tests reject non-text extras to match this installed behavior. Failed PATCH retained the linked identity; no duplicate recipe was created.
