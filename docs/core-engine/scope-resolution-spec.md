# Scope Resolution Spec: First Milestone of `docs/initial-spec.md`

**Status:** Draft for plan review  
**Related plan:** `docs/core-engine/`  
**Supersedes:** reviewer-b scope mismatch claim that "first milestone" must mean M1  
**Date:** 2026-07-05

## What I found

- `docs/initial-spec.md` §14 is the authoritative milestone list.
- The first row of that milestone table is `M0 | Core engine` with scope: `Instance/state/controlled-slice contract, column model, registries, React adapter shell`.
- The second row is `M1 | DataTable client features` with scope: `Sorting, filtering, pagination, ordering, visibility, events`.
- Therefore, for the user's goal — "Let's attain the first milestone of the spec @docs/initial-spec.md" — the least-surprising, spec-literal target is **M0: Core engine**, not M1.
- The existing `docs/core-engine/` plan is aligned to M0 and intentionally excludes M1 feature behavior. It does include some M1-facing state/type scaffolding where needed to keep the public API stable, but it does not implement row pipeline behavior, prop getters, or interaction events.

## Decision

Proceed with **M0: Core engine** as the current implementation target.

Corrected goal language for downstream roles:

> Attain **M0: Core engine** from `docs/initial-spec.md` §14: implement the instance/state/controlled-slice contract, column model, sorting/filtering registries, and React adapter shell, with controlled/uncontrolled state round-trips and type tests green.

## Explicit non-goals for this run

The following are **M1** and must not be required for this M0 run:

- Sorting row-model behavior.
- Filtering row-model behavior.
- Pagination row-model behavior.
- Public column-ordering helpers/behavior beyond M0 state/column-model scaffolding.
- Public column-visibility helpers/behavior beyond M0 state/column-model scaffolding.
- Interaction event prop getters/callback wiring.
- Level 0 API freeze for all client DataTable features.

## M1 handoff note

After M0 is implemented and reviewed, create a separate M1 plan covering all M1 scope in one or more sub-phases:

1. Sorting pipeline + helpers.
2. Filtering pipeline + helpers.
3. Pagination pipeline + helpers.
4. Column ordering helpers and public dispatchers.
5. Column visibility helpers and public dispatchers.
6. Prop getters and interaction events.
7. Feature integration tests and Level 0 API freeze.

## Acceptance criteria for the current M0 run

- `docs/core-engine/overview.md` and phase files are treated as the active implementation plan.
- The plan explicitly states the target is M0, not M1.
- Implementation satisfies M0 §14 exit criteria: controlled + uncontrolled state round-trips and type tests green.
- M1 features listed above are documented as future scope, not blocking omissions.
- Reviewers do not reject the M0 plan for omitting full M1 behavior.
