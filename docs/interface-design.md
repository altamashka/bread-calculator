# Interface design — October 2026

Bread Bench is a working tool for editing formulas, following a bake and recording results. The redesign makes those tasks easier to scan while preserving the existing calculations, controls and saved-data behavior.

## Research and decisions

- **Give each task a clear visual hierarchy.** [NN/g's visual hierarchy guidance](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/) describes grouping, contrast and scale as ways to guide attention. The baking view now separates ingredient weighing from the current method step. Step navigation is compact and the main recording action has a consistent, contained location. Completed ingredients retain legible weights; checkmarks and softer text replace heavy strike-throughs.
- **Keep power available in context.** [NN/g's progressive disclosure guidance](https://www.nngroup.com/articles/progressive-disclosure/) addresses the tension between a simple starting view and specialist controls. Flour-blend editing moves next to flour weight. Less frequent import/export, optional measurements and calibration remain labelled and available. The bake form keeps overall result and the main measurements prominent; detailed spring/sourness ratings sit with the optional measurements. Percentages and grams stay together rather than becoming separate modes.
- **Use a shared grid and spacing system.** [Carbon's grid guidance](https://www.carbondesignsystem.com/building-blocks/foundations/2x-grid/overview) uses consistent units to establish visual rhythm. One token-based stylesheet replaces accumulated overrides. All pages share the same navigation, panels, control sizes, typography and primary/secondary actions. The journal uses the wider viewport to show recording and history together, with results reflowing to readable cards in narrower panels.
- **Preserve touch and keyboard access.** [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) informs generous primary touch targets. [W3C focus visibility guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) specifically identifies fixed action areas as a possible obstruction. The viewport reserves space for action bars; focus rings, scroll padding and control spacing are checked across phone, tablet and desktop widths. Native labels, checkboxes, progress elements and disclosure controls retain their semantics.

The implementation uses native controls and system fonts, without a framework, external assets, analytics or a runtime dependency.

## Capability preservation

The redesign retains all existing named controls and the following workflows:

- Percentage and gram editing, arbitrary starter hydration, flour blends and reusable presets.
- Batch/hydration scaling, portions, totals, mixing-water estimation and friction calibration.
- Recipe save/duplicate/share/import/export, full backup, printing and Mealie save/retry status.
- Method creation, reordering, removal/undo, schedules, snapshots, import and download.
- Checklist and one-ingredient weighing, current-step navigation, progress recovery and immutable baking snapshots.
- Bake measurements, per-step observations, oven stages, history filters, method comparisons and CSV export.
- Explicit draft recovery, local/Mealie status and guards against recording the wrong snapshot.

The current method step and actual timeline lead the live bake view. Ingredient portions appear at their assigned step; optional preparation never blocks the method. Explicit start and finish actions record actual timestamps, and the next planned due time follows the completed action’s rest. Browsing steps does not record time. Progress indicators reflect checked portions and completed steps only. They do not estimate fermentation or alter a formula. Short ingredient display labels do not change stored ingredient names or Mealie exports.

## Validation

Generated visual-review captures use isolated invented demonstration records, never production recipe content. Functional browser checks exercise existing editing and recording workflows alongside the new layout. Widths include 320, 390, 768, 1024 and 1440 CSS pixels; checks include open advanced sections, keyboard focus, fixed actions, overflow, empty states and long content. The existing Node test suite and Docker checks remain required.

Text colors were checked against their actual surfaces: primary text 12.26:1, secondary text 4.84:1, completed ingredients 5.16:1, primary-action text 8.10:1 and planned-rest notes 5.84:1. This is targeted validation, not a claim of a complete WCAG conformance audit or physical-device testing.
