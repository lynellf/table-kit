# Guides & Agent Skills

> **Editor's note (2026-07-07):** The directory `docs/guides-agent-skills/` was renamed to `docs/guides/` as part of the `guides-ship-and-archive-reorg` plan. The plan artifacts (overview, phase-1..6, trivial.md) remain in this archive; the live doc outputs moved to `docs/guides/<target>/`. Cross-references in this README and the phase files have been updated to point at the live path.

Concept maps that align table-kit's v1.0 feature surface against four external grid/pivot libraries. Each target gets a paired `SKILL.md` (agent-skill frontmatter) and `guide.md` (recipe-style concept map).

**Last verified against:** `docs/m6-hardening/api-freeze.md` v1.0.0

---

## Targets

| Target | Description | Companion guide |
|---|---|---|
| [webix-datagrid](../../../docs/guides/webix-datagrid/) | Webix DataTable → `@lynellf/tablekit-react` | [guide.md](../../../docs/guides/webix-datagrid/guide.md) |
| [webix-pivot](../../../docs/guides/webix-pivot/) | Webix Pivot → `@lynellf/tablekit-pivot` | [guide.md](../../../docs/guides/webix-pivot/guide.md) |
| [ag-grid-datagrid](../../../docs/guides/ag-grid-datagrid/) | AG-Grid DataGrid → `@lynellf/tablekit-react` | [guide.md](../../../docs/guides/ag-grid-datagrid/guide.md) |
| [ag-grid-pivot](../../../docs/guides/ag-grid-pivot/) | AG-Grid Pivot → `@lynellf/tablekit-pivot` | [guide.md](../../../docs/guides/ag-grid-pivot/guide.md) |

---

## Shared structure

### Concept-table groups for DataTable targets (webix-datagrid, ag-grid-datagrid)

1. **Data & schema** — rows, columns, accessors, row identity, schema discovery
2. **State & lifecycle** — sorting, filtering, pagination, column ops, selection, persistence
3. **Rendering & layout** — virtualization, resizing, pinning, header/cell render slots
4. **Interactions & accessibility** — keyboard nav, focus, announcer, context menu, validation

### Concept-table groups for Pivot targets (webix-pivot, ag-grid-pivot)

1. **Structure** — rows/columns/measures/filters (maps to `PivotConfig`)
2. **Aggregation & totals** — aggregators, grand-total row/column, subtotals
3. **Expansion & navigation** — row expansion, treegrid keyboard, announcer
4. **Engine seam** — main-thread vs worker engine, mergeable aggregators

### Out-of-scope vocabulary (v1.0)

These are named explicitly in each guide's "Where the target has no v1.0 analog" section:

| Feature | Deferred to |
|---|---|
| `rowSelection` slice | v1.5 |
| State persistence (`serializeState`/`hydrateState`) | v1.5 |
| Subtotal rows per level (`subtotals: 'perLevel'`) | v1.5 |
| Cell editing / `editType` | v2 |
| Column auto-fit | v2 |
| Global quick filter | v2 |
| Hard gate `allowWithinPageOperations` | v2 |
| Columnar `Arrow` transfer for `setRows` | v2 |

### Shared SKILL.md frontmatter template

Each `SKILL.md` follows this frontmatter shape:

```yaml
name: <target-name>
description: <one-sentence trigger> Use when <specific contexts>.
type: guide-companion
verified_against: docs/m6-hardening/api-freeze.md v1.0.0
target: <webix-datagrid | webix-pivot | ag-grid-datagrid | ag-grid-pivot>
tablekit_packages:
  - @lynellf/tablekit-react   # omit for raw-core targets
  - @lynellf/tablekit-pivot   # pivot targets only
  - @lynellf/tablekit-core    # implicit; not listed
companion_guide: ./guide.md
```

### Shared guide.md body sections

Each `guide.md` includes these sections in order:

1. `# <Target> → table-kit concept map` + verification tag
2. `## Mapping at a glance`
3. `## Concept → feature table` (with per-group tables)
4. `## Where the target has no v1.0 analog`
5. `## Where table-kit v1.0 is richer than the target`
6. `## See also`
7. `## Verified against`

---

## See also

- [`docs/m6-hardening/api-freeze.md`](../../../docs/m6-hardening/api-freeze.md) — v1.0 API contract
- [`docs/initial-spec.md`](../../../docs/initial-spec.md) — full spec, §1 (positioning), §7–9 (feature surface)
- [`docs/recipes/`](../../../docs/recipes/) — consumer-facing wiring patterns
