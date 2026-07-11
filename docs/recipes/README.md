# Recipes

Consumer-facing integration patterns for `@lynellf/tablekit-react`. Each recipe is a self-contained copy-paste snippet with pitfalls and links back to the spec.

All recipes are verified against the [v1.0 API contract](https://github.com/lynellf/table-kit/tree/main/docs/m6-hardening/api-freeze.md) (v1.0.0).

| Recipe | What it solves | Library surface |
| --- | --- | --- |
| [layout.md](./layout.md) | Default recipe: virtualization + sticky pinning in one scroll container | `useDataTable` + `getRowModel` + pinned columns |
| [dnd-column-reorder.md](./dnd-column-reorder.md) | Pointer-based column re-ordering via dnd-kit | `useDataTable` + `moveColumn` |
| [kbd-column-reorder.md](./kbd-column-reorder.md) | Keyboard "grab" pattern: Space → Arrows → Space | `useDataTable` + `moveColumn` + announcer |
| [split-pane.md](./split-pane.md) | Three viewports with scroll sync (use when surrounding layout has transforms) | `useDataTable` + pinned column sets + `getHeaderGroups` |

## How to use these recipes

1. Pick the recipe that matches your layout constraint.
2. Copy the implementation snippet into your project.
3. Replace the placeholder types/interfaces with your actual row type.
4. Wire the `Announcer` component (from `useDataTable`) into your component tree.

## Adding new recipes

Recipes are v1.5+ additions. To add a new recipe:

1. Create `docs/recipes/{your-recipe-name}.md`.
2. Follow the structure: Problem → Implementation → How it works → Pitfalls → See also → Verified against.
3. Add a row to this index table.
4. Link from `README.md` at the repo root.

The "Last verified against" tag in each recipe documents which API freeze version it was checked against. When the API surface changes, update the tag in the affected recipe.
