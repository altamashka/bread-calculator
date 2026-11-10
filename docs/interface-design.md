# Interface design

[Back to README](../README.md)

## Design principles

Bread Bench puts formula editing, the current bake action and result recording first. It uses native controls, system fonts and one shared stylesheet, with no framework or external assets.

| Principle | Application | Reference |
| --- | --- | --- |
| Clear hierarchy | Current action and timeline lead the bake view; ingredient portions appear at their assigned step | [NN/g: visual hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/) |
| Details in context | Flour blends sit beside flour weight; imports, calibration and extra measurements stay labelled but secondary; grams and percentages remain together | [NN/g: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) |
| Consistent layout | Shared navigation, spacing, typography and actions; desktop recording/history columns become readable phone cards | [Carbon: grid](https://www.carbondesignsystem.com/building-blocks/foundations/2x-grid/overview) |
| Accessible controls | Generous touch targets, visible focus and reserved space around fixed action bars | W3C: [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [unobscured focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) |
| Visible state | Save/retry status and explicit draft recovery protect the selected recipe or bake snapshot | [NN/g: usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) |

Completed ingredients keep legible weights and checkmarks. Progress shows checked portions and completed steps; it does not alter formulas or predict fermentation. Browsing steps records no time. Short display labels do not change stored names or Mealie exports.

## Workflows to preserve

- Gram/percentage editing, starter hydration, flour blends/presets, scaling, portions and water-temperature calibration.
- Recipe save, duplicate, share, import/export, archive, print and Mealie retry/status.
- Method editing, reorder/undo, schedules, snapshots and downloads.
- Step-based and one-ingredient weighing, action timing, optional preparation and resumable bake progress.
- Results, optional measurements, oven stages, filters, method comparisons, CSV and explicit draft recovery.

## Validation

October/November 2026 browser reviews used invented isolated records at 320, 390, 768, 1024 and 1440 CSS pixels. Checks covered editing/recording, advanced sections, keyboard focus, fixed actions, overflow, empty states, long content, recovery and partial Mealie failures. Node tests and Docker checks remain required.

Measured text contrast: primary 12.26:1; secondary 4.84:1; completed ingredients 5.16:1; primary actions 8.10:1; planned-rest notes 5.84:1. These targeted checks do not claim a full WCAG audit or physical-device testing. See [timing validation](research.md#validation-record).
