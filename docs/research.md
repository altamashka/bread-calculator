# Calculations and research

[Back to README](../README.md) · [Mealie API findings](mealie.md) · [Interface design](interface-design.md)

## Calculation rules

Shared calculations live in `public/math.mjs`. Input percentages use **added flour**; reported total hydration includes starter flour and water. Use grams, not approximate cup conversions.

Let F be added flour, p the starter percentage, h starter hydration as a ratio (100% = 1), and S = F × p / 100.

| Quantity | Equation |
| --- | --- |
| Starter flour | S / (1 + h) |
| Starter water | S − starter flour |
| Total flour | F + starter flour |
| Total water | Added water + starter water |
| Total water hydration (%) | 100 × total water / total flour |
| Conventional liquid hydration (%) | 100 × (total water + milk mass) / total flour |
| Prefermented flour (%) | 100 × starter flour / total flour |
| Salt on total flour (%) | 100 × salt / total flour |
| Dough mass | Added flour + every weighed ingredient, counting the whole starter once |
| Batch scaling factor | Target mass / current mass; multiply F, retaining percentages |
| Added water for target hydration H | Total flour × H / 100 − starter water; reject negative results |

Milk counts fully in the separately labelled conventional liquid hydration. Eggs, butter and honey do not contribute to reported water hydration; this is not total chemical water content. Flour blends describe added flour only. Starter flour type is not inferred. There are no automatic absorption multipliers, universal hydration targets or yeast substitutions. Separate poolish/biga builds and their yeast are not modeled.

## Known examples

| Formula | Result |
| --- | --- |
| Default: 1,000 g flour, 750 g water, 20 g salt, 200 g starter at 100% | 1,100 g total flour; 850 g total water; 1,970 g dough; 77.2727% hydration; 9.0909% prefermented flour; 1.8182% salt on total flour |
| King Arthur: 500 g flour, 375 g water, 100 g starter at 100% | 550 g total flour; 425 g total water; 77.2727% hydration |
| 200 g starter at 50% | 133.3333 g flour and 66.6667 g water |

Tests cover these conventions, mass balance, arbitrary starter hydration and batch scaling.

## Water temperature and measurements

The conventional estimate is `n × target − room − flour − starter (if present) − friction`, with n = 3 without starter and 4 with starter. Reverse it to calibrate friction from measured water and final dough temperatures. All inputs use °C; friction is a temperature difference, so Fahrenheit conversion must not add a 32°F offset.

The helper stays separate from the formula. It supplies no default dough target or mixer factor and is neither a heat-capacity model nor a fermentation prediction.

Bake records collect observations rather than prescribe targets: bulk rise, fridge temperature, room/cold proof, oven stages, measured pH and per-step notes. Separate proof stages replace the total with their sum. Manual step durations include rest but never add to bulk/proof automatically.

Sources: King Arthur's [desired dough temperature](https://www.kingarthurbaking.com/blog/2018/05/29/desired-dough-temperature), [professional reference](https://www.kingarthurbaking.com/pro/reference/dough-temperature) and [friction calibration](https://www.kingarthurbaking.com/blog/2018/08/27/determining-the-friction-factor-in-baking), checked on 2026-10-15/16.

## Methods, snapshots and timing

Formulas and reusable methods are separate collections. A recipe captures its selected method; a bake captures the formula and method actually used. Library edits cannot rewrite those snapshots. Comparisons group by full saved steps, exclude missing ratings and show sample counts and temperature/hydration context. They do not establish causal effects.

Ingredient assignments are explicit percentages of each full recipe quantity. `ingredientPlan` calculates portions from the captured formula: all added flours share an allocation, starter stays whole, and unassigned amounts remain optional preparation. Older methods need no assignments or snapshot rewrite.

Actual starts/finishes are separate from planned rests and manual fermentation durations. A due time is **actual action finish + planned rest**, including the final step. Navigation records no times; unknown historical times stay unknown.

Clocks derive from persisted absolute timestamps and refresh when the page becomes visible, because [browser timers can be delayed or throttled](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout). Ticks update text without replacing focused fields. Corrections preserve untouched instants and milliseconds, including autumn daylight-saving ambiguity, and reject nonexistent spring times. Save/error messages follow [W3C status guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html); countdown ticks are not live announcements.

A page timer cannot guarantee a phone alarm after suspension. [WebKit's push requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) need a separate delivery design. That work remains in [issue #26](https://github.com/altamashka/bread-calculator/issues/26).

Fermentation sources: King Arthur's [bulk guide](https://www.kingarthurbaking.com/blog/2019/07/22/bulk-fermentation) and [autolyse/baking guide](https://www.kingarthurbaking.com/learn/guides/sourdough/bake). Check dough condition instead of treating planned rests as predictions.

## Reference tools

**BRDCLC**, inspected on 2026-10-15: [reference formula](http://brdclc.com/?flour=1000&water=75&salt=2&leaven=20). It uses added-flour percentages, gram/percentage editing, URL settings and 100%-hydration preferments. Bread Bench was written independently without copying source or assets. Imported preferments combine into one adjustable-hydration starter; the reference's fixed starter-split expression is not reused.

**Breadcalc spreadsheet**, all four tabs and bounded calculation cells read on 2026-10-15: [source](https://docs.google.com/spreadsheets/d/1xGGlesIknh4VE1UL9jeBnUatF8gWRAlbvTgt-FbFx6c/edit#gid=1837644571). It was neither edited nor copied into the app.

- Its dough percentages use total flour. A 3,600 g batch at 80% hydration and 2% salt has 1,978.02 g total flour; 396 g levain contains about 198 g flour, or 10% prefermented flour. Compare total hydration and prefermented flour, not raw starter percentages with different denominators.
- Its discard/preferment builds suggest a future multi-build model, which must count seed flour, water and yeast once. The current combined starter cannot represent separate builds.
- Its tracker informed optional observations and immutable methods. Example pH targets and timings are not app defaults. Its four-factor water-temperature example gives 30°C.

Calculation sources: King Arthur's [hydration](https://www.kingarthurbaking.com/blog/2023/01/11/bread-hydration), [baker's math](https://www.kingarthurbaking.com/blog/2022/04/28/what-is-bakers-math-and-how-can-i-use-it-in-my-everyday-bread-baking) and [stiff starter](https://www.kingarthurbaking.com/blog/2015/10/13/artisan-sourdough-bread-tips-part-1) guides.

## Validation record

The 2026-11-10 checks covered immutable snapshots, allocation validation, persisted timing and isolated server round trips. Synthetic browser checks covered staged portions, action/rest timing, navigation, recovery, time edits across tabs and layout changes, daylight-saving cases and method editing. Widths of 320, 390, 768, 1024 and 1440 CSS pixels showed no horizontal overflow. Recording advanced keyboard focus without scrolling; ticks preserved focus.

These were isolated-data checks, not physical-device tests or proof of background alarm delivery. See [interface validation](interface-design.md#validation) and [backup verification](deployment.md#scheduled-backups).
