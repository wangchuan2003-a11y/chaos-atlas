# Chaos Atlas design

## Surface

The application is an instrument for operating and reading a mathematical experiment. The first viewport places the parameter rail beside a wide bifurcation field. Time-series and cobweb plots follow, then numerical interpretation and source boundaries. The graphs are the primary content.

## Visual system

- Paper: `#f4f1e9`; plot surfaces: `#fcfaf5`.
- Text: `#30233d`; primary mathematical trace: `#503665`; comparison and selected parameter: `#b32870`.
- Secondary text: `#726875`; borders: `#d9d2da`; plot grid: `#e7e0e7`.
- Self-hosted Manrope with Chinese platform fallbacks; Georgia is used only for the mathematical recurrence. Numerical readouts use tabular figures.
- Plot panels use 10 px corners, controls 5–6 px. Hierarchy uses spacing and a single border, without shadows.
- Primary trace is solid; comparison is dashed. Colors are not the only distinction.

## Interaction

Native ranges, number inputs, checkboxes, selects, buttons, and details expose keyboard behavior. Focus has a 3 px magenta ring. Clicking the bifurcation chart has an equivalent `r` slider operation. The site starts stationary. Playback stops at the final iteration and when the document is hidden.

The worker clears stale scatter samples while computing and only accepts the most recent request. PNG export stays disabled until that background computation is ready. Source details and the recent-value table provide a text counterpart to Canvas.

## Responsive composition

Above 1100 px: 250 px parameter rail; bifurcation plot spans the chart column; time and cobweb graphs share a row. Below 1100 px the two lower plots stack. Below 700 px the parameter rail becomes a two-column inline control group, followed by three full-width plots. No essential action depends on hover.

## Validation boundary

TypeScript, numerical property tests and a production build are local checks. Desktop and mobile screenshots are reviewed by the coordinating agent through the in-app browser. Playwright runtime checks are assigned to GitHub Actions; local browser launches are excluded from this delivery workflow.
