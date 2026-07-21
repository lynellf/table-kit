# D2 three-region scroll protocol

**Status:** accepted planning contract; implementation must satisfy this protocol before D2 browser work begins.

## Scope

The walking skeleton renders pinned-left, virtualized-center, and pinned-right projections of one logical grid. This protocol fixes the synchronization boundary so row drift is a test failure rather than an implementation detail.

## Authorities and synchronization

- The center body viewport is the sole vertical scroll owner. It is the only region with vertical overflow and the only region whose `scrollTop` is written by user or programmatic scrolling.
- Its `scrollTop` is converted into a shared logical `scrollOffset` and published at most once per animation frame. The row virtualizer and all three region projections consume that same snapshot.
- Pinned regions have no independent vertical scroll containers and receive no `scrollTop` writes. Their rows use the same logical row IDs, `top` offsets, and virtual range as the center region.
- `scrollToRow`, page movement, and focus restoration call the center owner's scroll API. They do not scroll a pinned track directly.
- Horizontal overflow belongs only to the center viewport. Pinned regions use clipped, non-scrolling tracks. A wide grouped header in a pinned track clips to the resolved pinned width; it cannot expand or create a second horizontal authority.
- Scroll notification and virtual-range updates are RAF-batched. Tests must fail if independent region scroll listeners or competing scroll writes are introduced.

## Fixed geometry contract

- D2 uses fixed geometry only. `rowHeight` is a consumer option with a deterministic `40px` default; `headerHeight` has a deterministic `40px` default.
- The numeric row/header heights are available to the core virtualizer and emitted as CSS custom properties. Every region uses the same values; no region measures its own row.
- SSR uses these same defaults or supplied numeric options. DOM measurement is not required for initial layout and cannot change row order or initial virtual offsets during hydration.
- Variable/measured height is outside D2. It requires a later risk gate proving shared measurements, anchoring, bounded relayout, and focus stability.

## Visibility, order, and pinning

- For each committed table snapshot, resolve visible leaf columns, order, pin side, widths, and center spacer width once. Pass that immutable projection to all regions.
- A visibility/order/pinning change invalidates the whole projection atomically. Left, center, and right rows must never derive their columns from different snapshots.
- A column that moves between regions is rendered by exactly one region in the committed projection. Its focus identity remains the logical `rowId/columnId` pair while the DOM owner changes.

## Required evidence

D2 unit/view tests and browser fixtures must cover:

1. center-owner `scrollTop` updates produce equal row `top` offsets in all regions;
2. `scrollToRow` writes only to the center owner;
3. pinned tracks have no vertical or horizontal scrolling authority;
4. row/header heights and CSS variables are identical across regions and SSR hydration;
5. visibility, reorder, and pinning changes update all regions atomically;
6. horizontal center scrolling does not move pinned columns or grouped-header alignment.

A failure in any item stops D2 and keeps the fixed-height shell from advancing to D3/D4 until repaired.
